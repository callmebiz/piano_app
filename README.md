# Piano App — MIDI Demo

A simple piano-practice web app demonstrating Web MIDI input and chord recognition.

Overview
- Visual 88-key keyboard (MIDI notes 21–108). Keys respond to your MIDI keyboard and are clickable/touchable.
- Left-side Apps pane — currently includes the Chord Recognition app.
- Chord Recognition shows a single prominent match (short name and long description), a fixed grid of chord intervals and which tones are present, and up to five alternative interpretations.
- Light / Dark theme toggle and a resizable, docked piano panel.

Quick start
1. Open a terminal in the project folder:

```cmd
cd /d e:\Projects\piano_app
```
2. Install dependencies and run the dev server:

```cmd
npm install
npm run dev
```
3. Open the local URL printed by Vite (usually `http://localhost:5173`) in Chrome or Edge and allow MIDI access when prompted.

Notes
- The app is intended as a UI-focused demo. It does not include a built-in piano sample library — audio playback is not provided by default.
- Chord recognition is interval-based and prioritizes matches that include all pressed notes, falling back to the best partial matches.
- If your MIDI device does not appear, check the connection and browser permissions.

If you want help expanding the app (audio playback, more apps, animations, or accessibility improvements), tell me what you'd like next.
