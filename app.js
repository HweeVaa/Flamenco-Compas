const compasData = {
  solea: {
    name: "Solea / Buleria",
    beats: [
      { label: "1", accent: false },
      { label: "2", accent: false },
      { label: "3", accent: true },
      { label: "4", accent: false },
      { label: "5", accent: false },
      { label: "6", accent: true },
      { label: "7", accent: false },
      { label: "8", accent: true },
      { label: "9", accent: false },
      { label: "10", accent: true },
      { label: "11", accent: false },
      { label: "12", accent: true }
    ]
  },
  seguiriya: {
    name: "Seguiriya",
    beats: [
      { label: "1", accent: true },
      { label: "2", accent: false },
      { label: "3", accent: true },
      { label: "4", accent: false },
      { label: "5", accent: false },
      { label: "6", accent: true },
      { label: "7", accent: false, rest: true },
      { label: "8", accent: false },
      { label: "9", accent: true },
      { label: "10", accent: false },
      { label: "11", accent: false },
      { label: "12", accent: true }
    ]
  },
  tangos: {
    name: "Tangos",
    beats: [
      { label: "1", accent: true },
      { label: "2", accent: false },
      { label: "3", accent: true },
      { label: "4", accent: false }
    ]
  },
  rumba: {
    name: "Rumba",
    beats: [
      { label: "1", accent: true },
      { label: "2", accent: false },
      { label: "3", accent: false },
      { label: "4", accent: true }
    ]
  }
};

const compasSelect = document.getElementById("compas");
const tempoInput = document.getElementById("tempo");
const tempoValue = document.getElementById("tempoValue");
const tempoNumber = document.getElementById("tempoNumber");
const swingInput = document.getElementById("swing");
const swingValue = document.getElementById("swingValue");
const swingNumber = document.getElementById("swingNumber");
const accentInput = document.getElementById("accent");
const accentValue = document.getElementById("accentValue");
const accentNumber = document.getElementById("accentNumber");
const cyclesInput = document.getElementById("cycles");
const infiniteInput = document.getElementById("infinite");
// const ensembleInput = document.getElementById("ensemble"); // disabled for now
const ensembleInput = null;
const cyclesControl = document.querySelector(".control--cycles");
const advancedDetails = document.getElementById("advanced");
const grid = document.getElementById("grid");
const status = document.getElementById("status");
const toggleButton = document.getElementById("toggle");
const resetButton = document.getElementById("reset");
const toggleLabel = document.getElementById("toggleLabel");
const actions = document.querySelector(".actions--compas");
const actionsMount = document.getElementById("actionsMount");
const actionsPanel = document.getElementById("actionsPanel");
const compasControl = document.getElementById("compasControl");
const compasMount = document.getElementById("compasMount");
const controlsPanel = document.querySelector(".panel--settings .controls");
const rightMount = document.getElementById("rightMount");
const ensembleControl = document.getElementById("ensembleControl");
const advancedGrid = document.querySelector(".advanced__grid");

let audioContext = null;
let isRunning = false;
let currentBeat = 0;
let intervalId = null;
let cycleClapBeats = [];
let lastIntervalMs = 0;
let cycleSoftOverlayBeats = [];
let swingPhase = false;
let cyclesLeft = null;
let cycleBeatCount = 0;
let gridResizeObserver = null;
let samplesReady = false;
let samplesPromise = null;
const PALMA_DURATION = 0.18;
let subdivisionStep = 0;
let masterGain = null;
let masterCompressor = null;
let dryGain = null;
let wetGain = null;
let spaceDelay = null;
let spaceFilter = null;
let spaceFeedback = null;
let warmthFilter = null;
let stereoPannerAvailable = false;

const palmaSamplePaths = {
  strong: [
    "palma_sample/palma_secas1.wav",
    "palma_sample/palma_secas3.wav",
    "palma_sample/palma_secas4.wav"
  ],
  weak: [
    "palma_sample/palma_sordas.wav",
    "palma_sample/palma_sordas2.wav",
    "palma_sample/palma_sordas3.wav",
    "palma_sample/palma_sordas4.wav"
  ]
};

const palmaSamples = {
  strong: [],
  weak: []
};
const lastSampleIndex = {
  strong: -1,
  weak: -1
};
let lastBeatSampleIds = new Set();
let lastClapSampleIds = new Set();
let avoidNextBeatSampleIds = new Set();

