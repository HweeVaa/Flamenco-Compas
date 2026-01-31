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
      { label: "7", accent: false },
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
const swingInput = document.getElementById("swing");
const swingValue = document.getElementById("swingValue");
const accentInput = document.getElementById("accent");
const accentValue = document.getElementById("accentValue");
const grid = document.getElementById("grid");
const status = document.getElementById("status");
const toggleButton = document.getElementById("toggle");
const resetButton = document.getElementById("reset");

let audioContext = null;
let isRunning = false;
let currentBeat = 0;
let intervalId = null;
let cycleClapBeats = [];
let lastIntervalMs = 0;
let samplesReady = false;
let samplesPromise = null;
const PALMA_DURATION = 0.18;
let masterGain = null;
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

  const maxClaps = Math.min(2, candidates.length);
  const clapCount = Math.floor(Math.random() * (maxClaps + 1));
  const picks = new Set();
  while (picks.size < clapCount) {
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    picks.add(pick);
  }
  return Array.from(picks);
}

function renderGrid() {
  const { beats } = compasData[compasSelect.value];
  const offsetIndex = getTopIndex(beats);
  currentBeat = getStartIndex(compasSelect.value, beats);
  cycleClapBeats = [];
  grid.innerHTML = "";
  beats.forEach((beat, index) => {
    const cell = document.createElement("div");
    cell.className = `beat${beat.accent ? " beat--accent" : ""}`;
    cell.dataset.index = index.toString();
    const angle = ((index - offsetIndex) / beats.length) * 360;
    cell.style.setProperty("--angle", `${angle}deg`);

    const number = document.createElement("span");
    number.textContent = beat.label;

    const label = document.createElement("small");
    label.textContent = beat.accent ? "Accent" : "Pulse";

    cell.append(number, label);
    grid.appendChild(cell);
  });
}

function updateValues() {
  tempoValue.textContent = tempoInput.value;
  swingValue.textContent = swingInput.value;
  accentValue.textContent = accentInput.value;
}

