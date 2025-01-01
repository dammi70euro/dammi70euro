// API Key di Google (da configurare su Google Cloud Console)
const API_KEY = 'AIzaSyCsKsvTqnlnDD94CYef0diL_M0jZ4HqjTk';
const FOLDER_ID = '1JdLjxDa8xNTDYJgUCGLurORSbW0pXUAn';

// Elementi HTML
const listElement = document.getElementById('mp3-list');
const player = document.getElementById('player');

// Recupera la lista dei file da Google Drive
async function fetchMP3Files() {
  try {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q='${FOLDER_ID}'+in+parents&key=${API_KEY}`);
    const data = await response.json();

    if (data.files && data.files.length > 0) {
      const audioFiles = data.files.filter(file => file.mimeType === 'audio/mpeg' || file.mimeType === 'audio/wav');
      createMP3List(audioFiles);
    } else {
      console.error('Nessun file trovato nella cartella.');
    }
  } catch (error) {
    console.error('Errore durante il recupero dei file:', error);
  }
}

// Crea la lista di file audio
function createMP3List(files) {
  files.forEach(file => {
    const li = document.createElement('li');
    
    // Titolo della canzone
    const spanTitle = document.createElement('span');
    spanTitle.textContent = file.name;
    spanTitle.classList.add('song-title');

    // Pulsante Play
    const playButton = document.createElement('button');
    playButton.textContent = 'Play';
    playButton.classList.add('play-button');
    playButton.addEventListener('click', () => {
      // Rimuovi eventuale evidenziazione precedente
      const current = document.querySelector('.playing');
      if (current) current.classList.remove('playing');

      // Imposta la fonte dell'audio e riproduce
      player.src = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${API_KEY}`;
      player.play();

      // Evidenzia il brano in riproduzione
      spanTitle.classList.add('playing');
    });

    li.appendChild(spanTitle);
    li.appendChild(playButton);
    listElement.appendChild(li);
  });
}

// Avvia il recupero dei file all'avvio
fetchMP3Files();