function makeSampleId(key, index) {
  return `${key}:${index}`;
}

function getTopIndex(beats) {
  const topIndex = beats.findIndex((beat) => beat.label === "12");
  return topIndex === -1 ? 0 : topIndex;
}

function getStartIndex(compasKey, beats) {
  if (compasKey === "solea") {
    const startIndex = beats.findIndex((beat) => beat.label === "1");
    return startIndex === -1 ? 0 : startIndex;
  }

  if (compasKey === "seguiriya") {
    const startIndex = beats.findIndex((beat) => beat.label === "8");
    return startIndex === -1 ? 0 : startIndex;
  }

  return getTopIndex(beats);
}

function pickCycleClaps(beats, startIndex) {
  if (beats.length < 2) return [];
  const candidates = beats
    .map((beat, index) => {
      const next = beats[(index + 1) % beats.length];
      return next.accent ? index : null;
    })
    .filter((index) => index !== null);
  if (candidates.length === 0) return [];

  const maxClaps = Math.min(4, candidates.length);
  const clapCount = Math.floor(Math.random() * (maxClaps - 1)) + 2;
  const picks = new Set();
  while (picks.size < clapCount) {
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    picks.add(pick);
  }
  return Array.from(picks);
}

function pickCycleSoftOverlayBeats(beats, startIndex) {
  const weakCandidates = beats
    .map((beat, index) => (beat.accent ? null : index))
    .filter((index) => index !== null && index !== startIndex);
  if (weakCandidates.length === 0) return [];

  const maxOverlays = Math.min(3, weakCandidates.length);
  const overlayCount = Math.min(3, Math.max(1, Math.ceil(Math.random() * 3)));

  const picks = new Set();
  while (picks.size < Math.min(overlayCount, maxOverlays)) {
    picks.add(weakCandidates[Math.floor(Math.random() * weakCandidates.length)]);
  }
  return Array.from(picks);
}

function layoutBeats() {
  const { beats } = compasData[compasSelect.value];
  const size = Math.min(grid.clientWidth, grid.clientHeight);
  if (size < 200) return;

  const sampleTile = grid.querySelector(".beat");
  const tileSize = sampleTile ? sampleTile.offsetWidth : 60;
  const padding = 10;
  const radiusBonusRaw = getComputedStyle(grid).getPropertyValue("--radius-bonus");
  const radiusBonus = Number.parseFloat(radiusBonusRaw) || 0;
  const baseRadius = Math.max(0, size / 2 - tileSize / 2 - padding + radiusBonus);
  const minSpacingFactor = 1.45;
  const chordRequired = tileSize * minSpacingFactor;
  const minRadius = chordRequired / (2 * Math.sin(Math.PI / beats.length));
  const scaleFactor = Math.min(1, baseRadius / minRadius || 1);
  const radius = baseRadius;
  const startBeat = "12";
  const startIndex = beats.findIndex((beat) => beat.label === startBeat);
  const shift = startIndex === -1 ? 0 : startIndex;
  const startAngle = 0;

  beats.forEach((_, index) => {
    const cell = grid.querySelector(`[data-index='${index}']`);
    if (!cell) return;
    const shiftedIndex = (index - shift + beats.length) % beats.length;
    const angle = (shiftedIndex / beats.length) * 360 + startAngle;
    cell.style.transform = `translate(-50%, -50%) rotate(${angle}deg) translateY(${-radius}px) rotate(${-angle}deg) scale(${scaleFactor})`;
  });
}

function renderGrid() {
  const { beats } = compasData[compasSelect.value];
  currentBeat = getStartIndex(compasSelect.value, beats);
  cycleClapBeats = [];
  cycleSoftOverlayBeats = [];
  grid.innerHTML = "";
  beats.forEach((beat, index) => {
    const cell = document.createElement("div");
    cell.className = `beat${beat.accent ? " beat--accent" : ""}`;
    cell.dataset.index = index.toString();

    const number = document.createElement("span");
    number.textContent = beat.label;

    const label = document.createElement("small");
    label.textContent = beat.accent ? "Accent" : "Pulse";

    cell.append(number, label);
    grid.appendChild(cell);
  });

  requestAnimationFrame(layoutBeats);
}

