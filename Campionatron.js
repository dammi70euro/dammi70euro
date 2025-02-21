/*************************************************************
 * Campionatron.js
 * - Registrazione e riproduzione funzionante
 * - Stop ferma anche l'audio in riproduzione
 * - Waveform rimane anche dopo Play
 * - Loop On/Off
 * - Usa ScriptProcessorNode (deprecato) ma funziona
 *************************************************************/

// Stato
let audioContext;
let micStream;
let scriptProcessor;

let isRecording = false;
let recordedSamples = [];
let numSamples = 0;
let sampleRate = 44100;

let recordedWavBlob = null;
let audioBuffer = null;
let source = null;
let isPlaying = false;
let isLooping = false;

// DOM
const startBtn       = document.getElementById('start-recording');
const otherTabBtn    = document.getElementById('start-other-tab-recording');
const stopBtn        = document.getElementById('stop-recording');
const playBtn        = document.getElementById('playback');
const stopPlayBtn    = document.getElementById('stop-playback');
const loopToggleBtn  = document.getElementById('loop-toggle');
const downloadBtn    = document.getElementById('download');

const timeStretchSlider = document.getElementById('time-stretch');
const delaySlider       = document.getElementById('delay');
const reverbSlider      = document.getElementById('reverb');
const distortionSlider  = document.getElementById('distortion');
const gainSlider        = document.getElementById('gain');
const flangerSlider     = document.getElementById('flanger');
const bitcrusherSlider  = document.getElementById('bitcrusher');

const waveformCanvas = document.getElementById('waveform');
const waveformCtx    = waveformCanvas.getContext('2d');

// Effetti
let delayNode, convolverNode, distortionNode, gainNode, flangerDelay, bitcrusherNode;
let flangerOsc, flangerGain;

/*************************************************************
 * Eventi
 *************************************************************/
startBtn.addEventListener('click', startRecording);
otherTabBtn.addEventListener('click', startOtherTabRecording);
stopBtn.addEventListener('click', stopRecording);

playBtn.addEventListener('click', playback);
stopPlayBtn.addEventListener('click', stopPlayback);
loopToggleBtn.addEventListener('click', toggleLoop);

downloadBtn.addEventListener('click', downloadWav);

[
  timeStretchSlider, delaySlider, reverbSlider,
  distortionSlider, gainSlider, flangerSlider, bitcrusherSlider
].forEach(s => s.addEventListener('input', updateEffects));


/*************************************************************
 * Avvio registrazione microfono
 *************************************************************/
async function startRecording() {
  if (isRecording) return;
  isRecording = true;

  startBtn.disabled = true;
  otherTabBtn.disabled = true;
  stopBtn.disabled = false;

  playBtn.disabled = true;
  stopPlayBtn.disabled = true;
  loopToggleBtn.disabled = true;
  downloadBtn.disabled = true;

  initAudioContextForRecording();

  // Chiedi mic
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: false
  });
  recordFromStream(micStream);
}


/*************************************************************
 * Avvio registrazione dall'altra scheda
 *************************************************************/
async function startOtherTabRecording() {
  if (isRecording) return;
  isRecording = true;

  startBtn.disabled = true;
  otherTabBtn.disabled = true;
  stopBtn.disabled = false;

  playBtn.disabled = true;
  stopPlayBtn.disabled = true;
  loopToggleBtn.disabled = true;
  downloadBtn.disabled = true;

  initAudioContextForRecording();

  const systemStream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: true
  });
  recordFromStream(systemStream);
}


/*************************************************************
 * Inizializzazione AudioContext
 *************************************************************/
function initAudioContextForRecording() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  } else {
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
  }
  recordedSamples = [];
  numSamples = 0;
  recordedWavBlob = null;
  audioBuffer = null;
  sampleRate = audioContext.sampleRate;
}


/*************************************************************
 * recordFromStream
 * Configura lo ScriptProcessorNode (deprecato)
 *************************************************************/
