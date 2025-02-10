/*************************************************************
 * Campionatron.js - Registrazione manuale in WAV
 * Funziona su PC, iOS, Android, ecc.
 *************************************************************/

// Variabili di stato
let audioContext;
let micStream;
let scriptProcessor;

let isRecording = false;
let recordedSamples = [];  // array di Float32Array
let numSamples = 0;        // contatore dei campioni totali
let sampleRate = 44100;    // sample rate preferito (verrà adattato)

// WAV generato
let recordedWavBlob = null;

// AudioBuffer decodificato dal WAV
let audioBuffer = null;
let source = null;
let isPlaying = false;

// Riferimenti DOM
const startBtn    = document.getElementById('start-recording');
const stopBtn     = document.getElementById('stop-recording');
const playBtn     = document.getElementById('playback');
const stopPlayBtn = document.getElementById('stop-playback');
const downloadBtn = document.getElementById('download');

const timeStretchSlider = document.getElementById('time-stretch');
const delaySlider       = document.getElementById('delay');
const reverbSlider      = document.getElementById('reverb');
const distortionSlider  = document.getElementById('distortion');
const gainSlider        = document.getElementById('gain');
const flangerSlider     = document.getElementById('flanger');
const bitcrusherSlider  = document.getElementById('bitcrusher');

const waveformCanvas = document.getElementById('waveform');
const waveformCtx = waveformCanvas.getContext('2d');

let animationId;
let analyzerNode;

// Effetti
let delayNode, convolverNode, distortionNode, gainNode, flangerDelay, bitcrusherNode;
let flangerOsc, flangerGain;

/*************************************************************
 * EventListeners
 *************************************************************/
startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
playBtn.addEventListener('click', playback);
stopPlayBtn.addEventListener('click', stopPlayback);
downloadBtn.addEventListener('click', downloadWav);

[timeStretchSlider, delaySlider, reverbSlider, distortionSlider, 
 gainSlider, flangerSlider, bitcrusherSlider]
.forEach(s => s.addEventListener('input', updateEffects));


/*************************************************************
 * START Recording: usa getUserMedia + ScriptProcessor
 *************************************************************/
async function startRecording() {
  if (isRecording) return;

  isRecording = true;
  startBtn.disabled = true;
  stopBtn.disabled = false;

  // Disattiva riproduzione / download
  playBtn.disabled = true;
  stopPlayBtn.disabled = true;
  downloadBtn.disabled = true;
  
  // Resetta array e contatori
  recordedSamples = [];
  numSamples = 0;
  recordedWavBlob = null;
  audioBuffer = null;

  // Crea (o riattiva) AudioContext
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  } else {
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
  }

  // Chiedi microfono
  micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

  // Crea un MediaStreamAudioSourceNode
  const micSource = audioContext.createMediaStreamSource(micStream);
  
  // Sample rate effettivo dell'AudioContext
  sampleRate = audioContext.sampleRate;

  // Crea ScriptProcessor per intercettare i campioni
  // (bufferSize di 4096 e 1 canale in/1 out)
  scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

  // On audio process
  scriptProcessor.onaudioprocess = function(e) {
    if (!isRecording) return;
    const input = e.inputBuffer.getChannelData(0);
    // Copia i campioni in un Float32Array dedicato
    recordedSamples.push(new Float32Array(input));
    numSamples += input.length;
  };

  // Collega nodi
  micSource.connect(scriptProcessor);
  scriptProcessor.connect(audioContext.destination); // per “attivare” la callback
}

/*************************************************************
 * STOP Recording
 *************************************************************/
function stopRecording() {
  if (!isRecording) return;
  isRecording = false;

  startBtn.disabled = false;
  stopBtn.disabled = true;

  // Disconnetti la sorgente e lo scriptProcessor
  if (scriptProcessor) {
    scriptProcessor.disconnect();
    scriptProcessor.onaudioprocess = null;
    scriptProcessor = null;
  }
  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
    micStream = null;
  }

  // Crea WAV dai campioni registrati
  recordedWavBlob = encodeWAV(recordedSamples, numSamples, sampleRate);

  // Decodifica WAV in audioBuffer
  const reader = new FileReader();
  reader.onload = async () => {
    const arrayBuff = reader.result;
    try {
      audioBuffer = await audioContext.decodeAudioData(arrayBuff);
      // Disegna waveform statica
      drawWaveform(audioBuffer);
      // Abilita pulsanti
      playBtn.disabled = false;
      stopPlayBtn.disabled = false;
      downloadBtn.disabled = false;
    } catch (err) {
      console.error("Errore decodeAudioData: ", err);
      alert("Errore nella decodifica del WAV registrato");
    }
  };
  reader.readAsArrayBuffer(recordedWavBlob);
}

/*************************************************************
 * PLAYBACK
 *************************************************************/
