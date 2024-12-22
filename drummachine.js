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
const instruments = ['Kick', 'Snare', 'Hi-Hat'];
const patterns = {};

// Funzioni di generazione ritmica
function generatePattern(instrument) {
  const pattern = Array(numSteps).fill(false);

  if (instrument === 'kick') {
    for (let i = 0; i < numSteps; i += 4) {
      pattern[i] = true;
    }
  } else if (instrument === 'snare') {
    for (let i = 2; i < numSteps; i += 4) {
      pattern[i] = true;
    }
  } else if (instrument === 'hihat') {
    for (let i = 0; i < numSteps; i += 2) {
      pattern[i] = Math.random() > 0.3; // Sincopato casuale
    }
  }

  return pattern;
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
    patternButton.textContent = 'Genera';
    patternButton.addEventListener('click', () => applyPattern(instrument));

    header.appendChild(label);
    header.appendChild(patternButton);
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
  patterns[instrument.toLowerCase()] = generatePattern(instrument.toLowerCase());
  buildDrumMachine();
}

// Mantieni i valori degli step
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
  patterns[instrument.toLowerCase()] = generatePattern(instrument.toLowerCase());
});
buildDrumMachine();
