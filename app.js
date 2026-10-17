/**
 * RIFT // ATELIER ONE — 1:1 Turntable Physics, Tonearm Kinematics & Audio Controller
 * Features:
 *  - Buttery-smooth 60/120fps GPU-composited vinyl rotation (calm, hypnotic real-wax cadence)
 *  - No media play/pause buttons on the plinth: drop the needle onto the record (or press Spacebar) to play
 *  - Realistic rotary power switch (OFF / ON), 33 / 45 / 78 speed bank, hydraulic cue lever wand,
 *    and animated recessed Pitch Fader (-8% to +8%) with Quartz Lock center detent
 *  - Continuous velocity-tracked vinyl scrub & scratch DSP
 */
(function () {
  const catalog = Array.isArray(window.INITIAL_VINYL_CATALOG)
    ? [...window.INITIAL_VINYL_CATALOG]
    : [];

  const audio = new window.TurntableAudioEngine();

  const state = {
    albumIndex: 0,
    trackIndex: 0,
    motorPower: true,         // Rotary power switch ON by default
    stylusDropped: false,     // Music plays ONLY when needle is on the record (and cue is down)
    isCuedUp: false,          // Hydraulic cueing lever state
    isDraggingVinyl: false,
    isDraggingTonearm: false,
    isDraggingPitch: false,

    // Rotational physics (unwrapped continuous angle for zero-jitter GPU compositing)
    rpmBase: 33.3,            // 33.3, 45, 78
    pitchPercent: 0,          // -8.0 to +8.0
    platterAngle: 0,          // continuous degrees
    pulleyAngle: 0,           // continuous degrees
    angularVelocityDegPerSec: 0,
    lastPointerAngle: 0,
    lastPointerTime: 0,

    // Tonearm kinematics (0 deg = parked on armrest, 18.5 deg = outer Track 1 groove, 41.5 deg = inner label)
    tonearmAngle: 0,
    OUTER_GROOVE_DEG: 18.5,
    INNER_GROOVE_DEG: 41.5,

    // Configurator state
    chassis: "obsidian",      // "obsidian" | "espresso" | "silver"
    discStyle: "picture"      // "picture" | "classic" | "amber"
  };

  const els = {};

  function cacheElements() {
    const ids = [
      "heroStage", "heroWatermarkText", "eyebrowDot", "eyebrowStatusText",
      "heroDisplayTitle", "heroAlbumSubtitle", "dropNeedlePillBtn", "dropNeedlePillText",
      "grooveSideLabel", "grooveTracksContainer",
      "vinylDisc", "vinylFullbleedArt", "vinylTrackBands", "vinylRimEngraving",
      "vinylCenterLabel", "labelArtRing", "labelTextTop", "labelTextBottom",
      "platterStrobeRim", "rimProgressFill", "brassMotorSpindle",
      "rotaryPowerKnob", "strobeLedWindow",
      "tonearmPivotCenter", "tonearmRig", "tonearmHeadshell", "hydraulicCueAssembly",
      "pitchSlotWell", "pitchFaderCap", "quartzLockLed", "pitchResetBtn",
      "teleRpm", "teleRadius", "telePitch", "teleTime",
      "crackleRange", "cafeRange", "gainRange", "configSummaryText",
      "latheSearchForm", "latheArtistInput", "latheAlbumInput", "latheSubmitBtn",
      "crateSleevesGrid", "topDropNeedleCta", "studioToast"
    ];
    ids.forEach((id) => {
      els[id] = document.getElementById(id);
    });
  }

  function showToast(msg) {
    if (!els.studioToast) return;
    els.studioToast.textContent = msg;
    els.studioToast.classList.add("visible");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      els.studioToast.classList.remove("visible");
    }, 2800);
  }

  function getCurrentAlbum() {
    return catalog[state.albumIndex] || catalog[0];
  }

  function getCurrentTrack() {
    const album = getCurrentAlbum();
    if (!album || !album.tracks || !album.tracks.length) return null;
    return album.tracks[state.trackIndex] || album.tracks[0];
  }

  function getEffectiveRpm() {
    return state.rpmBase * (1 + state.pitchPercent / 100);
  }

  function getNormalizedPlaybackRate() {
    return getEffectiveRpm() / 33.3;
  }

  function isNeedleActivelyPlaying() {
    return state.motorPower && state.stylusDropped && !state.isCuedUp;
  }

  /**
   * Computes target tonearm angle [18.5 .. 41.5] based on current album track & progress
   */
  function computeTargetTonearmAngle() {
    if (!state.stylusDropped) return 0;
    const album = getCurrentAlbum();
    const totalTracks = (album && album.tracks && album.tracks.length) || 1;
    const trackRatio = audio.getProgressRatio();
    const overallProgress = Math.min(
      1,
      Math.max(0, (state.trackIndex + trackRatio) / totalTracks)
    );
    return (
      state.OUTER_GROOVE_DEG +
      overallProgress * (state.INNER_GROOVE_DEG - state.OUTER_GROOVE_DEG)
    );
  }

  function getGrooveRadiusMm(angleDeg) {
    if (angleDeg < state.OUTER_GROOVE_DEG - 2) return 150;
    const norm = Math.min(
      1,
      Math.max(
        0,
        (angleDeg - state.OUTER_GROOVE_DEG) /
          (state.INNER_GROOVE_DEG - state.OUTER_GROOVE_DEG)
      )
    );
    return Math.round(146 - norm * 86);
  }

  function renderVinylGrooveBands(album) {
    if (!els.vinylTrackBands || !album || !album.tracks) return;
    const n = album.tracks.length;
    const stops = [];
    for (let i = 1; i < n; i++) {
      const pct = 95 - (i / n) * 57;
      stops.push(
        `transparent ${pct - 0.22}%`,
        `rgba(255, 255, 255, 0.13) ${pct}%`,
        `rgba(0, 0, 0, 0.58) ${pct + 0.18}%`,
        `transparent ${pct + 0.42}%`
      );
    }
    els.vinylTrackBands.style.background = stops.length
      ? `radial-gradient(circle at 50% 50%, ${stops.join(", ")})`
      : "none";
  }

  function renderAlbumState() {
    const album = getCurrentAlbum();
    if (!album) return;
    const track = getCurrentTrack();

    // Shift the warm espresso/sunrise radial light glow behind the turntable to match the album!
    document.documentElement.style.setProperty("--glow-primary", album.glowPrimary || "#D9531E");
    document.documentElement.style.setProperty("--glow-secondary", album.glowSecondary || "#6E230B");

    if (els.heroWatermarkText) {
      els.heroWatermarkText.textContent = album.title.toLowerCase();
    }
    if (els.heroDisplayTitle) {
      els.heroDisplayTitle.textContent = album.title;
    }
    if (els.heroAlbumSubtitle) {
      els.heroAlbumSubtitle.textContent = `${album.artist} • ${album.year} • ${album.tracks.length} tracks pressed on 180g audiophile vinyl. Drag the tonearm onto the wax to listen.`;
    }

    // Vinyl disc textures & labels
    if (els.vinylFullbleedArt) {
      els.vinylFullbleedArt.style.backgroundImage = `url("${album.artwork}")`;
    }
    if (els.labelArtRing) {
      els.labelArtRing.style.backgroundImage = `url("${album.artwork}")`;
    }
    if (els.vinylCenterLabel) {
      els.vinylCenterLabel.style.backgroundColor = album.labelBg || "#F4EFE6";
      els.vinylCenterLabel.style.color = album.labelInk || "#141210";
    }
    if (els.labelTextTop) els.labelTextTop.textContent = album.artist;
    if (els.labelTextBottom) els.labelTextBottom.textContent = album.title;
    if (els.vinylRimEngraving) els.vinylRimEngraving.textContent = `• ${album.artist} •`;

    renderVinylGrooveBands(album);
    renderGrooveTracklist(album);
    state.carouselIndex = state.albumIndex;
    renderCrateGrid();
    renderSleeveCarousel();
    updateHardwareStatusUI();
    updateConfiguratorSummary();
  }

  function renderGrooveTracklist(album) {
    if (!els.grooveTracksContainer) return;
    els.grooveTracksContainer.innerHTML = "";
    const total = album.tracks.length;

    album.tracks.forEach((t, idx) => {
      const row = document.createElement("div");
      const isCurrent = idx === state.trackIndex && state.stylusDropped;
      row.className = "groove-track-item" + (isCurrent ? " active" : "");
      const numStr = String(idx + 1).padStart(2, "0");
      const radiusMm = Math.round(146 - (idx / Math.max(1, total)) * 84);

      row.innerHTML = `
        <span class="groove-track-num">${numStr}</span>
        <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.title}</span>
        <span class="groove-track-mm">${radiusMm}mm</span>
      `;
      row.addEventListener("click", () => {
        dropNeedleOnTrack(idx, 0);
      });
      els.grooveTracksContainer.appendChild(row);
    });

    const activeRow = els.grooveTracksContainer.querySelector(".groove-track-item.active");
    if (activeRow) {
      activeRow.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function renderCrateGrid() {
    if (!els.crateSleevesGrid) return;
    els.crateSleevesGrid.innerHTML = "";

    catalog.forEach((album, idx) => {
      const card = document.createElement("div");
      card.className = "vinyl-sleeve-card" + (idx === state.albumIndex ? " active-sleeve" : "");
      card.innerHTML = `
        <div class="sleeve-art-stage">
          <div class="sleeve-peeking-disc"></div>
          <img class="sleeve-cover-img" src="${album.artwork}" alt="${album.title}" loading="lazy" />
        </div>
        <div class="sleeve-meta-title">${album.title}</div>
        <div class="sleeve-meta-artist">${album.artist}</div>
        <div class="sleeve-meta-year">${album.year} • ${album.tracks.length} TRACKS</div>
      `;
      card.addEventListener("click", () => {
        mountAlbumOnPlatter(idx, true);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      els.crateSleevesGrid.appendChild(card);
    });
  }

  /**
   * Mounts a record from the crate onto the platter and swings the tonearm over to Track 1
   */
  function mountAlbumOnPlatter(albumIdx, autoDropNeedle = true) {
    audio.playMechanicalClick(0.92);
    state.albumIndex = albumIdx;
    state.trackIndex = 0;
    state.isCuedUp = false;

    if (!state.motorPower) {
      state.motorPower = true;
      audio.playPowerSwitchClunk(true);
    }

    renderAlbumState();
    if (autoDropNeedle) {
      dropNeedleOnTrack(0, 0);
      showToast(`Mounted "${getCurrentAlbum().title}" — Dropping stylus on Track 01`);
    } else {
      parkTonearm();
      showToast(`Mounted "${getCurrentAlbum().title}" on platter`);
    }
  }

  /**
   * Swings the tonearm over to the specified track groove and drops the diamond stylus
   */
  function dropNeedleOnTrack(trackIdx, offsetRatio = 0) {
    const album = getCurrentAlbum();
    if (!album || !album.tracks[trackIdx]) return;

    if (!state.motorPower) {
      state.motorPower = true;
      audio.playPowerSwitchClunk(true);
    }

    state.trackIndex = trackIdx;
    state.stylusDropped = true;
    state.isCuedUp = false;

    const track = album.tracks[trackIdx];
    audio.playNeedleDropSound(true);
    audio.loadTrack(track.previewUrl, true, offsetRatio);

    renderGrooveTracklist(album);
    updateHardwareStatusUI();
  }

  /**
   * Lifts the tonearm off the record and returns it to the armrest cradle
   */
  function parkTonearm() {
    const wasDropped = state.stylusDropped;
    state.stylusDropped = false;
    state.isCuedUp = false;
    audio.pause();
    if (wasDropped) {
      audio.playNeedleDropSound(false);
    }
    renderGrooveTracklist(getCurrentAlbum());
    updateHardwareStatusUI();
  }

  /**
   * Spacebar / Pill CTA handler: drops the needle onto the record if parked, or parks it if playing
   */
  function toggleNeedleDrop() {
    if (!state.stylusDropped) {
      dropNeedleOnTrack(state.trackIndex, audio.getProgressRatio());
      showToast(`Stylus dropped on "${getCurrentTrack().title}"`);
    } else if (state.isCuedUp) {
      // Lower hydraulic cue lever back onto the groove
      state.isCuedUp = false;
      audio.playCueLeverSound(true);
      audio.playNeedleDropSound(true);
      if (state.motorPower) audio.play();
      updateHardwareStatusUI();
    } else {
      parkTonearm();
      showToast("Stylus lifted — Tonearm returned to rest");
    }
  }

  function updateHardwareStatusUI() {
    const playing = isNeedleActivelyPlaying();
    const album = getCurrentAlbum();
    const track = getCurrentTrack();

    if (els.rotaryPowerKnob) {
      els.rotaryPowerKnob.classList.toggle("power-on", state.motorPower);
    }
    if (els.strobeLedWindow) {
      els.strobeLedWindow.classList.toggle("lit", state.motorPower);
    }
    if (els.hydraulicCueAssembly) {
      els.hydraulicCueAssembly.classList.toggle("cued-up", state.isCuedUp);
    }
    if (els.eyebrowDot) {
      els.eyebrowDot.classList.toggle("playing", playing);
    }
    if (els.eyebrowStatusText) {
      if (!state.motorPower) {
        els.eyebrowStatusText.textContent = "MOTOR OFF // TURN ROTARY KNOB OR DROP NEEDLE";
      } else if (!state.stylusDropped) {
        els.eyebrowStatusText.textContent = "PLATTER READY // DRAG TONEARM ONTO RECORD TO PLAY";
      } else if (state.isCuedUp) {
        els.eyebrowStatusText.textContent = `CUE LEVER LIFTED // ${track ? track.title.toUpperCase() : ""}`;
      } else {
        els.eyebrowStatusText.textContent = `NOW SPINNING // ${track ? track.title.toUpperCase() : ""} (${getEffectiveRpm().toFixed(1)} RPM)`;
      }
    }

    if (els.dropNeedlePillText) {
      els.dropNeedlePillText.textContent = playing ? "Lift Stylus & Park" : "Drop Needle on Wax";
    }
    if (els.grooveSideLabel && album && track) {
      const side = state.trackIndex < Math.ceil(album.tracks.length / 2) ? "SIDE A" : "SIDE B";
      els.grooveSideLabel.textContent = `${side} • TRACK ${String(state.trackIndex + 1).padStart(2, "0")} — ${track.title}`;
    }
  }

  function updateConfiguratorSummary() {
    if (!els.configSummaryText) return;
    const finishNames = {
      obsidian: "Matte Obsidian",
      espresso: "Sunburst Espresso",
      silver: "Brushed Silver PC-4"
    };
    const waxNames = {
      picture: "Full-Bleed Picture Disc",
      classic: "180g Classic Black Wax",
      amber: "Translucent Amber Wax"
    };
    els.configSummaryText.textContent = `Atelier One / ${finishNames[state.chassis]} / ${waxNames[state.discStyle]}`;
  }

  /**
   * Continuous Album Playback: automatically advances across every track groove on the record!
   */
  audio.onTrackEnded = () => {
    const album = getCurrentAlbum();
    if (!album) return;
    if (state.trackIndex + 1 < album.tracks.length) {
      state.trackIndex += 1;
      renderGrooveTracklist(album);
      updateHardwareStatusUI();
      const nextTrack = album.tracks[state.trackIndex];
      audio.loadTrack(nextTrack.previewUrl, true, 0);
    } else {
      // End of record run-out groove -> auto-return tonearm to rest!
      state.trackIndex = 0;
      parkTonearm();
      showToast("Run-out groove reached — Tonearm auto-returned");
    }
  };

  audio.onTimeUpdate = (cur, dur) => {
    const album = getCurrentAlbum();
    const totalTracks = (album && album.tracks.length) || 1;
    const trackRatio = dur > 0 ? cur / dur : 0;
    const overallRatio = Math.min(1, Math.max(0, (state.trackIndex + trackRatio) / totalTracks));

    if (els.rimProgressFill) {
      const offset = 942 - overallRatio * 942;
      els.rimProgressFill.style.strokeDashoffset = String(offset);
    }
    if (els.teleTime) {
      const m = Math.floor(cur / 60);
      const s = String(Math.floor(cur % 60)).padStart(2, "0");
      els.teleTime.textContent = `${m}:${s}`;
    }
  };

  /**
   * Direct Pointer-Drag Vinyl Scrubbing & Scratching with Continuous Harmonic DSP
   */
  function setupVinylScratchInteractions() {
    const disc = els.vinylDisc;
    if (!disc) return;

    let centerCache = { x: 0, y: 0 };

    const updateCenterCache = () => {
      const r = disc.getBoundingClientRect();
      centerCache = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };

    const getPointerAngle = (clientX, clientY) => {
      return Math.atan2(clientY - centerCache.y, clientX - centerCache.x) * (180 / Math.PI);
    };

    disc.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      updateCenterCache();
      disc.setPointerCapture(e.pointerId);
      state.isDraggingVinyl = true;
      state.lastPointerAngle = getPointerAngle(e.clientX, e.clientY);
      state.lastPointerTime = performance.now();
      audio.initContext();
    });

    disc.addEventListener("pointermove", (e) => {
      if (!state.isDraggingVinyl) return;
      const currentAngle = getPointerAngle(e.clientX, e.clientY);
      let delta = currentAngle - state.lastPointerAngle;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;

      const now = performance.now();
      const dtMs = Math.max(4, now - state.lastPointerTime);
      const degPerSec = (delta / dtMs) * 1000;

      // Rotate platter and pulley 1:1 with hand movement
      state.platterAngle += delta;
      state.pulleyAngle += delta * 3.6;
      state.angularVelocityDegPerSec = degPerSec;

      const stylusDown = state.stylusDropped && !state.isCuedUp;
      // Trigger continuous velocity-tracked Web Audio vinyl scratch & scrub DSP!
      audio.updateScratchScrub(degPerSec, stylusDown);

      if (stylusDown) {
        const curRatio = audio.getProgressRatio();
        const nextRatio = Math.min(0.995, Math.max(0, curRatio + delta * 0.00055));
        audio.seekToRatio(nextRatio);

        // Varispeed pitch bend on the song stream proportional to hand speed
        const handSpeedRate = Math.min(3.0, Math.max(0.22, Math.abs(degPerSec) / 55));
        audio.setPlaybackRate(handSpeedRate);
      }

      state.lastPointerAngle = currentAngle;
      state.lastPointerTime = now;
    });

    const releaseVinyl = (e) => {
      if (!state.isDraggingVinyl) return;
      state.isDraggingVinyl = false;
      try {
        disc.releasePointerCapture(e.pointerId);
      } catch (err) {}
      audio.updateScratchScrub(0, false);
      audio.setPlaybackRate(getNormalizedPlaybackRate());
    };

    disc.addEventListener("pointerup", releaseVinyl);
    disc.addEventListener("pointercancel", releaseVinyl);
  }

  /**
   * Draggable 1:1 Gimbal Tonearm Headshell
   * Drop the needle anywhere on the record to start playing that exact track groove!
   */
  function setupTonearmDragInteractions() {
    const headshell = els.tonearmHeadshell;
    const pivotEl = els.tonearmPivotCenter;
    const rigEl = els.tonearmRig;
    if (!headshell || !pivotEl || !rigEl) return;

    let pivotCenter = { x: 0, y: 0 };

    const computeAngleFromPointer = (clientX, clientY) => {
      const dx = clientX - pivotCenter.x;
      const dy = clientY - pivotCenter.y;
      const angleDeg = Math.atan2(-dx, dy) * (180 / Math.PI);
      return Math.max(0, Math.min(44, angleDeg));
    };

    headshell.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const rect = pivotEl.getBoundingClientRect();
      pivotCenter = { x: rect.left, y: rect.top };
      headshell.setPointerCapture(e.pointerId);
      state.isDraggingTonearm = true;
      rigEl.classList.add("dragging");
      audio.initContext();
      audio.playMechanicalClick(1.18);
    });

    headshell.addEventListener("pointermove", (e) => {
      if (!state.isDraggingTonearm) return;
      const angle = computeAngleFromPointer(e.clientX, e.clientY);
      state.tonearmAngle = angle;
      rigEl.style.transform = `translate3d(0,0,0) rotate(${angle.toFixed(3)}deg)`;
      if (els.teleRadius) {
        els.teleRadius.textContent = `${getGrooveRadiusMm(angle)} mm`;
      }
    });

    const endTonearmDrag = (e) => {
      if (!state.isDraggingTonearm) return;
      state.isDraggingTonearm = false;
      rigEl.classList.remove("dragging");
      try {
        headshell.releasePointerCapture(e.pointerId);
      } catch (err) {}

      // If released near armrest (< 13 deg), park the tonearm and stop playback
      if (state.tonearmAngle < 13) {
        state.tonearmAngle = 0;
        rigEl.style.transform = `translate3d(0,0,0) rotate(0deg)`;
        parkTonearm();
        showToast("Tonearm parked on armrest cradle");
        return;
      }

      // Dropped onto the vinyl grooves! Map angle [18.5 .. 41.5] to track & offset
      const album = getCurrentAlbum();
      if (!album || !album.tracks.length) return;
      const clamped = Math.max(
        state.OUTER_GROOVE_DEG,
        Math.min(state.INNER_GROOVE_DEG, state.tonearmAngle)
      );
      const norm =
        (clamped - state.OUTER_GROOVE_DEG) /
        (state.INNER_GROOVE_DEG - state.OUTER_GROOVE_DEG);
      const exactTrackFloat = norm * album.tracks.length;
      const targetTrackIdx = Math.min(
        album.tracks.length - 1,
        Math.max(0, Math.floor(exactTrackFloat))
      );
      const withinTrackOffset = exactTrackFloat - targetTrackIdx;

      dropNeedleOnTrack(targetTrackIdx, withinTrackOffset * 0.85);
      showToast(
        `Needle dropped at ${getGrooveRadiusMm(clamped)}mm — "${album.tracks[targetTrackIdx].title}"`
      );
    };

    headshell.addEventListener("pointerup", endTonearmDrag);
    headshell.addEventListener("pointercancel", endTonearmDrag);
  }

  /**
   * Animated Recessed Pitch Fader (-8% to +8%) with Center 0.0% Quartz Detent Click
   */
  function setupRecessedPitchFader() {
    const well = els.pitchSlotWell;
    const cap = els.pitchFaderCap;
    if (!well || !cap) return;

    let lastTickStep = 0;

    const setPitchFromValue = (val, animateCap = true) => {
      let clamped = Math.max(-8, Math.min(8, val));
      // Magnetic center quartz detent snap around 0.0%
      const wasZero = Math.abs(state.pitchPercent) < 0.05;
      if (Math.abs(clamped) < 0.38) {
        clamped = 0;
      }

      const crossedZero = !wasZero && clamped === 0;
      const tickStep = Math.round(clamped * 2);
      if (crossedZero) {
        audio.playPitchFaderTick(true);
      } else if (tickStep !== lastTickStep) {
        audio.playPitchFaderTick(false);
        lastTickStep = tickStep;
      }

      state.pitchPercent = clamped;
      audio.setPlaybackRate(getNormalizedPlaybackRate());

      // Position 3D fader cap inside slot (top 10% = -8%, 50% = 0%, 90% = +8%)
      const pctTop = 50 + (clamped / 8) * 40;
      if (!animateCap) {
        cap.classList.add("dragging");
      } else {
        cap.classList.remove("dragging");
      }
      cap.style.top = `${pctTop.toFixed(2)}%`;

      if (els.quartzLockLed) {
        els.quartzLockLed.classList.toggle("locked", clamped === 0);
      }
      if (els.telePitch) {
        const sign = clamped > 0 ? "+" : "";
        els.telePitch.textContent = `${sign}${clamped.toFixed(1)}%`;
      }
      updateHardwareStatusUI();
    };

    const updateFromPointerY = (clientY, animate) => {
      const rect = well.getBoundingClientRect();
      const relY = (clientY - rect.top) / rect.height;
      const norm = Math.max(0, Math.min(1, (relY - 0.1) / 0.8));
      const pitchVal = -8 + norm * 16;
      setPitchFromValue(pitchVal, animate);
    };

    well.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      well.setPointerCapture(e.pointerId);
      state.isDraggingPitch = true;
      audio.initContext();
      // If user clicked the slot away from the cap, animate smoothly first!
      updateFromPointerY(e.clientY, true);
    });

    well.addEventListener("pointermove", (e) => {
      if (!state.isDraggingPitch) return;
      updateFromPointerY(e.clientY, false);
    });

    const endPitchDrag = (e) => {
      if (!state.isDraggingPitch) return;
      state.isDraggingPitch = false;
      cap.classList.remove("dragging");
      try {
        well.releasePointerCapture(e.pointerId);
      } catch (err) {}
    };

    well.addEventListener("pointerup", endPitchDrag);
    well.addEventListener("pointercancel", endPitchDrag);

    if (els.pitchResetBtn) {
      els.pitchResetBtn.addEventListener("click", () => {
        setPitchFromValue(0, true);
        showToast("Quartz Pitch Lock engaged (0.0%)");
      });
    }
  }

  /**
   * Buttery-Smooth 60/120fps Hardware Physics Loop
   * Uses unwrapped floating-point rotation with translate3d(0,0,0) and zero DOM layout reads.
   * Calibrated so 33⅓ RPM has a hypnotic, true-to-life visual rotation speed (~54 deg/sec).
   */
  function startTurntablePhysicsLoop() {
    let lastTime = performance.now();

    function frame(now) {
      const dtMs = Math.min(48, now - lastTime);
      lastTime = now;

      const dtSec = dtMs / 1000;
      const effectiveRpm = getEffectiveRpm();

      // Platter rotates when motor power is ON and needle is dropped (or platter is spinning)
      // Calibrated visual angular speed: 54 deg/sec at 33.3 RPM (~6.6s per full revolution)
      // so the eye can smoothly track the spinning vinyl grooves and label at 60/120fps without blur!
      const platterShouldSpin = state.motorPower && state.stylusDropped;
      const targetDegPerSec = platterShouldSpin ? (effectiveRpm / 33.3) * 54.0 : 0;

      if (!state.isDraggingVinyl) {
        // Smooth belt-drive inertia ramp
        state.angularVelocityDegPerSec +=
          (targetDegPerSec - state.angularVelocityDegPerSec) * Math.min(1, dtSec * 5.5);

        // Decay scratch synth when not dragging
        audio.updateScratchScrub(0, false);

        if (Math.abs(state.angularVelocityDegPerSec) > 0.02) {
          const deltaDeg = state.angularVelocityDegPerSec * dtSec;
          state.platterAngle += deltaDeg;
          state.pulleyAngle += deltaDeg * 3.6;
        }
      }

      // GPU-composited sub-pixel rotation (no % 360 snap!)
      if (els.vinylDisc) {
        els.vinylDisc.style.transform = `translate3d(0,0,0) rotate(${state.platterAngle.toFixed(3)}deg)`;
      }
      if (els.platterStrobeRim) {
        els.platterStrobeRim.style.transform = `translate3d(0,0,0) rotate(${(state.platterAngle * 0.65).toFixed(3)}deg)`;
      }
      if (els.brassMotorSpindle) {
        els.brassMotorSpindle.style.transform = `translate3d(0,0,0) rotate(${state.pulleyAngle.toFixed(3)}deg)`;
      }

      // Smoothly advance tonearm across the groove when not being dragged by hand
      if (!state.isDraggingTonearm && els.tonearmRig) {
        const targetArm = computeTargetTonearmAngle();
        state.tonearmAngle += (targetArm - state.tonearmAngle) * Math.min(1, dtSec * 8.0);
        els.tonearmRig.style.transform = `translate3d(0,0,0) rotate(${state.tonearmAngle.toFixed(3)}deg)`;
      }

      // Update live telemetry readouts
      if (els.teleRpm) {
        const currentRpmDisplay =
          (Math.abs(state.angularVelocityDegPerSec) / 54.0) * 33.3;
        els.teleRpm.textContent = `${currentRpmDisplay.toFixed(1)} RPM`;
      }
      if (els.teleRadius) {
        els.teleRadius.textContent = `${getGrooveRadiusMm(state.tonearmAngle)} mm`;
      }

      // Update vinyl surface dust crackle & morning cafe room tone
      const stylusTouchingWax =
        state.motorPower && state.stylusDropped && !state.isCuedUp && state.tonearmAngle >= 14;
      const normSpeed = Math.abs(state.angularVelocityDegPerSec) / 54.0;
      audio.updateSurfaceNoise(stylusTouchingWax, normSpeed);

      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }

  /**
   * Live Global Album Pressing via Apple Music / iTunes Search API
   */
  async function pressCustomVinyl(artistQuery, albumQuery) {
    const combined = `${artistQuery || ""} ${albumQuery || ""}`.trim();
    if (!combined) {
      showToast("Enter an artist or album name to press onto vinyl");
      return;
    }

    const btn = els.latheSubmitBtn;
    const origHtml = btn.innerHTML;
    btn.textContent = "Cutting Master Lacquer...";
    btn.disabled = true;

    try {
      const q = encodeURIComponent(combined);
      const res = await fetch(`https://itunes.apple.com/search?term=${q}&entity=album&limit=8`);
      const data = await res.json();
      const candidates = data.results || [];
      if (!candidates.length) {
        showToast(`No master found for "${combined}"`);
        return;
      }

      let pressedAlbum = null;
      for (const c of candidates) {
        const tRes = await fetch(
          `https://itunes.apple.com/lookup?id=${c.collectionId}&entity=song`
        );
        const tData = await tRes.json();
        const tracks = (tData.results || []).filter(
          (r) => r.wrapperType === "track" && r.previewUrl
        );
        if (tracks.length > 0) {
          pressedAlbum = {
            id: String(c.collectionId),
            title: c.collectionName,
            artist: c.artistName,
            year: (c.releaseDate || "2024").slice(0, 4),
            genre: c.primaryGenreName || "Custom Pressing",
            note: `CUSTOM PRESSING // ${c.artistName.toUpperCase()} (${(c.releaseDate || "").slice(0, 4)})`,
            artwork: (c.artworkUrl100 || "").replace("100x100bb", "1000x1000bb"),
            glowPrimary: "#D9531E",
            glowSecondary: "#6E230B",
            labelBg: "#F4EFE6",
            labelInk: "#141210",
            tracks: tracks.map((t, idx) => ({
              number: t.trackNumber || idx + 1,
              title: t.trackName,
              durationMs: t.trackTimeMillis || 30000,
              previewUrl: t.previewUrl
            }))
          };
          break;
        }
      }

      if (!pressedAlbum) {
        showToast("Album found, but audio streams are unavailable in this region");
        return;
      }

      catalog.unshift(pressedAlbum);
      if (els.latheArtistInput) els.latheArtistInput.value = "";
      if (els.latheAlbumInput) els.latheAlbumInput.value = "";
      mountAlbumOnPlatter(0, true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      showToast(`Pressed "${pressedAlbum.title}" by ${pressedAlbum.artist} onto 180g wax!`);
    } catch (e) {
      showToast("Could not connect to vinyl catalog server");
    } finally {
      btn.innerHTML = origHtml;
      btn.disabled = false;
    }
  }

  function bindHardwareControls() {
    // 1. Rotary Power Switch (OFF / ON)
    if (els.rotaryPowerKnob) {
      els.rotaryPowerKnob.addEventListener("click", () => {
        state.motorPower = !state.motorPower;
        audio.playPowerSwitchClunk(state.motorPower);
        if (!state.motorPower) {
          audio.pause();
          showToast("Turntable motor switched OFF — Platter coasting to stop");
        } else {
          if (state.stylusDropped && !state.isCuedUp) {
            audio.play();
          }
          showToast("Turntable motor switched ON — Strobe locked");
        }
        updateHardwareStatusUI();
      });
    }

    // 2. Rectangular Machined Speed Selector Buttons (33 / 45 / 78 RPM)
    document.querySelectorAll(".hardware-speed-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        audio.playMechanicalClick(1.15);
        document.querySelectorAll(".hardware-speed-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.rpmBase = parseFloat(btn.dataset.rpm || "33.3");
        audio.setPlaybackRate(getNormalizedPlaybackRate());
        updateHardwareStatusUI();
        showToast(`Belt drive engaged: ${state.rpmBase === 33.3 ? "33⅓" : state.rpmBase} RPM`);
      });
    });

    // 3. Physical Hydraulic Cueing Lever Wand
    if (els.hydraulicCueAssembly) {
      els.hydraulicCueAssembly.addEventListener("click", () => {
        state.isCuedUp = !state.isCuedUp;
        audio.playCueLeverSound(!state.isCuedUp);
        if (state.isCuedUp) {
          audio.pause();
          showToast("Cueing lever raised — Stylus lifted above groove");
        } else {
          if (!state.stylusDropped) {
            dropNeedleOnTrack(state.trackIndex, audio.getProgressRatio());
          } else if (state.motorPower) {
            audio.playNeedleDropSound(true);
            audio.play();
          }
          showToast("Cueing lever lowered — Stylus resting in groove");
        }
        updateHardwareStatusUI();
      });
    }

    // 4. Pill CTAs & Spacebar Shortcut
    if (els.dropNeedlePillBtn) {
      els.dropNeedlePillBtn.addEventListener("click", toggleNeedleDrop);
    }
    if (els.topDropNeedleCta) {
      els.topDropNeedleCta.addEventListener("click", toggleNeedleDrop);
    }

    window.addEventListener("keydown", (e) => {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      if (e.code === "Space") {
        e.preventDefault();
        toggleNeedleDrop();
      }
    });

    // 5. Section 02 Configurator Finish Swatches & Wax Pills
    document.querySelectorAll(".finish-swatch-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        audio.playMechanicalClick(1.0);
        document.querySelectorAll(".finish-swatch-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.chassis = btn.dataset.chassis || "obsidian";
        document.body.setAttribute("data-chassis", state.chassis);
        updateConfiguratorSummary();
      });
    });

    document.querySelectorAll(".wax-mode-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        audio.playMechanicalClick(1.08);
        document.querySelectorAll(".wax-mode-pill").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.discStyle = btn.dataset.disc || "picture";
        document.body.setAttribute("data-disc-style", state.discStyle);
        updateConfiguratorSummary();
      });
    });

    // 6. Acoustic Sliders (Vinyl Crackle, Morning Cafe Ambience, Master Gain)
    if (els.crackleRange) {
      els.crackleRange.addEventListener("input", (e) => {
        audio.initContext();
        audio.setCrackle(parseFloat(e.target.value || "0.36"));
      });
    }
    if (els.cafeRange) {
      els.cafeRange.addEventListener("input", (e) => {
        audio.initContext();
        audio.setCafeAmbience(parseFloat(e.target.value || "0.22"));
      });
    }
    if (els.gainRange) {
      els.gainRange.addEventListener("input", (e) => {
        audio.setVolume(parseFloat(e.target.value || "0.85"));
      });
    }

    // 7. Section 03 Live Global Vinyl Lathe Form
    if (els.latheSearchForm) {
      els.latheSearchForm.addEventListener("submit", (e) => {
        e.preventDefault();
        pressCustomVinyl(
          els.latheArtistInput ? els.latheArtistInput.value : "",
          els.latheAlbumInput ? els.latheAlbumInput.value : ""
        );
      });
    }
  }

  
  // ==========================================================================
  // KOMBAI 3D RECORD SLEEVE CAROUSEL & JSONP ITUNES STREAM HYDRATION
  // ==========================================================================
  state.carouselIndex = 0;

  function fetchItunesJsonp(url) {
    return new Promise((resolve, reject) => {
      const cbName = "__atelierItunesCb_" + Math.random().toString(36).slice(2);
      const script = document.createElement("script");
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("JSONP timeout"));
      }, 6500);

      function cleanup() {
        clearTimeout(timer);
        delete window[cbName];
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[cbName] = (data) => {
        cleanup();
        resolve(data);
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("JSONP error"));
      };

      script.src = url + (url.includes("?") ? "&" : "?") + "callback=" + cbName;
      document.head.appendChild(script);
    });
  }

  async function hydrateAlbumFromItunesId(album) {
    if (!album || !album.itunesCollectionId || album._hydratedFromItunes) return;
    album._hydratedFromItunes = true;
    try {
      const url = `https://itunes.apple.com/lookup?id=${album.itunesCollectionId}&entity=song`;
      let data = null;
      try {
        data = await fetchItunesJsonp(url);
      } catch (err) {
        const res = await fetch(url);
        data = await res.json();
      }
      if (!data || !Array.isArray(data.results) || !data.results.length) return;

      const collection = data.results.find((r) => r.wrapperType === "collection") || data.results[0];
      if (collection && collection.artworkUrl100) {
        album.artwork = collection.artworkUrl100.replace("100x100bb", "1000x1000bb");
      }

      const songResults = data.results.filter((r) => r.wrapperType === "track" && r.previewUrl);
      if (songResults.length > 0) {
        album.tracks = songResults.map((t, idx) => ({
          number: t.trackNumber || idx + 1,
          title: t.trackName,
          durationMs: t.trackTimeMillis || 30000,
          previewUrl: t.previewUrl
        }));
      }

      if (getCurrentAlbum() && getCurrentAlbum().id === album.id) {
        renderAlbumState();
      } else {
        renderCrateGrid();
        renderSleeveCarousel();
      }
    } catch (e) {
      // Keep pre-seeded Wikimedia cover & fallback audio streams if offline
    }
  }

  function renderSleeveCarousel() {
    const trackEl = document.getElementById("sleeveCarouselTrack");
    const navCountEl = document.getElementById("navCrateCount");
    if (navCountEl) navCountEl.textContent = String(catalog.length);
    if (!trackEl) return;

    trackEl.innerHTML = "";
    catalog.forEach((album, idx) => {
      const card = document.createElement("div");
      card.className = "carousel-sleeve-3d-card";
      card.dataset.index = String(idx);
      const isSpinning = idx === state.albumIndex;

      card.innerHTML = `
        <div class="carousel-peeking-vinyl">
          <div class="carousel-peeking-label" style="background-image:url('${album.artwork}')"></div>
        </div>
        <div class="carousel-jacket-cover">
          ${isSpinning ? '<span class="carousel-now-spinning-pill">● ON PLATTER</span>' : ''}
          <img class="carousel-jacket-img" src="${album.artwork}" alt="${album.title}" loading="lazy" />
        </div>
      `;

      card.addEventListener("click", () => {
        if (state.carouselIndex === idx) {
          mountAlbumOnPlatter(idx, true);
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          audio.playMechanicalClick(1.05);
          state.carouselIndex = idx;
          updateSleeveCarouselTransforms();
        }
      });

      trackEl.appendChild(card);
    });

    updateSleeveCarouselTransforms();
  }

  function updateSleeveCarouselTransforms() {
    const trackEl = document.getElementById("sleeveCarouselTrack");
    if (!trackEl) return;
    const cards = trackEl.querySelectorAll(".carousel-sleeve-3d-card");
    const total = catalog.length;
    if (!total) return;

    cards.forEach((card, idx) => {
      let offset = idx - state.carouselIndex;
      if (offset > total / 2) offset -= total;
      if (offset < -total / 2) offset += total;

      const absOff = Math.abs(offset);
      const tx = offset * 205;
      const tz = -absOff * 125;
      const ry = offset * -25;
      const scale = offset === 0 ? 1.08 : Math.max(0.72, 1 - absOff * 0.11);
      const opacity = absOff > 3 ? 0 : Math.max(0.22, 1 - absOff * 0.25);

      card.style.transform = `translate3d(${tx}px, 0px, ${tz}px) rotateY(${ry}deg) scale(${scale})`;
      card.style.zIndex = String(30 - absOff);
      card.style.opacity = String(opacity);
      card.style.pointerEvents = absOff > 3 ? "none" : "auto";
      card.classList.toggle("is-focused", offset === 0);
    });

    const focused = catalog[state.carouselIndex] || catalog[0];
    if (focused) {
      const counterEl = document.getElementById("carouselCounterText");
      const noteEl = document.getElementById("carouselFocusedNote");
      const titleEl = document.getElementById("carouselFocusedTitle");
      const metaEl = document.getElementById("carouselFocusedMeta");

      if (counterEl) {
        counterEl.textContent = `${String(state.carouselIndex + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
      }
      if (noteEl) {
        noteEl.textContent = focused.note || `${focused.genre.toUpperCase()} • ${focused.artist.toUpperCase()} (${focused.year})`;
      }
      if (titleEl) {
        titleEl.textContent = `${focused.title} — ${focused.artist}`;
      }
      if (metaEl) {
        metaEl.textContent = `${focused.year} • ${focused.tracks.length} tracks pressed on 180g audiophile vinyl`;
      }
    }
  }

  function setupSleeveCarouselInteractions() {
    const prevBtn = document.getElementById("carouselPrevBtn");
    const nextBtn = document.getElementById("carouselNextBtn");
    const mountOnlyBtn = document.getElementById("carouselMountOnlyBtn");
    const dropNeedleBtn = document.getElementById("carouselDropNeedleBtn");
    const viewport = document.getElementById("sleeveCarouselViewport");

    const stepCarousel = (dir) => {
      if (!catalog.length) return;
      audio.playMechanicalClick(1.1);
      state.carouselIndex = (state.carouselIndex + dir + catalog.length) % catalog.length;
      updateSleeveCarouselTransforms();
    };

    if (prevBtn) prevBtn.addEventListener("click", () => stepCarousel(-1));
    if (nextBtn) nextBtn.addEventListener("click", () => stepCarousel(1));

    if (mountOnlyBtn) {
      mountOnlyBtn.addEventListener("click", () => {
        mountAlbumOnPlatter(state.carouselIndex, false);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
    if (dropNeedleBtn) {
      dropNeedleBtn.addEventListener("click", () => {
        mountAlbumOnPlatter(state.carouselIndex, true);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }

    if (viewport) {
      let startX = null;
      viewport.addEventListener("pointerdown", (e) => {
        if (e.target.closest("button")) return;
        startX = e.clientX;
      });
      window.addEventListener("pointerup", (e) => {
        if (startX === null) return;
        const dx = e.clientX - startX;
        startX = null;
        if (Math.abs(dx) > 36) {
          stepCarousel(dx < 0 ? 1 : -1);
        }
      });

      let wheelCooldown = false;
      viewport.addEventListener("wheel", (e) => {
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 15) {
          e.preventDefault();
          if (!wheelCooldown) {
            wheelCooldown = true;
            stepCarousel(e.deltaX > 0 ? 1 : -1);
            setTimeout(() => { wheelCooldown = false; }, 260);
          }
        }
      }, { passive: false });
    }

    window.addEventListener("keydown", (e) => {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      if (e.code === "ArrowLeft") {
        stepCarousel(-1);
      } else if (e.code === "ArrowRight") {
        stepCarousel(1);
      }
    });
  }

  function init() {
    cacheElements();
    renderAlbumState();
    setupSleeveCarouselInteractions();
    catalog.forEach((alb) => hydrateAlbumFromItunesId(alb));
    bindHardwareControls();
    setupVinylScratchInteractions();
    setupTonearmDragInteractions();
    setupRecessedPitchFader();

    const firstTrack = getCurrentTrack();
    if (firstTrack) {
      audio.loadTrack(firstTrack.previewUrl, false, 0);
    }

    startTurntablePhysicsLoop();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
