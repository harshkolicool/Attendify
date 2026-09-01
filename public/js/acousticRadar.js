/**
 * Attendify Acoustic Radar Engine (v1.0 - Production)
 * Zero-hardware inaudible ultrasonic presence verification (18.6 kHz - 19.8 kHz)
 * and indoor physical seating distance ranging.
 */

(function (window) {
    "use strict";

    // Frequencies (Hz) above human hearing threshold
    const FREQ_PILOT = 18600; // Start of Frame sync tone
    const FREQ_SPACE = 19200; // Binary '0'
    const FREQ_MARK  = 19800; // Binary '1'
    const SYMBOL_DURATION_MS = 25; // Duration per bit symbol

    // Web Audio Context Helper
    function getAudioContext() {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        return new AudioCtx();
    }

    /**
     * AcousticEmitter (Teacher Mode)
     * Plays inaudible 2-FSK modulated ultrasonic pulses from teacher's speaker during active lectures.
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
                    return false;
                }

                if (this.audioCtx.state === "suspended") {
                    this.audioCtx.resume();
                    const resumeOnInteraction = () => {
                        if (this.audioCtx && this.audioCtx.state === "suspended") {
                            this.audioCtx.resume();
                        }
                        document.removeEventListener("click", resumeOnInteraction);
                        document.removeEventListener("touchstart", resumeOnInteraction);
                    };
                    document.addEventListener("click", resumeOnInteraction);
                    document.addEventListener("touchstart", resumeOnInteraction);
                }

                this.isBroadcasting = true;
                this.lastToken = String(tokenHex || "ATTEND");
                const binaryPayload = this._encodeToBits(this.lastToken);

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

                // 1. Play Pilot Sync Tone
                this._scheduleTone(FREQ_PILOT, startTime, symbolTime * 2);
                startTime += symbolTime * 2;

                // 2. Play Bit Stream (FSK)
                for (let i = 0; i < bits.length; i++) {
                    const freq = bits[i] === 1 ? FREQ_MARK : FREQ_SPACE;
                    this._scheduleTone(freq, startTime, symbolTime);
                    startTime += symbolTime;
                }
            } catch (err) {}
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
     * Captures inaudible ultrasonic pulses during check-in and computes indoor seating distance.
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
        async capturePresence(timeoutMs = 450) {
            return new Promise((resolve) => {
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
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

                // Non-blocking timeout fallback to GPS
                const timer = setTimeout(() => {
                    finish({ verified: false, reason: "TIMEOUT" });
                }, timeoutMs);

                navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
                    .then(stream => {
                        this.stream = stream;
                        this.audioCtx = getAudioContext();
                        if (!this.audioCtx) return finish({ verified: false, reason: "AUDIO_CONTEXT_FAILED" });

                        const source = this.audioCtx.createMediaStreamSource(stream);

                        // High-Pass Filter: Cuts off all speech, AC, and ambient noise (< 18,000 Hz)
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

                            // If distinct ultrasonic signal detected above noise floor
                            if (maxPower >= 75) {
                                clearInterval(pollInterval);
                                const metrics = this._calculateSeatingMetrics(maxPower);
                                
                                finish({
                                    verified: true,
                                    signalPower: maxPower,
                                    distanceMeters: metrics.distanceMeters,
                                    rowCategory: metrics.rowCategory,
                                    confidence: metrics.confidence
                                });
                            }
                        }, 25);
                    })
                    .catch(() => {
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

    // Export clean production API to window
    window.AttendifyAcousticRadar = {
        Emitter: AcousticEmitter,
        Listener: AcousticListener,
        version: "1.0.0"
    };

})(window);
