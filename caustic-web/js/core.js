// Caustic Web — core helpers shared by engine, machines, effects and UI.
window.CW = window.CW || {};

(function (CW) {
  'use strict';

  CW.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  CW.lerp = (a, b, t) => a + (b - a) * t;
  CW.noteFreq = (n) => 440 * Math.pow(2, (n - 69) / 12);
  CW.uid = () => Math.random().toString(36).slice(2, 10);
  CW.deepCopy = (o) => JSON.parse(JSON.stringify(o));

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  CW.noteName = (n) => NOTE_NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
  CW.isBlackKey = (n) => [1, 3, 6, 8, 10].includes(((n % 12) + 12) % 12);

  CW.PATTERN_IDS = [];
  for (const b of 'ABCD') for (let i = 1; i <= 16; i++) CW.PATTERN_IDS.push(b + i);

  // ---------- envelopes ----------
  // Schedules attack/decay/sustain from time t. Values are absolute.
  CW.envAttack = (param, t, a, d, s, peak, base) => {
    base = base || 0;
    param.cancelScheduledValues(t);
    param.setValueAtTime(base, t);
    param.linearRampToValueAtTime(peak, t + Math.max(0.001, a));
    param.setTargetAtTime(base + (peak - base) * s, t + Math.max(0.001, a), Math.max(0.001, d) / 4);
  };
  CW.envRelease = (param, t, r, base) => {
    base = base || 0;
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
    else { param.cancelScheduledValues(t); }
    param.setTargetAtTime(base, t, Math.max(0.002, r) / 5);
  };
  // For notes whose duration is already known: attack is clamped to the note length
  // so the release never lands in the middle of a ramp.
  CW.envNote = (param, t, dur, a, d, s, r, peak, base) => {
    base = base || 0;
    const aa = Math.min(Math.max(0.001, a), Math.max(0.001, dur));
    param.cancelScheduledValues(t);
    param.setValueAtTime(base, t);
    param.linearRampToValueAtTime(peak, t + aa);
    if (dur > aa) param.setTargetAtTime(base + (peak - base) * s, t + aa, Math.max(0.001, d) / 4);
    param.setTargetAtTime(base, t + Math.max(dur, aa), Math.max(0.002, r) / 5);
    return t + Math.max(dur, aa) + r + 0.05;
  };

  // ---------- shared buffers per context ----------
  const noiseCache = new WeakMap();
  CW.noiseBuffer = (ctx) => {
    let b = noiseCache.get(ctx);
    if (!b) {
      b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      noiseCache.set(ctx, b);
    }
    return b;
  };
  CW.noiseSource = (ctx, loop) => {
    const s = ctx.createBufferSource();
    s.buffer = CW.noiseBuffer(ctx);
    s.loop = loop !== false;
    s.loopStart = Math.random();
    return s;
  };

  // Pulse wave with a given duty cycle, built as a Fourier series.
  const pulseCache = new WeakMap();
  CW.pulseWave = (ctx, duty) => {
    let m = pulseCache.get(ctx);
    if (!m) { m = {}; pulseCache.set(ctx, m); }
    const key = duty.toFixed(3);
    if (!m[key]) {
      const N = 64, re = new Float32Array(N), im = new Float32Array(N);
      for (let k = 1; k < N; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
      // cosine terms give the pulse; sine form is fine too, phase doesn't matter here
      for (let k = 1; k < N; k++) { re[k] = im[k]; im[k] = 0; }
      m[key] = ctx.createPeriodicWave(re, im);
    }
    return m[key];
  };

  CW.oscType = (ctx, osc, wave) => {
    if (wave === 'pulse25') osc.setPeriodicWave(CW.pulseWave(ctx, 0.25));
    else if (wave === 'pulse12') osc.setPeriodicWave(CW.pulseWave(ctx, 0.125));
    else osc.type = wave;
  };

  // Soft-clip / drive curve
  CW.driveCurve = (amount, kind) => {
    const n = 2048, c = new Float32Array(n);
    const k = amount * 50;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      let y;
      switch (kind) {
        case 'fuzz': y = Math.sign(x) * (1 - Math.exp(-Math.abs(x) * (1 + k))); break;
        case 'fold': y = Math.sin(x * (1 + amount * 6) * Math.PI / 2); break;
        case 'hard': y = CW.clamp(x * (1 + k), -1, 1); break;
        case 'sat': y = Math.tanh(x * (1 + k * 0.4)); break;
        default: y = ((1 + k) * x) / (1 + k * Math.abs(x)); // overdrive
      }
      c[i] = y;
    }
    return c;
  };
  CW.crushCurve = (bits) => {
    const n = 4096, c = new Float32Array(n), steps = Math.pow(2, bits);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.round(x * steps / 2) / (steps / 2);
    }
    return c;
  };

  // Simple synthetic impulse response for reverbs
  CW.makeImpulse = (ctx, seconds, damping, pre) => {
    const sr = ctx.sampleRate, len = Math.max(1, Math.floor(sr * seconds));
    const buf = ctx.createBuffer(2, len, sr);
    const preS = Math.floor((pre || 0) * sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = preS; i < len; i++) {
        const t = (i - preS) / (len - preS);
        const env = Math.pow(1 - t, 2.5) * Math.exp(-t * 3);
        const coef = CW.clamp(damping * (0.3 + t * 0.7), 0, 0.97);
        lp = lp * coef + (Math.random() * 2 - 1) * (1 - coef);
        d[i] = lp * env * (1 + damping);
      }
    }
    return buf;
  };

  // ---------- FFT (radix-2, in place) ----------
  CW.fft = (re, im, inverse) => {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (2 * Math.PI / len) * (inverse ? 1 : -1);
      const wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let j = 0; j < len / 2; j++) {
          const a = i + j, b = a + len / 2;
          const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
          const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
  };

  // ---------- WAV / base64 ----------
  CW.encodeWav = (audioBuffer) => {
    const nCh = audioBuffer.numberOfChannels, sr = audioBuffer.sampleRate, len = audioBuffer.length;
    const buf = new ArrayBuffer(44 + len * nCh * 2), v = new DataView(buf);
    const wstr = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    wstr(0, 'RIFF'); v.setUint32(4, 36 + len * nCh * 2, true); wstr(8, 'WAVE');
    wstr(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nCh, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * nCh * 2, true); v.setUint16(32, nCh * 2, true); v.setUint16(34, 16, true);
    wstr(36, 'data'); v.setUint32(40, len * nCh * 2, true);
    const chans = []; for (let c = 0; c < nCh; c++) chans.push(audioBuffer.getChannelData(c));
    let o = 44;
    for (let i = 0; i < len; i++) for (let c = 0; c < nCh; c++) {
      const s = CW.clamp(chans[c][i], -1, 1);
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
    }
    return new Blob([buf], { type: 'audio/wav' });
  };
  CW.bufToB64 = (ab) => {
    const bytes = new Uint8Array(ab); let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  CW.b64ToBuf = (b64) => {
    const s = atob(b64), bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes.buffer;
  };
  CW.download = (blob, name) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  // Param spec helpers: knob position <-> value
  CW.paramToNorm = (p, v) => {
    if (p.curve === 'log') return Math.log(v / p.min) / Math.log(p.max / p.min);
    return (v - p.min) / (p.max - p.min);
  };
  CW.normToParam = (p, n) => {
    n = CW.clamp(n, 0, 1);
    let v = p.curve === 'log' ? p.min * Math.pow(p.max / p.min, n) : p.min + (p.max - p.min) * n;
    if (p.step) v = Math.round(v / p.step) * p.step;
    return v;
  };
  CW.fmtParam = (p, v) => {
    if (p.type === 'select') { const o = p.options.find((o) => o[0] === v); return o ? o[1] : v; }
    if (p.fmt) return p.fmt(v);
    if (p.unit === 'Hz') return v >= 1000 ? (v / 1000).toFixed(2) + 'k' : Math.round(v) + 'Hz';
    if (p.unit === 's') return v < 1 ? Math.round(v * 1000) + 'ms' : v.toFixed(2) + 's';
    if (p.unit === '%') return Math.round(v * 100) + '%';
    if (p.unit === 'st') return (v > 0 ? '+' : '') + Math.round(v);
    if (p.step && p.step >= 1) return String(Math.round(v));
    return v.toFixed(2);
  };
  CW.defaultsOf = (params) => {
    const o = {};
    for (const p of params) o[p.id] = p.def;
    return o;
  };
})(window.CW);
