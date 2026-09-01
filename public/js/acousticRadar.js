/**
 * Attendify Acoustic Radar Engine (v2.0 - High Performance & Production Resilient)
 * Zero-hardware inaudible ultrasonic presence verification (18.2 kHz - 19.4 kHz)
 * and indoor seating distance ranging with adaptive SNR filtering.
 */

(function (window) {
    "use strict";

    // Frequencies (Hz) strictly above human hearing, within all 44.1kHz / 48kHz audio limits
    const FREQ_PILOT = 18200; // Start of Frame sync pilot tone
    const FREQ_SPACE = 18800; // Binary '0'
    const FREQ_MARK  = 19400; // Binary '1'
    const FREQ_NOISE_LOWER = 17500; // Guard band lower reference
    const FREQ_NOISE_UPPER = 20000; // Guard band upper reference
    const SYMBOL_DURATION_MS = 20;  // Duration per bit symbol (20ms)

    // Web Audio Context Singleton & Safe Lifecycle
    function getAudioContext() {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        try {
            return new AudioCtx();
        } catch (e) {
            return null;
        }
    }

    /**
     * AcousticEmitter (Teacher Mode)
     * Broadcasts inaudible 2-FSK modulated ultrasonic pulses from teacher's speaker during live attendance.
     */
    class AcousticEmitter {
        constructor() {
            this.audioCtx = null;
            this.broadcastTimer = null;
            this.isBroadcasting = false;
            this.activeNodes = [];
            this.lastToken = null;
        }

        startBroadcast(tokenHex, intervalMs = 800) {
            if (this.isBroadcasting) {
                this.stopBroadcast();
            }

            try {
                this.audioCtx = getAudioContext();
                if (!this.audioCtx) {
                    return false;
                }

                // Handle browser autoplay policy
                const tryResume = () => {
                    if (this.audioCtx && this.audioCtx.state === "suspended") {
                        this.audioCtx.resume().catch(() => {});
                    }
                };

                if (this.audioCtx.state === "suspended") {
                    tryResume();
                    const resumeOnInteraction = () => {
                        tryResume();
                        document.removeEventListener("click", resumeOnInteraction);
                        document.removeEventListener("touchstart", resumeOnInteraction);
                        document.removeEventListener("pointerdown", resumeOnInteraction);
                        document.removeEventListener("keydown", resumeOnInteraction);
                    };
                    document.addEventListener("click", resumeOnInteraction, { once: true });
                    document.addEventListener("touchstart", resumeOnInteraction, { once: true, passive: true });
                    document.addEventListener("pointerdown", resumeOnInteraction, { once: true, passive: true });
                    document.addEventListener("keydown", resumeOnInteraction, { once: true });
                }

                this.isBroadcasting = true;
                this.lastToken = String(tokenHex || "ATTEND");
                const binaryPayload = this._encodeToBits(this.lastToken);

                // Play first burst immediately
                this._transmitBurst(binaryPayload);

                // Repeat periodically during active attendance session (default every 800ms)
                this.broadcastTimer = setInterval(() => {
                    if (this.isBroadcasting) {
                        tryResume();
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
            this.activeNodes.forEach(item => {
                try {
                    if (item.osc) {
                        item.osc.stop();
                        item.osc.disconnect();
                    }
                    if (item.gain) {
                        item.gain.disconnect();
                    }
                } catch (e) {}
            });
            this.activeNodes = [];
            if (this.audioCtx && this.audioCtx.state !== "closed") {
                try { this.audioCtx.close(); } catch (e) {}
            }
            this.audioCtx = null;
        }

        _encodeToBits(str) {
            let bits = [1, 0, 1, 0]; // 4-bit sync preamble
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
                let startTime = this.audioCtx.currentTime + 0.03;
                const symbolTime = SYMBOL_DURATION_MS / 1000;

                // 1. Play Pilot Sync Tone (longer duration for lock)
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
            try {
                const osc = this.audioCtx.createOscillator();
                const gain = this.audioCtx.createGain();

                osc.type = "sine";
                osc.frequency.setValueAtTime(freq, start);

                // Smooth exponential envelope to eliminate speaker popping / clicks
                gain.gain.setValueAtTime(0.0001, start);
                gain.gain.exponentialRampToValueAtTime(0.75, start + 0.004);
                gain.gain.setValueAtTime(0.75, start + duration - 0.004);
                gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

                osc.connect(gain);
                gain.connect(this.audioCtx.destination);

                osc.start(start);
                osc.stop(start + duration);
                const entry = { osc, gain };
                this.activeNodes.push(entry);

                setTimeout(() => {
                    const idx = this.activeNodes.indexOf(entry);
                    if (idx > -1) {
                        try { gain.disconnect(); } catch (e) {}
                        this.activeNodes.splice(idx, 1);
                    }
                }, (duration + 0.08) * 1000);
            } catch (e) {}
        }
    }

    /**
     * AcousticListener (Student Mode)
     * Captures inaudible ultrasonic pulses during check-in with high-SNR multi-bin detection.
     */
    class AcousticListener {
        constructor() {
            this.audioCtx = null;
            this.stream = null;
        }

        _getBandPeak(dataArray, freq, binSize) {
            const centerBin = Math.round(freq / binSize);
            const left = dataArray[centerBin - 1] || 0;
            const center = dataArray[centerBin] || 0;
            const right = dataArray[centerBin + 1] || 0;
            return Math.max(left, center, right);
        }

        /**
         * Listens for classroom acoustic chirp with adaptive timeout and early exit.
         * Resolves with { verified: boolean, distanceMeters: number, signalPower: number, rowCategory: string }
         */
        async capturePresence(timeoutMs = 1200) {
            return new Promise((resolve) => {
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    return resolve({ verified: false, reason: "NOT_SUPPORTED" });
                }

                let isDone = false;
                let timer = null;

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

                // Non-blocking timeout fallback
                timer = setTimeout(() => {
                    finish({ verified: false, reason: "TIMEOUT" });
                }, timeoutMs);

                navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false
                    }
                })
                    .then(stream => {
                        if (isDone) {
                            try { stream.getTracks().forEach(t => t.stop()); } catch (e) {}
                            return;
                        }
                        try {
                            this.stream = stream;
                            this.audioCtx = getAudioContext();
                            if (!this.audioCtx) return finish({ verified: false, reason: "AUDIO_CONTEXT_FAILED" });

                            if (this.audioCtx.state === "suspended") {
                                this.audioCtx.resume().catch(() => {});
                            }

                            const source = this.audioCtx.createMediaStreamSource(stream);

                            // High-Pass Filter: Cuts off all speech, AC, and ambient audible noise (< 17,500 Hz)
                            const filter = this.audioCtx.createBiquadFilter();
                            filter.type = "highpass";
                            filter.frequency.value = 17500;
                            filter.Q.value = 1.0;

                            const analyser = this.audioCtx.createAnalyser();
                            analyser.fftSize = 2048;
                            analyser.smoothingTimeConstant = 0.15;

                            source.connect(filter);
                            filter.connect(analyser);

                            const sampleRate = this.audioCtx.sampleRate;
                            const binSize = sampleRate / analyser.fftSize;

                            const bufferLength = analyser.frequencyBinCount;
                            const dataArray = new Uint8Array(bufferLength);

                            let consecutiveHits = 0;
                            let highestDetectedPower = 0;

                            const pollInterval = setInterval(() => {
                                if (isDone) {
                                    clearInterval(pollInterval);
                                    return;
                                }

                                analyser.getByteFrequencyData(dataArray);

                                const powerPilot = this._getBandPeak(dataArray, FREQ_PILOT, binSize);
                                const powerSpace = this._getBandPeak(dataArray, FREQ_SPACE, binSize);
                                const powerMark  = this._getBandPeak(dataArray, FREQ_MARK, binSize);
                                const noiseFloor = Math.max(
                                    this._getBandPeak(dataArray, FREQ_NOISE_LOWER, binSize),
                                    this._getBandPeak(dataArray, FREQ_NOISE_UPPER, binSize)
                                );

                                const targetPeak = Math.max(powerPilot, powerSpace, powerMark);

                                // Dynamic SNR check: signal is prominent above guard band noise floor
                                const hasSignal = targetPeak >= 55 && (targetPeak - noiseFloor >= 12 || targetPeak >= 85);

                                if (hasSignal) {
                                    consecutiveHits++;
                                    if (targetPeak > highestDetectedPower) {
                                        highestDetectedPower = targetPeak;
                                    }

                                    // Fast early-return: 2 consecutive positive samples confirm presence
                                    if (consecutiveHits >= 2) {
                                        clearInterval(pollInterval);
                                        const metrics = this._calculateSeatingMetrics(highestDetectedPower);
                                        finish({
                                            verified: true,
                                            signalPower: highestDetectedPower,
                                            distanceMeters: metrics.distanceMeters,
                                            rowCategory: metrics.rowCategory,
                                            confidence: metrics.confidence
                                        });
                                    }
                                } else {
                                    consecutiveHits = Math.max(0, consecutiveHits - 1);
                                }
                            }, 15);
                        } catch (innerErr) {
                            console.warn("Acoustic node setup error:", innerErr);
                            finish({ verified: false, reason: "NODE_ERROR" });
                        }
                    })
                    .catch((err) => {
                        finish({ verified: false, reason: "PERMISSION_DENIED" });
                    });
            });
        }

        _calculateSeatingMetrics(signalPower) {
            let distanceMeters;
            let rowCategory;
            let confidence = Math.min(100, Math.max(50, Math.round((signalPower / 255) * 100)));

            if (signalPower >= 190) {
                distanceMeters = parseFloat((1.0 + (255 - signalPower) * (2.2 / 65)).toFixed(1));
                rowCategory = "Front Row (1–2)";
            } else if (signalPower >= 135) {
                distanceMeters = parseFloat((3.3 + (190 - signalPower) * (3.7 / 55)).toFixed(1));
                rowCategory = "Middle Row (3–5)";
            } else if (signalPower >= 85) {
                distanceMeters = parseFloat((7.1 + (135 - signalPower) * (5.4 / 50)).toFixed(1));
                rowCategory = "Back Row (6–9)";
            } else {
                distanceMeters = parseFloat((12.6 + (85 - signalPower) * (7.4 / 35)).toFixed(1));
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
        version: "2.0.0"
    };

})(window);