function recordFromStream(stream) {
  micStream = stream;
  const sourceNode = audioContext.createMediaStreamSource(micStream);

  // ScriptProcessor
  scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

  scriptProcessor.onaudioprocess = (e) => {
    if (!isRecording) return;
    const inputData = e.inputBuffer.getChannelData(0);
    recordedSamples.push(new Float32Array(inputData));
    numSamples += inputData.length;
  };

  // Per far funzionare lo ScriptProcessor, deve essere connesso a un nodo "attivo"
  // Creiamo un gain a 0, cosi' non sentiamo la diretta
  const zeroGain = audioContext.createGain();
  zeroGain.gain.value = 0;

  // Collegamenti
  sourceNode.connect(scriptProcessor);
  scriptProcessor.connect(zeroGain);
  zeroGain.connect(audioContext.destination);

  console.log("Recording started. SampleRate:", audioContext.sampleRate);
}


/*************************************************************
 * STOP registrazione
 *************************************************************/
function stopRecording() {
  if (!isRecording) return;
  isRecording = false;

  startBtn.disabled = false;
  otherTabBtn.disabled = false;
  stopBtn.disabled = true;

  // Ferma eventuale riproduzione
  stopPlayback();

  if (scriptProcessor) {
    scriptProcessor.disconnect();
    scriptProcessor.onaudioprocess = null;
    scriptProcessor = null;
  }

  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
    micStream = null;
  }

  if (numSamples === 0) {
    console.warn("Nessun campione registrato.");
    return;
  }

  // Encodiamo in WAV
  recordedWavBlob = encodeWAV(recordedSamples, numSamples, sampleRate);

  // Decodifica
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const arrayBuff = reader.result;
      audioBuffer = await audioContext.decodeAudioData(arrayBuff);
      drawWaveform(audioBuffer);

      playBtn.disabled = false;
      stopPlayBtn.disabled = false;
      loopToggleBtn.disabled = false;
      downloadBtn.disabled = false;

      console.log("Registrazione pronta. Durata:", audioBuffer.duration.toFixed(2), "s");
    } catch (err) {
      console.error("Errore decodeAudioData:", err);
      alert("Errore nella decodifica del WAV");
    }
  };
  reader.readAsArrayBuffer(recordedWavBlob);
}


/*************************************************************
 * PLAY
 *************************************************************/



function testTone() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  const osc = audioContext.createOscillator();
  osc.frequency.value = 440; // La4
  const gainTest = audioContext.createGain();
  gainTest.gain.value = 0.1; // un volume moderato

  osc.connect(gainTest).connect(audioContext.destination);
  osc.start();

  setTimeout(() => {
    osc.stop();
    osc.disconnect();
    console.log("Test tone ended");
  }, 2000); // suona 2 secondi
} 

/*************************************************************
 * STOP PLAY
 *************************************************************/
function stopPlayback() {
  if (source && isPlaying) {
    source.stop();
    source.disconnect();
    source = null;
  }
  isPlaying = false;
}


/*************************************************************
 * toggleLoop
 *************************************************************/
function toggleLoop() {
  isLooping = !isLooping;
  console.log('isLooping'+isLooping); 
  loopToggleBtn.textContent = isLooping ? "🔁 Loop On" : "🔁 Loop Off";
  if (source) {
	  console.log('source'+source); 
    source.loop = isLooping;
  }
}


/*************************************************************
 * updateEffects
 *************************************************************/
function updateEffects() {
  if (isPlaying && source) {
    source.playbackRate.value = parseFloat(timeStretchSlider.value);
    stopPlayback();
    playback();
  }
}


/*************************************************************
 * buildEffectsChain
 *************************************************************/
function buildEffectsChain(inputNode, outputNode) {
  // Delay
  delayNode = audioContext.createDelay(5.0);
  delayNode.delayTime.value = parseFloat(delaySlider.value);

  // Connetti solo il delay
  inputNode.connect(delayNode);
  delayNode.connect(outputNode);
}


