// Caustic Web — song model: creation, normalisation, persistence, undo.
(function (CW) {
  'use strict';

  CW.MAX_MACHINES = 14;

  CW.newMachine = (type, name) => {
    const def = CW.MachineTypes[type];
    return {
      id: CW.uid(), type, name: name || def.name.toUpperCase(),
      params: CW.defaultsOf(def.params),
      fx: [{ type: 'none', params: {}, bypass: false }, { type: 'none', params: {}, bypass: false }],
      mix: { vol: 0.8, pan: 0, mute: false, solo: false, delay: 0, reverb: 0.08, low: 0, mid: 0, high: 0 },
      patterns: { A1: { bars: 1, notes: [] } },
      cur: 'A1',
    };
  };

  CW.newSong = () => ({
    version: 1, name: 'UNTITLED', bpm: 125, swing: 0,
    machines: [], seq: {}, loop: { on: false, start: 0, end: 4 },
    master: {
      delay: { sync: '1/8d', time: 0.3, fb: 0.45, tone: 4000, pp: 'pp' },
      reverb: { size: 2.6, damp: 0.5, pre: 0.02, lowcut: 150 },
      delayRet: 0.8, reverbRet: 0.9, eqLow: 0, eqMid: 0, eqHigh: 0,
      limOn: true, limThr: -2, limGain: 1, vol: 0.85,
    },
  });

  CW.setFxType = (slot, type) => {
    slot.type = type;
    slot.params = type === 'none' ? {} : CW.defaultsOf(CW.EffectTypes[type].params);
  };

  // Fill any missing fields so older/foreign files keep working.
  CW.normalizeSong = (s) => {
    const base = CW.newSong();
    s = Object.assign(base, s);
    s.master = Object.assign(CW.newSong().master, s.master || {});
    s.master.delay = Object.assign(CW.newSong().master.delay, s.master.delay || {});
    s.master.reverb = Object.assign(CW.newSong().master.reverb, s.master.reverb || {});
    s.loop = Object.assign({ on: false, start: 0, end: 4 }, s.loop || {});
    s.seq = s.seq || {};
    s.machines = (s.machines || []).filter((m) => CW.MachineTypes[m.type]).map((m) => {
      const fresh = CW.newMachine(m.type, m.name);
      m = Object.assign(fresh, m);
      m.params = Object.assign(CW.defaultsOf(CW.MachineTypes[m.type].params), m.params || {});
      m.mix = Object.assign(fresh.mix, m.mix || {});
      m.fx = [0, 1].map((i) => {
        const f = (m.fx && m.fx[i]) || { type: 'none' };
        if (!CW.EffectTypes[f.type]) return { type: 'none', params: {}, bypass: false };
        return { type: f.type, bypass: !!f.bypass, params: Object.assign(CW.defaultsOf(CW.EffectTypes[f.type].params), f.params || {}) };
      });
      if (!m.patterns || !Object.keys(m.patterns).length) m.patterns = { A1: { bars: 1, notes: [] } };
      if (!m.patterns[m.cur]) m.patterns[m.cur] = { bars: 1, notes: [] };
      return m;
    });
    for (const id of Object.keys(s.seq)) if (!s.machines.find((m) => m.id === id)) delete s.seq[id];
    return s;
  };

  CW.ensurePattern = (m, id) => {
    if (!m.patterns[id]) m.patterns[id] = { bars: 1, notes: [] };
    return m.patterns[id];
  };
  CW.patternUsed = (m, id) => !!(m.patterns[id] && m.patterns[id].notes.length);

  // Samples for PCMSynth are stored base64 inside the song and decoded into CW.sampleCache.
  CW.decodeSamples = async (song, ctx) => {
    for (const m of song.machines) {
      if (m.sample && m.sample.b64 && !CW.sampleCache[m.sample.id]) {
        try { CW.sampleCache[m.sample.id] = await ctx.decodeAudioData(CW.b64ToBuf(m.sample.b64)); }
        catch (e) { console.warn('sample decode failed', e); }
      }
    }
  };

  // ---------- undo (JSON snapshots) ----------
  class History {
    constructor() { this.stack = []; this.redoStack = []; this.last = null; }
    reset(song) { this.stack = []; this.redoStack = []; this.last = JSON.stringify(song); }
    commit(song) {
      const s = JSON.stringify(song);
      if (s === this.last) return;
      if (this.last) this.stack.push(this.last);
      if (this.stack.length > 80) this.stack.shift();
      this.redoStack = [];
      this.last = s;
    }
    undo() { if (!this.stack.length) return null; this.redoStack.push(this.last); this.last = this.stack.pop(); return JSON.parse(this.last); }
    redo() { if (!this.redoStack.length) return null; this.stack.push(this.last); this.last = this.redoStack.pop(); return JSON.parse(this.last); }
  }
  CW.History = History;

  // ---------- user presets (localStorage) ----------
  const PKEY = 'causticweb.presets';
  const safeLS = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  };
  CW.ls = safeLS;
  CW.presets = {
    all() { try { return JSON.parse(safeLS.get(PKEY) || '{}'); } catch (e) { return {}; } },
    list(type) { return Object.keys(this.all()[type] || {}).sort(); },
    get(type, name) { return (this.all()[type] || {})[name]; },
    save(type, name, params) { const a = this.all(); a[type] = a[type] || {}; a[type][name] = CW.deepCopy(params); safeLS.set(PKEY, JSON.stringify(a)); },
    remove(type, name) { const a = this.all(); if (a[type]) delete a[type][name]; safeLS.set(PKEY, JSON.stringify(a)); },
  };
})(window.CW);
