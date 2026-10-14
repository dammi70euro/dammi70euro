# Caustic Web

A browser re-creation of **Caustic 3** (Single Cell Software), the rack-style music
studio: a rack of up to 14 synth machines, pattern editors, insert effects, a mixer,
a master section and a song sequencer. Built with plain HTML/CSS/JS and the Web Audio
API, with no build step and no dependencies.

## Running it

Open `index.html` directly in Chrome or Edge, or serve the folder:

```bash
python -m http.server 8765 --directory caustic-web
```

Then go to http://localhost:8765.

## What's included

| Area | Contents |
|---|---|
| Machines | SubSynth, BassLine (303 with accent/slide and distortion), BeatBox (8 synthesized drums), PadSynth (real PADsynth algorithm), 8BitSynth (pulse/NES triangle/noise, bitcrush, arpeggiator, sweep), FMSynth (3 operators, 3 algorithms), KSSynth (Karplus-Strong), Organ (9 drawbars, percussion, Leslie), SawSynth (supersaw), PCMSynth (sampler, load your own audio) |
| Effects (2 per machine) | Delay, Reverb, Chorus, Flanger, Phaser, Distortion, Bitcrusher, Compressor, Limiter, MultiFilter, AutoWah, Tremolo, AutoPan, CombFilter, Parametric EQ |
| Mixer | 3-band EQ, delay/reverb sends, pan, volume, mute/solo, VU meters |
| Master | Tempo-synced delay, reverb, 3-band EQ, limiter, scope + spectrum |
| Sequencing | 64 patterns per machine (banks A–D × 16), 1–8 bars, piano roll / step grid, velocity, accent, slide, swing, live recording from the keyboard, song arrangement with loop |
| Files | Autosave in the browser, save/open `.json` songs, export WAV (song or patterns), user presets, undo/redo |

## Shortcuts

- `Space`: play/stop. `Ctrl+Z` / `Ctrl+Y`: undo/redo. `Ctrl+S`: save the song.
- Computer keyboard as piano: `Z S X D C V G B H N J M ,` (lower octave), `Q 2 W 3 E R 5 T 6 Y 7 U I` (upper octave).
- On the BeatBox, `Z X C V B N M ,` trigger the 8 pads.
- Knobs: drag vertically (hold Shift for fine control), use the mouse wheel, or double-click to reset.

## Not included (yet)

- The Modular synth and the Vocoder.
- Importing Caustic's binary `.caustic` songs and presets.
- Automation lanes.