function updateValues() {
  tempoValue.textContent = tempoInput.value;
  swingValue.textContent = swingInput.value;
  accentValue.textContent = accentInput.value;
  tempoNumber.value = tempoInput.value;
  swingNumber.value = swingInput.value;
  accentNumber.value = accentInput.value;
}

function updateCycleSettings() {
  const infinite = infiniteInput.checked;
  cyclesInput.disabled = infinite;
  if (cyclesControl) {
    cyclesControl.classList.toggle("control--disabled", infinite);
  }
  if (infinite) {
    cyclesLeft = null;
    return;
  }
  const parsed = Number.parseInt(cyclesInput.value, 10);
  cyclesLeft = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function syncAdvancedPanel() {
  if (!advancedDetails) return;
  const compact = window.matchMedia("(max-height: 760px), (max-width: 1000px)").matches;
  advancedDetails.open = !compact;
}

function syncActionsPlacement() {
  if (!actions) return;
  const isPortraitNarrow = window.matchMedia("(max-width: 720px)").matches;
  if (isPortraitNarrow) {
    if (actionsMount && actions.parentElement !== actionsMount) {
      actionsMount.appendChild(actions);
    }
    if (rightMount && resetButton && resetButton.parentElement !== rightMount) {
      rightMount.appendChild(resetButton);
    }
    if (compasMount && compasControl && compasControl.parentElement !== compasMount) {
      compasMount.appendChild(compasControl);
    }
    if (advancedGrid && ensembleControl && ensembleControl.parentElement !== advancedGrid) {
      advancedGrid.appendChild(ensembleControl);
    }
    return;
  }

  const compasPanel = document.querySelector(".panel--compas");
  if (compasPanel && actions.parentElement !== compasPanel) {
    compasPanel.appendChild(actions);
  }
  if (actions && resetButton && resetButton.parentElement !== actions) {
    actions.appendChild(resetButton);
  }
  if (controlsPanel && compasControl && compasControl.parentElement !== controlsPanel) {
    controlsPanel.prepend(compasControl);
  }
  if (advancedGrid && ensembleControl && ensembleControl.parentElement !== advancedGrid) {
    advancedGrid.appendChild(ensembleControl);
  }
}

function setStatus(text, isActive = false) {
  if (!status) return;
  status.textContent = text;
  status.style.color = isActive ? "#6ee7ff" : "#f2c94c";
}

function setToggleState(running) {
  if (!toggleButton) return;
  const label = running ? "Pause" : "Start";
  toggleButton.dataset.state = running ? "running" : "stopped";
  toggleButton.setAttribute("aria-label", label);
  if (toggleLabel) {
    toggleLabel.textContent = label;
  }
}

function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
  if (!stereoPannerAvailable && typeof audioContext.createStereoPanner === "function") {
    stereoPannerAvailable = true;
  }
  if (!masterGain) {
    masterGain = audioContext.createGain();
    masterGain.gain.value = 1;

    masterCompressor = audioContext.createDynamicsCompressor();
    masterCompressor.threshold.value = -22;
    masterCompressor.knee.value = 24;
    masterCompressor.ratio.value = 4.5;
    masterCompressor.attack.value = 0.008;
    masterCompressor.release.value = 0.26;

    warmthFilter = audioContext.createBiquadFilter();
    warmthFilter.type = "lowpass";
    warmthFilter.frequency.value = 4800;
    warmthFilter.Q.value = 0.6;

    dryGain = audioContext.createGain();
    dryGain.gain.value = 1;

    wetGain = audioContext.createGain();
    wetGain.gain.value = 0.32;

    spaceDelay = audioContext.createDelay(0.25);
    spaceDelay.delayTime.value = 0.04;

    spaceFeedback = audioContext.createGain();
    spaceFeedback.gain.value = 0.22;

    spaceFilter = audioContext.createBiquadFilter();
    spaceFilter.type = "lowpass";
    spaceFilter.frequency.value = 2200;
    spaceFilter.Q.value = 0.8;

    masterGain.connect(masterCompressor);
    masterCompressor.connect(warmthFilter);
    warmthFilter.connect(dryGain).connect(audioContext.destination);
    masterCompressor.connect(spaceDelay);
    spaceDelay.connect(spaceFilter).connect(wetGain).connect(audioContext.destination);
    spaceDelay.connect(spaceFeedback).connect(spaceDelay);
  }
}

