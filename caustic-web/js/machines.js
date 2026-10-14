// Caustic Web — instrument machines.
// Each machine type: { name, short, color, kind: 'poly'|'mono'|'drum', params, create(rt) }
// create(rt) receives { ctx, out, params } and returns { noteOn(t, note, vel, dur, flags) -> {release(t)} }.
(function (CW) {
  'use strict';

  const knob = (id, label, min, max, def, extra) => Object.assign({ id, label, min, max, def, type: 'knob' }, extra || {});
  const sel = (id, label, options, def, extra) => Object.assign({ id, label, options, def, type: 'select' }, extra || {});
  const WAVES = [['sawtooth', 'SAW'], ['square', 'SQR'], ['triangle', 'TRI'], ['sine', 'SIN'], ['pulse25', 'PLS'], ['noise', 'NOI']];
  const ADSR = (prefix, group, a, d, s, r) => [
    knob(prefix + 'A', 'Attack', 0.001, 4, a, { curve: 'log', unit: 's', group }),
    knob(prefix + 'D', 'Decay', 0.005, 4, d, { curve: 'log', unit: 's', group }),
    knob(prefix + 'S', 'Sustain', 0, 1, s, { unit: '%', group }),
    knob(prefix + 'R', 'Release', 0.005, 6, r, { curve: 'log', unit: 's', group }),
  ];

  // Keeps polyphony in check: steals the oldest voice when the limit is hit.
  class VoicePool {
    constructor(ctx) { this.ctx = ctx; this.voices = []; }
    add(v, limit, t) {
      const now = this.ctx.currentTime;
      this.voices = this.voices.filter((x) => x.end > now);
      while (this.voices.length >= limit) {
        const old = this.voices.shift();
        old.kill(t);
      }
      this.voices.push(v);
    }
  }

  // A standard subtractive voice used by Sub/Saw/Pad-like machines.
  function makeOsc(ctx, wave, freq, t) {
    if (wave === 'noise') {
      const s = CW.noiseSource(ctx);
      s.start(t);
      return { node: s, detune: null, freq: null, stop: (tt) => s.stop(tt) };
    }
    const o = ctx.createOscillator();
    CW.oscType(ctx, o, wave);
    o.frequency.value = freq;
    o.start(t);
    return { node: o, detune: o.detune, freq: o.frequency, stop: (tt) => o.stop(tt) };
  }

  const M = {};

  // ===================================================================== SubSynth
  M.subsynth = {
    name: 'SubSynth', short: 'SUB', color: '#9aa7e6', kind: 'poly',
    params: [
      sel('o1Wave', 'Wave', WAVES, 'sawtooth', { group: 'Oscillator 1' }),
      knob('mix', 'Mix', 0, 1, 0.5, { unit: '%', group: 'Oscillator 1' }),
      sel('o2Wave', 'Wave', WAVES, 'square', { group: 'Oscillator 2' }),
      knob('o2Oct', 'Octave', -2, 2, 0, { step: 1, group: 'Oscillator 2' }),
      knob('o2Semi', 'Semis', -12, 12, 0, { step: 1, unit: 'st', group: 'Oscillator 2' }),
      knob('o2Det', 'Detune', -50, 50, 7, { step: 1, fmt: (v) => Math.round(v) + 'c', group: 'Oscillator 2' }),
      sel('fType', 'Type', [['lowpass', 'LP'], ['highpass', 'HP'], ['bandpass', 'BP']], 'lowpass', { group: 'Filter' }),
      knob('cutoff', 'Cutoff', 40, 18000, 1800, { curve: 'log', unit: 'Hz', group: 'Filter' }),
      knob('res', 'Res', 0.1, 25, 4, { curve: 'log', group: 'Filter' }),
      knob('fEnv', 'Env Amt', 0, 1, 0.4, { unit: '%', group: 'Filter' }),
      knob('track', 'Track', 0, 1, 0.3, { unit: '%', group: 'Filter' }),
      ...ADSR('f', 'Filter Envelope', 0.005, 0.3, 0.3, 0.3),
      ...ADSR('a', 'Volume Envelope', 0.005, 0.4, 0.7, 0.3),
      sel('lfoT', 'Target', [['off', 'OFF'], ['cutoff', 'VCF'], ['pitch', 'PIT'], ['amp', 'VCA']], 'off', { group: 'LFO' }),
      knob('lfoRate', 'Rate', 0.05, 20, 4, { curve: 'log', unit: 'Hz', fmt: (v) => v.toFixed(2) + 'Hz', group: 'LFO' }),
      knob('lfoDepth', 'Depth', 0, 1, 0.3, { unit: '%', group: 'LFO' }),
      knob('glide', 'Glide', 0, 0.5, 0, { unit: 's', group: 'Out' }),
      knob('poly', 'Polyphony', 1, 16, 8, { step: 1, group: 'Out' }),
      knob('vol', 'Volume', 0, 1, 0.6, { unit: '%', group: 'Out' }),
    ],
    create(rt) {
      const { ctx, out } = rt;
      const pool = new VoicePool(ctx);
      let lastFreq = null;
      return {
        noteOn(t, note, vel, dur, flags) {
          const p = rt.params;
          const f = CW.noteFreq(note);
          const g = ctx.createGain(); g.gain.value = 0;
          const filt = ctx.createBiquadFilter();
          filt.type = p.fType; filt.Q.value = p.res;
          const o1 = makeOsc(ctx, p.o1Wave, f, t);
          const o2 = makeOsc(ctx, p.o2Wave, f * Math.pow(2, p.o2Oct + p.o2Semi / 12), t);
          if (o2.detune) o2.detune.value = p.o2Det;
          if (p.glide > 0 && lastFreq) {
            for (const [o, mul] of [[o1, 1], [o2, Math.pow(2, p.o2Oct + p.o2Semi / 12)]]) if (o.freq) {
              o.freq.setValueAtTime(lastFreq * mul, t);
              o.freq.exponentialRampToValueAtTime(f * mul, t + p.glide);
            }
          }
          lastFreq = f;
          const g1 = ctx.createGain(); g1.gain.value = (1 - p.mix) * 0.5;
          const g2 = ctx.createGain(); g2.gain.value = p.mix * 0.5;
          o1.node.connect(g1).connect(filt); o2.node.connect(g2).connect(filt);
          filt.connect(g).connect(out);
          const base = CW.clamp(p.cutoff * Math.pow(f / 261.6, p.track), 20, 20000);
          const peak = CW.clamp(base + p.fEnv * 12000 * vel, 20, 20000);
          const peakAmp = vel * p.vol;
          const stopVoice = (tEnd) => { o1.stop(tEnd); o2.stop(tEnd); };
          let lfo = null;
          if (p.lfoT !== 'off') {
            lfo = ctx.createOscillator(); lfo.frequency.value = p.lfoRate;
            const lg = ctx.createGain();
            if (p.lfoT === 'cutoff') { lg.gain.value = p.lfoDepth * base; lfo.connect(lg).connect(filt.frequency); }
            if (p.lfoT === 'pitch') { lg.gain.value = p.lfoDepth * 200; lfo.connect(lg); if (o1.detune) lg.connect(o1.detune); if (o2.detune) lg.connect(o2.detune); }
            if (p.lfoT === 'amp') { const ag = ctx.createGain(); g.disconnect(); g.connect(ag).connect(out); lg.gain.value = p.lfoDepth * 0.5; ag.gain.value = 1 - p.lfoDepth * 0.5; lfo.connect(lg).connect(ag.gain); }
            lfo.start(t);
          }
          const voice = {
            end: Infinity,
            kill(tt) { g.gain.cancelScheduledValues(tt); g.gain.setTargetAtTime(0, tt, 0.005); stopVoice(tt + 0.05); if (lfo) lfo.stop(tt + 0.05); voice.end = tt; },
            release(tt) {
              CW.envRelease(g.gain, tt, p.aR); CW.envRelease(filt.frequency, tt, p.fR, base);
              const e = tt + p.aR + 0.05; stopVoice(e); if (lfo) lfo.stop(e); voice.end = e;
            },
          };
          if (dur != null) {
            const e = Math.max(CW.envNote(g.gain, t, dur, p.aA, p.aD, p.aS, p.aR, peakAmp),
              CW.envNote(filt.frequency, t, dur, p.fA, p.fD, p.fS, p.fR, peak, base));
            stopVoice(e); if (lfo) lfo.stop(e); voice.end = e;
          } else {
            CW.envAttack(g.gain, t, p.aA, p.aD, p.aS, peakAmp);
            CW.envAttack(filt.frequency, t, p.fA, p.fD, p.fS, peak, base);
          }
          pool.add(voice, p.poly, t);
          return voice;
        },
      };
    },
  };

  // ===================================================================== BassLine (303)
  M.bassline = {
    name: 'BassLine', short: 'BAS', color: '#d6d6d2', kind: 'mono',
    params: [
      sel('wave', 'Waveform', [['sawtooth', 'SAW'], ['square', 'SQR']], 'sawtooth', { group: 'Voice' }),
      knob('tune', 'Tune', -12, 12, 0, { step: 1, unit: 'st', group: 'Voice' }),
      knob('cutoff', 'Cutoff', 60, 6000, 500, { curve: 'log', unit: 'Hz', group: 'Voice' }),
      knob('res', 'Reso', 0.5, 28, 12, { curve: 'log', group: 'Voice' }),
      knob('envMod', 'Env.Mod', 0, 1, 0.55, { unit: '%', group: 'Voice' }),
      knob('decay', 'Decay', 0.05, 2, 0.35, { curve: 'log', unit: 's', group: 'Voice' }),
      knob('accent', 'Accent', 0, 1, 0.6, { unit: '%', group: 'Voice' }),
      knob('slideT', 'Slide', 0.01, 0.3, 0.06, { curve: 'log', unit: 's', group: 'Voice' }),
      sel('dist', 'Program', [['off', 'OFF'], ['od', 'OD'], ['sat', 'SAT'], ['fold', 'FB'], ['fuzz', 'FUZ']], 'off', { group: 'Distortion' }),
      knob('distAmt', 'Amount', 0, 1, 0.4, { unit: '%', group: 'Distortion' }),
      knob('distPost', 'Post', 0, 1, 0.5, { unit: '%', group: 'Distortion' }),
      sel('lfoT', 'Target', [['off', 'OFF'], ['vcf', 'VCF'], ['vca', 'VCA'], ['pitch', 'PIT']], 'off', { group: 'LFO' }),
      knob('lfoRate', 'Rate', 0.05, 16, 2, { curve: 'log', fmt: (v) => v.toFixed(2) + 'Hz', group: 'LFO' }),
      knob('lfoDepth', 'Depth', 0, 1, 0.3, { unit: '%', group: 'LFO' }),
      knob('vol', 'Volume', 0, 1, 0.7, { unit: '%', group: 'Out' }),
    ],
    create(rt) {
      const { ctx, out } = rt;
      // Persistent monophonic voice so slides can glide between notes.
      const osc = ctx.createOscillator();
      const filt = ctx.createBiquadFilter(); filt.type = 'lowpass';
      const filt2 = ctx.createBiquadFilter(); filt2.type = 'lowpass';
      const vca = ctx.createGain(); vca.gain.value = 0;
      const shaper = ctx.createWaveShaper(); shaper.oversample = '2x';
      const post = ctx.createGain();
      const lfo = ctx.createOscillator(); const lfoG = ctx.createGain(); lfoG.gain.value = 0;
      lfo.connect(lfoG); lfo.start();
      osc.connect(filt).connect(filt2).connect(vca).connect(shaper).connect(post).connect(out);
      osc.start();
      let lastDist = null, lastLfo = null;
      const refresh = () => {
        const p = rt.params;
        osc.type = p.wave;
        if (p.dist + p.distAmt !== lastDist) {
          lastDist = p.dist + p.distAmt;
          shaper.curve = p.dist === 'off' ? null : CW.driveCurve(p.distAmt, p.dist);
        }
        post.gain.value = p.dist === 'off' ? 1 : 0.4 + p.distPost;
        lfo.frequency.value = p.lfoRate;
        if (p.lfoT !== lastLfo) {
          try { lfoG.disconnect(); } catch (e) { /* not connected */ }
          if (p.lfoT === 'vcf') lfoG.connect(filt.detune);
          if (p.lfoT === 'pitch') lfoG.connect(osc.detune);
          if (p.lfoT === 'vca') lfoG.connect(vca.gain);
          lastLfo = p.lfoT;
        }
        lfoG.gain.value = p.lfoT === 'vcf' ? p.lfoDepth * 2400 : p.lfoT === 'pitch' ? p.lfoDepth * 100 : p.lfoT === 'vca' ? p.lfoDepth * 0.3 : 0;
      };
      return {
        refresh,
        noteOn(t, note, vel, dur, flags) {
          refresh();
          const p = rt.params;
          flags = flags || {};
          const f = CW.noteFreq(note + p.tune);
          const acc = flags.accent ? p.accent : 0;
          const q = p.res * (1 + acc * 0.3);
          filt.Q.setValueAtTime(q * 0.5, t); filt2.Q.setValueAtTime(Math.min(q, 12) * 0.25, t);
          const base = p.cutoff;
          const peak = CW.clamp(base * (1 + (p.envMod + acc) * 8), 30, 18000);
          const decay = p.decay * (flags.accent ? 0.5 : 1);
          const amp = p.vol * (0.55 + acc * 0.45) * vel;
          if (flags.slide) {
            osc.frequency.cancelScheduledValues(t);
            osc.frequency.setTargetAtTime(f, t, p.slideT / 3);
            vca.gain.cancelScheduledValues(t);
            vca.gain.setTargetAtTime(amp, t, 0.01);
          } else {
            osc.frequency.cancelScheduledValues(t);
            osc.frequency.setValueAtTime(f, t);
            vca.gain.cancelScheduledValues(t);
            vca.gain.setTargetAtTime(amp, t, 0.002);
            for (const fl of [filt, filt2]) {
              fl.frequency.cancelScheduledValues(t);
              fl.frequency.setValueAtTime(peak, t);
              fl.frequency.setTargetAtTime(base, t + 0.003, decay / 3);
            }
          }
          const voice = {
            release(tt) { vca.gain.cancelScheduledValues(tt); vca.gain.setTargetAtTime(0, tt, 0.008); },
          };
          if (dur != null) {
            // keep the gate open into a sliding next note
            voice.release(t + (flags.legatoNext ? dur : dur * 0.85));
          }
          return voice;
        },
      };
    },
  };

  // ===================================================================== BeatBox (synth drums)
  const DRUMS = [
    ['kick', 'KICK'], ['snare', 'SNARE'], ['chat', 'CL HAT'], ['ohat', 'OP HAT'],
    ['clap', 'CLAP'], ['tomlo', 'TOM LO'], ['tomhi', 'TOM HI'], ['cow', 'COWBELL'],
  ];
  const drumParams = [];
  DRUMS.forEach(([id, label], i) => {
    const g = (i + 1) + ' ' + label;
    drumParams.push(knob(id + 'Tune', 'Tune', -12, 12, 0, { step: 1, unit: 'st', group: g }));
    drumParams.push(knob(id + 'Dec', 'Decay', 0.2, 3, 1, { curve: 'log', fmt: (v) => v.toFixed(2) + 'x', group: g }));
    drumParams.push(knob(id + 'Pan', 'Pan', -1, 1, 0, { fmt: (v) => (v === 0 ? 'C' : v < 0 ? 'L' + Math.round(-v * 100) : 'R' + Math.round(v * 100)), group: g }));
    drumParams.push(knob(id + 'Vol', 'Level', 0, 1, 0.8, { unit: '%', group: g }));
  });
  M.beatbox = {
    name: 'BeatBox', short: 'BBX', color: '#f0a040', kind: 'drum',
    drums: DRUMS,
    params: [...drumParams, knob('vol', 'Volume', 0, 1, 0.8, { unit: '%', group: 'Out' })],
    create(rt) {
      const { ctx, out } = rt;
      let openHat = null;
      const hit = (t, idx, vel) => {
        const p = rt.params;
        const id = DRUMS[idx][0];
        const tune = Math.pow(2, p[id + 'Tune'] / 12), dec = p[id + 'Dec'];
        const lvl = p[id + 'Vol'] * p.vol * vel;
        const pan = ctx.createStereoPanner(); pan.pan.value = p[id + 'Pan']; pan.connect(out);
        const end = (nodes, tEnd) => nodes.forEach((n) => n.stop(tEnd));
        const env = (g, peak, d) => { g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); };
        const metal = (baseF) => {
          const mix = ctx.createGain(); mix.gain.value = 0.18;
          const oscs = [2, 3, 4.16, 5.43, 6.79, 8.21].map((r) => { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = baseF * r * tune; o.connect(mix); o.start(t); return o; });
          return { mix, oscs };
        };
        switch (id) {
          case 'kick': {
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.frequency.setValueAtTime(160 * tune, t);
            o.frequency.exponentialRampToValueAtTime(48 * tune, t + 0.08 * dec);
            env(g, lvl * 1.1, 0.45 * dec);
            const click = ctx.createOscillator(), cg = ctx.createGain(); click.frequency.value = 1200 * tune;
            env(cg, lvl * 0.25, 0.012);
            o.connect(g).connect(pan); click.connect(cg).connect(pan);
            o.start(t); click.start(t); end([o, click], t + 0.5 * dec + 0.05);
            break;
          }
          case 'snare': {
            const n = CW.noiseSource(ctx), hp = ctx.createBiquadFilter(), g = ctx.createGain();
            hp.type = 'highpass'; hp.frequency.value = 1800 * tune;
            env(g, lvl * 0.7, 0.22 * dec);
            const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'triangle';
            o.frequency.setValueAtTime(240 * tune, t); o.frequency.exponentialRampToValueAtTime(170 * tune, t + 0.05);
            env(og, lvl * 0.6, 0.1 * dec);
            n.connect(hp).connect(g).connect(pan); o.connect(og).connect(pan);
            n.start(t); o.start(t); end([n, o], t + 0.3 * dec + 0.05);
            break;
          }
          case 'chat': case 'ohat': {
            const m = metal(40);
            const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 10000; bp.Q.value = 1;
            const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
            const g = ctx.createGain();
            const d = (id === 'chat' ? 0.05 : 0.4) * dec;
            env(g, lvl * 0.9, d);
            m.mix.connect(bp).connect(hp).connect(g).connect(pan);
            end(m.oscs, t + d + 0.05);
            if (id === 'chat' && openHat) { openHat.gain.cancelScheduledValues(t); openHat.gain.setTargetAtTime(0, t, 0.01); }
            if (id === 'ohat') openHat = g;
            break;
          }
          case 'clap': {
            const n = CW.noiseSource(ctx), bp = ctx.createBiquadFilter(), g = ctx.createGain();
            bp.type = 'bandpass'; bp.frequency.value = 1100 * tune; bp.Q.value = 1.2;
            g.gain.setValueAtTime(0, t);
            [0, 0.011, 0.022].forEach((o) => { g.gain.setValueAtTime(lvl, t + o); g.gain.exponentialRampToValueAtTime(lvl * 0.1, t + o + 0.009); });
            g.gain.setValueAtTime(lvl * 0.8, t + 0.033);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.033 + 0.2 * dec);
            n.connect(bp).connect(g).connect(pan); n.start(t); end([n], t + 0.3 * dec + 0.1);
            break;
          }
          case 'tomlo': case 'tomhi': {
            const f0 = (id === 'tomlo' ? 110 : 190) * tune;
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.frequency.setValueAtTime(f0 * 1.6, t); o.frequency.exponentialRampToValueAtTime(f0, t + 0.06);
            env(g, lvl * 0.9, 0.35 * dec);
            o.connect(g).connect(pan); o.start(t); end([o], t + 0.4 * dec + 0.05);
            break;
          }
          case 'cow': {
            const g = ctx.createGain(), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600 * tune; bp.Q.value = 0.8;
            const os = [540, 800].map((f) => { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f * tune; o.connect(bp); o.start(t); return o; });
            g.gain.setValueAtTime(lvl * 0.5, t); g.gain.exponentialRampToValueAtTime(lvl * 0.15, t + 0.03);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3 * dec);
            bp.connect(g).connect(pan); end(os, t + 0.35 * dec + 0.05);
            break;
          }
        }
      };
      return {
        noteOn(t, note, vel) { hit(t, CW.clamp(note, 0, 7), vel); return { release() {} }; },
      };
    },
  };

  // ===================================================================== PadSynth (PADsynth algorithm)
  M.padsynth = {
    name: 'PadSynth', short: 'PAD', color: '#e79ac4', kind: 'poly',
    params: [
      knob('harm', 'Harmonics', 2, 64, 24, { step: 1, group: 'Harmonics' }),
      knob('bright', 'Brightness', 0, 1, 0.5, { unit: '%', group: 'Harmonics' }),
      knob('odd', 'Odd/Even', 0, 1, 0.5, { unit: '%', group: 'Harmonics' }),
      knob('bw', 'Bandwidth', 1, 120, 40, { curve: 'log', fmt: (v) => Math.round(v) + 'c', group: 'Harmonics' }),
      knob('bwScale', 'BW Scale', 0, 2, 1, { group: 'Harmonics' }),
      knob('oct', 'Octave', -2, 2, 0, { step: 1, group: 'Voice' }),
      knob('cutoff', 'Cutoff', 100, 18000, 6000, { curve: 'log', unit: 'Hz', group: 'Voice' }),
      knob('res', 'Res', 0.1, 10, 0.7, { curve: 'log', group: 'Voice' }),
      ...ADSR('a', 'Volume Envelope', 0.4, 1, 0.8, 1.5),
      knob('poly', 'Polyphony', 1, 16, 8, { step: 1, group: 'Out' }),
      knob('vol', 'Volume', 0, 1, 0.6, { unit: '%', group: 'Out' }),
    ],
    create(rt) {
      const { ctx, out } = rt;
      const pool = new VoicePool(ctx);
      const BASE = 261.6256; // table is generated at middle C
      let table = null, tableKey = '';
      const buildTable = () => {
        const p = rt.params;
        const key = [p.harm, p.bright, p.odd, p.bw, p.bwScale].join('|');
        if (key === tableKey && table) return table;
        const N = 1 << 17, sr = ctx.sampleRate;
        const amp = new Float32Array(N / 2);
        for (let h = 1; h <= p.harm; h++) {
          let a = Math.pow(h, -(2.2 - p.bright * 2));
          if (h > 1) a *= h % 2 ? (p.odd * 2) : ((1 - p.odd) * 2);
          const bwHz = (Math.pow(2, p.bw / 1200) - 1) * BASE * Math.pow(h, p.bwScale);
          const fc = BASE * h;
          const bwi = bwHz / (2 * sr), fi = fc / sr;
          for (let i = 0; i < N / 2; i++) {
            const x = (i / N - fi) / bwi;
            if (Math.abs(x) < 4) amp[i] += a * Math.exp(-x * x) / bwi;
          }
        }
        const re = new Float32Array(N), im = new Float32Array(N);
        for (let i = 1; i < N / 2; i++) {
          const ph = Math.random() * Math.PI * 2;
          re[i] = amp[i] * Math.cos(ph); im[i] = amp[i] * Math.sin(ph);
        }
        CW.fft(re, im, true);
        let mx = 0; for (let i = 0; i < N; i++) mx = Math.max(mx, Math.abs(re[i]));
        const buf = ctx.createBuffer(2, N, sr);
        const L = buf.getChannelData(0), R = buf.getChannelData(1);
        const off = N >> 2;
        for (let i = 0; i < N; i++) { L[i] = re[i] / mx * 0.7; R[i] = re[(i + off) % N] / mx * 0.7; }
        table = buf; tableKey = key;
        return table;
      };
      return {
        prepare: buildTable,
        noteOn(t, note, vel, dur) {
          const p = rt.params;
          const src = ctx.createBufferSource();
          src.buffer = buildTable(); src.loop = true;
          src.playbackRate.value = CW.noteFreq(note + p.oct * 12) / BASE;
          const filt = ctx.createBiquadFilter(); filt.frequency.value = p.cutoff; filt.Q.value = p.res;
          const g = ctx.createGain(); g.gain.value = 0;
          src.connect(filt).connect(g).connect(out);
          src.start(t, Math.random() * src.buffer.duration);
          const voice = {
            end: Infinity,
            kill(tt) { g.gain.cancelScheduledValues(tt); g.gain.setTargetAtTime(0, tt, 0.01); src.stop(tt + 0.08); voice.end = tt; },
            release(tt) { CW.envRelease(g.gain, tt, p.aR); src.stop(tt + p.aR + 0.05); voice.end = tt + p.aR; },
          };
          if (dur != null) { const e = CW.envNote(g.gain, t, dur, p.aA, p.aD, p.aS, p.aR, vel * p.vol); src.stop(e); voice.end = e; }
          else CW.envAttack(g.gain, t, p.aA, p.aD, p.aS, vel * p.vol);
          pool.add(voice, p.poly, t);
          return voice;
        },
      };
    },
  };

  // ===================================================================== 8BitSynth
  M.eightbit = {
    name: '8BitSynth', short: '8BT', color: '#c7d65a', kind: 'poly',
    params: [
      sel('wave', 'Wave', [['pulse12', '12%'], ['pulse25', '25%'], ['square', '50%'], ['nestri', 'TRI'], ['noise', 'NOI']], 'pulse25', { group: 'Oscillator' }),
      knob('bits', 'Bits', 2, 16, 6, { step: 1, group: 'Oscillator' }),
      knob('sweep', 'Sweep', -24, 24, 0, { step: 1, unit: 'st', group: 'Pitch' }),
      knob('sweepT', 'Sweep T', 0.01, 1, 0.1, { curve: 'log', unit: 's', group: 'Pitch' }),
      knob('vib', 'Vibrato', 0, 1, 0, { unit: '%', group: 'Pitch' }),
      sel('arp', 'Arp', [['off', 'OFF'], ['maj', 'MAJ'], ['min', 'MIN'], ['oct', 'OCT'], ['pow', '5TH']], 'off', { group: 'Arpeggio' }),
      knob('arpRate', 'Rate', 4, 60, 24, { step: 1, fmt: (v) => Math.round(v) + 'Hz', group: 'Arpeggio' }),
      ...ADSR('a', 'Envelope', 0.001, 0.25, 0.5, 0.1),
      knob('poly', 'Polyphony', 1, 8, 4, { step: 1, group: 'Out' }),
      knob('vol', 'Volume', 0, 1, 0.45, { unit: '%', group: 'Out' }),
    ],
    create(rt) {
      const { ctx, out } = rt;
      const pool = new VoicePool(ctx);
      const crusher = ctx.createWaveShaper(); crusher.connect(out);
      let lastBits = 0;
      // NES-style 4-bit stepped triangle as periodic wave
      let nesTri = null;
      const getNesTri = () => {
        if (nesTri) return nesTri;
        const N = 32, re = new Float32Array(N), im = new Float32Array(N), M2 = 1024, s = new Float32Array(M2);
        for (let i = 0; i < M2; i++) { const ph = i / M2; s[i] = Math.round((ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4) * 7.5) / 7.5; }
        for (let k = 1; k < N; k++) { let a = 0, b = 0; for (let i = 0; i < M2; i++) { a += s[i] * Math.cos(2 * Math.PI * k * i / M2); b += s[i] * Math.sin(2 * Math.PI * k * i / M2); } re[k] = a / M2 * 2; im[k] = b / M2 * 2; }
        nesTri = ctx.createPeriodicWave(re, im);
        return nesTri;
      };
      const ARPS = { maj: [0, 4, 7], min: [0, 3, 7], oct: [0, 12], pow: [0, 7, 12] };
      return {
        noteOn(t, note, vel, dur) {
          const p = rt.params;
          if (p.bits !== lastBits) { crusher.curve = p.bits >= 16 ? null : CW.crushCurve(p.bits); lastBits = p.bits; }
          const f = CW.noteFreq(note);
          let src, det = null;
          if (p.wave === 'noise') {
            src = CW.noiseSource(ctx);
            src.playbackRate.value = CW.clamp(f / 440, 0.05, 4);
            det = src.detune;
          } else {
            src = ctx.createOscillator();
            if (p.wave === 'nestri') src.setPeriodicWave(getNesTri()); else CW.oscType(ctx, src, p.wave);
            src.frequency.value = f; det = src.detune;
          }
          if (p.sweep !== 0) { det.setValueAtTime(-p.sweep * 100, t); det.linearRampToValueAtTime(0, t + p.sweepT); }
          if (p.arp !== 'off') {
            const steps = ARPS[p.arp], st = 1 / p.arpRate, len = dur != null ? dur + p.aR : 8;
            for (let i = 0, tt = t; tt < t + len; i++, tt += st) det.setValueAtTime(steps[i % steps.length] * 100, tt);
          }
          const g = ctx.createGain(); g.gain.value = 0;
          let vib = null;
          if (p.vib > 0) { vib = ctx.createOscillator(); vib.frequency.value = 6; const vg = ctx.createGain(); vg.gain.value = p.vib * 60; vib.connect(vg).connect(det); vib.start(t + 0.15); }
          src.connect(g).connect(crusher);
          src.start(t);
          const stop = (e) => { src.stop(e); if (vib) vib.stop(e); };
          const voice = {
            end: Infinity,
            kill(tt) { g.gain.cancelScheduledValues(tt); g.gain.setTargetAtTime(0, tt, 0.005); stop(tt + 0.05); voice.end = tt; },
            release(tt) { CW.envRelease(g.gain, tt, p.aR); stop(tt + p.aR + 0.05); voice.end = tt + p.aR; },
          };
          if (dur != null) { const e = CW.envNote(g.gain, t, dur, p.aA, p.aD, p.aS, p.aR, vel * p.vol); stop(e); voice.end = e; }
          else CW.envAttack(g.gain, t, p.aA, p.aD, p.aS, vel * p.vol);
          pool.add(voice, p.poly, t);
          return voice;
        },
      };
    },
  };

  // ===================================================================== FMSynth (3 operators: OP3 -> OP2 -> OP1)
  M.fmsynth = {
    name: 'FMSynth', short: 'FM', color: '#a58be0', kind: 'poly',
    params: [
      sel('algo', 'Algorithm', [['stack', '3>2>1'], ['par', '(2+3)>1'], ['add', '1+2>1']], 'stack', { group: 'Operators' }),
      knob('r1', 'OP1 Ratio', 0.5, 8, 1, { step: 0.5, group: 'Operators' }),
      knob('r2', 'OP2 Ratio', 0.5, 16, 2, { step: 0.5, group: 'OP 2' }),
      knob('i2', 'Index', 0, 10, 3, { group: 'OP 2' }),
      knob('d2', 'Decay', 0.01, 4, 0.5, { curve: 'log', unit: 's', group: 'OP 2' }),
      knob('s2', 'Sustain', 0, 1, 0.2, { unit: '%', group: 'OP 2' }),
      knob('r3', 'OP3 Ratio', 0.5, 16, 3.5, { step: 0.5, group: 'OP 3' }),
      knob('i3', 'Index', 0, 10, 1, { group: 'OP 3' }),
      knob('d3', 'Decay', 0.01, 4, 0.2, { curve: 'log', unit: 's', group: 'OP 3' }),
      ...ADSR('a', 'Carrier Envelope', 0.002, 0.8, 0.4, 0.4),
      knob('poly', 'Polyphony', 1, 16, 8, { step: 1, group: 'Out' }),
      knob('vol', 'Volume', 0, 1, 0.5, { unit: '%', group: 'Out' }),
    ],
    create(rt) {
      const { ctx, out } = rt;
      const pool = new VoicePool(ctx);
      return {
        noteOn(t, note, vel, dur) {
          const p = rt.params;
          const f = CW.noteFreq(note);
          const c = ctx.createOscillator(); c.frequency.value = f * p.r1;
          const m2 = ctx.createOscillator(); m2.frequency.value = f * p.r2;
          const m3 = ctx.createOscillator(); m3.frequency.value = f * p.r3;
          const g2 = ctx.createGain(), g3 = ctx.createGain(), amp = ctx.createGain(); amp.gain.value = 0;
          const dev2 = p.i2 * f * p.r2 * vel, dev3 = p.i3 * f * p.r3 * vel;
          g2.gain.setValueAtTime(dev2, t); g2.gain.setTargetAtTime(dev2 * p.s2, t, p.d2 / 4);
          g3.gain.setValueAtTime(dev3, t); g3.gain.setTargetAtTime(0, t, p.d3 / 4);
          m2.connect(g2);
          m3.connect(g3);
          if (p.algo === 'stack') { g3.connect(m2.frequency); g2.connect(c.frequency); c.connect(amp); }
          else if (p.algo === 'par') { g3.connect(c.frequency); g2.connect(c.frequency); c.connect(amp); }
          else { g3.connect(m2.frequency); g2.connect(c.frequency); c.connect(amp); const mix = ctx.createGain(); mix.gain.value = 0.4; m2.connect(mix).connect(amp); }
          amp.connect(out);
          [c, m2, m3].forEach((o) => o.start(t));
          const stop = (e) => [c, m2, m3].forEach((o) => o.stop(e));
          const voice = {
            end: Infinity,
            kill(tt) { amp.gain.cancelScheduledValues(tt); amp.gain.setTargetAtTime(0, tt, 0.005); stop(tt + 0.05); voice.end = tt; },
            release(tt) { CW.envRelease(amp.gain, tt, p.aR); stop(tt + p.aR + 0.05); voice.end = tt + p.aR; },
          };
          if (dur != null) { const e = CW.envNote(amp.gain, t, dur, p.aA, p.aD, p.aS, p.aR, vel * p.vol); stop(e); voice.end = e; }
          else CW.envAttack(amp.gain, t, p.aA, p.aD, p.aS, vel * p.vol);
          pool.add(voice, p.poly, t);
          return voice;
        },
      };
    },
  };

  // ===================================================================== KSSynth (Karplus-Strong, rendered per note)
  M.kssynth = {
    name: 'KSSynth', short: 'KS', color: '#c99a68', kind: 'poly',
    params: [
      sel('exc', 'Exciter', [['noise', 'NOISE'], ['saw', 'SAW'], ['pluck', 'PLUCK']], 'noise', { group: 'String' }),
      knob('bright', 'Brightness', 0, 1, 0.6, { unit: '%', group: 'String' }),
      knob('decay', 'Decay', 0.1, 10, 2.5, { curve: 'log', unit: 's', group: 'String' }),
      knob('damp', 'Damping', 0, 1, 0.4, { unit: '%', group: 'String' }),
      knob('pick', 'Pick Pos', 0.05, 0.5, 0.2, { unit: '%', group: 'String' }),
      knob('cutoff', 'Cutoff', 200, 18000, 9000, { curve: 'log', unit: 'Hz', group: 'Body' }),
      knob('body', 'Body', 0, 1, 0.3, { unit: '%', group: 'Body' }),
      knob('rel', 'Release', 0.01, 2, 0.15, { curve: 'log', unit: 's', group: 'Out' }),
      knob('poly', 'Polyphony', 1, 16, 8, { step: 1, group: 'Out' }),
      knob('vol', 'Volume', 0, 1, 0.7, { unit: '%', group: 'Out' }),
    ],
    create(rt) {
      const { ctx, out } = rt;
      const pool = new VoicePool(ctx);
      const cache = new Map();
      const render = (note, vel) => {
        const p = rt.params;
        const key = [note, Math.round(vel * 8), p.exc, p.bright, p.decay, p.damp, p.pick].join('|');
        if (cache.has(key)) return cache.get(key);
        const sr = ctx.sampleRate, f = CW.noteFreq(note), period = sr / f;
        const len = Math.floor(sr * Math.min(p.decay + 0.2, 10));
        const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
        const N = Math.max(2, Math.floor(period)), frac = period - N;
        const line = new Float32Array(N + 2);
        for (let i = 0; i < N; i++) {
          let x = p.exc === 'saw' ? (i / N) * 2 - 1 : p.exc === 'pluck' ? (i < N * p.pick ? i / (N * p.pick) : (N - i) / (N * (1 - p.pick))) * 2 - 1 : Math.random() * 2 - 1;
          line[i] = x * vel;
        }
        // brightness: pre-filter exciter
        let lp = 0;
        const bc = 1 - p.bright * 0.95;
        for (let i = 0; i < N; i++) { lp = lp * bc + line[i] * (1 - bc); line[i] = lp; }
        // pick position comb
        const pk = Math.floor(N * p.pick);
        for (let i = N - 1; i >= pk; i--) line[i] -= line[i - pk] * 0.5;
        const fb = Math.pow(0.001, 1 / (f * p.decay)); // per-period loss to reach -60dB at decay time
        const s = 0.5 - p.damp * 0.45;
        let idx = 0, prev = 0;
        for (let i = 0; i < len; i++) {
          const a = line[idx], b = line[(idx + 1) % N];
          const y = a + (b - a) * frac;
          d[i] = y;
          const nv = (y * (1 - s) + prev * s) * fb;
          prev = y;
          line[idx] = nv;
          idx = (idx + 1) % N;
        }
        if (cache.size > 200) cache.delete(cache.keys().next().value);
        cache.set(key, buf);
        return buf;
      };
      return {
        noteOn(t, note, vel, dur) {
          const p = rt.params;
          const src = ctx.createBufferSource(); src.buffer = render(note, vel);
          const filt = ctx.createBiquadFilter(); filt.frequency.value = p.cutoff;
          const body = ctx.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 220; body.Q.value = 1.5; body.gain.value = p.body * 12;
          const g = ctx.createGain(); g.gain.value = p.vol;
          src.connect(filt).connect(body).connect(g).connect(out);
          src.start(t);
          const voice = {
            end: t + src.buffer.duration,
            kill(tt) { g.gain.setTargetAtTime(0, tt, 0.005); src.stop(tt + 0.05); voice.end = tt; },
            release(tt) { g.gain.setTargetAtTime(0, tt, p.rel / 5); src.stop(tt + p.rel + 0.05); voice.end = tt + p.rel; },
          };
          if (dur != null) voice.release(t + dur);
          pool.add(voice, p.poly, t);
          return voice;
        },
      };
    },
  };

  // ===================================================================== Organ (drawbars + leslie)
  const BARS = [["16'", 1], ["5⅓'", 3], ["8'", 2], ["4'", 4], ["2⅔'", 6], ["2'", 8], ["1⅗'", 10], ["1⅓'", 12], ["1'", 16]];
  M.organ = {
    name: 'Organ', short: 'ORG', color: '#d9544f', kind: 'poly',
    params: [
      ...BARS.map(([lab], i) => knob('d' + i, lab, 0, 8, [8, 8, 8, 0, 0, 0, 0, 0, 0][i], { step: 1, group: 'Drawbars', slider: true })),
      sel('perc', 'Percussion', [['off', 'OFF'], ['2nd', '2ND'], ['3rd', '3RD']], 'off', { group: 'Percussion' }),
      knob('percDec', 'Decay', 0.05, 1, 0.25, { curve: 'log', unit: 's', group: 'Percussion' }),
      sel('leslie', 'Leslie', [['off', 'OFF'], ['slow', 'SLOW'], ['fast', 'FAST']], 'slow', { group: 'Leslie' }),
      knob('lesDepth', 'Depth', 0, 1, 0.5, { unit: '%', group: 'Leslie' }),
      knob('drive', 'Drive', 0, 1, 0.2, { unit: '%', group: 'Out' }),
      knob('click', 'Click', 0, 1, 0.3, { unit: '%', group: 'Out' }),
      knob('poly', 'Polyphony', 1, 16, 10, { step: 1, group: 'Out' }),
      knob('vol', 'Volume', 0, 1, 0.5, { unit: '%', group: 'Out' }),
    ],
    create(rt) {
      const { ctx, out } = rt;
      const pool = new VoicePool(ctx);
      // leslie: vibrato via modulated delay + tremolo, plus drive
      const input = ctx.createGain();
      const shaper = ctx.createWaveShaper();
      const dl = ctx.createDelay(0.05); dl.delayTime.value = 0.005;
      const trem = ctx.createGain();
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.8;
      const lfoD = ctx.createGain(), lfoT = ctx.createGain();
      lfo.connect(lfoD).connect(dl.delayTime); lfo.connect(lfoT).connect(trem.gain);
      lfo.start();
      input.connect(shaper).connect(dl).connect(trem).connect(out);
      let waveKey = '', wave = null, lastDrive = -1;
      const refresh = () => {
        const p = rt.params;
        const speed = p.leslie === 'fast' ? 6.5 : p.leslie === 'slow' ? 0.8 : 0;
        lfo.frequency.setTargetAtTime(Math.max(0.01, speed), ctx.currentTime, 0.8);
        const dep = p.leslie === 'off' ? 0 : p.lesDepth;
        lfoD.gain.value = dep * 0.0015; lfoT.gain.value = dep * 0.25; trem.gain.value = 1 - dep * 0.25;
        if (p.drive !== lastDrive) { shaper.curve = CW.driveCurve(p.drive * 0.6, 'sat'); lastDrive = p.drive; }
      };
      const getWave = () => {
        const p = rt.params;
        const key = BARS.map((_, i) => p['d' + i]).join(',');
        if (key !== waveKey) {
          const re = new Float32Array(17), im = new Float32Array(17);
          BARS.forEach(([, h], i) => { im[h] += p['d' + i] / 8; });
          wave = ctx.createPeriodicWave(re, im); waveKey = key;
        }
        return wave;
      };
      return {
        refresh,
        noteOn(t, note, vel, dur) {
          refresh();
          const p = rt.params;
          const f = CW.noteFreq(note);
          const o = ctx.createOscillator(); o.setPeriodicWave(getWave()); o.frequency.value = f / 2;
          const g = ctx.createGain(); g.gain.value = 0;
          o.connect(g).connect(input); o.start(t);
          const nodes = [o];
          if (p.perc !== 'off') {
            const po = ctx.createOscillator(); po.frequency.value = f * (p.perc === '2nd' ? 2 : 3);
            const pg = ctx.createGain(); pg.gain.setValueAtTime(0.35 * p.vol, t); pg.gain.setTargetAtTime(0, t, p.percDec / 4);
            po.connect(pg).connect(input); po.start(t); nodes.push(po);
          }
          if (p.click > 0) {
            const n = CW.noiseSource(ctx), ng = ctx.createGain(), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2000;
            ng.gain.setValueAtTime(p.click * 0.15, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.01);
            n.connect(hp).connect(ng).connect(input); n.start(t); n.stop(t + 0.03);
          }
          const stop = (e) => nodes.forEach((x) => x.stop(e));
          const voice = {
            end: Infinity,
            kill(tt) { g.gain.cancelScheduledValues(tt); g.gain.setTargetAtTime(0, tt, 0.005); stop(tt + 0.05); voice.end = tt; },
            release(tt) { CW.envRelease(g.gain, tt, 0.03); stop(tt + 0.1); voice.end = tt + 0.1; },
          };
          const amp = p.vol * 0.35 * (0.6 + vel * 0.4);
          if (dur != null) { const e = CW.envNote(g.gain, t, dur, 0.004, 0.1, 1, 0.03, amp); stop(e); voice.end = e; }
          else CW.envAttack(g.gain, t, 0.004, 0.1, 1, amp);
          pool.add(voice, p.poly, t);
          return voice;
        },
      };
    },
  };

  // ===================================================================== SawSynth (supersaw)
  M.sawsynth = {
    name: 'SawSynth', short: 'SAW', color: '#5fc4c0', kind: 'poly',
    params: [
      knob('voices', 'Voices', 1, 7, 5, { step: 1, group: 'Oscillator' }),
      knob('detune', 'Detune', 0, 60, 18, { fmt: (v) => Math.round(v) + 'c', group: 'Oscillator' }),
      knob('spread', 'Spread', 0, 1, 0.7, { unit: '%', group: 'Oscillator' }),
      knob('sub', 'Sub Osc', 0, 1, 0.2, { unit: '%', group: 'Oscillator' }),
      knob('oct', 'Octave', -2, 2, 0, { step: 1, group: 'Oscillator' }),
      knob('cutoff', 'Cutoff', 60, 18000, 3500, { curve: 'log', unit: 'Hz', group: 'Filter' }),
      knob('res', 'Res', 0.1, 20, 2, { curve: 'log', group: 'Filter' }),
      knob('fEnv', 'Env Amt', 0, 1, 0.3, { unit: '%', group: 'Filter' }),
      ...ADSR('f', 'Filter Envelope', 0.01, 0.4, 0.4, 0.4),
      ...ADSR('a', 'Volume Envelope', 0.01, 0.3, 0.8, 0.4),
      knob('poly', 'Polyphony', 1, 16, 6, { step: 1, group: 'Out' }),
      knob('vol', 'Volume', 0, 1, 0.5, { unit: '%', group: 'Out' }),
    ],
    create(rt) {
      const { ctx, out } = rt;
      const pool = new VoicePool(ctx);
      return {
        noteOn(t, note, vel, dur) {
          const p = rt.params;
          const f = CW.noteFreq(note + p.oct * 12);
          const filt = ctx.createBiquadFilter(); filt.Q.value = p.res;
          const g = ctx.createGain(); g.gain.value = 0;
          filt.connect(g).connect(out);
          const n = p.voices, oscs = [];
          for (let i = 0; i < n; i++) {
            const pos = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
            const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = pos * p.detune;
            const pn = ctx.createStereoPanner(); pn.pan.value = pos * p.spread;
            const og = ctx.createGain(); og.gain.value = 0.6 / Math.sqrt(n);
            o.connect(og).connect(pn).connect(filt); o.start(t, Math.random() / f); oscs.push(o);
          }
          if (p.sub > 0) { const s = ctx.createOscillator(); s.type = 'square'; s.frequency.value = f / 2; const sg = ctx.createGain(); sg.gain.value = p.sub * 0.3; s.connect(sg).connect(filt); s.start(t); oscs.push(s); }
          const base = p.cutoff, peak = CW.clamp(base + p.fEnv * 10000 * vel, 20, 20000);
          const stop = (e) => oscs.forEach((o) => o.stop(e));
          const voice = {
            end: Infinity,
            kill(tt) { g.gain.cancelScheduledValues(tt); g.gain.setTargetAtTime(0, tt, 0.005); stop(tt + 0.05); voice.end = tt; },
            release(tt) { CW.envRelease(g.gain, tt, p.aR); CW.envRelease(filt.frequency, tt, p.fR, base); stop(tt + p.aR + 0.05); voice.end = tt + p.aR; },
          };
          if (dur != null) {
            const e = Math.max(CW.envNote(g.gain, t, dur, p.aA, p.aD, p.aS, p.aR, vel * p.vol), CW.envNote(filt.frequency, t, dur, p.fA, p.fD, p.fS, p.fR, peak, base));
            stop(e); voice.end = e;
          } else { CW.envAttack(g.gain, t, p.aA, p.aD, p.aS, vel * p.vol); CW.envAttack(filt.frequency, t, p.fA, p.fD, p.fS, peak, base); }
          pool.add(voice, p.poly, t);
          return voice;
        },
      };
    },
  };

  // ===================================================================== PCMSynth (sampler)
  // Decoded sample buffers are shared by all contexts (AudioBuffers are context independent).
  CW.sampleCache = CW.sampleCache || {};
  CW.defaultSample = (ctx) => {
    if (CW.sampleCache.__default) return CW.sampleCache.__default;
    const sr = ctx.sampleRate, len = sr * 2, b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
    const f = CW.noteFreq(60);
    for (let i = 0; i < len; i++) {
      const t = i / sr, e = Math.exp(-t * 2.2) * Math.min(1, t * 400);
      d[i] = e * (Math.sin(2 * Math.PI * f * t) * 0.6 + Math.sin(4 * Math.PI * f * t) * 0.25 * Math.exp(-t * 4) + Math.sin(6 * Math.PI * f * t) * 0.12 * Math.exp(-t * 7)) * 0.8;
    }
    CW.sampleCache.__default = b;
    return b;
  };
  M.pcmsynth = {
    name: 'PCMSynth', short: 'PCM', color: '#7fcf6e', kind: 'poly', sampler: true,
    params: [
      knob('root', 'Root Key', 24, 96, 60, { step: 1, fmt: (v) => CW.noteName(v), group: 'Sample' }),
      knob('tune', 'Fine', -100, 100, 0, { step: 1, fmt: (v) => Math.round(v) + 'c', group: 'Sample' }),
      sel('loop', 'Loop', [['off', 'OFF'], ['on', 'ON']], 'off', { group: 'Sample' }),
      knob('start', 'Start', 0, 0.95, 0, { unit: '%', group: 'Sample' }),
      knob('cutoff', 'Cutoff', 60, 18000, 18000, { curve: 'log', unit: 'Hz', group: 'Filter' }),
      knob('res', 'Res', 0.1, 20, 0.7, { curve: 'log', group: 'Filter' }),
      ...ADSR('a', 'Volume Envelope', 0.001, 1, 1, 0.3),
      knob('poly', 'Polyphony', 1, 16, 8, { step: 1, group: 'Out' }),
      knob('vol', 'Volume', 0, 1, 0.8, { unit: '%', group: 'Out' }),
    ],
    create(rt) {
      const { ctx, out } = rt;
      const pool = new VoicePool(ctx);
      return {
        noteOn(t, note, vel, dur) {
          const p = rt.params;
          const s = rt.machine.sample;
          const buf = (s && CW.sampleCache[s.id]) || CW.defaultSample(ctx);
          const src = ctx.createBufferSource(); src.buffer = buf;
          src.loop = p.loop === 'on';
          src.playbackRate.value = Math.pow(2, (note - p.root) / 12);
          src.detune.value = p.tune;
          const filt = ctx.createBiquadFilter(); filt.frequency.value = p.cutoff; filt.Q.value = p.res;
          const g = ctx.createGain(); g.gain.value = 0;
          src.connect(filt).connect(g).connect(out);
          src.start(t, p.start * buf.duration);
          const voice = {
            end: Infinity,
            kill(tt) { g.gain.cancelScheduledValues(tt); g.gain.setTargetAtTime(0, tt, 0.005); src.stop(tt + 0.05); voice.end = tt; },
            release(tt) { CW.envRelease(g.gain, tt, p.aR); src.stop(tt + p.aR + 0.05); voice.end = tt + p.aR; },
          };
          if (dur != null) { const e = CW.envNote(g.gain, t, dur, p.aA, p.aD, p.aS, p.aR, vel * p.vol); src.stop(e); voice.end = e; }
          else CW.envAttack(g.gain, t, p.aA, p.aD, p.aS, vel * p.vol);
          pool.add(voice, p.poly, t);
          return voice;
        },
      };
    },
  };

  CW.MachineTypes = M;
  CW.MACHINE_ORDER = ['subsynth', 'bassline', 'beatbox', 'padsynth', 'eightbit', 'fmsynth', 'kssynth', 'organ', 'sawsynth', 'pcmsynth'];
})(window.CW);
