// Caustic Web — insert effects (2 slots per machine).
// Each effect: { name, params, create(ctx, params, bpm) -> { input, output, set(id, v, all), dispose() } }
(function (CW) {
  'use strict';

  const knob = (id, label, min, max, def, extra) => Object.assign({ id, label, min, max, def, type: 'knob' }, extra || {});
  const sel = (id, label, options, def, extra) => Object.assign({ id, label, options, def, type: 'select' }, extra || {});

  // dry/wet helper: input -> dry -> output, input -> [wet chain] -> wet -> output
  function dryWet(ctx) {
    const input = ctx.createGain(), output = ctx.createGain(), dry = ctx.createGain(), wet = ctx.createGain();
    input.connect(dry).connect(output); wet.connect(output);
    return { input, output, dry, wet, mix(v) { dry.gain.value = Math.cos(v * Math.PI / 2); wet.gain.value = Math.sin(v * Math.PI / 2); } };
  }

  const SYNC = [['free', 'FREE'], ['1/16', '1/16'], ['1/8', '1/8'], ['1/8d', '1/8.'], ['1/4', '1/4'], ['1/4d', '1/4.'], ['1/2', '1/2']];
  CW.syncTime = (sync, bpm, free) => {
    const beat = 60 / bpm;
    switch (sync) {
      case '1/16': return beat / 4; case '1/8': return beat / 2; case '1/8d': return beat * 0.75;
      case '1/4': return beat; case '1/4d': return beat * 1.5; case '1/2': return beat * 2;
      default: return free;
    }
  };

  const E = {};

  E.delay = {
    name: 'Delay',
    params: [
      sel('sync', 'Sync', SYNC, '1/8d'),
      knob('time', 'Time', 0.01, 1.5, 0.3, { curve: 'log', unit: 's' }),
      knob('fb', 'Feedback', 0, 0.95, 0.4, { unit: '%' }),
      knob('tone', 'Tone', 300, 16000, 5000, { curve: 'log', unit: 'Hz' }),
      sel('pp', 'Mode', [['mono', 'MONO'], ['pp', 'PING']], 'pp'),
      knob('mix', 'Wet', 0, 1, 0.3, { unit: '%' }),
    ],
    create(ctx) {
      const dw = dryWet(ctx);
      const dL = ctx.createDelay(4), dR = ctx.createDelay(4), fb = ctx.createGain(), tone = ctx.createBiquadFilter();
      const merger = ctx.createChannelMerger(2), split = ctx.createGain();
      dw.input.connect(split).connect(tone);
      tone.connect(dL); dL.connect(dR);
      dL.connect(merger, 0, 0); dR.connect(merger, 0, 1);
      dR.connect(fb).connect(tone);
      merger.connect(dw.wet);
      const monoFb = ctx.createGain(); dL.connect(monoFb).connect(tone);
      return {
        input: dw.input, output: dw.output,
        set(id, v, P, bpm) {
          const t = CW.syncTime(P.sync, bpm, P.time);
          dL.delayTime.setTargetAtTime(t, ctx.currentTime, 0.02);
          dR.delayTime.setTargetAtTime(P.pp === 'pp' ? t : 0.0001, ctx.currentTime, 0.02);
          fb.gain.value = P.pp === 'pp' ? P.fb : 0; monoFb.gain.value = P.pp === 'pp' ? 0 : P.fb;
          tone.frequency.value = P.tone; dw.mix(P.mix);
        },
      };
    },
  };

  E.reverb = {
    name: 'Reverb',
    params: [
      knob('size', 'Size', 0.2, 8, 2, { curve: 'log', unit: 's' }),
      knob('damp', 'Damping', 0, 0.95, 0.4, { unit: '%' }),
      knob('pre', 'Pre-Delay', 0, 0.2, 0.01, { unit: 's' }),
      knob('lowcut', 'Low Cut', 20, 1000, 120, { curve: 'log', unit: 'Hz' }),
      knob('mix', 'Wet', 0, 1, 0.3, { unit: '%' }),
    ],
    create(ctx) {
      const dw = dryWet(ctx);
      const conv = ctx.createConvolver(), hp = ctx.createBiquadFilter(); hp.type = 'highpass';
      dw.input.connect(hp).connect(conv).connect(dw.wet);
      let key = '', timer = null;
      return {
        input: dw.input, output: dw.output,
        set(id, v, P) {
          hp.frequency.value = P.lowcut; dw.mix(P.mix);
          const k = [P.size, P.damp, P.pre].join('|');
          if (k !== key) {
            key = k; clearTimeout(timer);
            const build = () => { conv.buffer = CW.makeImpulse(ctx, P.size, P.damp, P.pre); };
            if (!conv.buffer || ctx instanceof OfflineAudioContext) build(); else timer = setTimeout(build, 120);
          }
        },
      };
    },
  };

  const lfoFx = (name, mk) => ({ name, params: mk.params, create: mk.create });

  E.chorus = lfoFx('Chorus', {
    params: [knob('rate', 'Rate', 0.05, 8, 0.8, { curve: 'log', fmt: (v) => v.toFixed(2) + 'Hz' }), knob('depth', 'Depth', 0, 1, 0.5, { unit: '%' }), knob('delay', 'Delay', 0.005, 0.04, 0.015, { unit: 's' }), knob('mix', 'Wet', 0, 1, 0.5, { unit: '%' })],
    create(ctx) {
      const dw = dryWet(ctx), merger = ctx.createChannelMerger(2);
      const dl = [ctx.createDelay(0.1), ctx.createDelay(0.1)];
      const lfo = ctx.createOscillator(), inv = ctx.createGain(); inv.gain.value = -1;
      const lg = ctx.createGain(); lfo.connect(lg); lg.connect(dl[0].delayTime); lg.connect(inv).connect(dl[1].delayTime); lfo.start();
      dl.forEach((d, i) => { dw.input.connect(d); d.connect(merger, 0, i); });
      merger.connect(dw.wet);
      return {
        input: dw.input, output: dw.output,
        set(id, v, P) { lfo.frequency.value = P.rate; lg.gain.value = P.depth * P.delay * 0.5; dl.forEach((d) => (d.delayTime.value = P.delay)); dw.mix(P.mix); },
        dispose() { lfo.stop(); },
      };
    },
  });

  E.flanger = lfoFx('Flanger', {
    params: [knob('rate', 'Rate', 0.02, 5, 0.25, { curve: 'log', fmt: (v) => v.toFixed(2) + 'Hz' }), knob('depth', 'Depth', 0, 1, 0.7, { unit: '%' }), knob('fb', 'Feedback', -0.95, 0.95, 0.6), knob('mix', 'Wet', 0, 1, 0.5, { unit: '%' })],
    create(ctx) {
      const dw = dryWet(ctx), d = ctx.createDelay(0.05), fb = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      d.delayTime.value = 0.004; lfo.connect(lg).connect(d.delayTime); lfo.start();
      dw.input.connect(d); d.connect(fb).connect(d); d.connect(dw.wet);
      return {
        input: dw.input, output: dw.output,
        set(id, v, P) { lfo.frequency.value = P.rate; lg.gain.value = P.depth * 0.0035; fb.gain.value = P.fb; dw.mix(P.mix); },
        dispose() { lfo.stop(); },
      };
    },
  });

  E.phaser = lfoFx('Phaser', {
    params: [knob('rate', 'Rate', 0.02, 8, 0.4, { curve: 'log', fmt: (v) => v.toFixed(2) + 'Hz' }), knob('depth', 'Depth', 0, 1, 0.7, { unit: '%' }), knob('freq', 'Center', 200, 4000, 900, { curve: 'log', unit: 'Hz' }), knob('fb', 'Feedback', 0, 0.9, 0.5, { unit: '%' }), knob('stages', 'Stages', 2, 8, 4, { step: 2 }), knob('mix', 'Wet', 0, 1, 0.5, { unit: '%' })],
    create(ctx) {
      const dw = dryWet(ctx), lfo = ctx.createOscillator(), lg = ctx.createGain(), fb = ctx.createGain();
      lfo.connect(lg); lfo.start();
      const aps = [];
      for (let i = 0; i < 8; i++) { const a = ctx.createBiquadFilter(); a.type = 'allpass'; a.Q.value = 0.5; lg.connect(a.frequency); aps.push(a); }
      let built = 0;
      const wire = (n) => {
        aps.forEach((a) => a.disconnect()); try { dw.input.disconnect(aps[0]); } catch (e) { /* first build */ }
        aps.forEach((a) => lg.connect(a.frequency));
        dw.input.connect(aps[0]);
        for (let i = 0; i < n - 1; i++) aps[i].connect(aps[i + 1]);
        aps[n - 1].connect(dw.wet); aps[n - 1].connect(fb).connect(aps[0]);
        built = n;
      };
      return {
        input: dw.input, output: dw.output,
        set(id, v, P) {
          if (P.stages !== built) wire(P.stages);
          lfo.frequency.value = P.rate; aps.forEach((a) => (a.frequency.value = P.freq)); lg.gain.value = P.depth * P.freq * 0.9; fb.gain.value = P.fb; dw.mix(P.mix);
        },
        dispose() { lfo.stop(); },
      };
    },
  });

  E.distortion = {
    name: 'Distortion',
    params: [sel('kind', 'Program', [['od', 'OD'], ['sat', 'SAT'], ['fuzz', 'FUZZ'], ['fold', 'FOLD'], ['hard', 'CLIP']], 'od'), knob('pre', 'Pre', 0, 1, 0.5, { unit: '%' }), knob('amount', 'Amount', 0, 1, 0.5, { unit: '%' }), knob('tone', 'Tone', 400, 16000, 6000, { curve: 'log', unit: 'Hz' }), knob('post', 'Post', 0, 1, 0.5, { unit: '%' })],
    create(ctx) {
      const input = ctx.createGain(), pre = ctx.createGain(), sh = ctx.createWaveShaper(), tone = ctx.createBiquadFilter(), post = ctx.createGain();
      sh.oversample = '4x'; input.connect(pre).connect(sh).connect(tone).connect(post);
      let key = '';
      return {
        input, output: post,
        set(id, v, P) {
          pre.gain.value = 0.3 + P.pre * 2; tone.frequency.value = P.tone; post.gain.value = P.post * 1.2;
          const k = P.kind + P.amount; if (k !== key) { sh.curve = CW.driveCurve(P.amount, P.kind); key = k; }
        },
      };
    },
  };

  E.bitcrusher = {
    name: 'Bitcrusher',
    params: [knob('bits', 'Bits', 1, 16, 6, { step: 1 }), knob('tone', 'Tone', 300, 18000, 8000, { curve: 'log', unit: 'Hz' }), knob('mix', 'Wet', 0, 1, 1, { unit: '%' })],
    create(ctx) {
      const dw = dryWet(ctx), sh = ctx.createWaveShaper(), lp = ctx.createBiquadFilter();
      dw.input.connect(sh).connect(lp).connect(dw.wet);
      let b = 0;
      return { input: dw.input, output: dw.output, set(id, v, P) { if (P.bits !== b) { sh.curve = CW.crushCurve(P.bits); b = P.bits; } lp.frequency.value = P.tone; dw.mix(P.mix); } };
    },
  };

  E.compressor = {
    name: 'Compressor',
    params: [knob('thr', 'Threshold', -60, 0, -20, { fmt: (v) => Math.round(v) + 'dB' }), knob('ratio', 'Ratio', 1, 20, 4, { fmt: (v) => v.toFixed(1) + ':1' }), knob('att', 'Attack', 0.001, 0.3, 0.01, { curve: 'log', unit: 's' }), knob('rel', 'Release', 0.02, 1, 0.2, { curve: 'log', unit: 's' }), knob('gain', 'Makeup', 0, 4, 1.5, { fmt: (v) => v.toFixed(2) + 'x' })],
    create(ctx) {
      const c = ctx.createDynamicsCompressor(), g = ctx.createGain(); c.connect(g);
      return { input: c, output: g, set(id, v, P) { c.threshold.value = P.thr; c.ratio.value = P.ratio; c.attack.value = P.att; c.release.value = P.rel; g.gain.value = P.gain; } };
    },
  };

  E.limiter = {
    name: 'Limiter',
    params: [knob('pre', 'Pre Gain', 0, 4, 1, { fmt: (v) => v.toFixed(2) + 'x' }), knob('thr', 'Ceiling', -24, 0, -3, { fmt: (v) => Math.round(v) + 'dB' }), knob('rel', 'Release', 0.01, 1, 0.1, { curve: 'log', unit: 's' }), knob('post', 'Post Gain', 0, 2, 1, { fmt: (v) => v.toFixed(2) + 'x' })],
    create(ctx) {
      const pre = ctx.createGain(), c = ctx.createDynamicsCompressor(), post = ctx.createGain();
      c.ratio.value = 20; c.knee.value = 0; c.attack.value = 0.001; pre.connect(c).connect(post);
      return { input: pre, output: post, set(id, v, P) { pre.gain.value = P.pre; c.threshold.value = P.thr; c.release.value = P.rel; post.gain.value = P.post; } };
    },
  };

  E.multifilter = {
    name: 'MultiFilter',
    params: [sel('type', 'Type', [['lowpass', 'LP'], ['highpass', 'HP'], ['bandpass', 'BP'], ['notch', 'NOTCH']], 'lowpass'), knob('freq', 'Freq', 30, 18000, 2000, { curve: 'log', unit: 'Hz' }), knob('res', 'Res', 0.1, 25, 2, { curve: 'log' }), knob('gain', 'Gain', 0, 2, 1, { fmt: (v) => v.toFixed(2) + 'x' })],
    create(ctx) {
      const f = ctx.createBiquadFilter(), g = ctx.createGain(); f.connect(g);
      return { input: f, output: g, set(id, v, P) { f.type = P.type; f.frequency.setTargetAtTime(P.freq, ctx.currentTime, 0.01); f.Q.value = P.res; g.gain.value = P.gain; } };
    },
  };

  E.autowah = {
    name: 'AutoWah',
    params: [sel('sync', 'Sync', SYNC, '1/4'), knob('rate', 'Rate', 0.05, 10, 1, { curve: 'log', fmt: (v) => v.toFixed(2) + 'Hz' }), knob('freq', 'Freq', 100, 5000, 700, { curve: 'log', unit: 'Hz' }), knob('depth', 'Depth', 0, 1, 0.7, { unit: '%' }), knob('res', 'Res', 0.5, 20, 6, { curve: 'log' }), knob('mix', 'Wet', 0, 1, 1, { unit: '%' })],
    create(ctx) {
      const dw = dryWet(ctx), f = ctx.createBiquadFilter(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      f.type = 'bandpass'; lfo.connect(lg).connect(f.detune); lfo.start();
      dw.input.connect(f).connect(dw.wet);
      return {
        input: dw.input, output: dw.output,
        set(id, v, P, bpm) { lfo.frequency.value = P.sync === 'free' ? P.rate : 1 / CW.syncTime(P.sync, bpm, 1); f.frequency.value = P.freq; f.Q.value = P.res; lg.gain.value = P.depth * 2400; dw.mix(P.mix); },
        dispose() { lfo.stop(); },
      };
    },
  };

  E.tremolo = {
    name: 'Tremolo',
    params: [sel('sync', 'Sync', SYNC, '1/8'), knob('rate', 'Rate', 0.1, 20, 4, { curve: 'log', fmt: (v) => v.toFixed(2) + 'Hz' }), sel('wave', 'Wave', [['sine', 'SIN'], ['square', 'SQR'], ['triangle', 'TRI']], 'sine'), knob('depth', 'Depth', 0, 1, 0.6, { unit: '%' })],
    create(ctx) {
      const g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.connect(lg).connect(g.gain); lfo.start();
      return {
        input: g, output: g,
        set(id, v, P, bpm) { lfo.type = P.wave; lfo.frequency.value = P.sync === 'free' ? P.rate : 1 / CW.syncTime(P.sync, bpm, 1); lg.gain.value = P.depth / 2; g.gain.value = 1 - P.depth / 2; },
        dispose() { lfo.stop(); },
      };
    },
  };

  E.autopan = {
    name: 'AutoPan',
    params: [sel('sync', 'Sync', SYNC, '1/4'), knob('rate', 'Rate', 0.05, 10, 0.5, { curve: 'log', fmt: (v) => v.toFixed(2) + 'Hz' }), knob('depth', 'Depth', 0, 1, 0.8, { unit: '%' })],
    create(ctx) {
      const p = ctx.createStereoPanner(), lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.connect(lg).connect(p.pan); lfo.start();
      return {
        input: p, output: p,
        set(id, v, P, bpm) { lfo.frequency.value = P.sync === 'free' ? P.rate : 1 / CW.syncTime(P.sync, bpm, 1); lg.gain.value = P.depth; },
        dispose() { lfo.stop(); },
      };
    },
  };

  E.combfilter = {
    name: 'CombFilter',
    params: [knob('freq', 'Freq', 40, 2000, 220, { curve: 'log', unit: 'Hz' }), knob('fb', 'Feedback', 0, 0.97, 0.7, { unit: '%' }), knob('damp', 'Damping', 500, 16000, 6000, { curve: 'log', unit: 'Hz' }), knob('mix', 'Wet', 0, 1, 0.5, { unit: '%' })],
    create(ctx) {
      const dw = dryWet(ctx), d = ctx.createDelay(0.1), fb = ctx.createGain(), lp = ctx.createBiquadFilter();
      dw.input.connect(d); d.connect(lp).connect(fb).connect(d); d.connect(dw.wet);
      return { input: dw.input, output: dw.output, set(id, v, P) { d.delayTime.value = 1 / P.freq; fb.gain.value = P.fb; lp.frequency.value = P.damp; dw.mix(P.mix); } };
    },
  };

  E.parametriceq = {
    name: 'Parametric EQ',
    params: [knob('lf', 'Low F', 30, 500, 100, { curve: 'log', unit: 'Hz' }), knob('lg', 'Low dB', -18, 18, 0, { fmt: (v) => v.toFixed(1) + 'dB' }), knob('mf', 'Mid F', 200, 8000, 1000, { curve: 'log', unit: 'Hz' }), knob('mg', 'Mid dB', -18, 18, 0, { fmt: (v) => v.toFixed(1) + 'dB' }), knob('mq', 'Mid Q', 0.2, 10, 1, { curve: 'log' }), knob('hf', 'High F', 2000, 16000, 8000, { curve: 'log', unit: 'Hz' }), knob('hg', 'High dB', -18, 18, 0, { fmt: (v) => v.toFixed(1) + 'dB' })],
    create(ctx) {
      const l = ctx.createBiquadFilter(), m = ctx.createBiquadFilter(), h = ctx.createBiquadFilter();
      l.type = 'lowshelf'; m.type = 'peaking'; h.type = 'highshelf'; l.connect(m).connect(h);
      return { input: l, output: h, set(id, v, P) { l.frequency.value = P.lf; l.gain.value = P.lg; m.frequency.value = P.mf; m.gain.value = P.mg; m.Q.value = P.mq; h.frequency.value = P.hf; h.gain.value = P.hg; } };
    },
  };

  CW.EffectTypes = E;
  CW.EFFECT_ORDER = ['delay', 'reverb', 'chorus', 'flanger', 'phaser', 'distortion', 'bitcrusher', 'compressor', 'limiter', 'multifilter', 'autowah', 'tremolo', 'autopan', 'combfilter', 'parametriceq'];
})(window.CW);