async function loadPalmaSamples() {
  if (samplesPromise) return samplesPromise;

  samplesPromise = (async () => {
    try {
      const loadGroup = async (paths) => {
        const buffers = await Promise.all(
          paths.map(async (path) => {
            const response = await fetch(path);
            if (!response.ok) {
              throw new Error(`Failed to load ${path}`);
            }
            const data = await response.arrayBuffer();
            return audioContext.decodeAudioData(data);
          })
        );
        return buffers;
      };

      palmaSamples.strong = await loadGroup(palmaSamplePaths.strong);
      palmaSamples.weak = await loadGroup(palmaSamplePaths.weak);
      samplesReady = true;
      return true;
    } catch (error) {
      samplesReady = false;
      console.warn("Palma sample load failed, using synth clicks.", error);
      return false;
    }
  })();

  return samplesPromise;
}

function pickPalmaIndex(buffers, key, preferStronger = false, avoidIds = new Set()) {
  if (!buffers.length) return -1;
  const maxIndex = buffers.length - 1;
  let index = 0;
  if (preferStronger) {
    const biased = Math.floor(Math.random() * buffers.length * 0.6) + Math.floor(buffers.length * 0.4);
    index = Math.min(maxIndex, biased);
  } else {
    index = Math.floor(Math.random() * buffers.length);
  }

  if (buffers.length > 1) {
    const currentId = makeSampleId(key, index);
    if (index === lastSampleIndex[key] || avoidIds.has(currentId)) {
      const candidates = [];
      for (let i = 0; i < buffers.length; i += 1) {
        const id = makeSampleId(key, i);
        if (i !== lastSampleIndex[key] && !avoidIds.has(id)) {
          candidates.push(i);
        }
      }
      if (candidates.length > 0) {
        index = candidates[Math.floor(Math.random() * candidates.length)];
      }
    }
  }

  lastSampleIndex[key] = index;
  return index;
}

function pickPalmaBuffer(buffers, key, preferStronger = false, avoidIds = new Set()) {
  const index = pickPalmaIndex(buffers, key, preferStronger, avoidIds);
  if (index < 0) return null;
  return buffers[index];
}

function playPalmaSample(buffer, gainValue, brighten = false, compress = false) {
  if (!audioContext || !buffer) return;
  playPalmaLayer(buffer, gainValue, 0, 0, brighten, compress);
}

function playPalmaLayer(buffer, gainValue, panValue, delaySeconds, brighten = false, compress = false) {
  if (!audioContext || !buffer) return;
  const now = audioContext.currentTime + delaySeconds;
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = 0.98;
  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(gainValue, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + PALMA_DURATION);
  const postGain = brighten ? audioContext.createBiquadFilter() : null;
  if (postGain) {
    postGain.type = "highshelf";
    postGain.frequency.value = 3600;
    postGain.gain.value = 3.5;
  }
  const postCompressor = compress ? audioContext.createDynamicsCompressor() : null;
  if (postCompressor) {
    postCompressor.threshold.value = -28;
    postCompressor.knee.value = 18;
    postCompressor.ratio.value = 6;
    postCompressor.attack.value = 0.003;
    postCompressor.release.value = 0.18;
  }
  if (stereoPannerAvailable) {
    const panner = audioContext.createStereoPanner();
    panner.pan.setValueAtTime(panValue, now);
    if (postGain && postCompressor) {
      source.connect(gain).connect(postGain).connect(postCompressor).connect(panner).connect(masterGain);
    } else if (postGain) {
      source.connect(gain).connect(postGain).connect(panner).connect(masterGain);
    } else if (postCompressor) {
      source.connect(gain).connect(postCompressor).connect(panner).connect(masterGain);
    } else {
      source.connect(gain).connect(panner).connect(masterGain);
    }
  } else {
    if (postGain && postCompressor) {
      source.connect(gain).connect(postGain).connect(postCompressor).connect(masterGain);
    } else if (postGain) {
      source.connect(gain).connect(postGain).connect(masterGain);
    } else if (postCompressor) {
      source.connect(gain).connect(postCompressor).connect(masterGain);
    } else {
      source.connect(gain).connect(masterGain);
    }
  }
  source.start(now);
  source.stop(now + PALMA_DURATION);
}

