//////////////////////////////////////
// IMMAGINI CASUALI SULLO SFONDO    //
//////////////////////////////////////
const NUM_IMAGES = 100;
const imgSrc = 'dammi70euro.png';

const screenWidth = window.innerWidth;
const screenHeight = window.innerHeight;

for (let i = 0; i < NUM_IMAGES; i++) {
  const img = document.createElement('img');
  img.src = imgSrc;
  img.classList.add('random-image');
  const x = Math.random() * screenWidth;
  const y = Math.random() * screenHeight;
  // Dimensioni random
  const size = 80 + Math.random() * 70; 
  img.style.width = size + 'px';
  img.style.height = 'auto';
  img.style.left = x + 'px';
  img.style.top = y + 'px';
  document.body.appendChild(img);
}

////////////////////////
// DRUM MACHINE LOGIC //
////////////////////////

// Recuperiamo i <audio> dal DOM
const kickAudio = document.getElementById('kickAudio');
const snareAudio = document.getElementById('snareAudio');
const hihatAudio = document.getElementById('hihatAudio');

// Parametri Sequencer
const STEPS = 8;
const TEMPO = 120; // BPM
// Ogni step corrisponde a un ottavo -> stepDuration = (60 / TEMPO) / 2
const stepDuration = (60 / TEMPO) / 2; 

let currentStep = 0;
let isPlaying = false;
let intervalId = null;

const playBtn = document.getElementById('playBtn');
const checkboxes = document.querySelectorAll('input[type="checkbox"]');

// Funzione per suonare un campione
function playSample(sound) {
  if (sound === 'kick') {
    kickAudio.currentTime = 0;
    kickAudio.play();
  } else if (sound === 'snare') {
    snareAudio.currentTime = 0;
    snareAudio.play();
  } else if (sound === 'hihat') {
    hihatAudio.currentTime = 0;
    hihatAudio.play();
  }
}

function scheduleStep() {
  highlightStep(currentStep);

  // Per ogni checkbox
  checkboxes.forEach(chk => {
    const step = parseInt(chk.dataset.step);
    const sound = chk.dataset.sound;
    // Se step coincide e checkbox è attivo, suoniamo
    if (step === currentStep && chk.checked) {
      playSample(sound);
    }
  });

  // Prossimo step
  currentStep = (currentStep + 1) % STEPS;
}

// Evidenzia la colonna dello step
function highlightStep(stepIndex) {
  // Rimuoviamo la classe active-step da tutte le celle
  document.querySelectorAll('td').forEach(td => td.classList.remove('active-step'));
  // Aggiungiamo la classe alla colonna corrispondente
  const rows = document.querySelectorAll('tbody tr');
  rows.forEach(row => {
    const cells = row.querySelectorAll('td');
    // La colonna stepIndex + 1 (perché la colonna 0 è il nome dello strumento)
    if (cells[stepIndex + 1]) {
      cells[stepIndex + 1].classList.add('active-step');
    }
  });
}

function startSequencer() {
  if (!isPlaying) {
    isPlaying = true;
    currentStep = 0;
    playBtn.textContent = 'Stop';
    scheduleStep(); // Esegui subito il primo step
    intervalId = setInterval(scheduleStep, stepDuration * 1000);
  } else {
    // Ferma
    isPlaying = false;
    playBtn.textContent = 'Play';
    clearInterval(intervalId);
    intervalId = null;
    // Rimuoviamo evidenziazione
    document.querySelectorAll('td').forEach(td => td.classList.remove('active-step'));
  }
}

// Bottone Play/Stop
playBtn.addEventListener('click', () => {
  // Alcuni browser richiedono un "gesture" per l'audio
  // Quindi se .play() fosse bloccato, adesso c'è il click
  startSequencer();
});