function setStatus(text, isActive = false) {
  status.textContent = text;
  status.style.color = isActive ? "#6ee7ff" : "#f2c94c";
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

    warmthFilter = audioContext.createBiquadFilter();
    warmthFilter.type = "lowpass";
    warmthFilter.frequency.value = 7200;
    warmthFilter.Q.value = 0.6;

    dryGain = audioContext.createGain();
    dryGain.gain.value = 1;

    wetGain = audioContext.createGain();
    wetGain.gain.value = 0.26;

    spaceDelay = audioContext.createDelay(0.25);
    spaceDelay.delayTime.value = 0.04;

    spaceFeedback = audioContext.createGain();
    spaceFeedback.gain.value = 0.22;

    spaceFilter = audioContext.createBiquadFilter();
    spaceFilter.type = "lowpass";
    spaceFilter.frequency.value = 2800;
    spaceFilter.Q.value = 0.8;

    masterGain.connect(warmthFilter);
    warmthFilter.connect(dryGain).connect(audioContext.destination);
    masterGain.connect(spaceDelay);
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

function playPalmaSample(buffer, gainValue) {
  if (!audioContext || !buffer) return;
  playPalmaLayer(buffer, gainValue, 0, 0);
}

function playPalmaLayer(buffer, gainValue, panValue, delaySeconds) {
  if (!audioContext || !buffer) return;
  const now = audioContext.currentTime + delaySeconds;
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(gainValue, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + PALMA_DURATION);
  if (stereoPannerAvailable) {
    const panner = audioContext.createStereoPanner();
    panner.pan.setValueAtTime(panValue, now);
    source.connect(gain).connect(panner).connect(masterGain);
  } else {
    source.connect(gain).connect(masterGain);
  }
  source.start(now);
  source.stop(now + PALMA_DURATION);
}

function playPalmaDouble(primaryBuffer, secondaryBuffer, gainValue) {
  if (!audioContext || !primaryBuffer) return;
  playPalmaLayer(primaryBuffer, gainValue, -0.08, 0);
  if (secondaryBuffer) {
    playPalmaLayer(secondaryBuffer, gainValue * 0.92, 0.08, 0.02 + Math.random() * 0.01);
  }
}

function playClick(beat) {
  if (!audioContext) return;
  const isHotAccent = beat.label === "6" || beat.label === "12";
  if (samplesReady) {
    const accentBase = Math.min(1, (Number(accentInput.value) / 100) * 1.2);
    const weakVariation = 0.85 + Math.random() * 0.3;
    const gainValue = beat.accent
      ? (isHotAccent ? accentBase * 10.0 : accentBase * 7.6)
      : 4.8 * weakVariation;
    if (beat.accent) {
      const primaryIndex = pickPalmaIndex(palmaSamples.strong, "strong", isHotAccent, avoidNextBeatSampleIds);
      const primary = primaryIndex >= 0 ? palmaSamples.strong[primaryIndex] : null;
      const primaryId = primaryIndex >= 0 ? makeSampleId("strong", primaryIndex) : null;

      const avoidSecondary = new Set(avoidNextBeatSampleIds);
      if (primaryId) {
        avoidSecondary.add(primaryId);
      }

      const useSordasLayer = Math.random() < 0.25;
      const secondaryKey = useSordasLayer ? "weak" : "strong";
      const secondaryPool = useSordasLayer ? palmaSamples.weak : palmaSamples.strong;
      const secondaryIndex = pickPalmaIndex(secondaryPool, secondaryKey, false, avoidSecondary);
      const secondary = secondaryIndex >= 0 ? secondaryPool[secondaryIndex] : null;
      const secondaryId = secondaryIndex >= 0 ? makeSampleId(secondaryKey, secondaryIndex) : null;

      playPalmaDouble(primary, secondary, Math.min(11.5, gainValue));
      lastBeatSampleIds = new Set([primaryId, secondaryId].filter(Boolean));
    } else {
      const weakIndex = pickPalmaIndex(palmaSamples.weak, "weak", false, avoidNextBeatSampleIds);
      const buffer = weakIndex >= 0 ? palmaSamples.weak[weakIndex] : null;
      playPalmaSample(buffer, Math.min(11.5, gainValue));
      const weakId = weakIndex >= 0 ? makeSampleId("weak", weakIndex) : null;
      lastBeatSampleIds = new Set([weakId].filter(Boolean));
    }
    avoidNextBeatSampleIds = new Set();
    return;
  }

  const now = audioContext.currentTime;
  const duration = 0.14;
  const buffer = audioContext.createBuffer(1, audioContext.sampleRate * duration, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
  }

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  const bandpass = audioContext.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.value = beat.accent ? 2400 : 1400;
  bandpass.Q.value = 1.2;

  const accentBase = Math.min(1, (Number(accentInput.value) / 100) * 1.25);
  const accentLevel = isHotAccent ? Math.min(1, accentBase * 1.2) : accentBase;
  const volume = beat.accent ? accentLevel : 0.6;
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
    const useStrong = Math.random() < 0.5;
    const avoidIds = new Set([...lastBeatSampleIds, ...lastClapSampleIds]);
    const key = useStrong ? "strong" : "weak";
    const buffers = useStrong ? palmaSamples.strong : palmaSamples.weak;
    const index = pickPalmaIndex(buffers, key, false, avoidIds);
    const buffer = index >= 0 ? buffers[index] : null;
    playPalmaSample(buffer, 5.0);
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
  if (currentBeat === startIndex) {
    cycleClapBeats = pickCycleClaps(beats, startIndex);
  }
  const beat = beats[currentBeat];
  const beatCells = grid.querySelectorAll(".beat");

  beatCells.forEach((cell) => cell.classList.remove("beat--active"));
  const activeCell = grid.querySelector(`[data-index='${currentBeat}']`);
  if (activeCell) {
    activeCell.classList.add("beat--active");
  }

  if (!beat.accent && lastIntervalMs > 0) {
    const onTime = Math.random() < 0.6;
    if (onTime) {
      playClick(beat);
    } else {
      const maxJitter = Math.min(18, lastIntervalMs * 0.08);
      const jitter = Math.random() * maxJitter;
      setTimeout(() => playClick(beat), Math.round(jitter));
    }
  } else {
    playClick(beat);
  }

  if (cycleClapBeats.includes(currentBeat) && lastIntervalMs > 0) {
    const jitter = (Math.random() - 0.5) * 12;
    setTimeout(playClap, lastIntervalMs * 0.5 + jitter);
  }
  currentBeat = (currentBeat + 1) % beats.length;
}

async function start() {
  if (isRunning) return;

  ensureAudioContext();
  setStatus("Loading samples...", true);
  await loadPalmaSamples();
  isRunning = true;
  toggleButton.textContent = "Pause";
  setStatus("Running", true);

  const bpm = Number(tempoInput.value);
  const swing = Number(swingInput.value) / 100;

  const baseInterval = 60000 / bpm;
  let nextSwing = false;
  lastIntervalMs = baseInterval;
  cycleClapBeats = [];

  scheduleBeat();
  clearInterval(intervalId);
  intervalId = setInterval(() => {
    scheduleBeat();
    if (swing > 0) {
      clearInterval(intervalId);
      const adjustedInterval = nextSwing
        ? baseInterval * (1 + swing)
        : baseInterval * (1 - swing);
      lastIntervalMs = adjustedInterval;
      nextSwing = !nextSwing;
      intervalId = setInterval(() => scheduleBeat(), adjustedInterval);
    }
  }, baseInterval);
}

function stop() {
  if (!isRunning) return;
  isRunning = false;
  toggleButton.textContent = "Start";
  setStatus("Stopped", false);
  clearInterval(intervalId);
}

function reset() {
  stop();
  const { beats } = compasData[compasSelect.value];
  currentBeat = getStartIndex(compasSelect.value, beats);
  cycleClapBeats = [];
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
    if (isRunning) {
      stop();
      start();
    }
  });
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