function playEnsemble(buffer, baseGain, brighten = false, layerCount = 2, compress = false) {
  if (!audioContext || !buffer) return;
  const layers = Math.max(1, Math.min(4, layerCount));
  for (let i = 0; i < layers; i += 1) {
    const pan = stereoPannerAvailable ? (Math.random() * 0.6 - 0.3) : 0;
    const delay = Math.random() * 0.02;
    const gainJitter = 0.78 + Math.random() * 0.34;
    playPalmaLayer(buffer, baseGain * gainJitter, pan, delay, brighten, compress);
  }
}

function playPalmaDouble(primaryBuffer, secondaryBuffer, gainValue, primaryBrighten = false, secondaryBrighten = false, secondaryCompress = false) {
  if (!audioContext || !primaryBuffer) return;
  playPalmaLayer(primaryBuffer, gainValue, -0.02, 0, primaryBrighten);
  if (secondaryBuffer) {
    playPalmaLayer(
      secondaryBuffer,
      gainValue * 0.92,
      0.02,
      0.02 + Math.random() * 0.01,
      secondaryBrighten,
      secondaryCompress
    );
  }
}

function playClick(beat) {
  if (!audioContext) return;
  const isHotAccent = beat.label === "6" || beat.label === "12";
  if (samplesReady) {
    const accentBase = Math.min(1, (Number(accentInput.value) / 100) * 1.2);
    const weakVariation = 0.85 + Math.random() * 0.3;
    const gainValue = beat.accent
      ? (isHotAccent ? accentBase * 11.2 : accentBase * 6.4)
      : 3.4 * weakVariation;
    if (beat.accent) {
      const avoidAccentIds = new Set([...lastBeatSampleIds, ...avoidNextBeatSampleIds]);
      const primaryIndex = pickPalmaIndex(palmaSamples.strong, "strong", isHotAccent, avoidAccentIds);
      const primary = primaryIndex >= 0 ? palmaSamples.strong[primaryIndex] : null;
      const primaryId = primaryIndex >= 0 ? makeSampleId("strong", primaryIndex) : null;

      const avoidSecondary = new Set(avoidAccentIds);
      if (primaryId) {
        avoidSecondary.add(primaryId);
      }

      const useSordasLayer = false;
      const secondaryKey = "strong";
      const secondaryPool = palmaSamples.strong;
      const secondaryIndex = pickPalmaIndex(secondaryPool, secondaryKey, false, avoidSecondary);
      const secondary = secondaryIndex >= 0 ? secondaryPool[secondaryIndex] : null;
      const secondaryId = secondaryIndex >= 0 ? makeSampleId(secondaryKey, secondaryIndex) : null;

      if (ensembleInput && ensembleInput.checked) {
        playEnsemble(primary, Math.min(9.6, gainValue), true, 3);
        if (secondary) {
          playEnsemble(
            secondary,
            Math.min(7.0, gainValue * 0.9),
            secondaryKey === "strong",
            2,
            secondaryKey === "weak"
          );
        }
      } else {
        playPalmaDouble(
          primary,
          secondary,
          Math.min(11.5, gainValue),
          true,
          secondaryKey === "strong",
          secondaryKey === "weak"
        );
      }
      lastBeatSampleIds = new Set([primaryId, secondaryId].filter(Boolean));
      avoidNextBeatSampleIds = new Set(lastBeatSampleIds);
    } else {
      const avoidWeakIds = new Set([...lastBeatSampleIds, ...avoidNextBeatSampleIds]);
      const weakIndex = pickPalmaIndex(palmaSamples.weak, "weak", false, avoidWeakIds);
      const buffer = weakIndex >= 0 ? palmaSamples.weak[weakIndex] : null;
      if (ensembleInput && ensembleInput.checked) {
        playEnsemble(buffer, Math.min(6.8, gainValue), true, 2, true);
      } else {
        playPalmaSample(buffer, Math.min(11.5, gainValue), true, true);
      }
      const weakId = weakIndex >= 0 ? makeSampleId("weak", weakIndex) : null;
      lastBeatSampleIds = new Set([weakId].filter(Boolean));
      avoidNextBeatSampleIds = new Set(lastBeatSampleIds);
    }
    return;
  }

  const now = audioContext.currentTime;
  const duration = 0.16;
  const buffer = audioContext.createBuffer(1, audioContext.sampleRate * duration, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
  }

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  const bandpass = audioContext.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.value = beat.accent ? 1900 : 1200;
  bandpass.Q.value = 0.9;

  const accentBase = Math.min(1, (Number(accentInput.value) / 100) * 1.25);
  const accentLevel = isHotAccent ? Math.min(1, accentBase * 1.2) : accentBase;
  const volume = beat.accent ? accentLevel * 0.85 : 0.45;
  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  source.connect(bandpass).connect(gain).connect(masterGain);
  source.start(now);
  source.stop(now + duration);
}

