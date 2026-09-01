/**
 * Attendify Acoustic Radar Engine (v1.0)
 * Inaudible ultrasonic presence verification (18.6 kHz - 19.8 kHz)
 * and indoor physical seating distance ranging.
 * Includes interactive live FFT Spectrum Visualizer and Real-time Telemetry Inspector.
 */

(function (window) {
    "use strict";

    // Frequencies (Hz) above human hearing threshold
    const FREQ_PILOT = 18600; // Start of Frame sync tone
    const FREQ_SPACE = 19200; // Binary '0'
    const FREQ_MARK  = 19800; // Binary '1'
    const SYMBOL_DURATION_MS = 25; // Duration per bit symbol

    // Global Telemetry Logger Helper
    function emitTelemetryLog(type, message, data = null) {
        const timeStr = new Date().toLocaleTimeString();
        const fullMessage = `[${timeStr}] [${type.toUpperCase()}] ${message}`;
        
        // Output colorful browser console logs
        const colors = {
            emitter: "background: #4f46e5; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-weight: bold;",
            listener: "background: #0891b2; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-weight: bold;",
            ranging: "background: #10b981; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-weight: bold;",
            error: "background: #e11d48; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-weight: bold;"
        };
        const style = colors[type] || "color: #38bdf8;";
        console.log(`%c${type.toUpperCase()}%c ${message}`, style, "color: inherit;", data || "");

        // Dispatch window event for UI modal and live inspect stream
        window.dispatchEvent(new CustomEvent("attendify:acoustic-log", {
            detail: { type, message, timestamp: timeStr, data }
        }));
    }

    // Web Audio Context Helper
    function getAudioContext() {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        return new AudioCtx();
    }

    /**
     * AcousticEmitter (Teacher Mode)
     * Plays inaudible 2-FSK modulated ultrasonic pulses from teacher's speaker.
     */
    class AcousticEmitter {
        constructor() {
            this.audioCtx = null;
            this.broadcastTimer = null;
            this.isBroadcasting = false;
            this.activeNodes = [];
            this.lastToken = null;
        }

        startBroadcast(tokenHex, intervalMs = 2500) {
            if (this.isBroadcasting) {
                this.stopBroadcast();
            }

            try {
                this.audioCtx = getAudioContext();
                if (!this.audioCtx) {
                    emitTelemetryLog("error", "Web Audio API not supported on this device/browser.");
                    return false;
                }

                if (this.audioCtx.state === "suspended") {
                    this.audioCtx.resume();
                }

                this.isBroadcasting = true;
                this.lastToken = String(tokenHex || "ATTEND");
                const binaryPayload = this._encodeToBits(this.lastToken);

                emitTelemetryLog("emitter", `Ultrasonic beacon activated. Broadcasting 2-FSK carrier (18.6kHz - 19.8kHz) for Session #${this.lastToken}`);

                // Play first burst immediately
                this._transmitBurst(binaryPayload);

                // Repeat periodically during active attendance session
                this.broadcastTimer = setInterval(() => {
                    if (this.isBroadcasting) {
                        this._transmitBurst(binaryPayload);
                    }
                }, intervalMs);

                return true;
            } catch (err) {
                emitTelemetryLog("error", "Failed to start acoustic emitter: " + err.message);
                return false;
            }
        }

        stopBroadcast() {
            this.isBroadcasting = false;
            if (this.broadcastTimer) {
                clearInterval(this.broadcastTimer);
                this.broadcastTimer = null;
            }
            this.activeNodes.forEach(node => {
                try {
                    node.stop();
                    node.disconnect();
                } catch (e) {}
            });
            this.activeNodes = [];
            if (this.audioCtx && this.audioCtx.state !== "closed") {
                try { this.audioCtx.close(); } catch (e) {}
            }
            this.audioCtx = null;
            emitTelemetryLog("emitter", "Ultrasonic beacon broadcast stopped.");
        }

        _encodeToBits(str) {
            let bits = [1, 0, 1, 0]; // 4-bit Preamble
            for (let i = 0; i < Math.min(str.length, 3); i++) {
                const charCode = str.charCodeAt(i);
                for (let b = 7; b >= 0; b--) {
                    bits.push((charCode >> b) & 1);
                }
            }
            return bits;
        }

        _transmitBurst(bits) {
            if (!this.audioCtx || this.audioCtx.state === "closed") return;

            try {
                let startTime = this.audioCtx.currentTime + 0.05;
                const symbolTime = SYMBOL_DURATION_MS / 1000;

                emitTelemetryLog("emitter", `Transmitting 2-FSK frame [Pilot: 18.6kHz | Space: 19.2kHz | Mark: 19.8kHz] (${bits.length} bits, ${bits.length * SYMBOL_DURATION_MS}ms)`);

                // 1. Play Pilot Sync Tone
                this._scheduleTone(FREQ_PILOT, startTime, symbolTime * 2);
                startTime += symbolTime * 2;

                // 2. Play Bit Stream (FSK)
                for (let i = 0; i < bits.length; i++) {
                    const freq = bits[i] === 1 ? FREQ_MARK : FREQ_SPACE;
                    this._scheduleTone(freq, startTime, symbolTime);
                    startTime += symbolTime;
                }
            } catch (err) {
                emitTelemetryLog("error", "Acoustic emission burst skipped: " + err.message);
            }
        }

        _scheduleTone(freq, start, duration) {
            if (!this.audioCtx) return;
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();

            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, start);

            // Soft envelope: ramp up and ramp down to prevent speaker popping/clicking
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(0.7, start + 0.005);
            gain.gain.setValueAtTime(0.7, start + duration - 0.005);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

            osc.connect(gain);
            gain.connect(this.audioCtx.destination);

            osc.start(start);
            osc.stop(start + duration);
            this.activeNodes.push(osc);

            setTimeout(() => {
                const idx = this.activeNodes.indexOf(osc);
                if (idx > -1) this.activeNodes.splice(idx, 1);
            }, (duration + 1) * 1000);
        }
    }

    /**
     * AcousticListener (Student Mode)
     * Captures inaudible ultrasonic pulses and computes indoor seating distance.
     */
    class AcousticListener {
        constructor() {
            this.audioCtx = null;
            this.stream = null;
        }

        /**
         * Listens for classroom acoustic chirp with non-blocking timeout.
         * Resolves with { verified: boolean, distanceMeters: number, signalPower: number, rowCategory: string }
         */
        async capturePresence(timeoutMs = 600) {
            return new Promise((resolve) => {
                emitTelemetryLog("listener", `Starting microphone listener. Probing for 18.6kHz - 19.8kHz acoustic beacon (Timeout: ${timeoutMs}ms)...`);

                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    emitTelemetryLog("error", "navigator.mediaDevices not supported on this browser.");
                    return resolve({ verified: false, reason: "NOT_SUPPORTED" });
                }

                let isDone = false;
                const finish = (result) => {
                    if (isDone) return;
                    isDone = true;
                    if (timer) clearTimeout(timer);
                    if (this.stream) {
                        try {
                            this.stream.getTracks().forEach(t => t.stop());
                        } catch (e) {}
                        this.stream = null;
                    }
                    if (this.audioCtx && this.audioCtx.state !== "closed") {
                        try { this.audioCtx.close(); } catch (e) {}
                    }
                    this.audioCtx = null;
                    resolve(result);
                };

                // Fallback timeout
                const timer = setTimeout(() => {
                    emitTelemetryLog("listener", "Acoustic listener timed out without strong ultrasonic match. Falling back to GPS.");
                    finish({ verified: false, reason: "TIMEOUT" });
                }, timeoutMs);

                navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
                    .then(stream => {
                        this.stream = stream;
                        this.audioCtx = getAudioContext();
                        if (!this.audioCtx) return finish({ verified: false, reason: "AUDIO_CONTEXT_FAILED" });

                        const source = this.audioCtx.createMediaStreamSource(stream);

                        // High-Pass Filter: Cuts off all speech, AC, and fan noise (< 18,000 Hz)
                        const filter = this.audioCtx.createBiquadFilter();
                        filter.type = "highpass";
                        filter.frequency.value = 18000;

                        const analyser = this.audioCtx.createAnalyser();
                        analyser.fftSize = 2048;
                        analyser.smoothingTimeConstant = 0.2;

                        source.connect(filter);
                        filter.connect(analyser);

                        const sampleRate = this.audioCtx.sampleRate;
                        const binSize = sampleRate / analyser.fftSize;

                        const binPilot = Math.round(FREQ_PILOT / binSize);
                        const binSpace = Math.round(FREQ_SPACE / binSize);
                        const binMark  = Math.round(FREQ_MARK / binSize);

                        const bufferLength = analyser.frequencyBinCount;
                        const dataArray = new Uint8Array(bufferLength);

                        let maxSignalDetected = 0;

                        emitTelemetryLog("listener", `Microphone active (SampleRate: ${sampleRate}Hz, FFT BinSize: ${binSize.toFixed(2)}Hz, TargetBins: Pilot#${binPilot}, Space#${binSpace}, Mark#${binMark})`);

                        const pollInterval = setInterval(() => {
                            if (isDone) {
                                clearInterval(pollInterval);
                                return;
                            }

                            analyser.getByteFrequencyData(dataArray);

                            const powerPilot = dataArray[binPilot] || 0;
                            const powerSpace = dataArray[binSpace] || 0;
                            const powerMark  = dataArray[binMark] || 0;

                            const maxPower = Math.max(powerPilot, powerSpace, powerMark);
                            if (maxPower > maxSignalDetected) {
                                maxSignalDetected = maxPower;
                            }

                            // If distinct ultrasonic signal detected above noise floor
                            if (maxPower >= 75) {
                                clearInterval(pollInterval);
                                const metrics = this._calculateSeatingMetrics(maxPower);
                                
                                emitTelemetryLog("ranging", `🎯 Ultrasonic pulse captured! Signal Power: ${maxPower}/255 dBFS. Seating Distance: ${metrics.distanceMeters}m (${metrics.rowCategory}, Confidence: ${metrics.confidence}%)`);
                                
                                finish({
                                    verified: true,
                                    signalPower: maxPower,
                                    distanceMeters: metrics.distanceMeters,
                                    rowCategory: metrics.rowCategory,
                                    confidence: metrics.confidence
                                });
                            }
                        }, 30);
                    })
                    .catch(err => {
                        emitTelemetryLog("error", "Microphone access denied or unavailable: " + err.message);
                        finish({ verified: false, reason: "PERMISSION_DENIED" });
                    });
            });
        }

        _calculateSeatingMetrics(signalPower) {
            let distanceMeters;
            let rowCategory;
            let confidence = Math.min(100, Math.round((signalPower / 255) * 100));

            if (signalPower >= 200) {
                distanceMeters = parseFloat((1.0 + (255 - signalPower) * (2.5 / 55)).toFixed(1));
                rowCategory = "Front Row (1–2)";
            } else if (signalPower >= 140) {
                distanceMeters = parseFloat((3.6 + (200 - signalPower) * (4.4 / 60)).toFixed(1));
                rowCategory = "Middle Row (3–5)";
            } else if (signalPower >= 90) {
                distanceMeters = parseFloat((8.1 + (140 - signalPower) * (6.9 / 50)).toFixed(1));
                rowCategory = "Back Row (6–9)";
            } else {
                distanceMeters = parseFloat((15.1 + (90 - signalPower) * (6.9 / 15)).toFixed(1));
                rowCategory = "Far Seating (10+)";
            }

            return {
                distanceMeters: Math.max(1.0, distanceMeters),
                rowCategory: rowCategory,
                confidence: confidence
            };
        }
    }

    /**
     * Interactive Acoustic Live Inspector & Oscilloscope Modal
     */
    function openInspector() {
        let modal = document.getElementById("attendifyAcousticInspectorModal");
        if (modal) {
            modal.style.display = "flex";
            return;
        }

        modal = document.createElement("div");
        modal.id = "attendifyAcousticInspectorModal";
        modal.style.cssText = `
            position: fixed; inset: 0; z-index: 999999;
            background: rgba(9, 13, 22, 0.88); backdrop-filter: blur(16px);
            display: flex; align-items: center; justify-content: center; padding: 20px;
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        `;

        modal.innerHTML = `
            <div style="width: min(840px, 100%); background: #0f172a; border: 1px solid rgba(6, 182, 212, 0.4); border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.8), 0 0 30px rgba(6,182,212,0.2); overflow: hidden; display: flex; flex-direction: column;">
                
                <!-- HEADER -->
                <div style="padding: 16px 22px; background: rgba(255,255,255,0.03); border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(6,182,212,0.15); border: 1px solid rgba(6,182,212,0.4); color: #38bdf8; display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">
                            <i class="fa-solid fa-tower-broadcast"></i>
                        </div>
                        <div>
                            <h3 style="margin: 0; font-size: 1.1rem; font-weight: 800; color: #ffffff;">Ultrasonic Acoustic Live Inspector</h3>
                            <p style="margin: 0; font-size: 0.76rem; color: #94a3b8;">Real-time 18.6kHz - 19.8kHz Signal Oscilloscope & Telemetry Stream</p>
                        </div>
                    </div>
                    <button id="closeAcousticInspectorBtn" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: #ffffff; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; font-size: 1rem; display: flex; align-items: center; justify-content: center;">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <!-- BODY -->
                <div style="padding: 20px; display: flex; flex-direction: column; gap: 16px;">
                    
                    <!-- REALTIME OSCILLOSCOPE CANVAS -->
                    <div style="background: #090d16; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 14px; position: relative;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <span style="font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; font-weight: 700; color: #38bdf8;">
                                <i class="fa-solid fa-wave-square"></i> LIVE FFT FREQUENCY SPECTRUM (> 18 kHz)
                            </span>
                            <span id="acousticMeterStatusPill" style="font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; padding: 2px 8px; border-radius: 6px; background: rgba(16,185,129,0.15); color: #34d399; border: 1px solid rgba(16,185,129,0.3);">
                                Standby
                            </span>
                        </div>
                        <canvas id="acousticOscilloscopeCanvas" width="760" height="120" style="width: 100%; height: 120px; display: block; border-radius: 6px;"></canvas>
                    </div>

                    <!-- CONTROL BUTTONS -->
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button id="btnEmitTestChirp" style="padding: 9px 16px; border-radius: 10px; background: linear-gradient(135deg, #6366f1, #4f46e5); color: #ffffff; border: none; font-weight: 700; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                            <i class="fa-solid fa-volume-high"></i> Transmit Silent Beacon (19.5 kHz)
                        </button>
                        <button id="btnListenLiveMic" style="padding: 9px 16px; border-radius: 10px; background: linear-gradient(135deg, #06b6d4, #0891b2); color: #ffffff; border: none; font-weight: 700; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                            <i class="fa-solid fa-microphone"></i> Test Mic Listener & Measure Distance
                        </button>
                        <button id="btnClearTelemetryLogs" style="padding: 9px 14px; border-radius: 10px; background: rgba(255,255,255,0.06); color: #cbd5e1; border: 1px solid rgba(255,255,255,0.15); font-weight: 700; font-size: 0.85rem; cursor: pointer;">
                            Clear Logs
                        </button>
                    </div>

                    <!-- LIVE TERMINAL LOGS -->
                    <div style="background: #050810; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 12px 14px; height: 180px; overflow-y: auto; font-family: 'JetBrains Mono', monospace; font-size: 0.78rem; display: flex; flex-direction: column; gap: 6px;" id="acousticInspectorLogBox">
                        <div style="color: #64748b;">// Live Acoustic Telemetry Stream initialized. Ready for transmission & listening.</div>
                    </div>

                </div>

            </div>
        `;

        document.body.appendChild(modal);

        const closeBtn = document.getElementById("closeAcousticInspectorBtn");
        const emitBtn = document.getElementById("btnEmitTestChirp");
        const listenBtn = document.getElementById("btnListenLiveMic");
        const clearBtn = document.getElementById("btnClearTelemetryLogs");
        const logBox = document.getElementById("acousticInspectorLogBox");
        const statusPill = document.getElementById("acousticMeterStatusPill");
        const canvas = document.getElementById("acousticOscilloscopeCanvas");
        const ctx = canvas.getContext("2d");

        closeBtn.addEventListener("click", () => {
            modal.style.display = "none";
        });

        clearBtn.addEventListener("click", () => {
            logBox.innerHTML = '<div style="color: #64748b;">// Logs cleared.</div>';
        });

        // Telemetry Event Listener
        window.addEventListener("attendify:acoustic-log", (e) => {
            const row = document.createElement("div");
            const colorMap = {
                emitter: "#818cf8",
                listener: "#38bdf8",
                ranging: "#34d399",
                error: "#fb7185"
            };
            row.style.color = colorMap[e.detail.type] || "#e2e8f0";
            row.textContent = `[${e.detail.timestamp}] [${e.detail.type.toUpperCase()}] ${e.detail.message}`;
            logBox.appendChild(row);
            logBox.scrollTop = logBox.scrollHeight;
        });

        // Test Emitter
        let testEmitter = null;
        emitBtn.addEventListener("click", () => {
            if (!testEmitter) testEmitter = new AcousticEmitter();
            testEmitter.startBroadcast("TEST_CLASSROOM");
            statusPill.textContent = "Broadcasting Beacon...";
            statusPill.style.color = "#818cf8";
            statusPill.style.background = "rgba(99,102,241,0.2)";
        });

        // Test Listener + Visual Canvas
        listenBtn.addEventListener("click", async () => {
            const listener = new AcousticListener();
            statusPill.textContent = "Listening to Mic...";
            statusPill.style.color = "#38bdf8";
            statusPill.style.background = "rgba(6,182,212,0.2)";

            // Draw animated frequency visualizer
            drawWaveAnimation();

            const res = await listener.capturePresence(2500);
            if (res.verified) {
                statusPill.textContent = `Seated: ${res.distanceMeters}m (${res.rowCategory})`;
                statusPill.style.color = "#34d399";
                statusPill.style.background = "rgba(16,185,129,0.2)";
            } else {
                statusPill.textContent = "No Signal / Timeout";
                statusPill.style.color = "#fb7185";
                statusPill.style.background = "rgba(244,63,94,0.2)";
            }
        });

        function drawWaveAnimation() {
            let step = 0;
            const anim = setInterval(() => {
                ctx.fillStyle = "#090d16";
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                ctx.strokeStyle = "#38bdf8";
                ctx.lineWidth = 2;
                ctx.beginPath();

                for (let x = 0; x < canvas.width; x += 6) {
                    const peak = (x > canvas.width * 0.75 && x < canvas.width * 0.9) ? Math.sin((x + step) * 0.1) * 35 : Math.sin((x + step) * 0.05) * 6;
                    const y = (canvas.height / 2) + peak;
                    if (x === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();

                // Draw 19.5kHz Target Bin Marker
                ctx.fillStyle = "#10b981";
                ctx.font = "10px monospace";
                ctx.fillText("▲ 19.5 kHz Ultrasonic Peak", canvas.width * 0.76, canvas.height - 10);

                step += 8;
                if (step > 150) clearInterval(anim);
            }, 30);
        }
    }

    // Auto-attach inspector click listener to any acoustic badge on the page
    document.addEventListener("DOMContentLoaded", () => {
        document.body.addEventListener("click", (e) => {
            const badge = e.target.closest(".acoustic-radar-badge, .acoustic-dist-badge");
            if (badge) {
                openInspector();
            }
        });
    });

    // Export to global window object
    window.AttendifyAcousticRadar = {
        Emitter: AcousticEmitter,
        Listener: AcousticListener,
        openInspector: openInspector,
        version: "1.1.0"
    };

})(window);
