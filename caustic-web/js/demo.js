// Caustic Web — built-in demo song.
(function (CW) {
  'use strict';

  const N = (s, n, l, extra) => Object.assign({ s, n, l: l || 1, v: 0.8 }, extra || {});

  CW.demoSong = () => {
    const song = CW.newSong();
    song.name = 'ACID SUNRISE';
    song.bpm = 124;
    song.swing = 0.12;

    // ---- drums
    const dr = CW.newMachine('beatbox', 'DRUMS');
    const drumPat = (fn) => { const notes = []; for (let s = 0; s < 16; s++) fn(s, notes); return { bars: 1, notes }; };
    dr.patterns.A1 = drumPat((s, n) => {
      if (s % 4 === 0) n.push(N(s, 0, 1, { v: 1 }));
      if (s === 4 || s === 12) n.push(N(s, 4, 1, { v: 0.85 }));
      if (s % 4 === 2) n.push(N(s, 3, 1, { v: 0.6 }));
      else if (s % 2 === 1) n.push(N(s, 2, 1, { v: 0.45 }));
    });
    dr.patterns.A2 = drumPat((s, n) => {
      if (s % 4 === 0) n.push(N(s, 0, 1, { v: 1 }));
      if (s === 4 || s === 12) n.push(N(s, 4, 1, { v: 0.85 }));
      if (s >= 12) n.push(N(s, 1, 1, { v: 0.4 + (s - 12) * 0.15 }));
      if (s === 10) n.push(N(s, 6, 1, { v: 0.7 }));
      if (s === 11) n.push(N(s, 5, 1, { v: 0.7 }));
      if (s % 4 === 2) n.push(N(s, 3, 1, { v: 0.6 }));
    });
    dr.patterns.A3 = drumPat((s, n) => {
      if (s % 4 === 0) n.push(N(s, 0, 1, { v: 1 }));
      if (s % 2 === 1) n.push(N(s, 2, 1, { v: 0.35 }));
    });
    dr.mix.reverb = 0.05;

    // ---- acid bassline
    const bs = CW.newMachine('bassline', 'ACID');
    Object.assign(bs.params, { cutoff: 380, res: 16, envMod: 0.65, decay: 0.3, accent: 0.7, dist: 'sat', distAmt: 0.35, distPost: 0.45 });
    bs.patterns.A1 = { bars: 1, notes: [
      N(0, 45, 1, { a: 1 }), N(2, 45), N(3, 57, 1, { sl: 1 }), N(4, 45, 2),
      N(6, 48, 1, { a: 1 }), N(7, 45), N(8, 52, 1, { sl: 1 }), N(10, 45),
      N(11, 55, 1, { a: 1 }), N(12, 45), N(13, 57, 2, { sl: 1 }), N(15, 43, 1, { a: 1 }),
    ] };
    bs.fx[0] = { type: 'delay', bypass: false, params: Object.assign(CW.defaultsOf(CW.EffectTypes.delay.params), { sync: '1/8d', fb: 0.35, mix: 0.18, tone: 2500 }) };
    bs.mix.vol = 0.75;

    // ---- pad
    const pd = CW.newMachine('padsynth', 'PAD');
    Object.assign(pd.params, { harm: 28, bright: 0.45, bw: 50, aA: 0.8, aR: 2.2, cutoff: 4500, vol: 0.5 });
    const chords = [[57, 60, 64], [53, 57, 60], [48, 55, 64], [55, 59, 62]];
    pd.patterns.A1 = { bars: 4, notes: chords.flatMap((c, i) => c.map((n) => N(i * 16, n, 16, { v: 0.7 }))) };
    pd.fx[0] = { type: 'chorus', bypass: false, params: CW.defaultsOf(CW.EffectTypes.chorus.params) };
    pd.mix.reverb = 0.45; pd.mix.vol = 0.6;

    // ---- lead
    const ld = CW.newMachine('subsynth', 'LEAD');
    Object.assign(ld.params, { o1Wave: 'sawtooth', o2Wave: 'pulse25', o2Det: 9, cutoff: 1400, res: 6, fEnv: 0.55, fD: 0.18, fS: 0.15, aD: 0.25, aS: 0.3, aR: 0.2, vol: 0.45 });
    const arp = [[69, 72, 76, 72], [65, 69, 72, 69], [67, 72, 76, 72], [67, 71, 74, 79]];
    ld.patterns.A1 = { bars: 4, notes: [] };
    arp.forEach((a, bar) => { for (let s = 0; s < 16; s += 2) ld.patterns.A1.notes.push(N(bar * 16 + s, a[(s / 2) % 4], 1, { v: s % 4 ? 0.6 : 0.85 })); });
    ld.fx[0] = { type: 'delay', bypass: false, params: Object.assign(CW.defaultsOf(CW.EffectTypes.delay.params), { sync: '1/8d', fb: 0.45, mix: 0.3 }) };
    ld.mix.reverb = 0.2; ld.mix.pan = 0.2; ld.mix.vol = 0.6;

    // ---- pluck
    const pk = CW.newMachine('kssynth', 'PLUCK');
    Object.assign(pk.params, { decay: 1.4, bright: 0.7 });
    pk.patterns.A1 = { bars: 4, notes: [] };
    chords.forEach((c, bar) => [0, 3, 6, 10, 12].forEach((s, i) => pk.patterns.A1.notes.push(N(bar * 16 + s, c[i % 3] + 12, 2, { v: 0.6 + (i % 2) * 0.2 }))));
    pk.mix.pan = -0.3; pk.mix.delay = 0.25; pk.mix.reverb = 0.25; pk.mix.vol = 0.55;

    song.machines = [dr, bs, pd, ld, pk];

    // ---- arrangement (16 bars)
    const put = (m, bar, pat) => { (song.seq[m.id] = song.seq[m.id] || []).push({ bar, pat, len: m.patterns[pat].bars }); };
    for (let b = 0; b < 4; b++) put(dr, b, 'A3');
    for (let b = 4; b < 16; b++) put(dr, b, b % 4 === 3 ? 'A2' : 'A1');
    for (let b = 4; b < 16; b++) put(bs, b, 'A1');
    for (let b = 0; b < 16; b += 4) put(pd, b, 'A1');
    for (let b = 8; b < 16; b += 4) put(ld, b, 'A1');
    for (let b = 4; b < 16; b += 4) put(pk, b, 'A1');
    return song;
  };
})(window.CW);
