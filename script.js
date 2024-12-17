// Lista dei file nella cartella "canzoni"
// Puoi includere anche file .wav e .mpeg, ma ricorda che il player HTML5 riproduce senza problemi soltanto formati supportati dal browser.
// Se vuoi assicurarti che tutti i file vengano riprodotti, utilizza formati comuni come .mp3 o .wav.
const mp3Files = [
  "alle vene.mp3",
  "cachorro.mp3",
  "di-troit (1).mp3",
  "di-troit.mp3",
  "facciamo un ragionamento sensato.mp3",
  "Fast_Drums_Trap_Beat_04_165_BPM_NA.wav",
  "Fever Ray 'If I Had A Heart' (1) (1).mp3",
  "Fever Ray 'If I Had A Heart' (1).mp3",
  "Fever Ray 'If I Had A Heart'.mp3",
  "frosc%C3%ACo.mp3",
  "Giochi sull'acqua.mp3",
  "kenjem.mp3",
  "lofi.mp3",
  "mette carne.mpeg",
  "no a letto.mp3",
  "no.mp3",
  "non mi sento tanto bene.mp3",
  "pippaAncheTu.mpeg",
  "briaco.mp3",
  "secondo te è meglio andare a prostitute.mp3",
  "skukk no.wav",
  "ti garba fumà, eh!.mp3",
  "una pizza non mi sazia.mp3"
];

const listElement = document.getElementById('mp3-list');
const player = document.getElementById('player');

function createMP3List(files) {
  files.forEach(file => {
    const li = document.createElement('li');
    
    // Titolo della canzone
    const spanTitle = document.createElement('span');
    spanTitle.textContent = file;
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
      player.src = 'canzoni/' + file;
      player.play();

      // Evidenzia il brano in riproduzione
      spanTitle.classList.add('playing');
    });

    li.appendChild(spanTitle);
    li.appendChild(playButton);
    listElement.appendChild(li);
  });
}

// Creazione della lista all'avvio
createMP3List(mp3Files);
