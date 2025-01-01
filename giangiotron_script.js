// Funzione per inizializzare il Giangiotron
function initGiangiotron() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const buttonGrid = document.getElementById('button-grid');

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

    // Funzione per riprodurre audio
    function playAudio(fileUrl) {
        const audioElement = new Audio(fileUrl);
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

    // Funzione per caricare i file da Google Drive e generare pulsanti dinamicamente
    function loadDriveFiles() {
        const folderId = '1xrP5sDeeo5-iWzFWoQoIFuOTvKnhPntd'; // Sostituisci con l'ID della cartella di Google Drive

        gapi.client.drive.files.list({
            q: `'${folderId}' in parents and (mimeType='audio/mpeg' or mimeType='image/png')`,
            fields: 'files(id, name, mimeType)',
        }).then(response => {
            const files = response.result.files;
            const audioFiles = {};

            // Organizza i file per nome base
            files.forEach(file => {
                const fileType = file.mimeType;
                const fileName = file.name;
                const baseName = fileName.split('.')[0];

                if (fileType === 'audio/mpeg') {
                    audioFiles[baseName] = audioFiles[baseName] || {};
                    audioFiles[baseName].audio = file.id;
                } else if (fileType === 'image/png') {
                    audioFiles[baseName] = audioFiles[baseName] || {};
                    audioFiles[baseName].image = file.id;
                }
            });

            // Crea i pulsanti
            Object.keys(audioFiles).forEach(baseName => {
                const { audio, image } = audioFiles[baseName];
                if (audio && image) {
                    const button = document.createElement('button');
                    button.className = 'audio-button';
                    button.style.backgroundImage = `url(https://drive.google.com/uc?id=${image})`;
                    button.dataset.audio = `https://drive.google.com/uc?id=${audio}`;
                    button.addEventListener('click', () => playAudio(button.dataset.audio));
                    buttonGrid.appendChild(button);
                }
            });
        }).catch(error => console.error('Errore nel recupero dei file:', error));
    }

    // Carica i file dopo che l'utente ha autenticato l'accesso a Google Drive
    gapi.load('client:auth2', () => {
        gapi.client.init({
            apiKey: 'YOUR_API_KEY', // Sostituisci con la tua API Key
            clientId: 'YOUR_CLIENT_ID', // Sostituisci con il tuo Client ID
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
            scope: 'https://www.googleapis.com/auth/drive.readonly',
        }).then(() => {
            return gapi.auth2.getAuthInstance().signIn();
        }).then(() => {
            loadDriveFiles();
        }).catch(error => console.error('Errore nell'inizializzazione:', error));
    });

    // Eventi per controlli degli effetti
    delaySlider.addEventListener('input', () => {
        delayFeedback.gain.value = parseFloat(delaySlider.value);
    });
}

// Inizializza il Giangiotron al caricamento della pagina
document.addEventListener('DOMContentLoaded', initGiangiotron);
