const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const keys = document.querySelectorAll('.key');
const knobs = document.querySelectorAll('.knob');
let oscillators = {};

// Key mapping
keys.forEach(key => {
    key.addEventListener('mousedown', () => playTone(key.dataset.note));
    key.addEventListener('mouseup', stopTone);
});

// Frequencies for each note
const noteFrequencies = {
    'C4': 261.63,
    'D4': 293.66,
    'E4': 329.63,
    'F4': 349.23,
    'G4': 392.00,
    'A4': 440.00,
    'B4': 493.88,
    'C5': 523.25
};

// Play a tone
function playTone(note) {
    if (oscillators[note]) return;

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = 'sine';
	console.log('valore-> ' + audioContext.currentTime )
    oscillator.frequency.setValueAtTime(noteFrequencies[note], audioContext.currentTime);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();
    oscillators[note] = { oscillator, gainNode };
}

// Stop a tone
function stopTone(event) {
    const note = event.target.dataset.note;
    if (oscillators[note]) {
        oscillators[note].gainNode.gain.setTargetAtTime(0, audioContext.currentTime, 0.01);
        oscillators[note].oscillator.stop(audioContext.currentTime + 0.02);
        delete oscillators[note];
    }
}

// Knob controls
knobs.forEach((knob, index) => {
    knob.addEventListener('input', event => {
        const value = event.target.value;
        adjustParameter(index, value);
    });
});

function adjustParameter(index, value) {
    switch (index) {
        case 0:
            Object.values(oscillators).forEach(o => o.oscillator.type = value > 50 ? 'square' : 'sine');
            break;
        case 1:
            Object.values(oscillators).forEach(o => o.oscillator.frequency.value += value);
            break;
        case 2:
            // Implement custom behavior for third knob
            break;
        case 3:
            // Implement custom behavior for fourth knob
            break;
    }
}