function playClap() {
  if (!audioContext) return;
  if (samplesReady) {
    const useStrong = Math.random() < 0.6;
    const avoidIds = new Set([...lastBeatSampleIds, ...lastClapSampleIds]);
    const key = useStrong ? "strong" : "weak";
    const buffers = useStrong ? palmaSamples.strong : palmaSamples.weak;
    const index = pickPalmaIndex(buffers, key, false, avoidIds);
    const buffer = index >= 0 ? buffers[index] : null;
    if (ensembleInput && ensembleInput.checked) {
      playEnsemble(buffer, 3.2, useStrong, 2, !useStrong);
    } else {
      playPalmaSample(buffer, 3.6, useStrong, !useStrong);
    }
    const clapId = index >= 0 ? makeSampleId(key, index) : null;
    lastClapSampleIds = new Set([clapId].filter(Boolean));
    avoidNextBeatSampleIds = new Set([clapId].filter(Boolean));
    return;
  }

  const now = audioContext.currentTime;
  const duration = 0.16;
  const buffer = audioContext.createBuffer(1, audioContext.sampleRate * duration, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    const t = i / data.length;
    const envelope = Math.pow(1 - t, 1.8);
    data[i] = (Math.random() * 2 - 1) * envelope;
  }

  const filter = audioContext.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 700 + Math.random() * 450;
  filter.Q.value = 0.6;

  const lowpass = audioContext.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 3200;
  lowpass.Q.value = 0.7;

  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(0.55, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  const first = audioContext.createBufferSource();
  first.buffer = buffer;
  const second = audioContext.createBufferSource();
  second.buffer = buffer;

  first.connect(filter).connect(lowpass).connect(gain).connect(masterGain);
  second.connect(filter).connect(lowpass).connect(gain);

  first.start(now);
  second.start(now + 0.018 + Math.random() * 0.01);
  first.stop(now + duration);
  second.stop(now + duration);
}

function scheduleBeat() {
  const { beats } = compasData[compasSelect.value];
  const startIndex = getStartIndex(compasSelect.value, beats);
  const useEighths = false;

  if (currentBeat === startIndex) {
    cycleClapBeats = pickCycleClaps(beats, startIndex);
    cycleSoftOverlayBeats = pickCycleSoftOverlayBeats(beats, startIndex);
  }
  const beat = beats[currentBeat];
  const beatCells = grid.querySelectorAll(".beat");

  beatCells.forEach((cell) => cell.classList.remove("beat--active"));
  const activeCell = grid.querySelector(`[data-index='${currentBeat}']`);
  if (activeCell) {
    activeCell.classList.add("beat--active");
  }

  const hasClap = cycleClapBeats.includes(currentBeat) && lastIntervalMs > 0;
  const isRest = Boolean(beat.rest);
  if (!isRest) {
    playClick(beat);
  }

  if (!isRest && !beat.accent && cycleSoftOverlayBeats.includes(currentBeat) && samplesReady) {
    const avoidIds = new Set([...lastBeatSampleIds, ...lastClapSampleIds]);
    const overlayIndex = pickPalmaIndex(palmaSamples.strong, "strong", false, avoidIds);
    const buffer = overlayIndex >= 0 ? palmaSamples.strong[overlayIndex] : null;
    if (ensembleInput && ensembleInput.checked) {
      playEnsemble(buffer, 1.2, true, 2, false);
    } else {
      playPalmaSample(buffer, 1.6, true, false);
    }
    const overlayId = overlayIndex >= 0 ? makeSampleId("strong", overlayIndex) : null;
    lastBeatSampleIds = new Set([overlayId].filter(Boolean));
  }

  if (hasClap && !isRest) {
    const offbeatTime = Math.max(0, lastIntervalMs * 0.45);
    setTimeout(playClap, offbeatTime);
  }
  currentBeat = (currentBeat + 1) % beats.length;
  subdivisionStep = 0;
  if (cyclesLeft !== null) {
    if (beats.length === 12) {
      const endBeat = compasSelect.value === "seguiriya" ? "6" : "12";
      if (beat.label === endBeat) {
        if (cycleBeatCount > 0) {
          cyclesLeft -= 1;
          if (cyclesLeft <= 0) {
            stop();
          }
        }
        cycleBeatCount = 0;
      }
      cycleBeatCount += 1;
    } else if (currentBeat === startIndex) {
      cyclesLeft -= 1;
      if (cyclesLeft <= 0) {
        stop();
      }
    }
  }
}

function getNextIntervalMs() {
  const bpm = Number(tempoInput.value);
  const swing = Number(swingInput.value) / 100;
  const baseInterval = 60000 / bpm;
  if (swing <= 0) {
    lastIntervalMs = baseInterval;
    return baseInterval;
  }

  const interval = baseInterval * (swingPhase ? 1 + swing : 1 - swing);
  swingPhase = !swingPhase;
  lastIntervalMs = interval;
  return interval;
}

function tickLoop() {
  if (!isRunning) return;
  scheduleBeat();
  clearTimeout(intervalId);
  intervalId = setTimeout(tickLoop, getNextIntervalMs());
}

function rescheduleTick() {
  if (!isRunning) return;
  clearTimeout(intervalId);
  intervalId = setTimeout(tickLoop, getNextIntervalMs());
}

async function start() {
  if (isRunning) return;

  ensureAudioContext();
  setStatus("Loading samples...", true);
  await loadPalmaSamples();
  isRunning = true;
  setToggleState(true);
  setStatus("Running", true);
  swingPhase = false;
  lastIntervalMs = 60000 / Number(tempoInput.value);
  subdivisionStep = 0;
  cycleClapBeats = [];
  cycleSoftOverlayBeats = [];
  cycleBeatCount = 0;
  updateCycleSettings();
  tickLoop();
}

function stop() {
  if (!isRunning) return;
  isRunning = false;
  setToggleState(false);
  setStatus("Stopped", false);
  clearTimeout(intervalId);
}

function reset() {
  stop();
  const { beats } = compasData[compasSelect.value];
  currentBeat = getStartIndex(compasSelect.value, beats);
  cycleClapBeats = [];
  cycleSoftOverlayBeats = [];
  cycleBeatCount = 0;
  subdivisionStep = 0;
  updateCycleSettings();
  const beatCells = grid.querySelectorAll(".beat");
  beatCells.forEach((cell) => cell.classList.remove("beat--active"));
}

compasSelect.addEventListener("change", () => {
  renderGrid();
  reset();
});

[tempoInput, swingInput, accentInput].forEach((input) => {
  input.addEventListener("input", () => {
    updateValues();
    if (isRunning && (input === tempoInput || input === swingInput)) {
      rescheduleTick();
    }
  });
});

[tempoNumber, swingNumber, accentNumber].forEach((input) => {
  input.addEventListener("input", () => {
    const min = Number(input.min);
    const max = Number(input.max);
    let value = Number(input.value);
    if (Number.isNaN(value)) {
      return;
    }
    value = Math.max(min, Math.min(max, value));
    if (input === tempoNumber) {
      tempoInput.value = value;
    }
    if (input === swingNumber) {
      swingInput.value = value;
    }
    if (input === accentNumber) {
      accentInput.value = value;
    }
    updateValues();
    if (isRunning && (input === tempoNumber || input === swingNumber)) {
      rescheduleTick();
    }
  });
});

cyclesInput.addEventListener("input", () => {
  updateCycleSettings();
});

infiniteInput.addEventListener("change", () => {
  updateCycleSettings();
});


toggleButton.addEventListener("click", () => {
  if (isRunning) {
    stop();
  } else {
    start();
  }
});

resetButton.addEventListener("click", reset);

renderGrid();
updateValues();
updateCycleSettings();
syncAdvancedPanel();
setToggleState(false);
window.addEventListener("resize", syncAdvancedPanel);
window.addEventListener("resize", syncActionsPlacement);
syncActionsPlacement();

if (grid && "ResizeObserver" in window) {
  gridResizeObserver = new ResizeObserver(() => {
    layoutBeats();
  });
  gridResizeObserver.observe(grid);
}
