// Caustic Web — application state and actions.
(function (CW) {
  'use strict';

  const AUTOSAVE_KEY = 'causticweb.autosave';

  const PIANO_KEYS = { z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11, ',': 12,
    q: 12, 2: 13, w: 14, 3: 15, e: 16, r: 17, 5: 18, t: 19, 6: 20, y: 21, 7: 22, u: 23, i: 24 };
  const PAD_KEYS = { z: 0, x: 1, c: 2, v: 3, b: 4, n: 5, m: 6, ',': 7 };

  const app = {
    engine: null, ui: null, song: null, history: new CW.History(),
    selId: null, view: 'machine', machineTab: 'synth',
    noteLen: 1, kbOctave: 3, rec: false, clipboard: null,
    heldKeys: new Map(), recNotes: new Map(),

    sel() { return this.song.machines.find((m) => m.id === this.selId) || null; },

    // ---------------------------------------------------------- persistence
    commit() {
      this.history.commit(this.song);
      clearTimeout(this._saveT);
      this._saveT = setTimeout(() => {
        if (!CW.ls.set(AUTOSAVE_KEY, JSON.stringify(this.song))) console.warn('autosave failed (storage full?)');
      }, 500);
    },
    async loadSong(song, keepView) {
      const wasPlaying = this.engine.playing;
      if (wasPlaying) this.engine.stop();
      song = CW.normalizeSong(song);
      await CW.decodeSamples(song, this.engine.ctx);
      this.song = song;
      this.engine.load(song);
      if (!keepView) { this.history.reset(song); this.selId = song.machines[0] ? song.machines[0].id : null; }
      else if (!this.sel()) this.selId = song.machines[0] ? song.machines[0].id : null;
      this.ui.renderAll();
      if (wasPlaying) this.engine.play();
      CW.ls.set(AUTOSAVE_KEY, JSON.stringify(this.song));
    },
    newSong() { if (confirm('Start a new empty song? Unsaved changes in the current song will be lost.')) this.loadSong(CW.newSong()); },
    loadDemo() { this.loadSong(CW.demoSong()); CW.toast('Demo song loaded — press Space'); },
    saveFile() {
      const blob = new Blob([JSON.stringify(this.song)], { type: 'application/json' });
      CW.download(blob, (this.song.name || 'song').replace(/[^\w\- ]+/g, '_') + '.caustic.json');
    },
    openFile() {
      const inp = CW.h('input', { type: 'file', accept: '.json,application/json' });
      inp.onchange = async () => {
        const f = inp.files[0]; if (!f) return;
        try { await this.loadSong(JSON.parse(await f.text())); CW.toast('Loaded ' + f.name); }
        catch (e) { alert('Could not open this file: ' + e.message); }
      };
      inp.click();
    },
    async exportWav(mode) {
      if (mode === 'song' && !CW.songLengthBars(this.song)) { alert('The song arrangement is empty. Place patterns in the SONG view first, or export patterns.'); return; }
      const ov = CW.h('div', { class: 'modal' }, CW.h('div', { class: 'modal-box' }, CW.h('h2', null, 'RENDERING…'), CW.h('div', { class: 'progress' }, CW.h('div', { class: 'progress-bar' }))));
      document.body.append(ov);
      const bar = ov.querySelector('.progress-bar');
      try {
        const buf = await CW.renderOffline(CW.deepCopy(this.song), mode, (p) => { bar.style.width = Math.round(p * 100) + '%'; });
        CW.download(CW.encodeWav(buf), (this.song.name || 'song').replace(/[^\w\- ]+/g, '_') + (mode === 'song' ? '' : '_patterns') + '.wav');
        CW.toast('WAV exported (' + buf.duration.toFixed(1) + 's)');
      } catch (e) { console.error(e); alert('Export failed: ' + e.message); }
      ov.remove();
    },
    undo() { const s = this.history.undo(); if (s) this.loadSong(s, true); },
    redo() { const s = this.history.redo(); if (s) this.loadSong(s, true); },

    // ---------------------------------------------------------- transport
    togglePlay() {
      if (this.engine.playing) this.engine.stop();
      else {
        const loop = this.song.loop;
        this.engine.play(this.engine.mode === 'song' && loop.on ? loop.start * 16 : 0);
      }
      this.ui.renderHeader();
    },
    setMode(mode) {
      const was = this.engine.playing;
      if (was) this.engine.stop();
      this.engine.mode = mode;
      if (was) this.togglePlay();
      this.ui.renderHeader(); this.ui.renderRack();
    },
    setBpm(v) {
      this.song.bpm = CW.clamp(Math.round(v) || 120, 40, 250);
      this.engine.graph.bpmChanged();
      clearTimeout(this._bpmT); this._bpmT = setTimeout(() => this.commit(), 400);
    },
    setView(v) { this.view = v; this.ui.renderHeader(); this.ui.renderView(); },

    // ---------------------------------------------------------- machines
    select(id) { this.selId = id; this.ui.renderRack(); if (this.view !== 'machine') this.setView('machine'); else this.ui.renderView(); },
    addMachine(type) {
      if (this.song.machines.length >= CW.MAX_MACHINES) return;
      const count = this.song.machines.filter((m) => m.type === type).length;
      const m = CW.newMachine(type, CW.MachineTypes[type].name.toUpperCase() + (count ? ' ' + (count + 1) : ''));
      this.song.machines.push(m);
      this.engine.graph.addMachine(m);
      this.selId = m.id; this.machineTab = 'synth';
      this.commit();
      this.ui.renderRack(); this.setView('machine');
    },
    removeMachine(id) {
      const m = this.song.machines.find((x) => x.id === id);
      if (!m || !confirm('Delete ' + m.name + ' and its patterns?')) return;
      this.song.machines = this.song.machines.filter((x) => x.id !== id);
      delete this.song.seq[id];
      this.engine.graph.removeMachine(id);
      if (this.selId === id) this.selId = this.song.machines[0] ? this.song.machines[0].id : null;
      this.commit();
      this.ui.renderRack(); this.ui.renderView();
    },
    moveMachine(id, dir) {
      const a = this.song.machines, i = a.findIndex((m) => m.id === id), j = i + dir;
      if (i < 0 || j < 0 || j >= a.length) return;
      [a[i], a[j]] = [a[j], a[i]];
      this.commit(); this.ui.renderRack(); if (this.view !== 'machine') this.ui.renderView();
    },
    mixChanged(m) { const r = this.engine.graph.rt(m.id); if (r) r.applyMix(); this.commit(); },

    applyPreset(m, name) {
      const def = CW.MachineTypes[m.type];
      if (name === '__init') m.params = CW.defaultsOf(def.params);
      else if (name === '__rand') {
        for (const p of def.params) {
          if (p.id === 'vol' || p.id === 'poly' || /Vol$/.test(p.id)) continue;
          if (p.type === 'select') p.options.length && (m.params[p.id] = p.options[Math.floor(Math.random() * p.options.length)][0]);
          else m.params[p.id] = CW.normToParam(p, Math.random());
        }
        // keep sounds audible: avoid closed filters and endless attacks
        if (m.params.cutoff != null) m.params.cutoff = Math.max(m.params.cutoff, 400);
        if (m.params.aA != null) m.params.aA = Math.min(m.params.aA, 0.5);
        if (m.params.aS != null) m.params.aS = Math.max(m.params.aS, 0.3);
        if (m.params.o1Wave === 'noise' && m.params.o2Wave === 'noise') m.params.o1Wave = 'sawtooth';
      } else {
        const p = CW.presets.get(m.type, name); if (!p) return;
        m.params = Object.assign(CW.defaultsOf(def.params), p);
      }
      const r = this.engine.graph.rt(m.id); r.rt.params = m.params; r.paramsChanged();
      this.commit(); this.ui.renderView();
    },
    savePreset(m) {
      const n = prompt('Preset name', m.name); if (!n) return;
      CW.presets.save(m.type, n.toUpperCase(), m.params);
      CW.toast('Preset saved: ' + n.toUpperCase()); this.ui.renderView();
    },
    loadSample(m) {
      const inp = CW.h('input', { type: 'file', accept: 'audio/*' });
      inp.onchange = async () => {
        const f = inp.files[0]; if (!f) return;
        if (f.size > 8 * 1024 * 1024) { alert('Please choose a sample smaller than 8 MB (it is stored inside the song).'); return; }
        try {
          const ab = await f.arrayBuffer();
          const b64 = CW.bufToB64(ab);
          const id = CW.uid();
          CW.sampleCache[id] = await this.engine.ctx.decodeAudioData(ab.slice(0));
          m.sample = { id, name: f.name, b64 };
          this.commit(); this.ui.renderView(); CW.toast('Sample loaded: ' + f.name);
        } catch (e) { alert('Could not decode this audio file.'); }
      };
      inp.click();
    },

    // ---------------------------------------------------------- patterns
    selectPattern(m, id, quiet) { CW.ensurePattern(m, id); m.cur = id; if (!quiet) this.ui.renderView(); this.ui.renderRack(); },
    setPatternBars(m, bars) {
      const p = CW.ensurePattern(m, m.cur);
      p.bars = bars;
      p.notes = p.notes.filter((n) => n.s < bars * 16).map((n) => Object.assign(n, { l: Math.min(n.l, bars * 16 - n.s) }));
      // keep song entries in sync with the new length
      for (const e of this.song.seq[m.id] || []) if (e.pat === m.cur) e.len = bars;
      this.fixOverlaps(m);
      this.commit(); this.ui.renderView();
    },
    copyPattern(m) { this.clipboard = { type: m.type, pat: CW.deepCopy(CW.ensurePattern(m, m.cur)) }; CW.toast('Pattern ' + m.cur + ' copied'); },
    pastePattern(m) {
      if (!this.clipboard) return CW.toast('Clipboard is empty');
      const drumSrc = CW.MachineTypes[this.clipboard.type].kind === 'drum', drumDst = CW.MachineTypes[m.type].kind === 'drum';
      if (drumSrc !== drumDst) return CW.toast('Cannot paste between drum and synth patterns');
      m.patterns[m.cur] = CW.deepCopy(this.clipboard.pat);
      this.commit(); this.ui.renderView();
    },
    clearPattern(m) { CW.ensurePattern(m, m.cur).notes = []; this.commit(); this.ui.renderView(); },
    doublePattern(m) {
      const p = CW.ensurePattern(m, m.cur);
      if (p.bars >= 8) return CW.toast('Already 8 bars');
      const L = p.bars * 16;
      p.notes = p.notes.concat(p.notes.map((n) => Object.assign({}, n, { s: n.s + L })));
      p.bars *= 2;
      for (const e of this.song.seq[m.id] || []) if (e.pat === m.cur) e.len = p.bars;
      this.fixOverlaps(m);
      this.commit(); this.ui.renderView();
    },
    transpose(m, d) { for (const n of CW.ensurePattern(m, m.cur).notes) n.n = CW.clamp(n.n + d, 0, 127); this.commit(); this.ui.renderView(); },
    randomPattern(m) {
      const p = CW.ensurePattern(m, m.cur), def = CW.MachineTypes[m.type], L = p.bars * 16;
      p.notes = [];
      if (def.kind === 'drum') {
        const dens = [0.28, 0.12, 0.45, 0.1, 0.08, 0.06, 0.06, 0.05];
        for (let s = 0; s < L; s++) {
          if (s % 4 === 0 && Math.random() < 0.8) p.notes.push({ s, n: 0, l: 1, v: 1 });
          for (let d = 1; d < 8; d++) if (Math.random() < dens[d] * (s % 2 ? 0.8 : 1.2)) p.notes.push({ s, n: d, l: 1, v: 0.5 + Math.random() * 0.5 });
        }
      } else {
        const scale = [0, 3, 5, 7, 10, 12, 15], root = def.kind === 'mono' ? 45 : 57;
        for (let s = 0; s < L;) {
          const l = def.kind === 'mono' ? 1 : [1, 2, 2, 4][Math.floor(Math.random() * 4)];
          if (Math.random() < 0.65) {
            const n = { s, n: root + scale[Math.floor(Math.random() * scale.length)], l: Math.min(l, L - s), v: 0.6 + Math.random() * 0.4 };
            if (def.kind === 'mono') { if (Math.random() < 0.3) n.a = 1; if (Math.random() < 0.2 && p.notes.length && p.notes[p.notes.length - 1].s + p.notes[p.notes.length - 1].l === s) n.sl = 1; }
            p.notes.push(n);
          }
          s += l;
        }
      }
      this.commit(); this.ui.renderView();
    },

    // ---------------------------------------------------------- song arrangement
    fixOverlaps(m) {
      const list = (this.song.seq[m.id] || []).sort((a, b) => a.bar - b.bar);
      const out = [];
      for (const e of list) { const prev = out[out.length - 1]; if (prev && prev.bar + prev.len > e.bar) prev.len = e.bar - prev.bar; if (!prev || prev.len > 0) out.push(e); }
      this.song.seq[m.id] = out.filter((e) => e.len > 0);
    },
    placeSongEntry(m, bar) {
      const pat = CW.ensurePattern(m, m.cur);
      const list = (this.song.seq[m.id] = this.song.seq[m.id] || []);
      const end = bar + pat.bars;
      this.song.seq[m.id] = list.filter((e) => e.bar + e.len <= bar || e.bar >= end);
      this.song.seq[m.id].push({ bar, pat: m.cur, len: pat.bars });
      this.song.seq[m.id].sort((a, b) => a.bar - b.bar);
      this.commit();
    },
    removeSongEntry(m, bar) {
      this.song.seq[m.id] = (this.song.seq[m.id] || []).filter((e) => e.bar !== bar);
      this.commit();
    },

    // ---------------------------------------------------------- live recording
    currentStepFor(m) {
      const eng = this.engine;
      if (!eng.playing) return null;
      let step = eng.playStep;
      const next = eng.visual[0];
      if (next && next.time - eng.ctx.currentTime < 30 / this.song.bpm / 4) step = next.step;
      if (step < 0) return null;
      const at = CW.patternAt(this.song, m, eng.mode, step);
      return at && at.id === m.cur ? { at, global: step } : null;
    },
    recordNoteOn(m, note) {
      if (!this.rec) return;
      const pos = this.currentStepFor(m); if (!pos) return;
      const pat = m.patterns[m.cur];
      const isDrum = CW.MachineTypes[m.type].kind === 'drum';
      if (pat.notes.some((n) => n.s === pos.at.step && n.n === note)) return;
      const n = { s: pos.at.step, n: note, l: 1, v: 0.8 };
      pat.notes.push(n);
      if (!isDrum) this.recNotes.set(note, { n, global: pos.global, L: CW.patternSteps(pat) });
      if (this.ui.editor) this.ui.editor.draw();
    },
    recordNoteOff(note) {
      const r = this.recNotes.get(note); if (!r) return;
      this.recNotes.delete(note);
      const pos = this.engine.playStep;
      if (pos >= 0) r.n.l = CW.clamp(pos - r.global + 1, 1, r.L - r.n.s);
      if (this.ui.editor) this.ui.editor.draw();
      this.commit(); this.ui.refreshPatternButtons();
    },

    // ---------------------------------------------------------- keyboard
    onKey(e, down) {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (down && e.code === 'Space') { e.preventDefault(); this.togglePlay(); return; }
      if (down && (e.ctrlKey || e.metaKey)) {
        if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); }
        else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); this.redo(); }
        else if (e.key === 's') { e.preventDefault(); this.saveFile(); }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const m = this.sel(); if (!m) return;
      const k = e.key.toLowerCase();
      const isDrum = CW.MachineTypes[m.type].kind === 'drum';
      const map = isDrum ? PAD_KEYS : PIANO_KEYS;
      if (!(k in map)) return;
      const note = isDrum ? map[k] : (this.kbOctave + 1) * 12 + map[k];
      if (down) {
        if (this.heldKeys.has(k)) return;
        const hd = this.engine.liveNoteOn(m.id, note, 0.85);
        this.heldKeys.set(k, { hd, note });
        this.recordNoteOn(m, note);
      } else {
        const held = this.heldKeys.get(k); if (!held) return;
        this.heldKeys.delete(k);
        this.engine.liveNoteOff(held.hd);
        this.recordNoteOff(held.note);
      }
    },

    // ---------------------------------------------------------- boot
    async init() {
      this.engine = new CW.Engine();
      this.ui = new CW.UI(this);
      app.ui = this.ui;
      window.addEventListener('keydown', (e) => this.onKey(e, true));
      window.addEventListener('keyup', (e) => this.onKey(e, false));
      window.addEventListener('blur', () => { this.heldKeys.forEach((v) => this.engine.liveNoteOff(v.hd)); this.heldKeys.clear(); });
      document.addEventListener('pointerdown', () => this.engine.resume(), { capture: true });
      let song = null;
      try { const s = CW.ls.get(AUTOSAVE_KEY); if (s) song = JSON.parse(s); } catch (e) { song = null; }
      await this.loadSong(song && song.machines && song.machines.length ? song : CW.demoSong());
    },
  };

  CW.app = app;
  window.addEventListener('DOMContentLoaded', () => app.init());
})(window.CW);