/*************************************************************
 * Disegna waveform statica
 *************************************************************/
function drawWaveform(buffer) {
  const data = buffer.getChannelData(0);
  const width = waveformCanvas.width;
  const height = waveformCanvas.height;

  waveformCtx.clearRect(0, 0, width, height);
  waveformCtx.fillStyle = '#1b1b1b';
  waveformCtx.fillRect(0, 0, width, height);

  waveformCtx.strokeStyle = '#00ff00';
  waveformCtx.beginPath();

  const step = Math.ceil(data.length / width);
  const amp = height / 2;

  for (let i = 0; i < width; i++) {
    let min = 1.0;
    let max = -1.0;
    for (let j = 0; j < step; j++) {
      const idx = i * step + j;
      if (idx < data.length) {
        const val = data[idx];
        if (val < min) min = val;
        if (val > max) max = val;
      }
    }
    waveformCtx.lineTo(i, (1 + min) * amp);
  }
  waveformCtx.stroke();
}


/*************************************************************
 * downloadWav
 *************************************************************/
function downloadWav() {
  if (!audioBuffer) return;
  
  // Calcola gli indici iniziale e finale in base alla lunghezza totale dei campioni
  const startSample = Math.floor(audioStart * audioBuffer.length);
  const endSample = Math.floor(audioEnd * audioBuffer.length);
  const croppedLength = endSample - startSample;
  
  if (croppedLength <= 0) {
    alert("Selezione non valida: la fine deve essere maggiore dell'inizio.");
    return;
  }
  
  // Estrai i campioni dal canale 0 (mono). Se l'audio è stereo, occorrerebbe estendere l'estrazione ad entrambi i canali.
  const channelData = audioBuffer.getChannelData(0);
  const croppedData = channelData.slice(startSample, endSample);
  
  // Codifica in WAV utilizzando la funzione esistente.
  const wavBlob = encodeWAV([croppedData], croppedData.length, audioBuffer.sampleRate);
  
  // Scarica il file WAV
  const url = URL.createObjectURL(wavBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'campionatron_cropped.wav';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
}


/*************************************************************
 * encodeWAV
 *************************************************************/
function encodeWAV(chunks, totalLength, sRate) {
  const buffer = new Float32Array(totalLength);
  let offset = 0;
  for (let i = 0; i < chunks.length; i++) {
    buffer.set(chunks[i], offset);
    offset += chunks[i].length;
  }

  const bytesPerSample = 2;
  const blockAlign = bytesPerSample; // 1 canale * 2 bytes
  const wavBuffer = new ArrayBuffer(44 + totalLength * bytesPerSample);
  const view = new DataView(wavBuffer);

  function writeString(v, o, str) {
    for (let i = 0; i < str.length; i++) {
      v.setUint8(o + i, str.charCodeAt(i));
    }
  }

  // RIFF
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + totalLength * bytesPerSample, true);
  // WAVE
  writeString(view, 8, 'WAVE');
  // fmt
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sRate, true);
  view.setUint32(28, sRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  // data
  writeString(view, 36, 'data');
  view.setUint32(40, totalLength * bytesPerSample, true);

  // Campioni
  let pos = 44;
  for (let i = 0; i < totalLength; i++) {
    let sample = Math.max(-1, Math.min(1, buffer[i]));
    sample = sample < 0 ? sample * 32768 : sample * 32767;
    view.setInt16(pos, sample, true);
    pos += 2;
  }

  return new Blob([wavBuffer], { type: 'audio/wav' });
}


/*************************************************************
 * generateImpulseResponse
 *************************************************************/
