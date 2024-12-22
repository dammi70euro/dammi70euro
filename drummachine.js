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

function buildDrumMachine() {
  drumMachineDiv.innerHTML = '';
  steps = [];

  instruments.forEach((instrument) => {
    const row = document.createElement('div');
    row.className = 'instrument-row';

    const label = document.createElement('div');
    label.className = 'instrument-label';
    label.textContent = instrument;

    const stepGroup = document.createElement('div');
    stepGroup.className = 'step-group';

    for (let i = 0; i < numSteps; i++) {
      const stepContainer = document.createElement('div');
      stepContainer.className = 'step-container';

      const stepNumber = document.createElement('div');
      stepNumber.className = 'step-number';
      stepNumber.textContent = i + 1;

      const step = document.createElement('div');
      step.className = 'step';
      step.dataset.instrument = instrument.toLowerCase();
      step.dataset.step = i;

      step.addEventListener('click', () => {
        step.classList.toggle('active');
      });

      stepContainer.appendChild(stepNumber);
      stepContainer.appendChild(step);
      stepGroup.appendChild(stepContainer);

      steps.push(step);
    }

    row.appendChild(label);
    row.appendChild(stepGroup);
    drumMachineDiv.appendChild(row);
  });
}

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
    currentStep = 0;
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

tempoSlider.addEventListener('input', () => {
  tempo = parseInt(tempoSlider.value);
  tempoValue.textContent = tempo;
});

stepsButtons.forEach((button) => {
  button.addEventListener('click', () => {
    numSteps = parseInt(button.dataset.steps);
    buildDrumMachine();
  });
});

playBtn.addEventListener('click', startSequencer);
stopBtn.addEventListener('click', stopSequencer);

buildDrumMachine();
