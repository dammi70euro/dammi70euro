// API Key di Google (da configurare su Google Cloud Console)
const API_KEY = 'AIzaSyCsKsvTqnlnDD94CYef0diL_M0jZ4HqjTk';
const FOLDER_ID = '1JdLjxDa8xNTDYJgUCGLurORSbW0pXUAn';


// Elementi HTML
const listElement = document.getElementById('mp3-list');
const player = document.getElementById('player');

// Recupera eventuale parametro ?play=... dall'URL
const urlParams = new URLSearchParams(window.location.search);
const autoPlayId = urlParams.get('play');

// Variabile dove salviamo la traccia che serve far partire in autoplay
let fileToAutoPlay = null;

// Aggiungi un event listener per controllare l'audio con la barra spaziatrice
document.addEventListener('keydown', function(event) {
  // Controlla se il tasto premuto è la barra spaziatrice (codice 32)
  if (event.keyCode === 32 || event.code === 'Space') {
    // Previeni il comportamento predefinito (scroll della pagina)
    event.preventDefault();
    
    // Se il player è in pausa, avvia la riproduzione, altrimenti metti in pausa
    if (player.paused) {
      player.play();
    } else {
      player.pause();
    }
  }
});

// 1. Recupera la lista dei file da Google Drive
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

      // Se c'è un parametro ?play=..., cerchiamo tra queste 10 tracce
      if (autoPlayId) {
        fileToAutoPlay = limitedFiles.find(f => f.id === autoPlayId);
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
    console.log(file.name)
    const li = document.createElement('li');
    li.dataset.id = file.id; // Salviamo l'ID sul <li> per poterlo cercare

    // Titolo della canzone
    const spanTitle = document.createElement('span');
    spanTitle.textContent = file.name;
    spanTitle.classList.add('song-title');

    // Pulsante Play
    const playButton = document.createElement('button');
    playButton.textContent = 'Play';
    playButton.classList.add('play-button');
    playButton.addEventListener('click', () => {
      playTrack(file, spanTitle, playButton);
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

// 3. Funzione per riprodurre una traccia
function playTrack(file, titleElement, buttonElement) {
  // Rimuovi eventuale evidenziazione precedente
  const current = document.querySelector('.playing');
  if (current) current.classList.remove('playing');

  // Rimuovi eventuale evidenziazione "need-click" su tutti i pulsanti
  document.querySelectorAll('.play-button.need-click')
    .forEach(btn => btn.classList.remove('need-click'));

  // Imposta la fonte dell'audio
  player.src = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${API_KEY}`;
  
  // Tenta la riproduzione
  player.play()
    .then(() => {
      // Evidenzia il brano in riproduzione
      titleElement.classList.add('playing');
    })
    .catch(err => {
      // Se l'autoplay viene bloccato (NotAllowedError), evidenziamo il pulsante
      console.log("Riproduzione bloccata o errore:", err);
      buttonElement.classList.add('need-click');
      alert("Il browser ha bloccato l'autoplay. Clicca Play per ascoltare.");
    });
}

// 4. Funzione per la condivisione
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

// 5. Autoplay track (quando arrivi con ?play=ID)
function autoPlayTrack(file) {
  // Cerchiamo la <li> corrispondente
  const li = document.querySelector(`li[data-id="${file.id}"]`);
  if (li) {
    // Scrolliamo fino a quella traccia, così l'utente la vede subito
    li.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Simuliamo la chiamata a playTrack
    const spanTitle = li.querySelector('.song-title');
    const playBtn = li.querySelector('.play-button');

    // Prova a riprodurre
    player.src = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${API_KEY}`;
    player.play()
      .then(() => {
        // Evidenzia il titolo
        spanTitle.classList.add('playing');
      })
      .catch(err => {
        console.log("Autoplay bloccato:", err);
        // Evidenziamo il pulsante di Play
        playBtn.classList.add('need-click');
        alert("Per riprodurre questa traccia, clicca sul pulsante Play.");
      });
  }
}

// Avvia il recupero dei file all'avvio
fetchMP3Files();
