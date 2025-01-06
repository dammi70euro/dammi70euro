// Definisci la tua API key e l'ID della cartella
const apiKey = 'AIzaSyCsKsvTqnlnDD94CYef0diL_M0jZ4HqjTk';
const folderId = '1xrP5sDeeo5-iWzFWoQoIFuOTvKnhPntd';

// Funzione per caricare i file audio dalla cartella
async function fetchMP3Files() {
    try {
        // Richiedi i file dalla cartella usando l'API di Google Drive
        const response = await fetch(`https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&key=${apiKey}&fields=files(id,name,mimeType)`);
        const data = await response.json();

        // Verifica se ci sono file
        if (data.files && data.files.length > 0) {
            // Filtra i file audio MP3 e WAV
            const audioFiles = data.files.filter(file => file.mimeType === 'audio/mpeg' || file.mimeType === 'audio/wav');

            // Crea i bottoni per ciascun file audio
            createMP3List(audioFiles);
        } else {
            console.error('Nessun file trovato nella cartella.');
        }
    } catch (error) {
        console.error('Errore durante il recupero dei file:', error);
    }
}

// Funzione per creare i bottoni con i file audio
function createMP3List(audioFiles) {
    const buttonGrid = document.getElementById('button-grid'); // Assicurati che esista un elemento con id "button-grid"

    // Pulisci la griglia esistente prima di aggiungere nuovi bottoni
    buttonGrid.innerHTML = '';

    // Aggiungi un bottone per ogni file audio trovato
    audioFiles.forEach(file => {
        const audioUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${apiKey}`; // URL per il file audio usando il parametro alt=media
        const button = document.createElement('button');
        button.className = 'audio-button'; // Puoi aggiungere uno stile personalizzato
        button.textContent = file.name; // Mostra il nome del file come testo del bottone
        button.addEventListener('click', () => playAudio(audioUrl)); // Riproduce il file audio quando cliccato

        // Aggiungi il bottone alla griglia
        buttonGrid.appendChild(button);
    });
}

// Funzione per riprodurre il file audio
function playAudio(audioUrl) {
    const audio = new Audio(audioUrl);
    audio.play().catch(error => console.error('Errore nella riproduzione audio:', error));
}

// Carica i file audio quando la pagina è pronta
document.addEventListener('DOMContentLoaded', fetchMP3Files);
