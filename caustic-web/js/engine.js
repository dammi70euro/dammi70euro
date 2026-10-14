// Caustic Web — audio graph, channel strips, master section, sequencer and offline export.
(function (CW) {
  'use strict';

  const STEPS_PER_BAR = 16;

  // ------------------------------------------------------------------ Master section
  class MasterRT {
    constructor(graph) {
      const ctx = this.ctx = graph.ctx;
      this.graph = graph;
      this.dry = ctx.createGain();
      this.delayIn = ctx.createGain();
      this.reverbIn = ctx.createGain();
      this.bus = ctx.createGain();
      this.delay = CW.EffectTypes.delay.create(ctx);
      this.reverb = CW.EffectTypes.reverb.create(ctx);
      this.delayRet = ctx.createGain();
      this.reverbRet = ctx.createGain();
      this.delayIn.connect(this.delay.input); this.delay.output.connect(this.delayRet).connect(this.bus);
      this.reverbIn.connect(this.reverb.input); this.reverb.output.connect(this.reverbRet).connect(this.bus);
      this.dry.connect(this.bus);
      this.eqL = ctx.createBiquadFilter(); this.eqL.type = 'lowshelf'; this.eqL.frequency.value = 180;
      this.eqM = ctx.createBiquadFilter(); this.eqM.type = 'peaking'; this.eqM.frequency.value = 1200; this.eqM.Q.value = 0.8;
      this.eqH = ctx.createBiquadFilter(); this.eqH.type = 'highshelf'; this.eqH.frequency.value = 6000;
      this.limPre = ctx.createGain();
      this.lim = ctx.createDynamicsCompressor(); this.lim.ratio.value = 20; this.lim.knee.value = 0; this.lim.attack.value = 0.002;
      this.limBypass = ctx.createGain();
      this.vol = ctx.createGain();
      this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 2048;
      this.bus.connect(this.eqL).connect(this.eqM).connect(this.eqH).connect(this.limPre);
      this.limWet = ctx.createGain();
      this.limPre.connect(this.lim).connect(this.limWet).connect(this.vol);
      this.limPre.connect(this.limBypass).connect(this.vol);
      this.vol.connect(this.analyser);
      this.vol.connect(ctx.destination);
      this.apply();
    }
    apply() {
      const M = this.graph.song.master, bpm = this.graph.song.bpm;
      const dP = Object.assign({}, M.delay, { mix: 1 }), rP = Object.assign({}, M.reverb, { mix: 1 });
      this.delay.set(null, null, dP, bpm);
      this.reverb.set(null, null, rP, bpm);
      this.delayRet.gain.value = M.delayRet;
      this.reverbRet.gain.value = M.reverbRet;
      this.eqL.gain.value = M.eqLow; this.eqM.gain.value = M.eqMid; this.eqH.gain.value = M.eqHigh;
      this.limPre.gain.value = M.limGain;
      this.lim.threshold.value = M.limThr;
      // route either through the limiter or around it
      const on = M.limOn !== false;
      this.limBypass.gain.value = on ? 0 : 1;
      this.limWet.gain.value = on ? 1 : 0;
      this.vol.gain.value = M.vol;
    }
    dispose() { try { this.vol.disconnect(); } catch (e) { /* ignore */ } if (this.delay.dispose) this.delay.dispose(); }
  }

  // ------------------------------------------------------------------ Machine runtime (synth + fx + channel strip)
  class MachineRT {
    constructor(graph, m) {
      const ctx = this.ctx = graph.ctx;
      this.graph = graph; this.m = m;
      this.def = CW.MachineTypes[m.type];
      this.hits = []; // note-on times, consumed by the UI for the activity LED
      this.synthOut = ctx.createGain();
      this.rt = { ctx, out: this.synthOut, params: m.params, machine: m };
      this.synth = this.def.create(this.rt);
      this.slotIn = [ctx.createGain(), ctx.createGain()];
      this.slotOut = [ctx.createGain(), ctx.createGain()];
      this.fx = [null, null];
      this.synthOut.connect(this.slotIn[0]);
      this.slotOut[0].connect(this.slotIn[1]);
      this.eqL = ctx.createBiquadFilter(); this.eqL.type = 'lowshelf'; this.eqL.frequency.value = 200;
      this.eqM = ctx.createBiquadFilter(); this.eqM.type = 'peaking'; this.eqM.frequency.value = 1000; this.eqM.Q.value = 0.7;
      this.eqH = ctx.createBiquadFilter(); this.eqH.type = 'highshelf'; this.eqH.frequency.value = 5000;
      this.pan = ctx.createStereoPanner();
      this.vol = ctx.createGain();
      this.muteG = ctx.createGain();
      this.sendD = ctx.createGain(); this.sendR = ctx.createGain();
      this.meter = ctx.createAnalyser(); this.meter.fftSize = 256;
      this.slotOut[1].connect(this.eqL).connect(this.eqM).connect(this.eqH).connect(this.pan).connect(this.vol).connect(this.muteG);
      this.muteG.connect(graph.master.dry);
      this.muteG.connect(this.sendD).connect(graph.master.delayIn);
      this.muteG.connect(this.sendR).connect(graph.master.reverbIn);
      this.muteG.connect(this.meter);
      for (let i = 0; i < 2; i++) this.setFx(i);
      this.applyMix();
      this.paramsChanged();
    }
    setFx(i) {
      const slot = this.m.fx[i];
      if (this.fx[i]) {
        try { this.slotIn[i].disconnect(); this.fx[i].output.disconnect(); } catch (e) { /* ignore */ }
        if (this.fx[i].dispose) this.fx[i].dispose();
        this.fx[i] = null;
      } else {
        try { this.slotIn[i].disconnect(); } catch (e) { /* ignore */ }
      }
      const def = slot && slot.type !== 'none' && CW.EffectTypes[slot.type];
      if (!def || slot.bypass) { this.slotIn[i].connect(this.slotOut[i]); if (def) this.fx[i] = null; return; }
      const fx = def.create(this.ctx);
      fx.set(null, null, slot.params, this.graph.song.bpm);
      this.slotIn[i].connect(fx.input); fx.output.connect(this.slotOut[i]);
      this.fx[i] = fx;
    }
    fxParamsChanged(i) {
      const slot = this.m.fx[i];
      if (this.fx[i]) this.fx[i].set(null, null, slot.params, this.graph.song.bpm);
    }
    applyMix() {
      const x = this.m.mix;
      this.vol.gain.value = x.vol;
      this.pan.pan.value = x.pan;
      this.eqL.gain.value = x.low; this.eqM.gain.value = x.mid; this.eqH.gain.value = x.high;
      this.sendD.gain.value = x.delay; this.sendR.gain.value = x.reverb;
      this.graph.updateMutes();
    }
    paramsChanged() {
      if (this.synth.refresh) this.synth.refresh();
      if (this.synth.prepare) {
        clearTimeout(this._prep);
        if (this.ctx instanceof OfflineAudioContext) this.synth.prepare();
        else this._prep = setTimeout(() => this.synth.prepare(), 150);
      }
    }
    dispose() {
      try { this.muteG.disconnect(); this.synthOut.disconnect(); } catch (e) { /* ignore */ }
      this.fx.forEach((f) => f && f.dispose && f.dispose());
    }
  }

  // ------------------------------------------------------------------ Graph
  class Graph {
    constructor(ctx, song) {
      this.ctx = ctx; this.song = song;
      this.master = new MasterRT(this);
      this.rts = new Map();
      song.machines.forEach((m) => this.addMachine(m));
    }
    addMachine(m) { const r = new MachineRT(this, m); this.rts.set(m.id, r); this.updateMutes(); return r; }
    removeMachine(id) { const r = this.rts.get(id); if (r) { r.dispose(); this.rts.delete(id); } this.updateMutes(); }
    rt(id) { return this.rts.get(id); }
    updateMutes() {
      const anySolo = this.song.machines.some((m) => m.mix.solo);
      for (const m of this.song.machines) {
        const r = this.rts.get(m.id); if (!r) continue;
        r.muteG.gain.value = m.mix.mute || (anySolo && !m.mix.solo) ? 0 : 1;
      }
    }
    bpmChanged() {
      this.master.apply();
      this.rts.forEach((r) => { r.fxParamsChanged(0); r.fxParamsChanged(1); });
    }
    dispose() { this.master.dispose(); this.rts.forEach((r) => r.dispose()); }
  }

  // ------------------------------------------------------------------ sequencing helpers
  CW.songLengthBars = (song) => {
    let end = 0;
    for (const id in song.seq) for (const e of song.seq[id]) end = Math.max(end, e.bar + e.len);
    return end;
  };
  CW.patternSteps = (pat) => (pat ? pat.bars * STEPS_PER_BAR : STEPS_PER_BAR);

  // Returns { pat, step } that machine m plays at global step `step`, or null.
  CW.patternAt = (song, m, mode, step) => {
    if (mode === 'pattern') {
      const pat = m.patterns[m.cur];
      if (!pat) return null;
      return { pat, id: m.cur, step: step % CW.patternSteps(pat) };
    }
    const bar = Math.floor(step / STEPS_PER_BAR), inBar = step % STEPS_PER_BAR;
    const list = song.seq[m.id] || [];
    for (const e of list) {
      if (bar >= e.bar && bar < e.bar + e.len) {
        const pat = m.patterns[e.pat];
        if (!pat) return null;
        return { pat, id: e.pat, step: ((bar - e.bar) * STEPS_PER_BAR + inBar) % CW.patternSteps(pat) };
      }
    }
    return null;
  };

  // Schedules everything that starts on a given 16th step.
  CW.scheduleStep = (graph, mode, step, time) => {
    const song = graph.song;
    const stepDur = 60 / song.bpm / 4;
    const t = time + (step % 2 ? song.swing * stepDur * 0.66 : 0);
    for (const m of song.machines) {
      const at = CW.patternAt(song, m, mode, step);
      if (!at) continue;
      const r = graph.rt(m.id); if (!r) continue;
      const L = CW.patternSteps(at.pat);
      const mono = r.def.kind === 'mono';
      for (const n of at.pat.notes) {
        if (n.s !== at.step) continue;
        const flags = { accent: !!n.a, slide: !!n.sl };
        if (mono) flags.legatoNext = at.pat.notes.some((o) => o.sl && o.s === (n.s + n.l) % L);
        try { r.synth.noteOn(t, n.n, n.v == null ? 0.8 : n.v, n.l * stepDur, flags); }
        catch (e) { console.error('noteOn failed', m.type, e); }
        if (r.hits.length < 32) r.hits.push(t);
      }
    }
  };

  // ------------------------------------------------------------------ Realtime engine
  class Engine {
    constructor() {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.graph = null;
      this.playing = false;
      this.mode = 'pattern';
      this.step = 0;
      this.nextTime = 0;
      this.visual = [];
      this.playStep = -1;
      this.lookahead = 0.12;
      this.onTick = null;
      this._initTimer();
    }
    _initTimer() {
      const tick = () => this._tick();
      try {
        const src = 'let id=null;onmessage=e=>{if(e.data==="start"){clearInterval(id);id=setInterval(()=>postMessage(0),20)}else{clearInterval(id)}}';
        this.worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
        this.worker.onmessage = tick;
      } catch (e) {
        this.worker = null;
      }
      this._fallbackTick = tick;
    }
    load(song) {
      if (this.graph) this.graph.dispose();
      this.graph = new Graph(this.ctx, song);
    }
    get song() { return this.graph.song; }
    resume() { if (this.ctx.state !== 'running') this.ctx.resume(); }
    play(fromStep) {
      this.resume();
      this.step = fromStep || 0;
      this.nextTime = this.ctx.currentTime + 0.06;
      this.playing = true;
      this.visual = [];
      if (this.worker) this.worker.postMessage('start');
      else { clearInterval(this._iv); this._iv = setInterval(this._fallbackTick, 20); }
    }
    stop() {
      this.playing = false;
      if (this.worker) this.worker.postMessage('stop'); else clearInterval(this._iv);
      this.visual = []; this.playStep = -1;
    }
    _tick() {
      if (!this.playing) return;
      const song = this.graph.song;
      const ctx = this.ctx;
      if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.02; // recovered from a stall
      while (this.nextTime < ctx.currentTime + this.lookahead) {
        if (this.mode === 'song') {
          const len = CW.songLengthBars(song);
          const loop = song.loop && song.loop.on && song.loop.end > song.loop.start;
          const endStep = (loop ? song.loop.end : Math.max(1, len)) * STEPS_PER_BAR;
          if (this.step >= endStep) this.step = loop ? song.loop.start * STEPS_PER_BAR : 0;
        }
        CW.scheduleStep(this.graph, this.mode, this.step, this.nextTime);
        this.visual.push({ step: this.step, time: this.nextTime });
        this.nextTime += 60 / song.bpm / 4;
        this.step++;
      }
    }
    // current visual step based on audio clock
    updateVisual() {
      const now = this.ctx.currentTime;
      while (this.visual.length && this.visual[0].time <= now) this.playStep = this.visual.shift().step;
      return this.playStep;
    }
    liveNoteOn(mid, note, vel) {
      this.resume();
      const r = this.graph.rt(mid); if (!r) return null;
      r.hits.push(this.ctx.currentTime);
      return r.synth.noteOn(this.ctx.currentTime + 0.005, note, vel == null ? 0.85 : vel, null, {});
    }
    liveNoteOff(h) { if (h && h.release) h.release(this.ctx.currentTime + 0.005); }
  }
  CW.Engine = Engine;
  CW.Graph = Graph;

  // ------------------------------------------------------------------ Offline WAV export
  CW.renderOffline = async (song, mode, onProgress) => {
    const sr = 44100;
    const stepDur = 60 / song.bpm / 4;
    let bars;
    if (mode === 'song') bars = Math.max(1, CW.songLengthBars(song));
    else bars = Math.max(4, ...song.machines.map((m) => (m.patterns[m.cur] ? m.patterns[m.cur].bars : 1)));
    const steps = bars * STEPS_PER_BAR;
    const tail = 3;
    const secs = steps * stepDur + tail;
    const ctx = new OfflineAudioContext(2, Math.ceil(secs * sr), sr);
    const graph = new Graph(ctx, song);
    graph.rts.forEach((r) => r.paramsChanged());
    for (let s = 0; s < steps; s++) {
      CW.scheduleStep(graph, mode, s, 0.02 + s * stepDur);
      if (onProgress && s % 64 === 0) { onProgress(s / steps * 0.3); await new Promise((r) => setTimeout(r, 0)); }
    }
    if (onProgress) onProgress(0.35);
    const buf = await ctx.startRendering();
    if (onProgress) onProgress(1);
    return buf;
  };
})(window.CW);
