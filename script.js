// API Key di Google (da configurare su Google Cloud Console)
const API_KEY = 'AIzaSyCsKsvTqnlnDD94CYef0diL_M0jZ4HqjTk';
const FOLDER_ID = '1JdLjxDa8xNTDYJgUCGLurORSbW0pXUAn';


// Elementi HTML
const listElement = document.getElementById('mp3-list');
const player = document.getElementById('player');

// Recupera eventuale parametro ?play=... dall'URL
const urlParams = new URLSearchParams(window.location.search);
const autoPlayId = urlParams.get('play');

// Variabile per memorizzare quale file vogliamo auto-riprodurre
let fileToAutoPlay = null;

// 1. Recupera lista file da Google Drive
async function fetchMP3Files() {
  try {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q='${FOLDER_ID}'+in+parents&key=${API_KEY}`
    );
    const data = await response.json();

    if (data.files && data.files.length > 0) {
      // Filtra solo i file audio
      const audioFiles = data.files.filter(file =>
        file.mimeType === 'audio/mpeg' || file.mimeType === 'audio/wav'
      );

      // Crea la lista
      createMP3List(audioFiles);

      // Se c'è un parametro ?play=, proviamo a impostare il file da riprodurre
      if (autoPlayId) {
        fileToAutoPlay = audioFiles.find(f => f.id === autoPlayId);
        // Se il file esiste, tentiamo la riproduzione immediata
        if (fileToAutoPlay) {
          autoPlayTrack(fileToAutoPlay);
        }
      }

    } else {
      console.error('Nessun file trovato nella cartella.');
    }

  } catch (error) {
    console.error('Errore durante il recupero dei file:', error);
  }
}

// 2. Crea la lista di file audio
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
      playTrack(file, spanTitle);
    });

    // Pulsante Condividi
    const shareButton = document.createElement('button');
    shareButton.textContent = '📤 Condividi';
    shareButton.classList.add('share-button');
    shareButton.addEventListener('click', () => {
      shareSong(file.name, file.id);
    });

    li.appendChild(spanTitle);
    li.appendChild(playButton);
    li.appendChild(shareButton);
    listElement.appendChild(li);
  });
}

// 3. Funzione per riprodurre una traccia al click di “Play”
function playTrack(file, titleElement) {
  // Rimuovi eventuale evidenziazione precedente
  const current = document.querySelector('.playing');
  if (current) current.classList.remove('playing');

  // Imposta la fonte dell'audio
  player.src = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${API_KEY}`;
  
  // Prova ad avviare la riproduzione
  player.play()
    .then(() => {
      // Evidenzia il brano in riproduzione
      titleElement.classList.add('playing');
    })
    .catch(err => {
      console.log("Autoplay bloccato o errore di riproduzione:", err);
      // Se viene bloccato, possiamo mostrare un alert o un messaggio
      alert("Impossibile riprodurre automaticamente. Tocca lo schermo o premi un pulsante per avviare l'audio.");
    });
}

// 4. Funzione di condivisione
function shareSong(title, fileId) {
  // Crea un link alla stessa pagina con parametro ?play=...
  const currentUrl = window.location.origin + window.location.pathname;
  const shareUrl = `${currentUrl}?play=${fileId}`;

  if (navigator.share) {
    navigator.share({
      title: title,
      text: `Ascolta questa canzone: ${title}`,
      url: shareUrl
    }).catch(err => console.log("Errore condivisione: ", err));
  } else {
    // Fallback su WhatsApp (o altro)
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent('Ascolta questa canzone: ' + title + ' ' + shareUrl)}`;
    window.open(whatsappUrl, '_blank');
  }
}

// 5. Riproduzione automatica (se ?play=... è presente)
function autoPlayTrack(file) {
  // Imposta la sorgente
  player.src = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${API_KEY}`;
  
  player.play()
    .then(() => {
      // Se va a buon fine, evidenziamo il brano nella lista
      highlightPlayingSong(file.name);
    })
    .catch(err => {
      console.log("Autoplay bloccato:", err);
      // Se l’autoplay viene bloccato, possiamo aspettare un'interazione dell'utente
      // Oppure mostrare un messaggio/pulsante
      // Esempio minimal: un alert e poi l’utente dovrà cliccare Play manualmente
      alert("Per riprodurre automaticamente il brano devi prima interagire con la pagina. Premi Play!");
    });
}

// Evidenzia la canzone in riproduzione
function highlightPlayingSong(fileName) {
  const allTitles = document.querySelectorAll('.song-title');
  allTitles.forEach(titleSpan => {
    titleSpan.classList.remove('playing');
    if (titleSpan.textContent === fileName) {
      titleSpan.classList.add('playing');
    }
  });
}

// Avvia il recupero dei file
fetchMP3Files();
