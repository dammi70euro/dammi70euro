// Caustic Web — pattern editor (piano roll for synths, step grid for BeatBox).
(function (CW) {
  'use strict';
  const h = CW.h;

  const LOW = 24, HIGH = 96; // C1..C7

  class PatternEditor {
    constructor(app, m) {
      this.app = app; this.m = m;
      this.def = CW.MachineTypes[m.type];
      this.drum = this.def.kind === 'drum';
      this.rowH = this.drum ? 28 : 14;
      this.rows = this.drum ? 8 : HIGH - LOW + 1;
      this.keysW = this.drum ? 78 : 46;
      this.keys = h('canvas', { class: 'pe-keys' });
      this.grid = h('canvas', { class: 'pe-grid' });
      this.over = h('canvas', { class: 'pe-over' });
      const gridWrap = h('div', { class: 'pe-gridwrap' }, this.grid, this.over);
      this.inner = h('div', { class: 'pe-inner' }, this.keys, gridWrap);
      this.el = h('div', { class: 'pe-scroll' + (this.drum ? ' drum' : '') }, this.inner);
      this.gridWrap = gridWrap;
      this.lastPlay = -2;
      this._bind();
      this.ro = new ResizeObserver(() => this.layout());
      this.ro.observe(this.el);
      requestAnimationFrame(() => {
        this.layout();
        if (!this.drum) {
          // centre the view on the pattern's notes, or around C4 when empty
          const ns = this.pat.notes;
          const mid = ns.length ? ns.reduce((a, n) => a + n.n, 0) / ns.length : 60;
          this.el.scrollTop = (HIGH - mid) * this.rowH - this.el.clientHeight / 2;
        }
      });
    }
    get pat() { return CW.ensurePattern(this.m, this.m.cur); }
    get steps() { return CW.patternSteps(this.pat); }
    rowToNote(r) { return this.drum ? r : HIGH - r; }
    noteToRow(n) { return this.drum ? n : HIGH - n; }

    layout() {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(200, this.el.clientWidth - this.keysW - (this.el.offsetWidth - this.el.clientWidth));
      const H = this.rows * this.rowH;
      this.colW = w / this.steps;
      this.W = w; this.H = H;
      for (const [c, cw] of [[this.keys, this.keysW], [this.grid, w], [this.over, w]]) {
        c.width = cw * dpr; c.height = H * dpr; c.style.width = cw + 'px'; c.style.height = H + 'px';
        c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      this.drawKeys(); this.draw(); this.drawPlayhead(this.lastPlay, true);
    }

    drawKeys() {
      const g = this.keys.getContext('2d'), W = this.keysW, rh = this.rowH;
      g.clearRect(0, 0, W, this.H);
      g.font = '10px "Share Tech Mono", monospace';
      for (let r = 0; r < this.rows; r++) {
        const y = r * rh;
        if (this.drum) {
          g.fillStyle = r % 2 ? '#2b2d31' : '#313338'; g.fillRect(0, y, W, rh);
          g.fillStyle = '#d8d8d8'; g.fillText((r + 1) + ' ' + this.def.drums[r][1], 6, y + rh / 2 + 4);
        } else {
          const n = this.rowToNote(r), black = CW.isBlackKey(n);
          g.fillStyle = black ? '#1b1c1f' : '#e9e9e4'; g.fillRect(0, y, W, rh);
          g.fillStyle = '#888'; g.fillRect(0, y + rh - 1, W, 1);
          if (n % 12 === 0) { g.fillStyle = '#333'; g.fillText(CW.noteName(n), W - 26, y + rh - 3); }
        }
      }
    }

    draw() {
      const g = this.grid.getContext('2d'), cw = this.colW, rh = this.rowH, W = this.W, H = this.H;
      g.clearRect(0, 0, W, H);
      for (let r = 0; r < this.rows; r++) {
        const n = this.rowToNote(r);
        g.fillStyle = this.drum ? (r % 2 ? '#24262a' : '#292b30') : (CW.isBlackKey(n) ? '#1f2024' : '#292b30');
        g.fillRect(0, r * rh, W, rh);
        g.fillStyle = '#1a1b1e'; g.fillRect(0, r * rh + rh - 1, W, 1);
      }
      for (let s = 0; s <= this.steps; s++) {
        g.fillStyle = s % 16 === 0 ? '#6a6d75' : s % 4 === 0 ? '#44474e' : '#303237';
        g.fillRect(Math.round(s * cw), 0, 1, H);
      }
      const color = this.def.color;
      const notes = this.pat.notes;
      for (const n of notes) {
        const r = this.noteToRow(n.n);
        if (r < 0 || r >= this.rows) continue;
        const x = n.s * cw + 1, y = r * rh + 1, w = Math.max(3, n.l * cw - 2), hh = rh - 3;
        g.globalAlpha = 0.45 + 0.55 * (n.v == null ? 0.8 : n.v);
        g.fillStyle = color; g.fillRect(x, y, w, hh);
        g.globalAlpha = 1;
        g.strokeStyle = n.a ? '#fff' : 'rgba(0,0,0,.55)'; g.lineWidth = n.a ? 2 : 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, hh - 1);
        if (n.a || n.sl) {
          g.fillStyle = '#111'; g.font = 'bold 9px sans-serif';
          g.fillText((n.a ? 'A' : '') + (n.sl ? '~' : ''), x + 3, y + hh - 3);
        }
        if (n.sl) { g.strokeStyle = '#fff8'; g.beginPath(); g.moveTo(x - 4, y + hh / 2); g.lineTo(x + 2, y + hh / 2); g.stroke(); }
      }
    }

    drawPlayhead(step, force) {
      if (!force && step === this.lastPlay) return;
      this.lastPlay = step;
      const g = this.over.getContext('2d');
      g.clearRect(0, 0, this.W, this.H);
      if (step < 0) return;
      g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(step * this.colW, 0, this.colW, this.H);
      g.fillStyle = 'rgba(255,200,80,.9)'; g.fillRect(step * this.colW, 0, 2, this.H);
    }

    hitTest(e) {
      const r = this.grid.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const step = CW.clamp(Math.floor(x / this.colW), 0, this.steps - 1);
      const row = CW.clamp(Math.floor(y / this.rowH), 0, this.rows - 1);
      const note = this.rowToNote(row);
      const hit = this.pat.notes.find((n) => n.n === note && step >= n.s && step < n.s + n.l);
      return { x, y, step, note, hit };
    }

    audition(note, vel) {
      const hd = this.app.engine.liveNoteOn(this.m.id, note, vel);
      setTimeout(() => this.app.engine.liveNoteOff(hd), 160);
    }

    _bind() {
      const ov = this.over;
      let drag = null;
      ov.addEventListener('contextmenu', (e) => e.preventDefault());
      ov.addEventListener('pointerdown', (e) => {
        const t = this.hitTest(e), notes = this.pat.notes;
        ov.setPointerCapture(e.pointerId);
        if (e.button === 2 || e.ctrlKey || e.metaKey) {
          if (t.hit) { notes.splice(notes.indexOf(t.hit), 1); this.draw(); this.app.commit(); }
          drag = { mode: 'erase' };
          return;
        }
        if (this.drum) {
          if (t.hit && !e.shiftKey) { notes.splice(notes.indexOf(t.hit), 1); drag = { mode: 'erase' }; }
          else if (t.hit && e.shiftKey) { t.hit.v = t.hit.v >= 0.95 ? 0.6 : 1; drag = null; }
          else { notes.push({ s: t.step, n: t.note, l: 1, v: e.shiftKey ? 1 : 0.75 }); this.audition(t.note, e.shiftKey ? 1 : 0.75); drag = { mode: 'paint', v: e.shiftKey ? 1 : 0.75 }; }
          this.draw();
          return;
        }
        if (t.hit) {
          if (e.shiftKey) { t.hit.a = t.hit.a ? 0 : 1; this.draw(); this.app.commit(); drag = null; return; }
          if (e.altKey) { t.hit.sl = t.hit.sl ? 0 : 1; this.draw(); this.app.commit(); drag = null; return; }
          const edge = t.x > (t.hit.s + t.hit.l) * this.colW - Math.min(8, this.colW * 0.4);
          drag = edge ? { mode: 'resize', n: t.hit } : { mode: 'move', n: t.hit, off: t.step - t.hit.s, lastNote: t.hit.n };
          this.audition(t.hit.n, t.hit.v);
        } else {
          const len = Math.min(this.app.noteLen, this.steps - t.step);
          const n = { s: t.step, n: t.note, l: len, v: 0.8 };
          notes.push(n);
          drag = { mode: 'resize', n, fresh: true };
          this.audition(t.note, 0.8);
          this.draw();
        }
      });
      ov.addEventListener('pointermove', (e) => {
        const t = this.hitTest(e);
        ov.style.cursor = !this.drum && t.hit && t.x > (t.hit.s + t.hit.l) * this.colW - Math.min(8, this.colW * 0.4) ? 'ew-resize' : t.hit ? 'grab' : 'crosshair';
        if (!drag) return;
        const notes = this.pat.notes;
        if (drag.mode === 'erase') {
          if (t.hit) { notes.splice(notes.indexOf(t.hit), 1); this.draw(); }
        } else if (drag.mode === 'paint') {
          if (!t.hit) { notes.push({ s: t.step, n: t.note, l: 1, v: drag.v }); this.draw(); }
        } else if (drag.mode === 'resize') {
          const l = CW.clamp(t.step - drag.n.s + 1, 1, this.steps - drag.n.s);
          if (l !== drag.n.l) { drag.n.l = l; this.draw(); }
        } else if (drag.mode === 'move') {
          const s = CW.clamp(t.step - drag.off, 0, this.steps - drag.n.l);
          if (s !== drag.n.s || t.note !== drag.n.n) {
            drag.n.s = s; drag.n.n = t.note; this.draw();
            if (t.note !== drag.lastNote) { drag.lastNote = t.note; this.audition(t.note, drag.n.v); }
          }
        }
      });
      const end = () => { if (drag) { drag = null; this.app.commit(); this.app.ui.refreshPatternButtons(); } };
      ov.addEventListener('pointerup', end);
      ov.addEventListener('pointercancel', end);
      ov.addEventListener('wheel', (e) => {
        const t = this.hitTest(e);
        if (!t.hit) return;
        e.preventDefault();
        t.hit.v = CW.clamp((t.hit.v == null ? 0.8 : t.hit.v) + (e.deltaY < 0 ? 0.05 : -0.05), 0.05, 1);
        this.draw();
        CW.toast('Velocity ' + Math.round(t.hit.v * 100) + '%', 600);
        clearTimeout(this._wt); this._wt = setTimeout(() => this.app.commit(), 400);
      }, { passive: false });
      // keys column auditions notes
      this.keys.addEventListener('pointerdown', (e) => {
        const r = this.keys.getBoundingClientRect();
        const note = this.rowToNote(CW.clamp(Math.floor((e.clientY - r.top) / this.rowH), 0, this.rows - 1));
        const hd = this.app.engine.liveNoteOn(this.m.id, note, 0.85);
        const up = () => { this.app.engine.liveNoteOff(hd); window.removeEventListener('pointerup', up); };
        window.addEventListener('pointerup', up);
      });
    }

    destroy() { this.ro.disconnect(); }
  }

  CW.PatternEditor = PatternEditor;
})(window.CW);
