/*************************************************************
 * Campionatron.js
 * -----------------------------------------------------------
 * Script per gestire:
 *  - Registrazione microfono
 *  - Visualizzazione forma d'onda
 *  - Effetti audio (delay, reverb, distorsione, gain, flanger, bitcrusher)
 *  - Time stretch (con playbackRate)
 *  - Download in formato WAV
 *************************************************************/

// ======== Variabili globali ========
let audioContext;
let mediaRecorder;
let recordedChunks = [];
let audioBuffer = null;
let source = null;

// Interfaccia degli effetti
let delayNode, reverbNode, distortionNode, gainNode, flangerDelayNode, bitcrusherNode;

// Per il flanger (LFO)
let flangerOscillator;
let flangerGain;

// Per la visualizzazione
let analyzerNode;
let waveformCanvas, waveformCtx, animationId;

// ======== Riferimenti DOM ========
const startBtn    = document.getElementById('start-recording');
const stopBtn     = document.getElementById('stop-recording');
const playBtn     = document.getElementById('playback');
const downloadBtn = document.getElementById('download');

const timeStretchSlider = document.getElementById('time-stretch');
const delaySlider       = document.getElementById('delay');
const reverbSlider      = document.getElementById('reverb');
const distortionSlider  = document.getElementById('distortion');
const gainSlider        = document.getElementById('gain');
const flangerSlider     = document.getElementById('flanger');
const bitcrusherSlider  = document.getElementById('bitcrusher');

// Canvas waveform
waveformCanvas = document.getElementById('waveform');
waveformCtx = waveformCanvas.getContext('2d');

// ======== Event Listeners ========
startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
playBtn.addEventListener('click', playback);
downloadBtn.addEventListener('click', downloadWav);

timeStretchSlider.addEventListener('input', updateEffects);
delaySlider.addEventListener('input', updateEffects);
reverbSlider.addEventListener('input', updateEffects);
distortionSlider.addEventListener('input', updateEffects);
gainSlider.addEventListener('input', updateEffects);
flangerSlider.addEventListener('input', updateEffects);
bitcrusherSlider.addEventListener('input', updateEffects);

/*************************************************************
 * Funzione di inizio registrazione
 *************************************************************/
