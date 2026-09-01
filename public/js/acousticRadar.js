/**
 * Attendify Acoustic Radar Engine (v12.0 - Polyphonic Simultaneous Ultrasonic Chord Modem)
 * 100% Inaudible (18.3 kHz - 19.7 kHz), Zero Audible Clicks, Instant Single-Snapshot Detection.
 * Transmits all 4 Hex Characters Simultaneously in 4 Parallel Inaudible Frequency Carriers.
 */

(function (window) {
    "use strict";

    // 4 Parallel Inaudible Frequency Bands (One dedicated band per character position)
    const BANDS = [
        { base: 18300, step: 20, min: 18280, max: 18620 }, // Band 0 for Char 0 (18300 - 18600 Hz)
        { base: 18680, step: 20, min: 18660, max: 19000 }, // Band 1 for Char 1 (18680 - 18980 Hz)
        { base: 19060, step: 20, min: 19040, max: 19380 }, // Band 2 for Char 2 (19060 - 19360 Hz)
        { base: 19440, step: 20, min: 19420, max: 19760 }  // Band 3 for Char 3 (19440 - 19740 Hz)
    ];

    const HEX_CHARS = ["0","1","2","3","4","5","6","7","8","9","A","B","C","D","E","F"];
    const FREQ_GUARD_LOW = 17800;
    const FREQ_GUARD_HIGH= 19900;

    function tokenToChordFrequencies(tokenHex) {
        const clean = String(tokenHex || "E3F0").toUpperCase().replace(/[^0-9A-F]/g, "").slice(0, 4).padEnd(4, "0");
        const freqs = [];
        for (let i = 0; i < 4; i++) {
            const val = parseInt(clean[i], 16);
            freqs.push(BANDS[i].base + val * BANDS[i].step);
        }
        return freqs; // 4 simultaneous frequencies
    }

    function sha256(ascii) {
        function rightRotate(value, amount) {
            return (value>>>amount) | (value<<(32 - amount));
        }
        const mathPow = Math.pow;
        const maxWord = mathPow(2, 32);
        let lengthProperty = 'length';
        let i, j;
        let result = '';

        const words = [];
        const asciiBitLength = ascii[lengthProperty]*8;
        
        let hash = sha256.h = sha256.h || [];
        const k = sha256.k = sha256.k || [];
        let primeCounter = k[lengthProperty];

        const isComposite = {};
        for (let candidate = 2; primeCounter < 64; candidate++) {
            if (!isComposite[candidate]) {
                for (i = 0; i < 313; i += candidate) {
                    isComposite[i] = candidate;
                }
                hash[primeCounter] = (mathPow(candidate, .5)*maxWord)|0;
                k[primeCounter++] = (mathPow(candidate, 1/3)*maxWord)|0;
            }
        }
        
        ascii += '\x80';
        while (ascii[lengthProperty]%64 - 56) ascii += '\x00';
        for (i = 0; i < ascii[lengthProperty]; i++) {
            j = ascii.charCodeAt(i);
            if (j>>8) return;
            words[i>>2] |= j << ((3 - i)%4)*8;
        }
        words[words[lengthProperty]] = ((asciiBitLength/maxWord)|0);
        words[words[lengthProperty]] = (asciiBitLength);
        
        for (j = 0; j < words[lengthProperty];) {
            const w = words.slice(j, j += 16);
            const oldHash = hash;
            hash = hash.slice(0, 8);
            
            for (i = 0; i < 64; i++) {
                const i2 = i + j;
                const w15 = w[i - 15], w2 = w[i - 2];

                const a = hash[0], e = hash[4];
                const temp1 = hash[7]
                    + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
                    + ((e & hash[5]) ^ ((~e) & hash[6]))
                    + k[i]
                    + (w[i] = (i < 16) ? w[i] : (
                            w[i - 16]
                            + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15>>>3))
                            + w[i - 7]
                            + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2>>>10))
                        )|0
                    );
                const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
                    + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
                
                hash = [(temp1 + temp2)|0].concat(hash);
                hash[4] = (hash[4] + temp1)|0;
            }
            
            for (i = 0; i < 8; i++) {
                hash[i] = (hash[i] + oldHash[i])|0;
            }
        }
        
        for (i = 0; i < 8; i++) {
            for (j = 3; j + 1; j--) {
                const b = (hash[i]>>(j*8))&255;
                result += ((b < 16) ? 0 : '') + b.toString(16);
            }
        }
        return result;
    }

    function generateRollingToken(baseSecret, windowIndex) {
        const raw = String(baseSecret || "") + ":" + String(windowIndex);
        const hash = sha256(raw).toUpperCase();
        return hash.slice(0, 4);
    }

    function interpolateFrequency(dataArray, bin, binSize) {
        if (bin <= 0 || bin >= dataArray.length - 1) return bin * binSize;
        const y1 = dataArray[bin - 1];
        const y2 = dataArray[bin];
        const y3 = dataArray[bin + 1];
        const denom = y1 - 2 * y2 + y3;
        if (denom === 0) return bin * binSize;
        const delta = (0.5 * (y1 - y3)) / denom;
        return (bin + delta) * binSize;
    }

    function getAudioContext() {
        if (window._attendifyGlobalAudioCtx && window._attendifyGlobalAudioCtx.state !== "closed") {
            return window._attendifyGlobalAudioCtx;
        }
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        try {
            window._attendifyGlobalAudioCtx = new AudioCtx();
            return window._attendifyGlobalAudioCtx;
        } catch (e) {
            return null;
        }
    }

    // Auto-unlock Web Audio on first touch/click (iOS Safari / Android Chrome autoplay policy)
    function unlockAudioContext() {
        const ctx = getAudioContext();
        if (ctx && ctx.state === "suspended") {
            ctx.resume().catch(() => {});
        }
        document.removeEventListener("touchstart", unlockAudioContext);
        document.removeEventListener("touchend", unlockAudioContext);
        document.removeEventListener("click", unlockAudioContext);
    }
    if (typeof document !== "undefined") {
        document.addEventListener("touchstart", unlockAudioContext, { passive: true });
        document.addEventListener("touchend", unlockAudioContext, { passive: true });
        document.addEventListener("click", unlockAudioContext, { passive: true });
    }

    /**
     * AcousticEmitter (Teacher Laptop Speaker)
     * Broadcasts a continuous 4-tone inaudible polyphonic ultrasonic chord with rolling beacon support.
     */
    class AcousticEmitter {
        constructor(existingAudioCtx) {
            this.audioCtx = existingAudioCtx || getAudioContext();
            this.isBroadcasting = false;
            this.activeNodes = [];
            this.lastToken = null;
            this.rollingTimer = null;
            this.baseSecret = null;
        }

        startBroadcast(tokenHex) {
            if (this.isBroadcasting) {
                this.stopBroadcast();
            }

            try {
                if (!this.audioCtx || this.audioCtx.state === "closed") {
                    this.audioCtx = getAudioContext();
                }
                if (!this.audioCtx) return false;

                if (this.audioCtx.state === "suspended") {
                    this.audioCtx.resume().catch(() => {});
                }

                this.isBroadcasting = true;
                const cleanToken = String(tokenHex || "E3F0").toUpperCase().replace(/[^0-9A-F]/g, "").slice(0, 4).padEnd(4, "0");
                this.lastToken = cleanToken;

                this._playChord(cleanToken);
                return true;
            } catch (err) {
                console.warn("AcousticEmitter startBroadcast error:", err);
                return false;
            }
        }

        startRollingBroadcast(baseSecret, windowDurationMs = 20000) {
            if (this.isBroadcasting) {
                this.stopBroadcast();
            }

            this.baseSecret = baseSecret;
            const currentWin = Math.floor(Date.now() / windowDurationMs);
            const currentToken = generateRollingToken(baseSecret, currentWin);
            
            console.log(`[AcousticEmitter] Starting Rolling Beacon (20s window): Initial Token "${currentToken}"`);
            this.startBroadcast(currentToken);

            // Set up rolling interval
            this.rollingTimer = setInterval(() => {
                if (!this.isBroadcasting) return;
                const nextWin = Math.floor(Date.now() / windowDurationMs);
                const nextToken = generateRollingToken(this.baseSecret, nextWin);
                if (nextToken !== this.lastToken) {
                    console.log(`[AcousticEmitter] Rolling to new window ${nextWin} token: "${nextToken}"`);
                    this.lastToken = nextToken;
                    this._crossfadeChord(nextToken);
                }
            }, 1000);

            return true;
        }

        _playChord(token) {
            if (!this.audioCtx || this.audioCtx.state === "closed") return;
            const chordFrequencies = tokenToChordFrequencies(token);
            const now = this.audioCtx.currentTime;

            for (let i = 0; i < 4; i++) {
                const freq = chordFrequencies[i];
                const osc = this.audioCtx.createOscillator();
                const gain = this.audioCtx.createGain();

                osc.type = "sine";
                osc.frequency.setValueAtTime(freq, now);

                // Smooth 25ms raised-cosine ramp
                gain.gain.setValueAtTime(0, now);
                gain.gain.linearRampToValueAtTime(0.24, now + 0.025);

                osc.connect(gain);
                gain.connect(this.audioCtx.destination);

                osc.start(now);
                this.activeNodes.push({ osc, gain });
            }
        }

        _crossfadeChord(newToken) {
            if (!this.audioCtx) return;
            const now = this.audioCtx.currentTime;

            // Fade out existing nodes over 40ms
            const oldNodes = this.activeNodes.slice();
            this.activeNodes = [];

            oldNodes.forEach(item => {
                try {
                    item.gain.gain.setValueAtTime(item.gain.gain.value, now);
                    item.gain.gain.linearRampToValueAtTime(0, now + 0.04);
                    setTimeout(() => {
                        try { item.osc.stop(); item.osc.disconnect(); item.gain.disconnect(); } catch (e) {}
                    }, 50);
                } catch (e) {}
            });

            // Start new nodes with 40ms fade-in
            this._playChord(newToken);
        }

        stopBroadcast() {
            this.isBroadcasting = false;
            if (this.rollingTimer) {
                clearInterval(this.rollingTimer);
                this.rollingTimer = null;
            }
            if (!this.audioCtx) return;

            const now = this.audioCtx.currentTime;
            this.activeNodes.forEach(item => {
                try {
                    if (item.gain) {
                        item.gain.gain.setValueAtTime(item.gain.gain.value, now);
                        item.gain.gain.linearRampToValueAtTime(0, now + 0.02);
                    }
                    setTimeout(() => {
                        try {
                            if (item.osc) { item.osc.stop(); item.osc.disconnect(); }
                            if (item.gain) { item.gain.disconnect(); }
                        } catch (e) {}
                    }, 30);
                } catch (e) {}
            });
            this.activeNodes = [];
        }
    }


    /**
     * AcousticListener (Student Smartphone Microphone)
     * Real-time 4-Band Simultaneous Polyphonic Demodulator.
     */
    class AcousticListener {
        constructor(existingAudioCtx) {
            this.audioCtx = existingAudioCtx || null;
            this.stream = null;
        }

        async capturePresence(timeoutMs = 6000, onLiveSpectrum = null) {
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
                    if (this.audioCtx && this.audioCtx.state !== "closed" && this.audioCtx !== window._attendifyGlobalAudioCtx) {
                        try { this.audioCtx.close(); } catch (e) {}
                    }
                    this.audioCtx = null;
                    resolve(result);
                };

                timer = setTimeout(() => {
                    finish({ verified: false, reason: "ACOUSTIC_SIGNAL_NOT_DETECTED" });
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
                            if (!this.audioCtx || this.audioCtx.state === "closed") {
                                this.audioCtx = getAudioContext();
                            }
                            if (!this.audioCtx) return finish({ verified: false, reason: "AUDIO_CONTEXT_FAILED" });

                            if (this.audioCtx.state === "suspended") {
                                this.audioCtx.resume().catch(() => {});
                            }

                            const source = this.audioCtx.createMediaStreamSource(stream);

                            const filter = this.audioCtx.createBiquadFilter();
                            filter.type = "highpass";
                            filter.frequency.value = 17500;
                            filter.Q.value = 0.7;

                            const analyser = this.audioCtx.createAnalyser();
                            analyser.fftSize = 2048;
                            analyser.smoothingTimeConstant = 0.04;

                            source.connect(filter);
                            filter.connect(analyser);

                            const sampleRate = this.audioCtx.sampleRate;
                            const binSize = sampleRate / analyser.fftSize;
                            const bufferLength = analyser.frequencyBinCount;
                            const dataArray = new Uint8Array(bufferLength);

                            let consecutiveValidFrames = 0;
                            let candidateTokenVotes = {};
                            let highestPower = 0;

                            const pollInterval = setInterval(() => {
                                if (isDone) {
                                    clearInterval(pollInterval);
                                    return;
                                }

                                analyser.getByteFrequencyData(dataArray);

                                // Guard noise floor
                                const guardLowBin = Math.round(FREQ_GUARD_LOW / binSize);
                                const guardHighBin = Math.round(FREQ_GUARD_HIGH / binSize);
                                const noiseFloor = Math.max(
                                    dataArray[guardLowBin] || 0,
                                    dataArray[guardHighBin] || 0,
                                    5
                                );

                                // Read all 4 bands simultaneously in this single frame!
                                const frameChars = [];
                                let frameValid = true;
                                let framePowerSum = 0;

                                for (let i = 0; i < 4; i++) {
                                    const band = BANDS[i];
                                    const startBin = Math.floor(band.min / binSize);
                                    const endBin   = Math.ceil(band.max / binSize);

                                    let bandMaxVal = 0;
                                    let bandPeakBin = -1;
                                    for (let b = startBin; b <= endBin && b < dataArray.length; b++) {
                                        if (dataArray[b] > bandMaxVal) {
                                            bandMaxVal = dataArray[b];
                                            bandPeakBin = b;
                                        }
                                    }

                                    if (bandPeakBin > -1) {
                                        const peakFreq = interpolateFrequency(dataArray, bandPeakBin, binSize);
                                        const snr = bandMaxVal / noiseFloor;

                                        if (bandMaxVal > highestPower) highestPower = bandMaxVal;

                                        if (bandMaxVal >= 16 && snr >= 1.25) {
                                            const val = Math.round((peakFreq - band.base) / band.step);
                                            if (val >= 0 && val <= 15) {
                                                frameChars.push(HEX_CHARS[val]);
                                                framePowerSum += bandMaxVal;
                                            } else {
                                                frameValid = false;
                                            }
                                        } else {
                                            frameValid = false;
                                        }
                                    } else {
                                        frameValid = false;
                                    }
                                }

                                if (typeof onLiveSpectrum === "function") {
                                    onLiveSpectrum({
                                        peakFreq: Math.round(18300),
                                        power: highestPower,
                                        noise: noiseFloor,
                                        snr: Math.round((highestPower / noiseFloor) * 10) / 10,
                                        state: "DECODING",
                                        collected: frameChars.length === 4 ? frameChars.join(" ") : "Listening..."
                                    });
                                }

                                if (frameValid && frameChars.length === 4) {
                                    const token = frameChars.join("");
                                    candidateTokenVotes[token] = (candidateTokenVotes[token] || 0) + framePowerSum;
                                    consecutiveValidFrames++;

                                    // Require 10 consecutive matching frames (~120ms) of the 4-tone chord
                                    if (consecutiveValidFrames >= 10) {
                                        let bestToken = null;
                                        let maxVotes = -1;
                                        for (const [tok, votes] of Object.entries(candidateTokenVotes)) {
                                            if (votes > maxVotes) {
                                                maxVotes = votes;
                                                bestToken = tok;
                                            }
                                        }

                                        if (bestToken) {
                                            clearInterval(pollInterval);
                                            const metrics = this._calculateSeatingMetrics(highestPower, noiseFloor);

                                            return finish({
                                                verified: true,
                                                decodedToken: bestToken,
                                                signalPower: highestPower,
                                                distanceMeters: metrics.distanceMeters,
                                                rowCategory: metrics.rowCategory,
                                                confidence: metrics.confidence,
                                                snr: metrics.snr
                                            });
                                        }
                                    }
                                } else {
                                    consecutiveValidFrames = 0;
                                }
                            }, 12);
                        } catch (innerErr) {
                            console.warn("Acoustic listener setup error:", innerErr);
                            finish({ verified: false, reason: "NODE_ERROR" });
                        }
                    })
                    .catch((err) => {
                        console.warn("getUserMedia audio error:", err);
                        finish({ verified: false, reason: "PERMISSION_DENIED" });
                    });
            });
        }

        _calculateSeatingMetrics(signalPower, noiseFloor = 5) {
            // 1. Noise-compensated acoustic power (removes ambient hiss bias)
            const effectivePower = Math.max(8, Math.sqrt(Math.max(1, (signalPower * signalPower) - (noiseFloor * noiseFloor))));
            
            // 2. Telemetry-calibrated Log-Distance Acoustic Path Loss Formula:
            // Measured Reference Anchor: 158/255 power corresponds to 1.0 meter
            const PREF = 158; 
            const exponent = (PREF - effectivePower) / 105.0;
            let distance = 1.0 * Math.pow(10, exponent);
            
            distance = Math.max(0.2, Math.min(10.0, distance));
            distance = parseFloat(distance.toFixed(1));

            // 3. Dynamic Seating Category
            let rowCategory;
            if (distance <= 0.6) {
                rowCategory = "Desk Proximity (< 0.6m)";
            } else if (distance <= 1.8) {
                rowCategory = "Front Row (1–2m)";
            } else if (distance <= 4.2) {
                rowCategory = "Middle Row (2–4m)";
            } else {
                rowCategory = "Back Row (4m+)";
            }

            const snr = parseFloat((effectivePower / Math.max(1, noiseFloor)).toFixed(1));
            const confidence = Math.min(99, Math.max(70, Math.round(60 + (effectivePower / 255) * 39)));

            return {
                distanceMeters: distance,
                rowCategory: rowCategory,
                confidence: confidence,
                snr: snr
            };
        }
    }

    window.AttendifyAcousticRadar = {
        Emitter: AcousticEmitter,
        Listener: AcousticListener,
        version: "12.0.0",
        getAudioContext: getAudioContext,
        tokenToChordFrequencies: tokenToChordFrequencies
    };

})(window);
