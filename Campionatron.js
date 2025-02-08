/*************************************************************
 * Campionatron.js - MPC Style
 * -----------------------------------------------------------
 * Funzionalità:
 *  - Registrazione microfono (webm opus)
 *  - Visualizzazione forma d'onda
 *  - Playback con effetti (delay, reverb, distorsione, gain, flanger, bitcrusher)
 *  - Download WAV (usando OfflineAudioContext) se supportato
 *  - Link fallback a file webm originale
 *************************************************************/

// Variabili
let audioContext;
let mediaRecorder;
let recordedChunks = [];
let audioBuffer = null;
let source = null;
let isPlaying = false;

// Effetti
let delayNode, reverbNode, distortionNode, gainNode, flangerDelayNode, bitcrusherNode;
let analyzerNode;
let flangerOscillator, flangerGain;

// Canvas
let waveformCanvas, waveformCtx, animationId;

// Dom
const startBtn    = document.getElementById('start-recording');
const stopBtn     = document.getElementById('stop-recording');
const playBtn     = document.getElementById('playback');
const stopPlaybackBtn = document.getElementById('stop-playback');
const downloadBtn = document.getElementById('download');
const rawDownloadLink = document.getElementById('raw-download');

const timeStretchSlider = document.getElementById('time-stretch');
const delaySlider       = document.getElementById('delay');
const reverbSlider      = document.getElementById('reverb');
const distortionSlider  = document.getElementById('distortion');
const gainSlider        = document.getElementById('gain');
const flangerSlider     = document.getElementById('flanger');
const bitcrusherSlider  = document.getElementById('bitcrusher');

waveformCanvas = document.getElementById('waveform');
waveformCtx = waveformCanvas.getContext('2d');

// Event listeners
startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
playBtn.addEventListener('click', playback);
stopPlaybackBtn.addEventListener('click', stopPlayback);
downloadBtn.addEventListener('click', downloadWav);

// Sliders
[timeStretchSlider, delaySlider, reverbSlider, distortionSlider, gainSlider, flangerSlider, bitcrusherSlider]
.forEach(s => s.addEventListener('input', updateEffects));

/*************************************************************
 * START Recording
 *************************************************************/
async function startRecording() {
  recordedChunks = [];
  audioBuffer = null;

  stopBtn.disabled     = false;
  startBtn.disabled    = true;
  playBtn.disabled     = true;
  stopPlaybackBtn.disabled = true;
  downloadBtn.disabled = true;
  rawDownloadLink.style.display = 'none';

  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Richiesta microfono
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  // Verifica se il browser supporta un determinato mimeType
  let options = { mimeType: 'audio/webm; codecs=opus' };
  if (!MediaRecorder.isTypeSupported(options.mimeType)) {
    // fallback
    options = { mimeType: 'audio/webm' };
  }

  mediaRecorder = new MediaRecorder(stream, options);

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  mediaRecorder.onstop = async () => {
    // Abbiamo finito di registrare
    const blob = new Blob(recordedChunks, { type: options.mimeType });
    
    // Salviamo un link "raw" in webm (fallback se offlineAudioContext non funziona)
    rawDownloadLink.href = URL.createObjectURL(blob);
    rawDownloadLink.style.display = 'inline';

    try {
      // Decodifica con audioContext
      const arrayBuffer = await blob.arrayBuffer();
      audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Disegno della waveform statica
      drawWaveform(audioBuffer);

      // Abilita Playback e Download
      playBtn.disabled = false;
      stopPlaybackBtn.disabled = false;
      downloadBtn.disabled = false;
    } catch (err) {
      console.error("Errore nella decodifica audio (forse Safari non supporta webm):", err);
      alert("Impossibile decodificare l'audio nel tuo browser. Usa Chrome/Firefox o cambia formato.");
    }
  };

  mediaRecorder.start();
}

/*************************************************************
 * STOP Recording
 *************************************************************/
function stopRecording() {
  stopBtn.disabled = true;
  startBtn.disabled = false;
  mediaRecorder.stop();
}

/*************************************************************
 * Riproduzione
 *************************************************************/
async function playback() {
  if (!audioBuffer) return;

  // Alcuni browser richiedono un .resume()
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  stopPlayback(); // Assicuriamoci di fermare eventuale audio in corso

  source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.playbackRate.value = parseFloat(timeStretchSlider.value);

  buildAudioGraph(source, audioContext.destination);

  source.start();
  isPlaying = true;
}

/*************************************************************
 * STOP Playback
 *************************************************************/
function stopPlayback() {
  if (source && isPlaying) {
    source.stop();
    source.disconnect();
    source = null;
    isPlaying = false;
  }
  cancelAnimationFrame(animationId);
}

/*************************************************************
 * Build Audio Graph
 *************************************************************/
