// Funzione per inizializzare il Giangiotron
function initGiangiotron() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const buttons = document.querySelectorAll('.audio-button');

    // Effetti
    const delay = audioContext.createDelay();
    const delayFeedback = audioContext.createGain();
    delay.connect(delayFeedback);
    delayFeedback.connect(delay);

    const reverb = audioContext.createGain();

    // Controlli degli effetti
    const delayCheckbox = document.getElementById('delayCheckbox');
    const delaySlider = document.getElementById('delaySlider');

    const reverbCheckbox = document.getElementById('reverbCheckbox');
    const reverbSlider = document.getElementById('reverbSlider');

    const reverseCheckbox = document.getElementById('reverseCheckbox');

    // Configurazione degli effetti
    delay.delayTime.value = 0.5;
    delayFeedback.gain.value = 0.5;
    reverb.gain.value = 0.5;

    // Funzione per caricare e riprodurre l'audio
    function playAudio(fileName) {
        const audioElement = new Audio(`giangiotron/${fileName}`);

        const track = audioContext.createMediaElementSource(audioElement);
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 1;

        track.connect(gainNode);

        // Applica effetti
        if (delayCheckbox.checked) {
            gainNode.connect(delay);
        }
        if (reverbCheckbox.checked) {
            gainNode.connect(reverb);
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

    reverbSlider.addEventListener('input', () => {
        reverb.gain.value = parseFloat(reverbSlider.value);
    });
}

// Inizializza il Giangiotron al caricamento della pagina
document.addEventListener('DOMContentLoaded', initGiangiotron);
