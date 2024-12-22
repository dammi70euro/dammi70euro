//////////////////////////////////////
// IMMAGINI CASUALI SULLO SFONDO    //
//////////////////////////////////////
const NUM_IMAGES = 80;
const imgSrc = 'dammi70euro.png';
const screenWidth = window.innerWidth;
const screenHeight = window.innerHeight;

for (let i = 0; i < NUM_IMAGES; i++) {
  const img = document.createElement('img');
  img.src = imgSrc;
  img.classList.add('random-image');
  const x = Math.random() * screenWidth;
  const y = Math.random() * screenHeight;
  const size = 80 + Math.random() * 50;
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
const kickAudio  = document.getElementById('kickAudio');
const snareAudio = document.getElementById('snareAudio');
const hihatAudio = document.getElementById('hihatAudio');

// Riferimenti a elementi dell'interfaccia
const drumMachineDiv = document.getElementById('drumMachine');
const tempoSlider    = document.getElementById('tempoSlider');
const tempoValue     = document.getElementById('tempoValue');
const playBtn        = document.getElementById('playBtn');
const stopBtn        = document.getElementById('stopBtn');

// Pulsanti per cambiare il numero di step (16, 32, 64)
const stepsButtons = document.querySelectorAll('.steps-buttons button');

// Parametri Sequencer
let currentSteps = 16;    // numero di step iniziale
let tempo = 120;          // BPM iniziale
let currentStepIndex = 0; // step corrente
let isPlaying = false;
let intervalId = null;

// Manteniamo un riferimento ai checkboxes generati (per sapere quali sono attivi)
let checkboxes = [];

// Costruisce dinamicamente la tabella
function buildTable(numSteps) {
  drumMachineDiv.innerHTML = ''; // svuota
  // Creiamo la tabella
  const table = document.createElement('table');
  
  // Intestazione
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  // Prima cella: "Strumento"
  let th = document.createElement('th');
  th.textContent = 'Strumento';
  headRow.appendChild(th);
  // Creiamo le celle da 1 a numSteps
  for (let i = 0; i < numSteps; i++) {
    let thStep = document.createElement('th');
    thStep.textContent = (i + 1).toString();
    headRow.appendChild(thStep);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  // Corpo tabella
  const tbody = document.createElement('tbody');

  // Array strumenti
  const instruments = ['Kick', 'Snare', 'Hi-Hat'];
  // Associamo ogni string a un 'data-sound' (kick, snare, hihat)
  const dataSoundMap = {
    'Kick': 'kick',
    'Snare': 'snare',
    'Hi-Hat': 'hihat'
  };

  instruments.forEach(instr => {
    let tr = document.createElement('tr');

    // Prima cella: nome strumento
    let tdName = document.createElement('td');
    tdName.textContent = instr;
    tr.appendChild(tdName);

    // Crea i <input type="checkbox"> per i step
    for (let s = 0; s < numSteps; s++) {
      let tdStep = document.createElement('td');
      let input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.sound = dataSoundMap[instr];
      input.dataset.step  = s.toString();
      // Aggiungiamo il checkbox nella cella
      tdStep.appendChild(input);
      tr.appendChild(tdStep);
    }
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  drumMachineDiv.appendChild(table);

  // Aggiorniamo l’array globale di checkboxes
  checkboxes = drumMachineDiv.querySelectorAll('input[type="checkbox"]');
}

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

// Evidenzia step attivo
function highlightStep(stepIndex) {
  // Rimuoviamo la classe .active-step da tutte le celle
  document.querySelectorAll('td').forEach(td => td.classList.remove('active-step'));
  // Aggiungiamo la classe alla colonna corrispondente (stepIndex + 1)
  const rows = drumMachineDiv.querySelectorAll('tbody tr');
  rows.forEach(row => {
    const cells = row.querySelectorAll('td');
    if (cells[stepIndex + 1]) {
      cells[stepIndex + 1].classList.add('active-step');
    }
  });
}

// Schedula lo step
function scheduleStep() {
  highlightStep(currentStepIndex);

  // Per ogni checkbox
  checkboxes.forEach(chk => {
    const step = parseInt(chk.dataset.step);
    const sound = chk.dataset.sound;
    if (step === currentStepIndex && chk.checked) {
      playSample(sound);
    }
  });

  currentStepIndex = (currentStepIndex + 1) % currentSteps;
}

// Calcola la durata di ogni step
function getStepDuration() {
  // Se consideriamo i step come sedicesimi (16th note):
  // durStep = (60 / tempo) / 4
  // con 16 step otteniamo 1 battuta di 4/4, 
  // con 32 step otteniamo 2 battute, ecc.
  // (Puoi variare la logica se preferisci)
  return (60 / tempo) / 4;
}

// Avvia il sequencer
function startSequencer() {
  if (!isPlaying) {
    isPlaying = true;
    currentStepIndex = 0;
    const stepDuration = getStepDuration();
    scheduleStep(); // esegui subito il primo step
    intervalId = setInterval(scheduleStep, stepDuration * 1000);
  }
}

// Ferma il sequencer
function stopSequencer() {
  isPlaying = false;
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  // Rimuoviamo evidenziazione
  document.querySelectorAll('td').forEach(td => td.classList.remove('active-step'));
}

// ------------ EVENTI --------------- //

// Cambiamento slider tempo
tempoSlider.addEventListener('input', () => {
  tempo = parseInt(tempoSlider.value);
  tempoValue.textContent = tempo.toString();
  // Se stiamo suonando, aggiorniamo l’intervallo
  if (isPlaying) {
    stopSequencer();
    startSequencer();
  }
});

// Pulsanti step (16, 32, 64)
stepsButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const newSteps = parseInt(btn.dataset.step);
    currentSteps = newSteps;
    stopSequencer();
    buildTable(currentSteps);
  });
});

// Play
playBtn.addEventListener('click', () => {
  // Alcuni browser richiedono un "gesture" per l'audio
  startSequencer();
});

// Stop
stopBtn.addEventListener('click', () => {
  stopSequencer();
});

// ------------------------- //
// Inizializzazione iniziale //
// ------------------------- //
buildTable(currentSteps); 
tempoValue.textContent = tempo.toString();
tempoSlider.value = tempo;
