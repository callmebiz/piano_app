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
- Audio is a built-in synthesized-tone engine (`src/audio/engine.js`, Web Audio API) — tunable in Settings (waveform, ADSR, brightness, volume). No sample library involved.
- Chord recognition is interval-based and prioritizes matches that include all pressed notes, falling back to the best partial matches.
- If your MIDI device does not appear, check the connection and browser permissions.

## Android (Capacitor)

The app ships to Android as a sideloaded APK via [Capacitor](https://capacitorjs.com/) — no server, no Play Store, works fully offline. `capacitor.config.json` points Capacitor at Vite's `dist/` build output; the native project lives in `android/` (source/config is committed, build outputs are gitignored).

**Prerequisites**: Node ≥22 (Capacitor CLI requirement) and Android Studio / the Android SDK installed locally.

Build loop:
```cmd
npm run cap:sync
```
This builds the web app (`vite build`) and copies it into the native project (`npx cap sync android`). Then either:
- Open `android/` in Android Studio and run/build from there, or
- From the CLI: `cd android && .\gradlew assembleDebug` — the APK lands in `android/app/build/outputs/apk/debug/`.

Install the resulting APK on your phone via `adb install path\to\app-debug.apk`, or copy the file over and allow "install unknown apps" when opening it.

App icon/splash source SVGs live in `assets/` (`icon-only`, `icon-foreground`, `icon-background`, `splash`, `splash-dark`). Regenerate the native icon/splash assets after changing them:
```cmd
npx capacitor-assets generate --android
```

If you want help expanding the app (more apps, animations, or accessibility improvements), tell me what you'd like next.
