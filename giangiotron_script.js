// Funzione per inizializzare il Giangiotron
function initGiangiotron() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const buttons = document.querySelectorAll('.audio-button');

    // Effetti
    const delay = audioContext.createDelay(5.0); // Massimo ritardo di 5 secondi
    const delayFeedback = audioContext.createGain();
    delay.connect(delayFeedback);
    delayFeedback.connect(delay);

    const convolver = audioContext.createConvolver(); // Reverbero

    const gainNode = audioContext.createGain(); // Gain finale
    gainNode.gain.value = 0.5;

    // Controlli degli effetti
    const delayCheckbox = document.getElementById('delayCheckbox');
    const delaySlider = document.getElementById('delaySlider');

    const reverbCheckbox = document.getElementById('reverbCheckbox');
    const reverbSlider = document.getElementById('reverbSlider');

    const reverseCheckbox = document.getElementById('reverseCheckbox');

    // Funzione per generare un buffer per il reverbero
    function createReverbBuffer(decay = 2) {
        const sampleRate = audioContext.sampleRate;
        const length = sampleRate * decay;
        const impulse = audioContext.createBuffer(2, length, sampleRate);
        for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
            const impulseData = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                impulseData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
            }
        }
        return impulse;
    }

    // Aggiorna il buffer del reverbero
    reverbSlider.addEventListener('input', () => {
        convolver.buffer = createReverbBuffer(parseFloat(reverbSlider.value));
    });
    convolver.buffer = createReverbBuffer(parseFloat(reverbSlider.value));

    // Configurazione degli effetti
    delay.delayTime.value = 0.5; // Default ritardo
    delayFeedback.gain.value = 0.5; // Default feedback

    // Funzione per caricare e riprodurre l'audio
    function playAudio(fileName) {
        const audioElement = new Audio(`giangiotron/${fileName}`);
        audioElement.crossOrigin = 'anonymous';

        const track = audioContext.createMediaElementSource(audioElement);

        // Connessioni degli effetti
        track.connect(gainNode);

        if (delayCheckbox.checked) {
            gainNode.connect(delay);
            delay.connect(audioContext.destination);
        }
        if (reverbCheckbox.checked) {
            gainNode.connect(convolver);
            convolver.connect(audioContext.destination);
        }

        gainNode.connect(audioContext.destination);

        audioElement.play();
    }

    // Configurazione eventi per i bottoni
    buttons.forEach(button => {
        button.addEventListener('click', () => {
            const fileName = button.dataset.audio;
            playAudio(fileName);
        });
    });

    // Eventi per controlli degli effetti
    delaySlider.addEventListener('input', () => {
        delayFeedback.gain.value = parseFloat(delaySlider.value);
    });
}

// Inizializza il Giangiotron al caricamento della pagina
document.addEventListener('DOMContentLoaded', initGiangiotron);