function buildAudioGraph(inputNode, outputNode) {
  // Delay
  delayNode = audioContext.createDelay(5.0);
  delayNode.delayTime.value = parseFloat(delaySlider.value);

  // Reverb
  reverbNode = audioContext.createConvolver();
  reverbNode.buffer = generateImpulseResponse(audioContext, 2, 2);
  const reverbGain = audioContext.createGain();
  reverbGain.gain.value = parseFloat(reverbSlider.value);

  // Distorsione
  distortionNode = audioContext.createWaveShaper();
  distortionNode.curve = makeDistortionCurve(parseFloat(distortionSlider.value) * 400);
  distortionNode.oversample = '4x';

  // Gain
  gainNode = audioContext.createGain();
  gainNode.gain.value = parseFloat(gainSlider.value);

  // Flanger
  flangerDelayNode = audioContext.createDelay();
  flangerDelayNode.delayTime.value = 0.005;
  flangerGain = audioContext.createGain();
  flangerGain.gain.value = parseFloat(flangerSlider.value) * 0.004;

  flangerOscillator = audioContext.createOscillator();
  flangerOscillator.type = 'sine';
  flangerOscillator.frequency.value = 0.25;
  flangerOscillator.connect(flangerGain).connect(flangerDelayNode.delayTime);
  flangerOscillator.start();

  // Bitcrusher
  bitcrusherNode = createBitcrusherNode(audioContext, parseInt(bitcrusherSlider.value));

  // Analyser
  analyzerNode = audioContext.createAnalyser();
  analyzerNode.fftSize = 2048;

  // Collegamenti
  inputNode.connect(delayNode);
  delayNode.connect(distortionNode);
  distortionNode.connect(flangerDelayNode);
  flangerDelayNode.connect(bitcrusherNode);
  bitcrusherNode.connect(reverbNode);
  reverbNode.connect(reverbGain);
  reverbGain.connect(gainNode);
  gainNode.connect(analyzerNode);
  analyzerNode.connect(outputNode);

  animateWaveform();
}

/*************************************************************
 * Aggiorna Effetti in tempo reale
 *************************************************************/
function updateEffects() {
  if (!source || !isPlaying) return;

  // playbackRate
  source.playbackRate.value = parseFloat(timeStretchSlider.value);

  // Ricostruisci la catena
  // NB: Alcuni parametri come la distorsione waveShaper
  // richiedono di rifare tutto il waveShaper curve.
  stopPlayback();
  playback(); 
}

/*************************************************************
 * Disegna Waveform Statica
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
 * Animazione Waveform in tempo reale
 *************************************************************/
function animateWaveform() {
  const bufferLength = analyzerNode.fftSize;
  const dataArray = new Uint8Array(bufferLength);

  function draw() {
    animationId = requestAnimationFrame(draw);

    analyzerNode.getByteTimeDomainData(dataArray);

    waveformCtx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
    waveformCtx.fillStyle = '#1b1b1b';
    waveformCtx.fillRect(0, 0, waveformCanvas.width, waveformCanvas.height);

    waveformCtx.lineWidth = 2;
    waveformCtx.strokeStyle = '#00ff00';
    waveformCtx.beginPath();

    let sliceWidth = waveformCanvas.width / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      let v = dataArray[i] / 128.0;
      let y = v * (waveformCanvas.height / 2) + (waveformCanvas.height / 2);

      if (i === 0) {
        waveformCtx.moveTo(x, y);
      } else {
        waveformCtx.lineTo(x, y);
      }
      x += sliceWidth;
    }

    waveformCtx.stroke();
  }
  draw();
}

/*************************************************************
 * Impulso Reverb
 *************************************************************/
