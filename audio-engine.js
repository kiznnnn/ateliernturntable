/**
 * RIFT // ATELIER ANALOGUE — Precision Turntable & Morning Cafe Acoustics Engine
 * Features:
 *  - Continuous velocity-tracked vinyl scrub & scratch DSP (harmonic groove buffer + dynamic formant filter)
 *  - Authentic mechanical hardware acoustics (rotary power clunk, quartz-lock pitch detent, hydraulic cue lever, diamond stylus drop)
 *  - Procedural vinyl surface patina (warm dust floor + random micro-pop impulses)
 *  - Morning Jazz Coffee Shop room ambiance generator
 */
class TurntableAudioEngine {
  constructor() {
    this.ctx = null;
    this.audioEl = new Audio();
    this.audioEl.preload = "auto";
    this.preservePitch(false);

    this.isInitialized = false;
    this.masterVolume = 0.85;
    this.crackleAmount = 0.36;
    this.cafeAmbienceAmount = 0.22;
    this.currentRate = 1.0;

    // Web Audio nodes
    this.crackleGain = null;
    this.cafeGain = null;
    this.scratchGain = null;
    this.scratchFilter = null;
    this.scratchSource = null;

    // Callbacks
    this.onTrackEnded = null;
    this.onTimeUpdate = null;
    this.onPlayStateChange = null;

    this.audioEl.addEventListener("ended", () => {
      if (this.onTrackEnded) this.onTrackEnded();
    });
    this.audioEl.addEventListener("timeupdate", () => {
      if (this.onTimeUpdate) {
        this.onTimeUpdate(this.audioEl.currentTime, this.audioEl.duration || 30);
      }
    });
    this.audioEl.addEventListener("play", () => {
      if (this.onPlayStateChange) this.onPlayStateChange(true);
    });
    this.audioEl.addEventListener("pause", () => {
      if (this.onPlayStateChange) this.onPlayStateChange(false);
    });
  }

  preservePitch(flag) {
    if ("preservesPitch" in this.audioEl) this.audioEl.preservesPitch = flag;
    if ("mozPreservesPitch" in this.audioEl) this.audioEl.mozPreservesPitch = flag;
    if ("webkitPreservesPitch" in this.audioEl) this.audioEl.webkitPreservesPitch = flag;
  }

  initContext() {
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();
    this.setupVinylCrackleGenerator();
    this.setupContinuousScratchDSP();
    this.setupMorningCafeAmbience();
    this.isInitialized = true;
  }

  /**
   * 1. Continuous Vinyl Surface Dust & Micro-Pop Generator
   */
  setupVinylCrackleGenerator() {
    if (!this.ctx) return;
    const sr = this.ctx.sampleRate;
    const len = sr * 5;
    const buffer = this.ctx.createBuffer(2, len, sr);

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let b0 = 0, b1 = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.992 * b0 + white * 0.01;
        b1 = 0.965 * b1 + white * 0.022;
        let sample = (b0 + b1) * 0.32;

        const r = Math.random();
        if (r > 0.9994) {
          sample += (Math.random() * 2 - 1) * 0.9;
        } else if (r > 0.9968) {
          sample += (Math.random() * 2 - 1) * 0.24;
        }
        data[i] = sample;
      }
      for (let i = 2; i < len; i++) {
        data[i] = data[i] * 0.68 + data[i - 1] * 0.22 + data[i - 2] * 0.1;
      }
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2250;
    bp.Q.value = 0.75;

    this.crackleGain = this.ctx.createGain();
    this.crackleGain.gain.value = 0.0;