function generateImpulseResponse(ctx, duration, decay) {
  const sr = ctx.sampleRate;
  const length = sr * duration;
  const impulse = ctx.createBuffer(2, length, sr);

  for (let ch = 0; ch < 2; ch++) {
    const channelData = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++){
      channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}


/*************************************************************
 * makeDistortionCurve
 *************************************************************/
function makeDistortionCurve(amount) {
  const n_samples = 256;
  const curve = new Float32Array(n_samples);

  for (let i = 0; i < n_samples; i++) {
    const x = i * 2 / n_samples - 1;
    curve[i] = ((3 + amount) * x * 20 * Math.PI / 180) /
               (Math.PI + amount * Math.abs(x));
  }
  return curve;
}


/*************************************************************
 * createBitcrusherNode
 * (usa ScriptProcessor, produce warning di deprecazione)
 *************************************************************/
function createBitcrusherNode(context, bits) {
  const node = context.createScriptProcessor(4096, 1, 1);
  let phaser = 0;
  let increment = 0.002;

  node.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    const output = e.outputBuffer.getChannelData(0);
    const step = Math.pow(0.5, bits);

    for (let i = 0; i < input.length; i++) {
      phaser += increment;
      if (phaser >= 1.0) {
        phaser -= 1.0;
        output[i] = step * Math.floor(input[i] / step + 0.5);
      } else {
        output[i] = (i > 0) ? output[i - 1] : 0;
      }
    }
  };
  return node;
}

let audioStart = 0;
let audioEnd = 0;

// Configura lo slider con due maniglie (start e end)
const slider = document.getElementById('audio-range');
const startTimeLabel = document.getElementById('start-time');
const endTimeLabel = document.getElementById('end-time');

noUiSlider.create(slider, {
  start: [0, 0], // Inizia con entrambi i puntatori a 0
  range: {
    'min': 0,
    'max': 1
  },
  connect: true, // Mostra la parte selezionata
  step: 0.01,
  tooltips: true, // Mostra il tooltip al passaggio del mouse
  format: {
    to: value => value.toFixed(2),
    from: value => parseFloat(value)
  }
});

// Aggiorna start e end al cambiare dello slider
slider.noUiSlider.on('update', function(values) {
  audioStart = parseFloat(values[0]);
  audioEnd = parseFloat(values[1]);
  console.log(audioStart)
  console.log(audioEnd)
  
  // Aggiorna il testo dei valori
  startTimeLabel.textContent = `Start: ${audioStart.toFixed(2)}s`;
  endTimeLabel.textContent = `End: ${audioEnd.toFixed(2)}s`;
});





async function playback() {
  if (!audioBuffer) {
    console.warn("No audioBuffer available, cannot play.");
    return;
  }

  if (audioContext.state === 'suspended') {
    console.log("AudioContext is suspended, calling resume()...");
    await audioContext.resume();
    console.log("AudioContext state after resume:", audioContext.state);
  }

  stopPlayback();

  // Crea la sorgente audio
  source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.playbackRate.value = parseFloat(timeStretchSlider.value);
  console.log("playlooping:" + isLooping);

  // Imposta la catena degli effetti
  buildEffectsChain(source, audioContext.destination);

  // Calcola i secondi di inizio e fine in base alla lunghezza totale
  const startTime = audioStart * audioBuffer.duration;  // Inizio in secondi
  const endTime = audioEnd * audioBuffer.duration;      // Fine in secondi
  const duration = endTime - startTime;                 // Durata in secondi

  console.log('Start time (in sec):', startTime);
  console.log('End time (in sec):', endTime);
  console.log('Duration:', duration);

  // Avvia la riproduzione dalla posizione specificata con la durata
  source.start(0, startTime, duration);

  // Gestione del loop manuale
  if (isLooping) {
    source.onended = () => {
      console.log("Looping...");
      playback();  // Rilancia la funzione playback per far partire di nuovo il loop
    };
  } else {
    source.onended = () => {
      isPlaying = false;
      console.log("Playback ended.");
    };
  }

  isPlaying = true;
  
  console.log("Playback started successfully.");
}










// STOP playback
function stopPlayback() {
  if (source && isPlaying) {
    source.stop();
    source.disconnect();
    source = null;
  }
  isPlaying = false;
}

