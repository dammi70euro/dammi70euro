document.addEventListener("DOMContentLoaded", () => {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  let oscillator1 = null;
  let oscillator2 = null;
  let filter = null;

  const vco1Control = document.getElementById("vco1");
  const vco2Control = document.getElementById("vco2");
  const vcfControl = document.getElementById("vcf");
  const playButton = document.getElementById("playButton");

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

  playButton.addEventListener("click", () => {
    if (playButton.textContent === "Play") {
      startSynth();
      playButton.textContent = "Stop";
    } else {
      stopSynth();
      playButton.textContent = "Play";
    }
  });

  vco1Control.addEventListener("input", updateSynth);
  vco2Control.addEventListener("input", updateSynth);
  vcfControl.addEventListener("input", updateSynth);
});
