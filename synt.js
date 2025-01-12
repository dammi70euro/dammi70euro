document.addEventListener("DOMContentLoaded", () => {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  let oscillator1 = null;
  let oscillator2 = null;
  let filter = null;
  let gainNode = null;

  let lfo1 = null;
  let lfo1Gain = null;
  let lfo2 = null;
  let lfo2Gain = null;
  let lfoFilter = null;
  let lfoFilterGain = null;

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

  const vco1LfoCheckbox = document.getElementById("vco1Lfo");
  const vco1LfoAmpControl = document.getElementById("vco1LfoAmp");
  const vco1LfoRateControl = document.getElementById("vco1LfoRate");

  const vco2LfoCheckbox = document.getElementById("vco2Lfo");
  const vco2LfoAmpControl = document.getElementById("vco2LfoAmp");
  const vco2LfoRateControl = document.getElementById("vco2LfoRate");

  const vcfLfoCheckbox = document.getElementById("vcfLfo");
  const vcfLfoAmpControl = document.getElementById("vcfLfoAmp");
  const vcfLfoRateControl = document.getElementById("vcfLfoRate");
  
  const gainControl = document.getElementById("gainControl");
 const volumeControl = document.getElementById("volumeControl");

  let currentStep = 0;
  let tempo = 120;
  let nextStepTime = 0;
  let isPlaying = false;
  
  gainControl.addEventListener("input", updateSynth);
 volumeControl.addEventListener("input", updateSynth);

  function startSynth() {
    oscillator1 = audioContext.createOscillator();
    oscillator2 = audioContext.createOscillator();
    filter = audioContext.createBiquadFilter();
    gainNode = audioContext.createGain();
	volumeNode = audioContext.createGain();
	
	gainNode.gain.value = parseFloat(gainControl.value);
	volumeNode.gain.value = parseFloat(volumeControl.value);

    lfo1 = audioContext.createOscillator();
    lfo1Gain = audioContext.createGain();
    lfo2 = audioContext.createOscillator();
    lfo2Gain = audioContext.createGain();
    lfoFilter = audioContext.createOscillator();
    lfoFilterGain = audioContext.createGain();

    oscillator1.type = "sine";
    oscillator2.type = "sine";
    filter.type = "lowpass";
    gainNode.gain.value = 0;

    lfo1.type = "sine";
    lfo2.type = "sine";
    lfoFilter.type = "sine";

    oscillator1.connect(filter);
    oscillator2.connect(filter);
	
    filter.connect(gainNode);
	gainNode.connect(audioContext.destination);

    lfo1.connect(lfo1Gain);
    lfo1Gain.connect(oscillator1.frequency);

    lfo2.connect(lfo2Gain);
    lfo2Gain.connect(oscillator2.frequency);

    lfoFilter.connect(lfoFilterGain);
    lfoFilterGain.connect(filter.frequency);

    lfo1.start();
    lfo2.start();
    lfoFilter.start();

    oscillator1.start();
    oscillator2.start();

    updateSynth();
  }

  function stopSynth() {
    if (oscillator1) oscillator1.stop();
    if (oscillator2) oscillator2.stop();
    if (lfo1) lfo1.stop();
    if (lfo2) lfo2.stop();
    if (lfoFilter) lfoFilter.stop();
    oscillator1 = null;
    oscillator2 = null;
    filter = null;
    gainNode = null;
    lfo1 = null;
    lfo1Gain = null;
    lfo2 = null;
    lfo2Gain = null;
    lfoFilter = null;
    lfoFilterGain = null;
  }

// Updating the updateSynth method to include requestAnimationFrame calls for VCO2 and VCF
function updateSynth() {
  if (oscillator1 && oscillator2 && filter) {
    oscillator1.frequency.value = vco1Control.value * 10;
    oscillator2.frequency.value = vco2Control.value * 10;
    filter.frequency.value = vcfControl.value * 100;
	gainNode.gain.value = parseFloat(gainControl.value);

    lfo1Gain.gain.value = vco1LfoCheckbox.checked ? vco1LfoAmpControl.value : 0;
    lfo1.frequency.value = vco1LfoRateControl.value;

    lfo2Gain.gain.value = vco2LfoCheckbox.checked ? vco2LfoAmpControl.value : 0;
    lfo2.frequency.value = vco2LfoRateControl.value;

    lfoFilterGain.gain.value = vcfLfoCheckbox.checked ? vcfLfoAmpControl.value : 0;
    lfoFilter.frequency.value = vcfLfoRateControl.value;

    if (vco1LfoCheckbox.checked) {
      requestAnimationFrame(syncVCO1SliderWithLFO);
    }

    if (vco2LfoCheckbox.checked) {
      requestAnimationFrame(syncVCO2SliderWithLFO);
    }

    if (vcfLfoCheckbox.checked) {
      requestAnimationFrame(syncVCFSliderWithLFO);
    }

    
  }
}


function syncVCO2SliderWithLFO() {
  if (vco2LfoCheckbox.checked && lfo2 && lfo2Gain) {
    const lfoAmplitude = parseFloat(vco2LfoAmpControl.value) || 0;
    const baseFrequency = parseFloat(vco2Control.value) || 0;
    const lfoFrequency = lfo2.frequency.value;

    const currentTime = audioContext.currentTime;
    const lfoValue = baseFrequency + lfoAmplitude * Math.sin(2 * Math.PI * lfoFrequency * currentTime);

    vco2Control.value = Math.max(0, Math.min(100, lfoValue));
    requestAnimationFrame(syncVCO2SliderWithLFO);
  }
}

function syncVCFSliderWithLFO() {
  if (vcfLfoCheckbox.checked && lfoFilter && lfoFilterGain) {
    const lfoAmplitude = parseFloat(vcfLfoAmpControl.value) || 0;
    const baseFrequency = parseFloat(vcfControl.value) || 0;
    const lfoFrequency = lfoFilter.frequency.value;

    const currentTime = audioContext.currentTime;
    const lfoValue = baseFrequency + lfoAmplitude * Math.sin(2 * Math.PI * lfoFrequency * currentTime);

    vcfControl.value = Math.max(0, Math.min(100, lfoValue));
    requestAnimationFrame(syncVCFSliderWithLFO);
  }
}


function syncVCO1SliderWithLFO() {
  if (vco1LfoCheckbox.checked && lfo1 && lfo1Gain) {
    const lfoAmplitude = parseFloat(vco1LfoAmpControl.value) || 0;
    const baseFrequency = parseFloat(vco1Control.value) || 0;
    const lfoFrequency = lfo1.frequency.value;

    const scaleFactor = 0.1; // Riduce il rate di aggiornamento
    const currentTime = audioContext.currentTime * scaleFactor;
    const lfoValue = baseFrequency + lfoAmplitude * Math.sin(2 * Math.PI * lfoFrequency * currentTime);

    vco1Control.value = Math.max(0, Math.min(100, lfoValue));
    requestAnimationFrame(syncVCO1SliderWithLFO);
  }
}


  function triggerSynth() {
    if (!oscillator1 || !oscillator2 || !filter || !gainNode) {
      startSynth();
    }
    updateSynth();
    gainNode.gain.cancelScheduledValues(audioContext.currentTime);
    gainNode.gain.setValueAtTime( parseFloat(gainControl.value)	, audioContext.currentTime);
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
