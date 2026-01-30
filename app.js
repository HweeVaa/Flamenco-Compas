const compasData = {
  solea: {
    name: "솔레아 / 불레리아",
    beats: [
      { label: "1", accent: true },
      { label: "2", accent: false },
      { label: "3", accent: false },
      { label: "4", accent: true },
      { label: "5", accent: false },
      { label: "6", accent: false },
      { label: "7", accent: true },
      { label: "8", accent: false },
      { label: "9", accent: true },
      { label: "10", accent: false },
      { label: "11", accent: true },
      { label: "12", accent: false }
    ]
  },
  seguiriya: {
    name: "세기리야",
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
    name: "탕고스",
    beats: [
      { label: "1", accent: true },
      { label: "2", accent: false },
      { label: "3", accent: true },
      { label: "4", accent: false }
    ]
  },
  rumba: {
    name: "룸바",
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

function renderGrid() {
  const { beats } = compasData[compasSelect.value];
  grid.innerHTML = "";
  beats.forEach((beat, index) => {
    const cell = document.createElement("div");
    cell.className = `beat${beat.accent ? " beat--accent" : ""}`;
    cell.dataset.index = index.toString();
    const angle = (index / beats.length) * 360 - 90;
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
}

function playClick(isAccent) {
  if (!audioContext) return;

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
  bandpass.frequency.value = isAccent ? 1800 : 1400;
  bandpass.Q.value = 1.2;

  const volume = (isAccent ? accentInput.value : 60) / 100;
  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  source.connect(bandpass).connect(gain).connect(audioContext.destination);
  source.start(now);
  source.stop(now + duration);
}

function scheduleBeat() {
  const { beats } = compasData[compasSelect.value];
  const beat = beats[currentBeat];
  const beatCells = grid.querySelectorAll(".beat");

  beatCells.forEach((cell) => cell.classList.remove("beat--active"));
  const activeCell = grid.querySelector(`[data-index='${currentBeat}']`);
  if (activeCell) {
    activeCell.classList.add("beat--active");
  }

  playClick(beat.accent);
  currentBeat = (currentBeat + 1) % beats.length;
}

function start() {
  if (isRunning) return;

  ensureAudioContext();
  isRunning = true;
  toggleButton.textContent = "일시정지";
  setStatus("재생 중", true);

  const bpm = Number(tempoInput.value);
  const swing = Number(swingInput.value) / 100;

  const baseInterval = 60000 / bpm;
  let nextSwing = false;

  scheduleBeat();
  clearInterval(intervalId);
  intervalId = setInterval(() => {
    scheduleBeat();
    if (swing > 0) {
      clearInterval(intervalId);
      const adjustedInterval = nextSwing
        ? baseInterval * (1 + swing)
        : baseInterval * (1 - swing);
      nextSwing = !nextSwing;
      intervalId = setInterval(() => scheduleBeat(), adjustedInterval);
    }
  }, baseInterval);
}

function stop() {
  if (!isRunning) return;
  isRunning = false;
  toggleButton.textContent = "시작";
  setStatus("정지", false);
  clearInterval(intervalId);
}

function reset() {
  stop();
  currentBeat = 0;
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
