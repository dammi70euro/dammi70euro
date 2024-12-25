document.addEventListener("DOMContentLoaded", () => {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  let oscillator1 = null;
  let oscillator2 = null;
  let filter = null;

  const numSteps = 16;
  const steps1 = Array(numSteps / 2).fill(false);
  const steps2 = Array(numSteps / 2).fill(false);

  const vco1Control = document.getElementById("vco1");
  const vco2Control = document.getElementById("vco2");
  const vcfControl = document.getElementById("vcf");
  const playButton = document.getElementById("playButton");
  const sequencer1 = document.getElementById("sequencer");
  const sequencer2 = document.getElementById("sequencer2");
  const randomFill = document.getElementById("randomFill");
  const randomize = document.getElementById("randomize");
  const clear = document.getElementById("clear");

  function startSynth() {
    oscillator1 = audioContext.createOscillator();
    oscillator2 = audioContext.createOscillator();
    filter = audioContext.createBiquadFilter();

    oscillator1.type = "sawtooth";
    oscillator2.type = "square";
    filter.type = "lowpass";

    const gainNode = audioContext.createGain();
    gainNode.gain.value = 0.1;

    oscillator1.connect(filter);
    oscillator2.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator1.start();
    oscillator2.start();

    updateSynth();
  }

  function stopSynth() {
    if (oscillator1) oscillator1.stop();
    if (oscillator2) oscillator2.stop();
    oscillator1 = null;
    oscillator2 = null;
    filter = null;
  }

  function updateSynth() {
    if (oscillator1 && oscillator2 && filter) {
      oscillator1.frequency.value = vco1Control.value * 10;
      oscillator2.frequency.value = vco2Control.value * 10;
      filter.frequency.value = vcfControl.value * 100;
    }
  }

  function buildSequencer() {
    sequencer1.innerHTML = "";
    sequencer2.innerHTML = "";
    for (let i = 0; i < numSteps / 2; i++) {
      createStep(sequencer1, steps1, i);
      createStep(sequencer2, steps2, i);
    }
  }

  function createStep(sequencer, stepsArray, index) {
    const step = document.createElement("div");
    step.className = "step";
    step.dataset.index = index;
    step.addEventListener("click", () => {
      stepsArray[index] = !stepsArray[index];
      step.classList.toggle("active");
    });
    sequencer.appendChild(step);
  }

  function randomizeSteps() {
    const fillPercentage = parseInt(randomFill.value, 10);
    randomizeArray(steps1, fillPercentage, sequencer1);
    randomizeArray(steps2, fillPercentage, sequencer2);
  }

  function randomizeArray(stepsArray, fillPercentage, sequencer) {
    stepsArray.forEach((_, index) => {
      const isActive = Math.random() < fillPercentage / 100;
      stepsArray[index] = isActive;
      const step = sequencer.children[index];
      step.classList.toggle("active", isActive);
    });
  }

  function clearSteps() {
    clearArray(steps1, sequencer1);
    clearArray(steps2, sequencer2);
  }

  function clearArray(stepsArray, sequencer) {
    stepsArray.fill(false);
    Array.from(sequencer.children).forEach((step) => step.classList.remove("active"));
  }

  playButton.addEventListener("click", () => {
    if (playButton.textContent === "Play") {
      startSynth();
      playButton.textContent = "Stop";
    } else {
      stopSynth();
      playButton.textContent = "Play";
    }
  });

  randomize.addEventListener("click", randomizeSteps);
  clear.addEventListener("click", clearSteps);

  vco1Control.addEventListener("input", updateSynth);
  vco2Control.addEventListener("input", updateSynth);
  vcfControl.addEventListener("input", updateSynth);

  buildSequencer();
});
