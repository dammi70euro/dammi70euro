document.addEventListener("DOMContentLoaded", () => {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  let oscillator1 = null;
  let oscillator2 = null;
  let filter = null;
  let gainNode = null;

  const numSteps = 16;
  const steps1 = Array(numSteps / 2).fill(false);
  const steps2 = Array(numSteps / 2).fill(false);

  const vco1Control = document.getElementById("vco1");
  const vco2Control = document.getElementById("vco2");
  const vcfControl = document.getElementById("vcf");
  const decayControl = document.getElementById("decay");
  const tempoSlider = document.getElementById("tempoSlider");
  const tempoValue = document.getElementById("tempoValue");
  const playButton = document.getElementById("playButton");
  const sequencer1 = document.getElementById("sequencer");
  const sequencer2 = document.getElementById("sequencer2");
  const randomFill = document.getElementById("randomFill");
  const randomize = document.getElementById("randomize");
  const clear = document.getElementById("clear");

  let currentStep = 0;
  let tempo = 120;
  let nextStepTime = 0;
  let isPlaying = false;

  function startSynth() {
    oscillator1 = audioContext.createOscillator();
    oscillator2 = audioContext.createOscillator();
    filter = audioContext.createBiquadFilter();
    gainNode = audioContext.createGain();

    oscillator1.type = "sawtooth";
    oscillator2.type = "square";
    filter.type = "lowpass";
    gainNode.gain.value = 0;

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
    gainNode = null;
  }

  function updateSynth() {
    if (oscillator1 && oscillator2 && filter) {
      oscillator1.frequency.value = vco1Control.value * 10;
      oscillator2.frequency.value = vco2Control.value * 10;
      filter.frequency.value = vcfControl.value * 100;
    }
  }

  function triggerSynth() {
    if (!oscillator1 || !oscillator2 || !filter || !gainNode) {
      startSynth();
    }
    updateSynth();
    gainNode.gain.cancelScheduledValues(audioContext.currentTime);
    gainNode.gain.setValueAtTime(1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + parseFloat(decayControl.value));
  }

  function handleStep() {
    const allSteps = [...sequencer1.children, ...sequencer2.children];
    allSteps.forEach((step, index) => {
      if (index === currentStep) {
        step.classList.add("current");
        if (step.classList.contains("active")) {
          triggerSynth();
        }
      } else {
        step.classList.remove("current");
      }
    });
    currentStep = (currentStep + 1) % numSteps;
  }

  function scheduler() {
    while (nextStepTime < audioContext.currentTime + 0.1) {
      handleStep();
      nextStepTime += 60 / tempo / 4;
    }
    if (isPlaying) {
      requestAnimationFrame(scheduler);
    }
  }

  function startSequencer() {
    if (!isPlaying) {
      isPlaying = true;
      currentStep = 0;
      nextStepTime = audioContext.currentTime;
      scheduler();
    }
  }

  function stopSequencer() {
    isPlaying = false;
    stopSynth();
    const allSteps = [...sequencer1.children, ...sequencer2.children];
    allSteps.forEach((step) => step.classList.remove("current"));
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

  randomize.addEventListener("click", () => {
    const fillPercentage = parseInt(randomFill.value, 10);
    [steps1, steps2].forEach((steps, i) => {
      const sequencer = i === 0 ? sequencer1 : sequencer2;
      steps.forEach((_, index) => {
        const isActive = Math.random() < fillPercentage / 100;
        steps[index] = isActive;
        sequencer.children[index].classList.toggle("active", isActive);
      });
    });
  });

  clear.addEventListener("click", () => {
    [steps1, steps2].forEach((steps, i) => {
      const sequencer = i === 0 ? sequencer1 : sequencer2;
      steps.fill(false);
      Array.from(sequencer.children).forEach((step) =>
        step.classList.remove("active")
      );
    });
  });

  tempoSlider.addEventListener("input", () => {
    tempo = parseInt(tempoSlider.value, 10);
    tempoValue.textContent = `${tempo} BPM`;
  });

  playButton.addEventListener("click", () => {
    if (isPlaying) {
      stopSequencer();
      playButton.textContent = "Play";
    } else {
      startSequencer();
      playButton.textContent = "Stop";
    }
  });

  buildSequencer();
});
