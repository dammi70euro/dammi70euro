// Caustic Web — reusable UI controls.
(function (CW) {
  'use strict';

  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') for (const sk in v) { if (sk.startsWith('--')) el.style.setProperty(sk, v[sk]); else el.style[sk] = v[sk]; }
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  };
  CW.h = h;

  // shared floating value tooltip
  let tip = null;
  const showTip = (el, text) => {
    if (!tip) { tip = h('div', { class: 'value-tip' }); document.body.append(tip); }
    tip.textContent = text;
    const r = el.getBoundingClientRect();
    tip.style.left = r.left + r.width / 2 + 'px';
    tip.style.top = r.top - 6 + 'px';
    tip.style.display = 'block';
  };
  const hideTip = () => { if (tip) tip.style.display = 'none'; };

  // Knob: drag vertically, shift for fine, double click resets, wheel nudges.
  CW.knob = (p, get, set, opts) => {
    opts = opts || {};
    const size = opts.size || 40;
    const ring = h('div', { class: 'knob-ring', style: { width: size + 'px', height: size + 'px' } });
    const cap = h('div', { class: 'knob-cap' }, h('div', { class: 'knob-ind' }));
    ring.append(cap);
    const label = h('div', { class: 'knob-label' }, p.label);
    const el = h('div', { class: 'knob' + (opts.cls ? ' ' + opts.cls : ''), title: p.label }, ring, label);
    const draw = () => {
      const n = CW.clamp(CW.paramToNorm(p, get()), 0, 1);
      const deg = -135 + n * 270;
      cap.style.transform = `rotate(${deg}deg)`;
      const bipolar = p.min < 0 && p.max > 0;
      if (bipolar) {
        const z = CW.paramToNorm(p, 0), a = Math.min(z, n) * 270, b = Math.max(z, n) * 270;
        ring.style.background = `conic-gradient(from -135deg, transparent 0deg ${a}deg, var(--accent) ${a}deg ${b}deg, transparent ${b}deg 270deg, transparent 270deg)`;
      } else {
        ring.style.background = `conic-gradient(from -135deg, var(--accent) 0deg ${n * 270}deg, var(--knob-track) ${n * 270}deg 270deg, transparent 270deg)`;
      }
    };
    const apply = (v) => { set(v); draw(); showTip(ring, CW.fmtParam(p, get())); };
    let startY = 0, startN = 0, dragging = false;
    ring.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      ring.setPointerCapture(e.pointerId);
      dragging = true; startY = e.clientY; startN = CW.paramToNorm(p, get());
      showTip(ring, CW.fmtParam(p, get()));
    });
    ring.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const d = (startY - e.clientY) / (e.shiftKey ? 600 : 160);
      apply(CW.normToParam(p, startN + d));
    });
    const end = () => { if (dragging) { dragging = false; hideTip(); if (opts.onEnd) opts.onEnd(); } };
    ring.addEventListener('pointerup', end);
    ring.addEventListener('pointercancel', end);
    ring.addEventListener('dblclick', () => { apply(p.def); hideTip(); if (opts.onEnd) opts.onEnd(); });
    ring.addEventListener('wheel', (e) => {
      e.preventDefault();
      const stepN = p.step ? p.step / (p.max - p.min) : 0.01;
      apply(CW.normToParam(p, CW.paramToNorm(p, get()) + (e.deltaY < 0 ? 1 : -1) * Math.max(stepN, e.shiftKey ? 0.002 : 0.01)));
      clearTimeout(ring._t); ring._t = setTimeout(() => { hideTip(); if (opts.onEnd) opts.onEnd(); }, 600);
    }, { passive: false });
    ring.addEventListener('pointerenter', () => { if (!dragging) showTip(ring, CW.fmtParam(p, get())); });
    ring.addEventListener('pointerleave', () => { if (!dragging) hideTip(); });
    el.refresh = draw;
    draw();
    return el;
  };

  // Selector: LCD-like segmented buttons for discrete choices.
  CW.selector = (p, get, set, opts) => {
    opts = opts || {};
    const btns = p.options.map(([v, lab]) => h('button', { class: 'seg', 'data-v': v, onclick: () => { set(v); draw(); if (opts.onEnd) opts.onEnd(); } }, lab));
    const el = h('div', { class: 'selector' }, h('div', { class: 'seg-row' }, btns), h('div', { class: 'knob-label' }, p.label));
    const draw = () => btns.forEach((b) => b.classList.toggle('on', b.dataset.v === String(get())));
    el.refresh = draw;
    draw();
    return el;
  };

  // Vertical slider (drawbars, faders)
  CW.vslider = (p, get, set, opts) => {
    opts = opts || {};
    const thumb = h('div', { class: 'vs-thumb' });
    const fill = h('div', { class: 'vs-fill' });
    const track = h('div', { class: 'vs-track', style: { height: (opts.height || 110) + 'px' } }, fill, thumb);
    const el = h('div', { class: 'vslider' + (opts.cls ? ' ' + opts.cls : '') }, track, h('div', { class: 'knob-label' }, p.label));
    const draw = () => {
      const n = CW.clamp(CW.paramToNorm(p, get()), 0, 1);
      thumb.style.bottom = `calc(${n * 100}% - ${n * 14}px)`;
      fill.style.height = n * 100 + '%';
    };
    const fromEvent = (e) => {
      const r = track.getBoundingClientRect();
      set(CW.normToParam(p, 1 - (e.clientY - r.top - 7) / (r.height - 14)));
      draw(); showTip(track, CW.fmtParam(p, get()));
    };
    let drag = false;
    track.addEventListener('pointerdown', (e) => { drag = true; track.setPointerCapture(e.pointerId); fromEvent(e); });
    track.addEventListener('pointermove', (e) => { if (drag) fromEvent(e); });
    track.addEventListener('pointerup', () => { drag = false; hideTip(); if (opts.onEnd) opts.onEnd(); });
    track.addEventListener('dblclick', () => { set(p.def); draw(); if (opts.onEnd) opts.onEnd(); });
    el.refresh = draw;
    draw();
    return el;
  };

  // Builds the right control for a param spec bound to an object.
  CW.control = (p, obj, onChange, opts) => {
    const get = () => obj[p.id];
    const set = (v) => { obj[p.id] = v; onChange(p.id, v); };
    if (p.type === 'select') return CW.selector(p, get, set, opts);
    if (p.slider) return CW.vslider(p, get, set, opts);
    return CW.knob(p, get, set, opts);
  };

  // Group params by their `group` field preserving order.
  CW.groupParams = (params) => {
    const groups = [];
    for (const p of params) {
      const g = p.group || 'Main';
      let G = groups.find((x) => x.name === g);
      if (!G) { G = { name: g, params: [] }; groups.push(G); }
      G.params.push(p);
    }
    return groups;
  };

  CW.toast = (msg, ms) => {
    const t = h('div', { class: 'toast' }, msg);
    document.body.append(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms || 2200);
  };

  CW.menu = (anchor, items) => {
    document.querySelectorAll('.popup-menu').forEach((m) => m.remove());
    const r = anchor.getBoundingClientRect();
    const m = h('div', { class: 'popup-menu', style: { left: r.left + 'px', top: r.bottom + 4 + 'px' } },
      items.map((it) => it === '-' ? h('div', { class: 'menu-sep' }) : h('div', { class: 'menu-item', onclick: () => { m.remove(); it.action(); } },
        it.color ? h('span', { class: 'menu-swatch', style: { background: it.color } }) : null, it.label)));
    document.body.append(m);
    const mr = m.getBoundingClientRect();
    if (mr.bottom > window.innerHeight) m.style.top = Math.max(4, r.top - mr.height - 4) + 'px';
    if (mr.right > window.innerWidth) m.style.left = Math.max(4, window.innerWidth - mr.width - 4) + 'px';
    setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('pointerdown', off); } }), 0);
  };
})(window.CW);