async function startRecording() {
  // Resetta eventuali dati precedenti
  recordedChunks = [];
  stopBtn.disabled = false;
  startBtn.disabled = true;
  playBtn.disabled = true;
  downloadBtn.disabled = true;

  // Crea o riusa un AudioContext
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  // Richiedi il flusso audio dal microfono
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  
  // Crea MediaRecorder
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = e => {
    if (e.data && e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  mediaRecorder.onstop = async () => {
    // Crea un Blob con i dati audio
    const blob = new Blob(recordedChunks, { type: 'audio/webm' });
    // Decodifica in AudioBuffer per poterlo riprodurre e manipolare
    const arrayBuffer = await blob.arrayBuffer();
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Visualizza waveform registrata (una volta finita la registrazione)
    drawWaveform(audioBuffer);

    // Abilita pulsante di Play
    playBtn.disabled = false;
  };

  // Avvia la registrazione
  mediaRecorder.start();
}

/*************************************************************
 * Funzione di stop registrazione
 *************************************************************/
function stopRecording() {
  stopBtn.disabled = true;
  startBtn.disabled = false;
  mediaRecorder.stop();
}

/*************************************************************
 * Funzione di riproduzione del campione registrato
 *************************************************************/
function playback() {
  if (!audioBuffer) return;

  // Se già in riproduzione, ferma tutto
  if (source) {
    source.stop();
    source.disconnect();
    source = null;
  }

  // Crea un nuovo buffer source
  source = audioContext.createBufferSource();
  source.buffer = audioBuffer;

  // Imposta playbackRate (time stretch)
  source.playbackRate.value = parseFloat(timeStretchSlider.value);

  // Costruisci la catena di effetti
  buildAudioGraph(source, audioContext.destination);

  // Avvia
  source.start();
}

/*************************************************************
 * Costruzione della catena di effetti con parametri aggiornati
 *************************************************************/
function buildAudioGraph(inputNode, outputNode) {
  // 1) Delay
  delayNode = audioContext.createDelay(5.0);
  delayNode.delayTime.value = parseFloat(delaySlider.value);

  // 2) Reverb (Convolver)
  reverbNode = audioContext.createConvolver();
  // Genera un impulso di base per la dimostrazione
  reverbNode.buffer = generateImpulseResponse(audioContext, 2, 2);
  // Reverb "mix" controllato dal reverbSlider
  // -> Per semplicità usiamo un gain sul reverb e un mix se serve
  let reverbGain = audioContext.createGain();
  reverbGain.gain.value = parseFloat(reverbSlider.value);

  // 3) Distorsione (WaveShaper)
  distortionNode = audioContext.createWaveShaper();
  distortionNode.curve = makeDistortionCurve(parseFloat(distortionSlider.value) * 400);
  distortionNode.oversample = '4x';

  // 4) Gain (amplificazione)
  gainNode = audioContext.createGain();
  gainNode.gain.value = parseFloat(gainSlider.value);

  // 5) Flanger
  flangerDelayNode = audioContext.createDelay();
  flangerDelayNode.delayTime.value = 0.005; // ritardo di base
  flangerGain = audioContext.createGain();
  flangerGain.gain.value = parseFloat(flangerSlider.value) * 0.004; // ampiezza modulazione

  flangerOscillator = audioContext.createOscillator();
  flangerOscillator.type = 'sine';
  flangerOscillator.frequency.value = 0.25; // Frequenza LFO
  flangerOscillator.connect(flangerGain).connect(flangerDelayNode.delayTime);
  flangerOscillator.start();

  // 6) Bitcrusher
  bitcrusherNode = createBitcrusherNode(audioContext, parseInt(bitcrusherSlider.value));

  // 7) Analyzer (per disegnare waveform in tempo reale se serve)
  analyzerNode = audioContext.createAnalyser();

  // Collegamenti
  // input -> delay -> distorsione -> flanger -> bitcrusher -> reverb -> gain -> output
  // E per il reverb: di solito si fa un send/return, qui facciamo un collegamento semplice
  
  // Ingresso
  inputNode.connect(delayNode);
  // Delay
  delayNode.connect(distortionNode);
  // Distorsione
  distortionNode.connect(flangerDelayNode);
  // Flanger -> bitcrusher
  flangerDelayNode.connect(bitcrusherNode);
  // Bitcrusher -> reverb
  bitcrusherNode.connect(reverbNode);
  // Reverb -> reverbGain -> Gain
  reverbNode.connect(reverbGain);
  reverbGain.connect(gainNode);
  // Gain -> Analyser -> Uscita
  gainNode.connect(analyzerNode);
  analyzerNode.connect(outputNode);
  
  // Attiva animazione se vuoi waveform in "realtime" (durante playback)
  cancelAnimationFrame(animationId);
  animateWaveform();
}

/*************************************************************
 * Aggiornamento valori degli effetti in tempo reale
 * (non interrompe la riproduzione in corso,
 *  ma per alcuni parametri è necessario ricostruire il grafo).
 *************************************************************/
function updateEffects() {
  if (!source || !audioContext) return;

  // Aggiorna playback rate
  source.playbackRate.value = parseFloat(timeStretchSlider.value);

  // Delay
  if (delayNode) {
    delayNode.delayTime.value = parseFloat(delaySlider.value);
  }

  // Reverb (usiamo reverbGain come "mix")
  // Nel codice di buildAudioGraph c'è un reverbGain. Per semplificare,
  // possiamo ricostruire l'intero grafo (o potremmo mantenere un riferimento a reverbGain).
  // Qui, per semplicità, ricostruiamo la catena.
  buildAudioGraph(source, audioContext.destination);
}

/*************************************************************
 * Funzione per disegnare la waveform del buffer registrato
 * (Static waveform).
 *************************************************************/
function drawWaveform(buffer) {
  const data = buffer.getChannelData(0); // Primo canale
  const width = waveformCanvas.width;
  const height = waveformCanvas.height;
  
  waveformCtx.clearRect(0, 0, width, height);
  waveformCtx.fillStyle = '#fff';
  waveformCtx.fillRect(0, 0, width, height);
  waveformCtx.strokeStyle = '#000';
  waveformCtx.beginPath();

  const step = Math.ceil(data.length / width);
  const amp = height / 2;

  for (let i = 0; i < width; i++) {
    let min = 1.0;
    let max = -1.0;
    for (let j = 0; j < step; j++) {
      const datum = data[(i * step) + j]; 
      if (datum < min) min = datum;
      if (datum > max) max = datum;
    }
    waveformCtx.lineTo(i, (1 + min) * amp);
  }

  waveformCtx.stroke();
}

/*************************************************************
 * Visualizzazione waveform in tempo reale (analyzerNode)
 *************************************************************/
function animateWaveform() {
  const bufferLength = analyzerNode.fftSize;
  let dataArray = new Uint8Array(bufferLength);
  
  function draw() {
    animationId = requestAnimationFrame(draw);
    analyzerNode.getByteTimeDomainData(dataArray);

    waveformCtx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
    waveformCtx.fillStyle = '#fff';
    waveformCtx.fillRect(0, 0, waveformCanvas.width, waveformCanvas.height);
    
    waveformCtx.lineWidth = 2;
    waveformCtx.strokeStyle = '#000';
    waveformCtx.beginPath();

    let sliceWidth = waveformCanvas.width * 1.0 / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      let v = dataArray[i] / 128.0;
      let y = v * waveformCanvas.height / 2;
      
      if (i === 0) {
        waveformCtx.moveTo(x, y);
      } else {
        waveformCtx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    waveformCtx.lineTo(waveformCanvas.width, waveformCanvas.height / 2);
    waveformCtx.stroke();
  }
  draw();
}

/*************************************************************
 * Generazione di un semplice impulso per la Convolver (Reverb)
 *************************************************************/
function generateImpulseResponse(audioCtx, duration, decay) {
  const sampleRate = audioCtx.sampleRate;
  const length = sampleRate * duration;
  const impulse = audioCtx.createBuffer(2, length, sampleRate);
  
  for (let channel = 0; channel < 2; channel++) {
    let channelData = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++){
      channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

/*************************************************************
 * DistortionCurve (semplice)
 *************************************************************/
function makeDistortionCurve(amount) {
  let n_samples = 256,
      curve = new Float32Array(n_samples);
  let x;
  for (let i = 0; i < n_samples; ++i ) {
    x = i * 2 / n_samples - 1;
    curve[i] = ((3 + amount) * x * 20 * Math.PI / 180) /
               (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

/*************************************************************
 * Crea un bitcrusher node
 *************************************************************/
function createBitcrusherNode(context, bits) {
  // bits tra 1 e 16
  const bitcrusher = context.createScriptProcessor(4096, 1, 1);
  let phaser = 0;
  let increment = 0.002;
  
  bitcrusher.onaudioprocess = function(e) {
    let input = e.inputBuffer.getChannelData(0);
    let output = e.outputBuffer.getChannelData(0);
    let step = Math.pow(0.5, bits);
    for (let i = 0; i < input.length; i++){
      phaser += increment;
      if (phaser >= 1.0) {
        phaser -= 1.0;
        // quantizzazione
        output[i] = step * Math.floor(input[i] / step + 0.5);
      } else {
        // mantieni l'ultimo campione
        output[i] = output[i-1] || 0;
      }
    }
  };
  return bitcrusher;
}

/*************************************************************
 * Funzione per scaricare l'audio con gli effetti in formato WAV
 * - Usa OfflineAudioContext per renderizzare gli effetti
 * - Salva il risultato in un blob WAV
 *************************************************************/
async function downloadWav() {
  if (!audioBuffer) return;

  // Creiamo un OfflineAudioContext della stessa configurazione
  const offlineCtx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  );

  // Source offline
  const offlineSource = offlineCtx.createBufferSource();
  offlineSource.buffer = audioBuffer;

  // Ricrea i nodi di effetto offline
  const offlineDelayNode = offlineCtx.createDelay(5.0);
  offlineDelayNode.delayTime.value = parseFloat(delaySlider.value);

  const offlineDistortion = offlineCtx.createWaveShaper();
  offlineDistortion.curve = makeDistortionCurve(parseFloat(distortionSlider.value) * 400);
  offlineDistortion.oversample = '4x';

  const offlineConvolver = offlineCtx.createConvolver();
  offlineConvolver.buffer = generateImpulseResponse(offlineCtx, 2, 2);
  let offlineReverbGain = offlineCtx.createGain();
  offlineReverbGain.gain.value = parseFloat(reverbSlider.value);

  const offlineGainNode = offlineCtx.createGain();
  offlineGainNode.gain.value = parseFloat(gainSlider.value);

  // Flanger offline
  const offlineFlangerDelay = offlineCtx.createDelay();
  offlineFlangerDelay.delayTime.value = 0.005;

  const offlineFlangerGain = offlineCtx.createGain();
  offlineFlangerGain.gain.value = parseFloat(flangerSlider.value) * 0.004;

  // Bitcrusher offline
  const offlineBitcrusher = createBitcrusherNode(offlineCtx, parseInt(bitcrusherSlider.value));

  // LFO flanger offline: lo creiamo ma su OfflineAudioContext non si anima “in tempo reale”.
  // Verrà reso staticamente. Per una soluzione corretta su flanger offline,
  // bisognerebbe simulare il LFO su un buffer. Qui facciamo un set statico per la demo.
  // (In un ambiente offline, l'oscillatore non scorre in "tempo reale" come in diretta.)
  // Per la dimostrazione semplifichiamo.
  offlineFlangerDelay.delayTime.value += offlineFlangerGain.gain.value * 0.5;

  // Collegamenti offline
  offlineSource.connect(offlineDelayNode);
  offlineDelayNode.connect(offlineDistortion);
  offlineDistortion.connect(offlineFlangerDelay);
  offlineFlangerDelay.connect(offlineBitcrusher);
  offlineBitcrusher.connect(offlineConvolver);
  offlineConvolver.connect(offlineReverbGain);
  offlineReverbGain.connect(offlineGainNode);
  offlineGainNode.connect(offlineCtx.destination);

  offlineSource.playbackRate.value = parseFloat(timeStretchSlider.value);

  offlineSource.start();

  // Render
  const renderedBuffer = await offlineCtx.startRendering();

  // Codifica in WAV
  const wavBlob = bufferToWave(renderedBuffer, renderedBuffer.length);

  // Crea un link per il download
  const url = URL.createObjectURL(wavBlob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = 'campionatron_output.wav';
  document.body.appendChild(a);
  a.click();

  // Cleanup
  window.URL.revokeObjectURL(url);
}

/*************************************************************
 * Al termine della registrazione, abilita Download
 *************************************************************/
mediaRecorder && mediaRecorder.addEventListener('stop', () => {
  downloadBtn.disabled = false;
});

/*************************************************************
 * bufferToWave: Converte un AudioBuffer in Blob .wav
 *************************************************************/
function bufferToWave(abuffer, len) {
  let numOfChannels = abuffer.numberOfChannels,
      length = len * numOfChannels * 2 + 44,
      buffer = new ArrayBuffer(length),
      view = new DataView(buffer),
      channels = [],
      i, sample,
      offset = 0,
      pos = 0;

  // helper
  function writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++){
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // RIFF chunk descriptor
  writeString(view, pos, 'RIFF');  pos += 4;
  view.setUint32(pos, length - 8, true); pos += 4;
  writeString(view, pos, 'WAVE'); pos += 4;
  // Fmt subchunk
  writeString(view, pos, 'fmt '); pos += 4;
  view.setUint32(pos, 16, true); pos += 4; // SubChunk1Size
  view.setUint16(pos, 1, true);  pos += 2; // PCM
  view.setUint16(pos, numOfChannels, true); pos += 2;
  view.setUint32(pos, abuffer.sampleRate, true); pos += 4;
  view.setUint32(pos, abuffer.sampleRate * numOfChannels * 2, true); pos += 4;
  view.setUint16(pos, numOfChannels * 2, true); pos += 2;
  view.setUint16(pos, 16, true); pos += 2; // bits per sample
  // data subchunk
  writeString(view, pos, 'data'); pos += 4;
  view.setUint32(pos, length - pos - 4, true); pos += 4;

  // Scrittura dei canali
  for(let ch = 0; ch < numOfChannels; ch++){
    channels.push(abuffer.getChannelData(ch));
  }

  while(pos < length) {
    for (let ch = 0; ch < numOfChannels; ch++){
      sample = channels[ch][offset]; 
      // converte da [-1,1] a 16-bit
      let s = Math.max(-1, Math.min(1, sample));
      s = s < 0 ? s * 32768 : s * 32767; 
      view.setInt16(pos, s, true);
      pos += 2;
    }
    offset++
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