function generateImpulseResponse(ctx, duration, decay) {
  const sr = ctx.sampleRate;
  const length = sr * duration;
  const impulse = ctx.createBuffer(2, length, sr);

  for (let ch = 0; ch < 2; ch++) {
    let channelData = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++){
      channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

/*************************************************************
 * Distorsione
 *************************************************************/
function makeDistortionCurve(amount) {
  const n_samples = 256;
  const curve = new Float32Array(n_samples);

  for (let i = 0; i < n_samples; i++) {
    let x = i * 2 / n_samples - 1;
    curve[i] = ((3 + amount) * x * 20 * Math.PI / 180) / 
               (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

/*************************************************************
 * Bitcrusher
 *************************************************************/
function createBitcrusherNode(context, bits) {
  const node = context.createScriptProcessor(4096, 1, 1);
  let phaser = 0;
  let increment = 0.002; // Frequenza di campionamento ridotta

  node.onaudioprocess = (e) => {
    let input = e.inputBuffer.getChannelData(0);
    let output = e.outputBuffer.getChannelData(0);
    let step = Math.pow(0.5, bits);

    for (let i = 0; i < input.length; i++) {
      phaser += increment;
      if (phaser >= 1.0) {
        phaser -= 1.0;
        output[i] = step * Math.floor(input[i] / step + 0.5);
      } else {
        // mantieni il valore precedente
        output[i] = output[i - 1] || 0;
      }
    }
  };
  return node;
}

/*************************************************************
 * Download WAV (OfflineAudioContext)
 *************************************************************/
async function downloadWav() {
  if (!audioBuffer) return;

  // Tenta un rendering offline con gli stessi parametri
  let offlineCtx;
  try {
    offlineCtx = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate
    );
  } catch (err) {
    console.error("OfflineAudioContext non supportato:", err);
    alert("Il tuo browser non supporta OfflineAudioContext, impossibile generare WAV!");
    return;
  }

  const offlineSource = offlineCtx.createBufferSource();
  offlineSource.buffer = audioBuffer;
  
  // Ricrea gli effetti offline
  const offlineDelay = offlineCtx.createDelay(5.0);
  offlineDelay.delayTime.value = parseFloat(delaySlider.value);

  const offlineDistortion = offlineCtx.createWaveShaper();
  offlineDistortion.curve = makeDistortionCurve(parseFloat(distortionSlider.value) * 400);
  offlineDistortion.oversample = '4x';

  const offlineConvolver = offlineCtx.createConvolver();
  offlineConvolver.buffer = generateImpulseResponse(offlineCtx, 2, 2);

  const offlineReverbGain = offlineCtx.createGain();
  offlineReverbGain.gain.value = parseFloat(reverbSlider.value);

  const offlineGain = offlineCtx.createGain();
  offlineGain.gain.value = parseFloat(gainSlider.value);

  const offlineFlangerDelay = offlineCtx.createDelay();
  offlineFlangerDelay.delayTime.value = 0.005;

  const offlineFlangerGain = offlineCtx.createGain();
  offlineFlangerGain.gain.value = parseFloat(flangerSlider.value) * 0.004;

  // Bitcrusher offline
  const offlineBitcrusher = createBitcrusherNode(offlineCtx, parseInt(bitcrusherSlider.value));

  // Flanger LFO in offline non “scorre” come in real-time,
  // per semplicità aggiungiamo un offset fisso
  offlineFlangerDelay.delayTime.value += offlineFlangerGain.gain.value * 0.5;

  // Collegamenti
  offlineSource.connect(offlineDelay);
  offlineDelay.connect(offlineDistortion);
  offlineDistortion.connect(offlineFlangerDelay);
  offlineFlangerDelay.connect(offlineBitcrusher);
  offlineBitcrusher.connect(offlineConvolver);
  offlineConvolver.connect(offlineReverbGain);
  offlineReverbGain.connect(offlineGain);
  offlineGain.connect(offlineCtx.destination);

  offlineSource.playbackRate.value = parseFloat(timeStretchSlider.value);

  offlineSource.start();

  try {
    const renderedBuffer = await offlineCtx.startRendering();
    const wavBlob = bufferToWave(renderedBuffer, renderedBuffer.length);

    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Campionatron_processed.wav';
    document.body.appendChild(a);
    a.style.display = 'none';
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Errore in OfflineAudioContext:", err);
    alert("Offline rendering non riuscito, vedi console.");
  }
}

/*************************************************************
 * Converte AudioBuffer in WAV (Blob)
 *************************************************************/
function bufferToWave(abuffer, len) {
  const numOfChannels = abuffer.numberOfChannels;
  const length = len * numOfChannels * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  const channels = [];
  let pos = 0;
  let offset = 0;

  function writeString(str) {
    for (let i = 0; i < str.length; i++){
      view.setUint8(pos++, str.charCodeAt(i));
    }
  }

  // RIFF chunk
  writeString('RIFF');
  view.setUint32(pos, length - 8, true); pos += 4;
  writeString('WAVE');

  // fmt 
  writeString('fmt ');
  view.setUint32(pos, 16, true); pos += 4; // subchunk1size
  view.setUint16(pos, 1, true); pos += 2;  // PCM
  view.setUint16(pos, numOfChannels, true); pos += 2;
  view.setUint32(pos, abuffer.sampleRate, true); pos += 4;
  view.setUint32(pos, abuffer.sampleRate * numOfChannels * 2, true); pos += 4;
  view.setUint16(pos, numOfChannels * 2, true); pos += 2;
  view.setUint16(pos, 16, true); pos += 2; // bits

  // data
  writeString('data');
  view.setUint32(pos, length - pos - 4, true); pos += 4;

  for(let ch = 0; ch < numOfChannels; ch++){
    channels.push(abuffer.getChannelData(ch));
  }

  while(pos < length) {
    for (let ch = 0; ch < numOfChannels; ch++){
      let sample = channels[ch][offset];
      sample = Math.max(-1, Math.min(1, sample));
      sample = sample < 0 ? sample * 32768 : sample * 32767;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}
