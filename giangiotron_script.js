// Definisci la tua API key e l'ID della cartella
const apiKey = 'AIzaSyCsKsvTqnlnDD94CYef0diL_M0jZ4HqjTk';
const folderId = '1xrP5sDeeo5-iWzFWoQoIFuOTvKnhPntd';

// Funzione per caricare i file audio e le immagini dalla cartella
async function fetchMP3Files() {
    try {
        // Richiedi i file dalla cartella usando l'API di Google Drive
        const response = await fetch(`https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&key=${apiKey}&fields=files(id,name,mimeType)`);
        const data = await response.json();

        // Verifica se ci sono file
        if (data.files && data.files.length > 0) {
            // Filtra i file audio MP3 e WAV e le immagini PNG
            const audioFiles = data.files.filter(file => file.mimeType === 'audio/mpeg' || file.mimeType === 'audio/wav');
            const imageFiles = data.files.filter(file => file.mimeType === 'image/png');

            // Crea i bottoni per ciascun file audio e associa l'immagine come sfondo
            createMP3List(audioFiles, imageFiles);
        } else {
            console.error('Nessun file trovato nella cartella.');
        }
    } catch (error) {
        console.error('Errore durante il recupero dei file:', error);
    }
}

// Funzione per creare i bottoni con i file audio e l'immagine di sfondo
function createMP3List(audioFiles, imageFiles) {
    const buttonGrid = document.getElementById('button-grid'); // Assicurati che esista un elemento con id "button-grid"

    // Pulisci la griglia esistente prima di aggiungere nuovi bottoni
    buttonGrid.innerHTML = '';

    // Aggiungi un bottone per ogni file audio trovato
    audioFiles.forEach(file => {
        // Trova l'immagine associata (assumiamo che l'immagine abbia lo stesso nome del file audio)
        const imageFile = imageFiles.find(imgFile => imgFile.name.split('.')[0] === file.name.split('.')[0]);

        // URL per il file audio
        const audioUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${apiKey}`;

        // URL per l'immagine di sfondo
        const imageUrl = imageFile ? `https://www.googleapis.com/drive/v3/files/${imageFile.id}?alt=media&key=${apiKey}` : '';

        // Crea il bottone
        const button = document.createElement('button');
        button.className = 'audio-button'; // Puoi aggiungere uno stile personalizzato

        // Se esiste l'immagine, imposta come sfondo e non mostra il testo
        if (imageUrl) {
            button.style.backgroundImage = `url(${imageUrl})`;
            button.style.backgroundSize = 'cover'; // Imposta la dimensione dell'immagine di sfondo
        } else {
            // Se non c'è immagine, mostra il nome del file (senza estensione)
            const fileNameWithoutExtension = file.name.split('.')[0];
            button.textContent = fileNameWithoutExtension;

            // Imposta un colore di sfondo randomico
            button.style.backgroundColor = getRandomColor();
        }

        // Aggiungi un evento per riprodurre l'audio quando il bottone è cliccato
        button.addEventListener('click', () => playAudio(audioUrl));

        // Aggiungi il bottone alla griglia
        buttonGrid.appendChild(button);
    });
}

// Funzione per riprodurre il file audio
function playAudio(audioUrl) {
    const audio = new Audio(audioUrl);
    audio.play().catch(error => console.error('Errore nella riproduzione audio:', error));
}

// Funzione per generare un colore randomico
function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

// Carica i file audio quando la pagina è pronta
document.addEventListener('DOMContentLoaded', fetchMP3Files);
