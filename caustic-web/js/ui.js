// Caustic Web — views: header, rack, machine, mixer, song sequencer, master.
(function (CW) {
  'use strict';
  const h = CW.h;

  class UI {
    constructor(app) {
      this.app = app;
      this.root = document.getElementById('app');
      this.editor = null;
      this.meters = [];
      this.leds = new Map();
      this.litUntil = new Map();
      this.scope = null;
      this.songHead = null;
      this.build();
      requestAnimationFrame(() => this.frame());
    }

    // ------------------------------------------------------------ skeleton
    build() {
      this.header = h('header', { class: 'topbar' });
      this.rack = h('aside', { class: 'rack' });
      this.main = h('main', { class: 'main' });
      this.root.replaceChildren(this.header, h('div', { class: 'body' }, this.rack, this.main));
      this.renderHeader();
    }

    renderAll() { this.renderHeader(); this.renderRack(); this.renderView(); }

    renderHeader() {
      const app = this.app, song = app.song, eng = app.engine;
      const playBtn = h('button', { class: 'tbtn play' + (eng.playing ? ' on' : ''), title: 'Play / Stop (Space)', onclick: () => app.togglePlay() }, eng.playing ? '■' : '▶');
      const recBtn = h('button', { class: 'tbtn rec' + (app.rec ? ' on' : ''), title: 'Record keyboard notes into the pattern while playing', onclick: () => { app.rec = !app.rec; this.renderHeader(); } }, '●');
      const bpm = h('input', { class: 'lcd-input', type: 'number', min: 40, max: 250, step: 1, value: song ? song.bpm : 120,
        onchange: (e) => app.setBpm(+e.target.value) });
      const bpmBox = h('div', { class: 'lcd-box' }, h('span', { class: 'lcd-label' }, 'BPM'), bpm);
      bpmBox.addEventListener('wheel', (e) => { e.preventDefault(); app.setBpm(song.bpm + (e.deltaY < 0 ? 1 : -1)); bpm.value = song.bpm; }, { passive: false });
      const swing = song ? CW.knob({ id: 'swing', label: 'Swing', min: 0, max: 0.6, def: 0, unit: '%' }, () => song.swing, (v) => { song.swing = v; }, { size: 30, cls: 'mini', onEnd: () => app.commit() }) : '';
      const mode = h('div', { class: 'seg-row mode' },
        h('button', { class: 'seg' + (eng.mode === 'pattern' ? ' on' : ''), onclick: () => app.setMode('pattern') }, 'PATTERN'),
        h('button', { class: 'seg' + (eng.mode === 'song' ? ' on' : ''), onclick: () => app.setMode('song') }, 'SONG'));
      const tab = (id, label) => h('button', { class: 'vtab' + (app.view === id ? ' on' : ''), onclick: () => app.setView(id) }, label);
      const views = h('nav', { class: 'views' }, tab('machine', 'RACK'), tab('mixer', 'MIXER'), tab('song', 'SONG'), tab('master', 'MASTER'));
      const fileBtn = h('button', { class: 'tbtn file' }, '☰ FILE');
      fileBtn.onclick = () => CW.menu(fileBtn, [
        { label: 'New song', action: () => app.newSong() },
        { label: 'Load demo song', action: () => app.loadDemo() },
        '-',
        { label: 'Open song (.json)…', action: () => app.openFile() },
        { label: 'Save song (.json)', action: () => app.saveFile() },
        '-',
        { label: 'Export WAV — song', action: () => app.exportWav('song') },
        { label: 'Export WAV — patterns', action: () => app.exportWav('pattern') },
        '-',
        { label: 'Undo (Ctrl+Z)', action: () => app.undo() },
        { label: 'Redo (Ctrl+Y)', action: () => app.redo() },
        { label: 'Help / shortcuts', action: () => this.showHelp() },
      ]);
      const name = h('input', { class: 'song-name', value: song ? song.name : '', spellcheck: 'false', onchange: (e) => { song.name = e.target.value.toUpperCase(); e.target.value = song.name; app.commit(); } });
      this.scope = h('canvas', { class: 'mini-scope', width: 140, height: 34 });
      this.header.replaceChildren(
        h('div', { class: 'logo' }, h('b', null, 'CAUSTIC'), h('span', null, 'WEB')),
        h('div', { class: 'transport' }, playBtn, recBtn), bpmBox, swing, mode, views, h('div', { class: 'spacer' }), name, this.scope, fileBtn);
    }

    // ------------------------------------------------------------ rack sidebar
    renderRack() {
      const app = this.app, song = app.song;
      this.leds.clear();
      const tiles = song.machines.map((m, i) => {
        const def = CW.MachineTypes[m.type];
        const led = h('span', { class: 'led' });
        this.leds.set(m.id, led);
        const tile = h('div', {
          class: 'tile' + (m.id === app.selId ? ' active' : '') + (m.mix.mute ? ' muted' : ''),
          style: { '--mc': def.color },
          onclick: () => app.select(m.id),
        },
        h('div', { class: 'tile-head' }, h('span', { class: 'tile-type' }, def.short), led,
          h('span', { class: 'tile-pat' }, app.engine.mode === 'pattern' ? m.cur : '')),
        h('div', { class: 'tile-name', title: 'Double-click to rename', ondblclick: (e) => { e.stopPropagation(); this.renameMachine(m); } }, m.name),
        h('div', { class: 'tile-btns' },
          h('button', { class: 'mini-btn' + (m.mix.mute ? ' on' : ''), title: 'Mute', onclick: (e) => { e.stopPropagation(); m.mix.mute = !m.mix.mute; app.mixChanged(m); this.renderRack(); } }, 'M'),
          h('button', { class: 'mini-btn solo' + (m.mix.solo ? ' on' : ''), title: 'Solo', onclick: (e) => { e.stopPropagation(); m.mix.solo = !m.mix.solo; app.mixChanged(m); this.renderRack(); } }, 'S'),
          h('button', { class: 'mini-btn', title: 'Move up', onclick: (e) => { e.stopPropagation(); app.moveMachine(m.id, -1); } }, '▲'),
          h('button', { class: 'mini-btn', title: 'Move down', onclick: (e) => { e.stopPropagation(); app.moveMachine(m.id, 1); } }, '▼'),
          h('button', { class: 'mini-btn del', title: 'Delete machine', onclick: (e) => { e.stopPropagation(); app.removeMachine(m.id); } }, '✕')));
        return tile;
      });
      const addBtn = h('button', { class: 'tile add', disabled: song.machines.length >= CW.MAX_MACHINES }, h('span', { class: 'plus' }, '+'), h('span', null, 'ADD MACHINE'));
      addBtn.onclick = () => CW.menu(addBtn, CW.MACHINE_ORDER.map((t) => ({ label: CW.MachineTypes[t].name, color: CW.MachineTypes[t].color, action: () => app.addMachine(t) })));
      this.rack.replaceChildren(h('div', { class: 'rack-title' }, `MACHINES ${song.machines.length}/${CW.MAX_MACHINES}`), ...tiles, addBtn);
    }

    renameMachine(m) {
      const n = prompt('Machine name', m.name);
      if (n) { m.name = n.toUpperCase().slice(0, 16); this.app.commit(); this.renderRack(); if (this.app.view !== 'machine') this.renderView(); else this.renderView(); }
    }

    // ------------------------------------------------------------ main view
    renderView() {
      if (this.editor) { this.editor.destroy(); this.editor = null; }
      this.meters = [];
      this.masterScope = null;
      this.songHead = null;
      const v = this.app.view;
      if (v === 'machine') this.renderMachine();
      else if (v === 'mixer') this.renderMixer();
      else if (v === 'song') this.renderSong();
      else if (v === 'master') this.renderMaster();
    }

    panel(title, children, cls) {
      return h('section', { class: 'panel' + (cls ? ' ' + cls : '') }, h('div', { class: 'panel-title' }, title), h('div', { class: 'panel-body' }, children));
    }

    renderMachine() {
      const app = this.app, m = app.sel();
      if (!m) {
        this.main.replaceChildren(h('div', { class: 'empty' }, h('div', { class: 'empty-plus', onclick: (e) => this.rack.querySelector('.add').click() }, '+'), h('p', null, 'Add a machine from the rack to start.')));
        return;
      }
      const def = CW.MachineTypes[m.type];
      const rtm = app.engine.graph.rt(m.id);
      const tabs = h('div', { class: 'mtabs' },
        h('button', { class: 'vtab' + (app.machineTab === 'synth' ? ' on' : ''), onclick: () => { app.machineTab = 'synth'; this.renderView(); } }, def.name.toUpperCase()),
        h('button', { class: 'vtab' + (app.machineTab === 'fx' ? ' on' : ''), onclick: () => { app.machineTab = 'fx'; this.renderView(); } },
          'EFFECTS' + (m.fx.some((f) => f.type !== 'none') ? ' •' : '')));
      let top;
      if (app.machineTab === 'fx') top = this.renderFx(m, rtm);
      else top = this.renderSynth(m, def, rtm);

      // pattern toolbar
      this.patBtns = [];
      const bank = m.cur[0];
      const banks = h('div', { class: 'seg-row' }, ...'ABCD'.split('').map((b) => h('button', { class: 'seg' + (b === bank ? ' on' : ''), onclick: () => app.selectPattern(m, b + m.cur.slice(1)) }, b)));
      const nums = h('div', { class: 'patnums' });
      for (let i = 1; i <= 16; i++) {
        const id = bank + i;
        const b = h('button', { class: 'patbtn', 'data-id': id, onclick: () => app.selectPattern(m, id) }, i);
        this.patBtns.push(b); nums.append(b);
      }
      const pat = CW.ensurePattern(m, m.cur);
      const lenSel = h('select', { class: 'sel', title: 'Pattern length', onchange: (e) => app.setPatternBars(m, +e.target.value) },
        [1, 2, 4, 8].map((b) => h('option', { value: b, selected: pat.bars === b }, b + (b > 1 ? ' BARS' : ' BAR'))));
      const nlSel = h('select', { class: 'sel', title: 'New note length', onchange: (e) => { app.noteLen = +e.target.value; } },
        [[1, '1/16'], [2, '1/8'], [3, '1/8.'], [4, '1/4'], [8, '1/2'], [16, '1 BAR']].map(([v, l]) => h('option', { value: v, selected: app.noteLen === v }, 'NOTE ' + l)));
      const tools = h('div', { class: 'tools' },
        def.kind !== 'drum' ? nlSel : null,
        lenSel,
        h('button', { class: 'tool', title: 'Copy pattern', onclick: () => app.copyPattern(m) }, 'COPY'),
        h('button', { class: 'tool', title: 'Paste pattern', onclick: () => app.pastePattern(m) }, 'PASTE'),
        h('button', { class: 'tool', title: 'Clear pattern', onclick: () => app.clearPattern(m) }, 'CLEAR'),
        h('button', { class: 'tool', title: 'Duplicate content to double length', onclick: () => app.doublePattern(m) }, '×2'),
        def.kind !== 'drum' ? h('button', { class: 'tool', title: 'Transpose down (shift: octave)', onclick: (e) => app.transpose(m, e.shiftKey ? -12 : -1) }, '♭') : null,
        def.kind !== 'drum' ? h('button', { class: 'tool', title: 'Transpose up (shift: octave)', onclick: (e) => app.transpose(m, e.shiftKey ? 12 : 1) }, '♯') : null,
        h('button', { class: 'tool', title: 'Randomize pattern', onclick: () => app.randomPattern(m) }, 'DICE'));
      const hint = h('div', { class: 'hint' }, def.kind === 'drum'
        ? 'Click: toggle step · drag: paint · Shift+click: accent · wheel: velocity · right-click: erase'
        : 'Click: add note · drag: length/move · right-click: delete · wheel: velocity' + (def.kind === 'mono' ? ' · Shift: accent · Alt: slide' : ''));
      const patbar = h('div', { class: 'patbar', style: { '--mc': def.color } }, h('div', { class: 'patlabel' }, 'PATTERN ' + m.cur), banks, nums, tools);
      this.editor = new CW.PatternEditor(app, m);
      const kb = this.renderKeyboard(m, def);
      this.main.replaceChildren(h('div', { class: 'machine-view', style: { '--mc': def.color } }, tabs, top, patbar, hint, this.editor.el, kb));
      this.refreshPatternButtons();
    }

    refreshPatternButtons() {
      const m = this.app.sel(); if (!m || !this.patBtns) return;
      for (const b of this.patBtns) {
        b.classList.toggle('on', b.dataset.id === m.cur);
        b.classList.toggle('used', CW.patternUsed(m, b.dataset.id));
      }
    }

    renderSynth(m, def, rtm) {
      const app = this.app;
      const onChange = () => { rtm.paramsChanged(); };
      const onEnd = () => app.commit();
      this.synthCtrls = [];
      const groups = CW.groupParams(def.params).map((G) => {
        const ctrls = G.params.map((p) => { const c = CW.control(p, m.params, onChange, { onEnd }); this.synthCtrls.push(c); return c; });
        return this.panel(G.name, ctrls, def.kind === 'drum' ? 'drum-ch' : '');
      });
      // header strip: presets, sample loader
      const presetSel = h('select', { class: 'sel lcd', onchange: (e) => { const v = e.target.value; e.target.value = ''; if (v) app.applyPreset(m, v); } },
        h('option', { value: '' }, 'PRESETS…'),
        h('option', { value: '__init' }, '— INIT —'),
        h('option', { value: '__rand' }, '— RANDOMIZE —'),
        ...CW.presets.list(m.type).map((n) => h('option', { value: n }, n)));
      const head = h('div', { class: 'synth-head' },
        h('div', { class: 'synth-name' }, h('span', { class: 'led big' }), def.name.toUpperCase(), h('small', null, ' · ' + m.name)),
        presetSel,
        h('button', { class: 'tool', title: 'Save current sound as a user preset', onclick: () => app.savePreset(m) }, 'SAVE PRESET'),
        def.sampler ? h('button', { class: 'tool', onclick: () => app.loadSample(m) }, 'LOAD SAMPLE') : null,
        def.sampler ? h('span', { class: 'sample-name' }, m.sample ? m.sample.name : '(built-in tone)') : null);
      this.leds.set('__synth', head.querySelector('.led'));
      return h('div', { class: 'synth' }, head, h('div', { class: 'panels' + (def.kind === 'drum' ? ' drums' : '') }, groups));
    }

    renderFx(m, rtm) {
      const app = this.app;
      const slots = m.fx.map((slot, i) => {
        const typeSel = h('select', { class: 'sel lcd', onchange: (e) => { CW.setFxType(slot, e.target.value); rtm.setFx(i); app.commit(); this.renderView(); } },
          h('option', { value: 'none', selected: slot.type === 'none' }, '— EMPTY —'),
          ...CW.EFFECT_ORDER.map((t) => h('option', { value: t, selected: slot.type === t }, CW.EffectTypes[t].name.toUpperCase())));
        const byp = h('button', { class: 'tool' + (slot.bypass ? ' on' : ''), onclick: () => { slot.bypass = !slot.bypass; rtm.setFx(i); app.commit(); this.renderView(); } }, slot.bypass ? 'BYPASSED' : 'BYPASS');
        const def = CW.EffectTypes[slot.type];
        const ctrls = def ? def.params.map((p) => CW.control(p, slot.params, () => rtm.fxParamsChanged(i), { onEnd: () => app.commit() })) : [h('div', { class: 'fx-empty' }, 'Choose an effect')];
        return this.panel('FX ' + (i + 1), [h('div', { class: 'fx-head' }, typeSel, slot.type !== 'none' ? byp : null), h('div', { class: 'fx-ctrls' }, ctrls)], 'fx-slot');
      });
      return h('div', { class: 'synth' }, h('div', { class: 'synth-head' }, h('div', { class: 'synth-name' }, 'INSERT EFFECTS', h('small', null, ' · ' + m.name)), h('span', { class: 'hint' }, 'Signal: synth → FX 1 → FX 2 → mixer channel')), h('div', { class: 'panels fx' }, slots));
    }

    renderKeyboard(m, def) {
      const app = this.app;
      const wrap = h('div', { class: 'kb-wrap' });
      const oct = h('div', { class: 'kb-oct' },
        h('button', { class: 'tool', onclick: () => { app.kbOctave = Math.max(0, app.kbOctave - 1); this.renderView(); } }, 'OCT−'),
        h('span', null, def.kind === 'drum' ? 'PADS' : 'C' + (app.kbOctave + 1)),
        h('button', { class: 'tool', onclick: () => { app.kbOctave = Math.min(6, app.kbOctave + 1); this.renderView(); } }, 'OCT+'));
      const keys = h('div', { class: 'kb' + (def.kind === 'drum' ? ' pads' : '') });
      const press = (el, note) => {
        el.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          el.classList.add('down');
          const hd = app.engine.liveNoteOn(m.id, note, 0.85);
          app.recordNoteOn(m, note, hd);
          const up = () => { el.classList.remove('down'); app.engine.liveNoteOff(hd); app.recordNoteOff(note); window.removeEventListener('pointerup', up); };
          window.addEventListener('pointerup', up);
        });
      };
      if (def.kind === 'drum') {
        def.drums.forEach(([, lab], i) => { const p = h('div', { class: 'pad' }, h('b', null, i + 1), lab); press(p, i); keys.append(p); });
      } else {
        const base = (app.kbOctave + 1) * 12;
        for (let n = base; n < base + 36; n++) {
          if (CW.isBlackKey(n)) continue;
          const w = h('div', { class: 'wkey' }, n % 12 === 0 ? h('span', null, CW.noteName(n)) : null);
          press(w, n);
          if (CW.isBlackKey(n + 1) && n + 1 < base + 36) { const b = h('div', { class: 'bkey' }); press(b, n + 1); w.append(b); b.addEventListener('pointerdown', (e) => e.stopPropagation()); }
          keys.append(w);
        }
      }
      wrap.append(oct, keys);
      return wrap;
    }

    // ------------------------------------------------------------ mixer
    renderMixer() {
      const app = this.app, song = app.song;
      const P = {
        low: { id: 'low', label: 'Bass', min: -15, max: 15, def: 0, fmt: (v) => v.toFixed(1) + 'dB' },
        mid: { id: 'mid', label: 'Mid', min: -15, max: 15, def: 0, fmt: (v) => v.toFixed(1) + 'dB' },
        high: { id: 'high', label: 'High', min: -15, max: 15, def: 0, fmt: (v) => v.toFixed(1) + 'dB' },
        delay: { id: 'delay', label: 'Delay', min: 0, max: 1, def: 0, unit: '%' },
        reverb: { id: 'reverb', label: 'Reverb', min: 0, max: 1, def: 0, unit: '%' },
        pan: { id: 'pan', label: 'Pan', min: -1, max: 1, def: 0, fmt: (v) => (Math.abs(v) < 0.01 ? 'C' : v < 0 ? 'L' + Math.round(-v * 100) : 'R' + Math.round(v * 100)) },
        vol: { id: 'vol', label: 'Volume', min: 0, max: 1.2, def: 0.8, unit: '%' },
      };
      const strips = song.machines.map((m) => {
        const def = CW.MachineTypes[m.type];
        const r = app.engine.graph.rt(m.id);
        const ch = () => r.applyMix();
        const end = () => app.commit();
        const meter = h('canvas', { class: 'vu', width: 10, height: 120 });
        this.meters.push({ c: meter, an: r.meter });
        return h('div', { class: 'strip', style: { '--mc': def.color } },
          h('div', { class: 'strip-name', onclick: () => { app.select(m.id); app.setView('machine'); } }, m.name),
          CW.control(P.low, m.mix, ch, { onEnd: end, size: 32 }), CW.control(P.mid, m.mix, ch, { onEnd: end, size: 32 }), CW.control(P.high, m.mix, ch, { onEnd: end, size: 32 }),
          CW.control(P.delay, m.mix, ch, { onEnd: end, size: 32, cls: 'k-delay' }), CW.control(P.reverb, m.mix, ch, { onEnd: end, size: 32, cls: 'k-reverb' }), CW.control(P.pan, m.mix, ch, { onEnd: end, size: 32, cls: 'k-pan' }),
          h('div', { class: 'fader-row' }, CW.vslider(P.vol, () => m.mix.vol, (v) => { m.mix.vol = v; ch(); }, { onEnd: end, height: 120 }), meter),
          h('div', { class: 'strip-btns' },
            h('button', { class: 'mini-btn' + (m.mix.mute ? ' on' : ''), onclick: () => { m.mix.mute = !m.mix.mute; app.mixChanged(m); this.renderView(); this.renderRack(); } }, 'M'),
            h('button', { class: 'mini-btn solo' + (m.mix.solo ? ' on' : ''), onclick: () => { m.mix.solo = !m.mix.solo; app.mixChanged(m); this.renderView(); this.renderRack(); } }, 'S')));
      });
      const M = song.master, mr = () => app.engine.graph.master.apply(), me = () => app.commit();
      const mmeter = h('canvas', { class: 'vu', width: 10, height: 120 });
      this.meters.push({ c: mmeter, an: app.engine.graph.master.analyser });
      const master = h('div', { class: 'strip master-strip' },
        h('div', { class: 'strip-name' }, 'MASTER'),
        CW.control({ id: 'delayRet', label: 'Delay Ret', min: 0, max: 1.5, def: 0.8, unit: '%' }, M, mr, { onEnd: me, size: 32, cls: 'k-delay' }),
        CW.control({ id: 'reverbRet', label: 'Verb Ret', min: 0, max: 1.5, def: 0.9, unit: '%' }, M, mr, { onEnd: me, size: 32, cls: 'k-reverb' }),
        h('div', { class: 'fader-row' }, CW.vslider({ id: 'vol', label: 'Master', min: 0, max: 1.2, def: 0.85, unit: '%' }, () => M.vol, (v) => { M.vol = v; mr(); }, { onEnd: me, height: 120 }), mmeter));
      this.main.replaceChildren(h('div', { class: 'mixer-view' }, song.machines.length ? strips : h('div', { class: 'empty' }, 'No machines yet.'), master));
    }

    // ------------------------------------------------------------ song sequencer
    renderSong() {
      const app = this.app, song = app.song;
      const CWID = 30;
      const len = CW.songLengthBars(song);
      const bars = Math.max(32, Math.ceil((len + 8) / 8) * 8);
      const ruler = h('div', { class: 'ruler', style: { width: bars * CWID + 'px' } });
      for (let b = 0; b < bars; b++) ruler.append(h('div', { class: 'rbar' + (b % 4 === 0 ? ' major' : ''), style: { left: b * CWID + 'px', width: CWID + 'px' } }, b % 4 === 0 ? b + 1 : ''));
      const loop = song.loop;
      if (loop.on) ruler.append(h('div', { class: 'loop-region', style: { left: loop.start * CWID + 'px', width: (loop.end - loop.start) * CWID + 'px' } }));
      ruler.title = 'Click: set loop start · Shift+click: set loop end';
      ruler.addEventListener('pointerdown', (e) => {
        const r = ruler.getBoundingClientRect(), b = CW.clamp(Math.floor((e.clientX - r.left) / CWID), 0, bars - 1);
        if (e.shiftKey) { loop.end = Math.max(loop.start + 1, b + 1); } else { loop.start = b; if (loop.end <= b) loop.end = b + 4; }
        loop.on = true; app.commit(); this.renderView();
      });
      const names = h('div', { class: 'song-names' }, h('div', { class: 'song-corner' }, 'MACHINE / BRUSH'));
      const rows = h('div', { class: 'song-rows', style: { width: bars * CWID + 'px' } });
      song.machines.forEach((m) => {
        const def = CW.MachineTypes[m.type];
        const brush = h('select', { class: 'sel brush', title: 'Pattern placed when you click', onchange: (e) => { app.selectPattern(m, e.target.value, true); } },
          CW.PATTERN_IDS.filter((id) => CW.patternUsed(m, id) || id === m.cur).map((id) => h('option', { value: id, selected: id === m.cur }, id)));
        names.append(h('div', { class: 'song-name-cell', style: { '--mc': def.color } }, h('span', { onclick: () => { app.select(m.id); app.setView('machine'); } }, m.name), brush));
        const row = h('div', { class: 'song-row', style: { '--mc': def.color } });
        for (let b = 0; b < bars; b += 4) row.append(h('div', { class: 'song-grid4', style: { left: b * CWID + 'px', width: 4 * CWID + 'px' } }));
        for (const e of song.seq[m.id] || []) {
          row.append(h('div', { class: 'song-entry', 'data-bar': e.bar, style: { left: e.bar * CWID + 1 + 'px', width: e.len * CWID - 2 + 'px' }, title: e.pat + ' — click to remove, Alt+click to edit' }, e.pat));
        }
        row.addEventListener('pointerdown', (ev) => {
          const r = row.getBoundingClientRect(), bar = Math.floor((ev.clientX - r.left) / CWID);
          const entryEl = ev.target.closest('.song-entry');
          if (entryEl) {
            const e = (song.seq[m.id] || []).find((x) => x.bar === +entryEl.dataset.bar);
            if (ev.altKey && e) { app.select(m.id); m.cur = e.pat; app.setView('machine'); return; }
            app.removeSongEntry(m, +entryEl.dataset.bar);
          } else app.placeSongEntry(m, bar);
          this.renderView();
        });
        rows.append(row);
      });
      this.songHead = h('div', { class: 'song-head' });
      rows.append(this.songHead);
      this.songCW = CWID;
      const toolbar = h('div', { class: 'song-toolbar' },
        h('button', { class: 'tool' + (loop.on ? ' on' : ''), onclick: () => { loop.on = !loop.on; app.commit(); this.renderView(); } }, loop.on ? `LOOP ${loop.start + 1}–${loop.end}` : 'LOOP OFF'),
        h('span', { class: 'hint' }, `Song length: ${len} bars · click a cell to place the row's brush pattern, click a block to remove it`),
        h('div', { class: 'spacer' }),
        h('button', { class: 'tool', onclick: () => { if (confirm('Clear the whole arrangement?')) { song.seq = {}; app.commit(); this.renderView(); } } }, 'CLEAR SONG'));
      const scroller = h('div', { class: 'song-scroll' }, h('div', { class: 'song-grid' }, h('div', { class: 'song-right' }, ruler, rows)));
      this.main.replaceChildren(h('div', { class: 'song-view' }, toolbar, h('div', { class: 'song-wrap' }, names, scroller)));
      // keep the names column aligned with the vertical scroll
      scroller.addEventListener('scroll', () => { names.scrollTop = scroller.scrollTop; });
    }

    // ------------------------------------------------------------ master
    renderMaster() {
      const app = this.app, M = app.song.master, g = app.engine.graph.master;
      const ap = () => g.apply(), end = () => app.commit();
      const ctl = (p, obj) => CW.control(p, obj, ap, { onEnd: end });
      const dl = CW.EffectTypes.delay.params.filter((p) => p.id !== 'mix');
      const rv = CW.EffectTypes.reverb.params.filter((p) => p.id !== 'mix');
      const db = (id, label) => ({ id, label, min: -12, max: 12, def: 0, fmt: (v) => v.toFixed(1) + 'dB' });
      this.masterScope = h('canvas', { class: 'scope' });
      const limBtn = h('button', { class: 'tool' + (M.limOn ? ' on' : ''), onclick: () => { M.limOn = !M.limOn; ap(); end(); this.renderView(); } }, M.limOn ? 'ON' : 'OFF');
      this.main.replaceChildren(h('div', { class: 'master-view' },
        h('div', { class: 'panels' },
          this.panel('Master Delay', [...dl.map((p) => ctl(p, M.delay)), ctl({ id: 'delayRet', label: 'Return', min: 0, max: 1.5, def: 0.8, unit: '%' }, M)]),
          this.panel('Master Reverb', [...rv.map((p) => ctl(p, M.reverb)), ctl({ id: 'reverbRet', label: 'Return', min: 0, max: 1.5, def: 0.9, unit: '%' }, M)]),
          this.panel('Equalizer', [ctl(db('eqLow', 'Low'), M), ctl(db('eqMid', 'Mid'), M), ctl(db('eqHigh', 'High'), M)]),
          this.panel('Limiter', [h('div', { class: 'selector' }, limBtn, h('div', { class: 'knob-label' }, 'Active')), ctl({ id: 'limGain', label: 'Pre Gain', min: 0, max: 4, def: 1, fmt: (v) => v.toFixed(2) + 'x' }, M), ctl({ id: 'limThr', label: 'Ceiling', min: -24, max: 0, def: -2, fmt: (v) => v.toFixed(1) + 'dB' }, M)]),
          this.panel('Out', [ctl({ id: 'vol', label: 'Volume', min: 0, max: 1.2, def: 0.85, unit: '%' }, M)])),
        this.panel('Scope / Spectrum', [this.masterScope], 'scope-panel')));
    }

    showHelp() {
      const close = () => ov.remove();
      const ov = h('div', { class: 'modal', onclick: (e) => { if (e.target === ov) close(); } }, h('div', { class: 'modal-box' },
        h('h2', null, 'CAUSTIC WEB — QUICK GUIDE'),
        h('ul', null,
          h('li', null, h('b', null, 'Space'), ' play / stop · ', h('b', null, 'Ctrl+Z / Ctrl+Y'), ' undo / redo'),
          h('li', null, h('b', null, 'Keyboard'), ': Z S X D C V G B H N J M , (lower octave), Q 2 W 3 E R 5 T 6 Y 7 U I (upper). On BeatBox: Z X C V B N M , trigger the 8 pads.'),
          h('li', null, h('b', null, '● REC'), ': while playing, notes you play are written into the current pattern.'),
          h('li', null, h('b', null, 'Knobs'), ': drag up/down (Shift = fine), wheel, double-click resets.'),
          h('li', null, h('b', null, 'Piano roll'), ': click adds, drag sets length / moves, right-click deletes, wheel on a note sets velocity. BassLine: Shift+click accent, Alt+click slide.'),
          h('li', null, h('b', null, 'Patterns'), ': 4 banks (A–D) × 16 per machine, 1–8 bars each. In PATTERN mode each machine loops its selected pattern.'),
          h('li', null, h('b', null, 'Song'), ': pick a brush pattern per row, click cells to place it, click blocks to remove. Ruler click/Shift+click sets the loop. Switch to SONG mode to play the arrangement.'),
          h('li', null, h('b', null, 'Files'), ': songs autosave in the browser; use FILE to save/open .json and export WAV.')),
        h('button', { class: 'tool', onclick: close }, 'CLOSE')));
      document.body.append(ov);
    }

    // ------------------------------------------------------------ animation frame
    frame() {
      requestAnimationFrame(() => this.frame());
      const app = this.app, eng = app.engine;
      if (!eng.graph) return;
      const now = eng.ctx.currentTime;
      const step = eng.playing ? eng.updateVisual() : -1;
      // activity LEDs
      eng.graph.rts.forEach((r, id) => {
        while (r.hits.length && r.hits[0] <= now) { this.litUntil.set(id, r.hits.shift() + 0.09); }
        const on = (this.litUntil.get(id) || 0) > now;
        const led = this.leds.get(id); if (led) led.classList.toggle('on', on);
        if (id === app.selId) { const l2 = this.leds.get('__synth'); if (l2) l2.classList.toggle('on', on); }
      });
      // editor playhead
      if (this.editor) {
        const m = this.editor.m;
        let ps = -1;
        if (step >= 0) { const at = CW.patternAt(app.song, m, eng.mode, step); if (at && at.id === m.cur) ps = at.step; }
        this.editor.drawPlayhead(ps);
      }
      if (this.songHead) {
        this.songHead.style.display = step >= 0 && eng.mode === 'song' ? 'block' : 'none';
        if (step >= 0) this.songHead.style.left = (step / 16) * this.songCW + 'px';
      }
      // meters
      if (this.meters.length) {
        const buf = this._mbuf || (this._mbuf = new Float32Array(256));
        for (const mt of this.meters) {
          mt.an.getFloatTimeDomainData(buf);
          let pk = 0; for (let i = 0; i < buf.length; i++) pk = Math.max(pk, Math.abs(buf[i]));
          mt.peak = Math.max(pk, (mt.peak || 0) * 0.92);
          const g = mt.c.getContext('2d'), H = mt.c.height, lv = CW.clamp(mt.peak, 0, 1.2) / 1.2;
          g.fillStyle = '#111'; g.fillRect(0, 0, 10, H);
          const grd = g.createLinearGradient(0, H, 0, 0); grd.addColorStop(0, '#3c3'); grd.addColorStop(0.75, '#dd3'); grd.addColorStop(1, '#e33');
          g.fillStyle = grd; g.fillRect(1, H - lv * H, 8, lv * H);
        }
      }
      const an = eng.graph.master.analyser;
      if (this.scope) this.drawScope(this.scope, an, false);
      if (this.masterScope) this.drawScope(this.masterScope, an, true);
    }

    drawScope(c, an, big) {
      if (big) {
        const w = c.clientWidth, hh = c.clientHeight;
        if (c.width !== w || c.height !== hh) { c.width = w; c.height = hh; }
      }
      const g = c.getContext('2d'), W = c.width, H = c.height;
      const td = this._td || (this._td = new Float32Array(2048));
      an.getFloatTimeDomainData(td);
      g.fillStyle = '#0d1a10'; g.fillRect(0, 0, W, H);
      if (big) {
        const fd = this._fd || (this._fd = new Uint8Array(an.frequencyBinCount));
        an.getByteFrequencyData(fd);
        const bins = 96;
        for (let i = 0; i < bins; i++) {
          const idx = Math.min(fd.length - 1, Math.floor(2 * Math.pow(fd.length / 4, i / bins))), v = fd[idx] / 255;
          g.fillStyle = `hsla(${120 - v * 90},70%,45%,.55)`;
          g.fillRect(i * W / bins, H - v * H, W / bins - 1, v * H);
        }
      }
      let start = 0; for (let i = 1; i < 1024; i++) if (td[i - 1] < 0 && td[i] >= 0) { start = i; break; }
      g.strokeStyle = '#6f6'; g.lineWidth = big ? 2 : 1; g.beginPath();
      const n = big ? 1024 : 512;
      for (let i = 0; i < n; i++) { const x = i / n * W, y = H / 2 - td[start + i] * H * 0.45; i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
  }

  CW.UI = UI;
})(window.CW);