    src.connect(bp);
    bp.connect(this.crackleGain);
    this.crackleGain.connect(this.ctx.destination);
    src.start(0);
  }

  /**
   * 2. Continuous Velocity-Tracked Vinyl Scrub & Scratch DSP
   * Synthesizes a rich harmonic groove texture buffer (warm jazz chord harmonics + wax friction)
   * whose playback rate, resonant formant filter, and gain follow the user's hand drag velocity continuously.
   */
  setupContinuousScratchDSP() {
    if (!this.ctx) return;
    const sr = this.ctx.sampleRate;
    const len = sr * 2;
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);

    // Build a textured groove signal: warm Rhodes/horn harmonic partials + micro-groove surface modulation
    const freqs = [110, 164.81, 220, 261.63, 329.63, 392.0, 493.88];
    let pink = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const white = Math.random() * 2 - 1;
      pink = 0.92 * pink + 0.08 * white;

      // Rhythmic amplitude contour embedded in the groove so scrubbing crosses audible "beats" in the wax
      const grooveEnvelope = 0.55 + 0.45 * Math.sin(t * Math.PI * 7.5) * Math.cos(t * Math.PI * 3.0);
      let tonal = 0;
      for (let f = 0; f < freqs.length; f++) {
        tonal += Math.sin(2 * Math.PI * freqs[f] * t + Math.sin(t * 12) * 0.3) / freqs.length;
      }
      data[i] = (tonal * 0.65 + pink * 0.48) * grooveEnvelope;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 400;
    filter.Q.value = 1.65;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.0;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(0);

    this.scratchSource = src;
    this.scratchFilter = filter;
    this.scratchGain = gain;
  }

  /**
   * Updates the continuous vinyl scrub/scratch DSP in real time as the user drags the record.
   * @param {number} degPerSec - Angular velocity of the user's hand drag in degrees/sec
   * @param {boolean} stylusDown - Whether the needle is currently resting on the vinyl
   */
  updateScratchScrub(degPerSec, stylusDown) {
    if (!this.ctx || !this.scratchGain || !this.scratchFilter || !this.scratchSource) return;
    const now = this.ctx.currentTime;
    const absVel = Math.abs(degPerSec);

    if (!stylusDown || absVel < 4) {
      this.scratchGain.gain.setTargetAtTime(0.0, now, 0.025);
      return;
    }

    // Normal 33.3 RPM is ~200 deg/sec. Map hand speed to pitch & filter cutoff:
    const speedRatio = Math.min(3.8, Math.max(0.15, absVel / 180));
    this.scratchSource.playbackRate.setTargetAtTime(speedRatio, now, 0.012);

    const targetCutoff = Math.min(3400, Math.max(160, 220 + speedRatio * 780));
    this.scratchFilter.frequency.setTargetAtTime(targetCutoff, now, 0.012);

    const targetGain = Math.min(0.26, (0.04 + speedRatio * 0.075) * this.masterVolume);
    this.scratchGain.gain.setTargetAtTime(targetGain, now, 0.012);
  }

  /**
   * 3. Morning Jazz Coffee Shop Room Ambience (Warm room tone + gentle rain/espresso warmth)
   */
  setupMorningCafeAmbience() {
    if (!this.ctx) return;
    const sr = this.ctx.sampleRate;
    const len = sr * 6;
    const buf = this.ctx.createBuffer(2, len, sr);

    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + w * 0.008;
        b1 = 0.985 * b1 + w * 0.012;
        b2 = 0.95 * b2 + w * 0.015;
        // Slow morning room breathe modulation
        const mod = 0.8 + 0.2 * Math.sin((i / len) * Math.PI * 2 + ch);
        d[i] = (b0 + b1 * 0.6 + b2 * 0.25) * 0.28 * mod;
      }
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 680;

    this.cafeGain = this.ctx.createGain();
    this.cafeGain.gain.value = 0.0;

    src.connect(lp);
    lp.connect(this.cafeGain);
    this.cafeGain.connect(this.ctx.destination);
    src.start(0);
  }

  updateSurfaceNoise(stylusOnRecord, normalizedSpeed) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.crackleGain) {
      const speedFactor = Math.min(1.5, Math.max(0, Math.abs(normalizedSpeed)));
      const target = stylusOnRecord ? this.crackleAmount * 0.18 * speedFactor * this.masterVolume : 0.0;
      this.crackleGain.gain.setTargetAtTime(target, now, 0.04);
    }
    if (this.cafeGain) {
      const cafeTarget = this.cafeAmbienceAmount * 0.14 * this.masterVolume;
      this.cafeGain.gain.setTargetAtTime(cafeTarget, now, 0.08);
    }
  }

  /**
   * 4. Realistic Hardware Sound: Heavy Rotary Power Switch Detent Clunk
   */
  playPowerSwitchClunk(isTurningOn = true) {
    this.initContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // 1) Heavy cabinet mechanical thud
    const bodyOsc = this.ctx.createOscillator();
    const bodyGain = this.ctx.createGain();
    bodyOsc.type = "sine";
    bodyOsc.frequency.setValueAtTime(isTurningOn ? 165 : 130, now);
    bodyOsc.frequency.exponentialRampToValueAtTime(38, now + 0.065);
    bodyGain.gain.setValueAtTime(0.34 * this.masterVolume, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    bodyOsc.connect(bodyGain);
    bodyGain.connect(this.ctx.destination);
    bodyOsc.start(now);
    bodyOsc.stop(now + 0.075);

    // 2) Crisp spring-loaded brass detent snap (12ms delayed double-click like a real rotary cam)
    const snapBuf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.025), this.ctx.sampleRate);
    const ch = snapBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.0025));
    }
    const snapSrc = this.ctx.createBufferSource();
    snapSrc.buffer = snapBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = isTurningOn ? 2850 : 2100;
    bp.Q.value = 3.2;
    const snapGain = this.ctx.createGain();
    snapGain.gain.value = 0.35 * this.masterVolume;

    snapSrc.connect(bp);
    bp.connect(snapGain);
    snapGain.connect(this.ctx.destination);
    snapSrc.start(now + 0.008);
  }

  /**
   * 5. Realistic Hardware Sound: Stylus Needle Drop onto Vinyl Groove
   */
  playNeedleDropSound(isLanding = true) {
    this.initContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Low phono cartridge suspension resonance (55Hz thump)
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(isLanding ? 128 : 92, now);
    osc.frequency.exponentialRampToValueAtTime(26, now + 0.16);
    gain.gain.setValueAtTime((isLanding ? 0.38 : 0.2) * this.masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);

    if (isLanding) {
      // Diamond tip touching spinning PVC groove transient + initial vinyl crackle burst
      const len = Math.floor(this.ctx.sampleRate * 0.06);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const env = Math.exp(-i / (this.ctx.sampleRate * 0.009));
        d[i] = (Math.random() * 2 - 1) * env;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const hp = this.ctx.createBiquadFilter();
      hp.type = "bandpass";
      hp.frequency.value = 2600;
      hp.Q.value = 1.4;
      const g = this.ctx.createGain();
      g.gain.value = 0.28 * this.masterVolume;
      src.connect(hp);
      hp.connect(g);
      g.connect(this.ctx.destination);
      src.start(now + 0.015);
    }
  }

  /**
   * 6. Realistic Hardware Sound: Hydraulic Cueing Lever Toggle
   */
  playCueLeverSound(isLowering = true) {
    this.initContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Metallic lever toggle tick + soft pneumatic hiss
    const len = Math.floor(this.ctx.sampleRate * 0.08);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const clickEnv = Math.exp(-i / (this.ctx.sampleRate * 0.002));
      const hissEnv = Math.sin((i / len) * Math.PI) * 0.18;
      d[i] = (Math.random() * 2 - 1) * (clickEnv * 0.8 + hissEnv);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = isLowering ? 1850 : 2450;
    filter.Q.value = 1.8;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.24 * this.masterVolume;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(now);
  }

  /**
   * 7. Realistic Hardware Sound: Pitch Fader Slide & Center 0.0% Quartz Detent Click
   */
  playPitchFaderTick(isCenterDetent = false) {
    this.initContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isCenterDetent ? "triangle" : "sine";
    osc.frequency.setValueAtTime(isCenterDetent ? 1420 : 620, now);
    osc.frequency.exponentialRampToValueAtTime(isCenterDetent ? 340 : 190, now + (isCenterDetent ? 0.024 : 0.012));

    gain.gain.setValueAtTime((isCenterDetent ? 0.22 : 0.05) * this.masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isCenterDetent ? 0.026 : 0.014));

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.03);
  }

  playMechanicalClick(pitchMultiplier = 1.0) {
    this.initContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Short noise burst + resonant wood/metal switch body
    const len = Math.floor(this.ctx.sampleRate * 0.018);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.0022));
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1950 * pitchMultiplier;
    bp.Q.value = 2.4;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.25 * this.masterVolume;

    src.connect(bp);
    bp.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(now);
  }

  loadTrack(previewUrl, autoPlay = false, startOffsetRatio = 0) {
    this.initContext();
    if (!previewUrl) return;

    const isSameUrl = this.audioEl.src === previewUrl;
    if (!isSameUrl) {
      this.audioEl.src = previewUrl;
      this.audioEl.load();
    }
    this.audioEl.volume = this.masterVolume;
    this.preservePitch(false);
    this.audioEl.playbackRate = Math.max(0.25, Math.min(3.0, this.currentRate));

    const applySeekAndPlay = () => {
      if (startOffsetRatio > 0 && this.audioEl.duration && isFinite(this.audioEl.duration)) {
        this.audioEl.currentTime = Math.min(
          this.audioEl.duration - 0.4,
          Math.max(0, startOffsetRatio * this.audioEl.duration)
        );
      }
      if (autoPlay) {
        this.audioEl.play().catch(() => {});
      }
    };

    if (this.audioEl.readyState >= 1) {
      applySeekAndPlay();
    } else {
      this.audioEl.addEventListener("loadedmetadata", applySeekAndPlay, { once: true });
    }
  }

  play() {
    this.initContext();
    if (this.audioEl.src) {
      this.audioEl.play().catch(() => {});
    }
  }

  pause() {
    this.audioEl.pause();
  }

  setPlaybackRate(rate) {
    this.currentRate = rate;
    const clamped = Math.max(0.2, Math.min(3.5, Math.abs(rate) || 0.25));
    try {
      this.preservePitch(false);
      this.audioEl.playbackRate = clamped;
    } catch (e) {}
  }

  setVolume(val) {
    this.masterVolume = Math.max(0, Math.min(1, val));
    this.audioEl.volume = this.masterVolume;
  }

  setCrackle(val) {
    this.crackleAmount = Math.max(0, Math.min(1, val));
  }

  setCafeAmbience(val) {
    this.cafeAmbienceAmount = Math.max(0, Math.min(1, val));
  }

  seekToRatio(ratio) {
    if (this.audioEl.duration && isFinite(this.audioEl.duration)) {
      this.audioEl.currentTime = Math.max(
        0,
        Math.min(this.audioEl.duration - 0.15, ratio * this.audioEl.duration)
      );
    }
  }

  getProgressRatio() {
    if (!this.audioEl.duration || !isFinite(this.audioEl.duration) || this.audioEl.duration <= 0) {
      return 0;
    }
    return Math.min(1, Math.max(0, this.audioEl.currentTime / this.audioEl.duration));
  }
}

window.TurntableAudioEngine = TurntableAudioEngine;
