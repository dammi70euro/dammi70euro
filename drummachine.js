const tempoSlider = document.getElementById('tempoSlider');
const tempoValue = document.getElementById('tempoValue');
const playBtn = document.getElementById('playBtn');
const stopBtn = document.getElementById('stopBtn');
const stepsButtons = document.querySelectorAll('.steps-buttons button');
const drumMachineDiv = document.getElementById('drumMachine');

let tempo = 120;
let numSteps = 16;
let isPlaying = false;
let intervalId = null;
let currentStep = 0;
let steps = [];
const patterns = {};

const instruments = ['Kick', 'Snare', 'hihat'];

// Genera pattern per Kick
function generateKickPattern(numSteps) {
  const pattern = Array(numSteps).fill(false);
  for (let i = 0; i < numSteps; i += 4) {
    pattern[i] = true; // Battiti forti (1° e 3°)
    if (i + 2 < numSteps) pattern[i + 2] = Math.random() > 0.7; // Aggiunge variazione
  }
  return pattern;
}

// Genera pattern per Snare
function generateSnarePattern(numSteps) {
  const pattern = Array(numSteps).fill(false);
  for (let i = 2; i < numSteps; i += 4) {
    pattern[i] = true; // Battiti deboli (2° e 4°)
    if (i + 1 < numSteps) pattern[i + 1] = Math.random() > 0.8; // Ghost notes
  }
  return pattern;
}

// Genera pattern per Hi-Hat
function generateHiHatPattern(numSteps) {
  const pattern = Array(numSteps).fill(false);
  for (let i = 0; i < numSteps; i += 2) {
    pattern[i] = true; // Ritmo regolare
    if (Math.random() > 0.5 && i + 1 < numSteps) pattern[i + 1] = true; // Swing o sincopato
  }
  return pattern;
}

// Cancella tutti gli step per uno strumento
function clearPattern(instrument) {
  patterns[instrument] = Array(numSteps).fill(false);
  buildDrumMachine();
}

// Mantiene i valori degli step
function adjustSteps(newSteps) {
  instruments.forEach((instrument) => {
    const oldPattern = patterns[instrument.toLowerCase()] || [];
    const newPattern = [];

    for (let i = 0; i < newSteps; i++) {
      if (i < oldPattern.length) {
        newPattern[i] = oldPattern[i];
      } else {
        newPattern[i] = oldPattern[i % oldPattern.length];
      }
    }

    patterns[instrument.toLowerCase()] = newPattern;
  });
}

// Costruisce la drum machine
function buildDrumMachine() {
  drumMachineDiv.innerHTML = '';
  steps = [];

  instruments.forEach((instrument) => {
    const row = document.createElement('div');
    row.className = 'instrument-row';

    const header = document.createElement('div');
    header.className = 'instrument-header';

    const label = document.createElement('div');
    label.className = 'instrument-label';
    label.textContent = instrument;

    const patternButton = document.createElement('button');
    patternButton.className = 'pattern-button';
    patternButton.textContent = '🎲';
    patternButton.title = 'Genera pattern';
    patternButton.addEventListener('click', () => applyPattern(instrument.toLowerCase()));

    const clearButton = document.createElement('button');
    clearButton.className = 'pattern-button';
    clearButton.textContent = '❌';
    clearButton.title = 'Cancella pattern';
    clearButton.addEventListener('click', () => clearPattern(instrument.toLowerCase()));

    header.appendChild(label);
    header.appendChild(patternButton);
    header.appendChild(clearButton);
    row.appendChild(header);

    const stepGroup = document.createElement('div');
    stepGroup.className = 'step-group';

    const currentPattern = patterns[instrument.toLowerCase()] || [];
    for (let i = 0; i < numSteps; i++) {
      const stepContainer = document.createElement('div');
      stepContainer.className = 'step-container';

      const stepNumber = document.createElement('div');
      stepNumber.className = 'step-number';
      stepNumber.textContent = (i % 8) + 1;

      const step = document.createElement('div');
      step.className = 'step';
      step.dataset.instrument = instrument.toLowerCase();
      step.dataset.step = i;
      if (currentPattern[i]) step.classList.add('active');

      step.addEventListener('click', () => {
        step.classList.toggle('active');
      });

      stepContainer.appendChild(stepNumber);
      stepContainer.appendChild(step);
      stepGroup.appendChild(stepContainer);

      steps.push(step);
    }

    row.appendChild(stepGroup);
    drumMachineDiv.appendChild(row);
  });
}

// Applica un pattern generato
function applyPattern(instrument) {
  switch (instrument) {
    case 'kick':
      patterns[instrument] = generateKickPattern(numSteps);
      break;
    case 'snare':
      patterns[instrument] = generateSnarePattern(numSteps);
      break;
    case 'hi-hat':
      patterns[instrument] = generateHiHatPattern(numSteps);
      break;
    default:
      break;
  }
  buildDrumMachine();
}

// Riproduzione
function playSound(instrument) {
  const audio = document.getElementById(`${instrument}Audio`);
  if (audio) {
    audio.currentTime = 0;
    audio.play();
  }
}

function handleStep() {
  steps.forEach((step) => {
    const stepIndex = parseInt(step.dataset.step);
    if (stepIndex === currentStep) {
      step.classList.add('current');
      if (step.classList.contains('active')) {
        playSound(step.dataset.instrument);
      }
    } else {
      step.classList.remove('current');
    }
  });

  currentStep = (currentStep + 1) % numSteps;
}

function startSequencer() {
  if (!isPlaying) {
    isPlaying = true;
    const stepDuration = (60 / tempo) / 4;
    intervalId = setInterval(handleStep, stepDuration * 1000);
  }
}

function stopSequencer() {
  if (isPlaying) {
    isPlaying = false;
    clearInterval(intervalId);
    steps.forEach((step) => step.classList.remove('current'));
  }
}

// Eventi
tempoSlider.addEventListener('input', () => {
  tempo = parseInt(tempoSlider.value);
  tempoValue.textContent = `${tempo} BPM`;
  if (isPlaying) {
    clearInterval(intervalId);
    const stepDuration = (60 / tempo) / 4;
    intervalId = setInterval(handleStep, stepDuration * 1000);
  }
});

stepsButtons.forEach((button) => {
  button.addEventListener('click', () => {
    numSteps = parseInt(button.dataset.steps);
    adjustSteps(numSteps);
    buildDrumMachine();
  });
});

playBtn.addEventListener('click', startSequencer);
stopBtn.addEventListener('click', stopSequencer);

// Inizializzazione
instruments.forEach((instrument) => {
  patterns[instrument.toLowerCase()] = generateKickPattern(numSteps);
});
buildDrumMachine();
