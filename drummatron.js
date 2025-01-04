// Create an audio context
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

// Drum sound mappings for keys
const drumSounds = {
  Q: { type: "triangle", frequency: 150, decay: 0.1 }, // Kick drum
  W: { type: "square", frequency: 200, decay: 0.05 }, // Snare drum
  E: { type: "sine", frequency: 400, decay: 0.05 },  // Hi-hat
  A: { type: "triangle", frequency: 100, decay: 0.15 }, // Low tom
  S: { type: "sine", frequency: 300, decay: 0.15 },   // Mid tom
  D: { type: "sine", frequency: 450, decay: 0.2 },    // High tom
  Z: { type: "square", frequency: 500, decay: 0.03 }, // Clap
  X: { type: "sine", frequency: 250, decay: 0.05 },   // Rim shot
  C: { type: "triangle", frequency: 350, decay: 0.05 }, // Cowbell
};

// Play sound function
function playSound(key) {
  const drum = drumSounds[key.toUpperCase()];
  if (drum) {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = drum.type;
    oscillator.frequency.setValueAtTime(drum.frequency, audioContext.currentTime);

    gainNode.gain.setValueAtTime(1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + drum.decay);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + drum.decay);
  }
}

// Add event listeners to pads
const pads = document.querySelectorAll(".pad");
pads.forEach((pad) => {
  pad.addEventListener("click", () => {
    const key = pad.getAttribute("data-key");
    playSound(key);
  });
});

// Add event listener for keyboard presses
document.addEventListener("keydown", (e) => {
  playSound(e.key);

  // Highlight the pad on key press
  const pad = document.querySelector(`.pad[data-key="${e.key.toUpperCase()}"]`);
  if (pad) {
    pad.classList.add("active");
    setTimeout(() => pad.classList.remove("active"), 100);
  }
});
