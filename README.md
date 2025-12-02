# Piano App — MIDI Demo

This project is a small scaffold for a piano practice web app. It includes a simple Vite + React demo that connects to your MIDI keyboard using the Web MIDI API and displays an 88-key keyboard (MIDI 21–108) that lights up when you play.

Quick start (Windows `cmd.exe`):

```
cd /d e:\Projects\piano_app
npm install
npm run dev
```

Open the URL printed by Vite (usually `http://localhost:5173`) in a Chromium-based browser (Chrome/Edge). Grant MIDI access when prompted. Play notes on your MIDI keyboard — the keys should highlight.

Notes:
- The app uses the Web MIDI API — only available in secure contexts (localhost is fine) and supported in Chrome/Edge. Firefox does not support Web MIDI currently.
- If your keyboard doesn't show up, ensure it's connected, the driver is installed, and the browser has access to MIDI devices.

High-quality piano playback (notes and recommendations):

- Approach: The highest-fidelity piano on the web is usually sample-based playback with velocity layers + convolution reverb, or high-quality physical-modeling engines (e.g. Pianoteq). For a web app, a practical best-practice is:
	- Use multi-sampled piano libraries (multiple velocity layers and release samples) in uncompressed or lossless WAV at 44.1/48 kHz when possible.
	- Stream samples on demand (don't bundle 100s of MB in the initial download). Provide a manifest that maps MIDI notes and velocity layers to URLs.
	- Use the Web Audio API with an AudioContext, per-voice BufferSource + GainNodes, and an efficient voice pool for polyphony.
	- Use a convolution reverb (IR) to reproduce realistic room/recording ambience.
	- Use AudioWorklet for ultra-low-latency custom processing if you need sample-level streaming or DSP.

- Formats & size: WAV (48 kHz, 24-bit) gives the best fidelity but is large. If bandwidth/size matters, use high-bitrate compressed formats (Ogg Vorbis, AAC) and pre-decode into AudioBuffers on load. Balance file size vs decode CPU.

- Performance:
	- Pre-decode samples using `AudioContext.decodeAudioData` (or `AudioBuffer` from fetch) and reuse AudioBuffers.
	- Limit simultaneous voices by voice stealing and proper release samples.
	- Use convolution reverb sparingly — it is CPU/GC heavy for long IRs; use shorter IRs or offline-render IRs per environment.

- Licensing: High-quality samples are typically proprietary. Free options to experiment:
	- Salamander Grand (free, public domain-ish — check license): good for testing.
	- University / archive sample sets (check each license).
	- Commercial libraries (Garritan, EastWest, Keyscape, etc.) offer superior realism but require licensing.

Files added for audio engine scaffold:
- `src/audio/AudioEngine.js`: lightweight sample-based player (load manifest, play notes, sustain, reverb)
- `src/audio/sample-manifest.example.json`: example manifest showing velocity layers

Next steps you can ask me to do:
- Wire `src/midi.js` to `AudioEngine` so MIDI note-on triggers sample playback.
- Hook a small free sample pack (or a single high-quality note) into the manifest to demo realistic playback.
- Add convolution IRs and a UI for reverb/room selection.


What's next:
- Add the Chord Recognition app as a separate route/page.
- Improve keyboard rendering and responsiveness.