async function playback() {
  if (!audioBuffer) return;
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  stopPlayback(); // ferma eventuale riproduzione precedente

  source = audioContext.createBufferSource();
  source.buffer = audioBuffer;

  // Time stretch
  source.playbackRate.value = parseFloat(timeStretchSlider.value);

  // Costruisci catena di effetti
  buildEffectsChain(source, audioContext.destination);
  source.connect(audioContext.destination);
  source.start();
  isPlaying = true;
  source.onended = () => {
    isPlaying = false;
  };
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
 * updateEffects: ricostruisce la catena se stiamo già suonando
 *************************************************************/
function updateEffects() {
  if (isPlaying && source) {
    // Cambiare playbackRate on the fly
    source.playbackRate.value = parseFloat(timeStretchSlider.value);
    // Per alcuni effetti (distorsion, bitcrusher, etc.)
    // è più semplice ricostruire l'intero grafo:
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

  // Reverb
  convolverNode = audioContext.createConvolver();
  convolverNode.buffer = generateImpulseResponse(audioContext, 2, 2);
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
  flangerDelay = audioContext.createDelay();
  flangerDelay.delayTime.value = 0.005;
  flangerGain = audioContext.createGain();
  flangerGain.gain.value = parseFloat(flangerSlider.value) * 0.004;

  flangerOsc = audioContext.createOscillator();
  flangerOsc.type = 'sine';
  flangerOsc.frequency.value = 0.25;
  flangerOsc.connect(flangerGain).connect(flangerDelay.delayTime);
  flangerOsc.start();

  // Bitcrusher
  bitcrusherNode = createBitcrusherNode(audioContext, parseInt(bitcrusherSlider.value));

  // Analyser
  analyzerNode = audioContext.createAnalyser();
  analyzerNode.fftSize = 2048;

  // Collegamenti
  inputNode.connect(delayNode);
  delayNode.connect(distortionNode);
  distortionNode.connect(flangerDelay);
  flangerDelay.connect(bitcrusherNode);
  bitcrusherNode.connect(convolverNode);
  convolverNode.connect(reverbGain);
  reverbGain.connect(gainNode);
  gainNode.connect(analyzerNode);
  analyzerNode.connect(outputNode);

  animateWaveform();
}

/*************************************************************
 * animateWaveform: disegna la waveform in "tempo reale"
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

    const sliceWidth = waveformCanvas.width / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = v * (waveformCanvas.height / 2) + (waveformCanvas.height / 2);

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
 * Disegno waveform statica (dopo la registrazione)
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
      const idx = (i * step) + j;
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
 * DOWNLOAD WAV
 *************************************************************/
function downloadWav() {
  if (!recordedWavBlob) return;
  const url = URL.createObjectURL(recordedWavBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'campionatron_recorded.wav';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
}

/*************************************************************
 * encodeWAV: converte array di Float32 in un Blob WAV 16bit mono
 *************************************************************/
function encodeWAV(chunks, totalLength, sRate) {
  // Uniamo i frammenti in un unico Float32Array
  const buffer = new Float32Array(totalLength);
  let offset = 0;
  for (let i = 0; i < chunks.length; i++) {
    buffer.set(chunks[i], offset);
    offset += chunks[i].length;
  }

  // Creiamo un ArrayBuffer per l’header + data PCM
  // 44 byte di header, poi 2 bytes per campione
  const bytesPerSample = 2; // 16 bit
  const blockAlign = 1 * bytesPerSample; // 1 canale * 2 bytes
  const wavBuffer = new ArrayBuffer(44 + totalLength * bytesPerSample);
  const view = new DataView(wavBuffer);

  // helper per scrivere stringhe
  function writeString(v, offset, str) {
    for (let i = 0; i < str.length; i++) {
      v.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // ChunkID "RIFF"
  writeString(view, 0, 'RIFF');
  // ChunkSize = 36 + data
  view.setUint32(4, 36 + totalLength * bytesPerSample, true);
  // Format = "WAVE"
  writeString(view, 8, 'WAVE');
  // Subchunk1ID = "fmt "
  writeString(view, 12, 'fmt ');
  // Subchunk1Size = 16 per PCM
  view.setUint32(16, 16, true);
  // AudioFormat = 1 (PCM)
  view.setUint16(20, 1, true);
  // NumChannels = 1
  view.setUint16(22, 1, true);
  // SampleRate
  view.setUint32(24, sRate, true);
  // ByteRate = SampleRate * NumChannels * bytesPerSample
  view.setUint32(28, sRate * blockAlign, true);
  // BlockAlign = NumChannels * bytesPerSample
  view.setUint16(32, blockAlign, true);
  // BitsPerSample
  view.setUint16(34, 16, true);
  // Subchunk2ID = "data"
  writeString(view, 36, 'data');
  // Subchunk2Size = totalLength * bytesPerSample
  view.setUint32(40, totalLength * bytesPerSample, true);

  // Scriviamo i campioni
  let pos = 44;
  for (let i = 0; i < totalLength; i++) {
    // clamp da -1 a 1
    let sample = Math.max(-1, Math.min(1, buffer[i]));
    // converto a int16
    sample = sample < 0 ? sample * 32768 : sample * 32767;
    view.setInt16(pos, sample, true);
    pos += 2;
  }

  return new Blob([wavBuffer], { type: 'audio/wav' });
}

/*************************************************************
 * GENERAZIONE IMPULSO PER REVERB
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
 * DISTORTION CURVE
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
 * BITCRUSHER
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
        output[i] = output[i - 1] || 0;
      }
    }
  };
  return node;
}
