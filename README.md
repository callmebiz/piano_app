# Piano App

A piano practice/theory web app: a visual 88-key keyboard driven by Web MIDI (or click/touch), and six apps built around it.

## Apps

- **Identification** — quiz-style ID practice: Note, Key Signature, Interval, Scale, and Chord ID, each with its own options (clef, accidentals, distance-only intervals, etc.) and a Stats view (accuracy, speed, drill-down, streaks).
- **Chord Recognition** — live "what am I playing" — shows the best-matching chord for whatever's currently held down, plus alternative interpretations.
- **Play The Chord** — practice striking a shown chord correctly: adjustable hold-time, inversions, chord-type/root filters, and Stats.
- **Scales** — practice scale runs in order (1-4 octaves, ascending/descending, one or two hands), with the scale shown on a staff that lights up as you play it, and Stats.
- **Key Center** — diatonic chords plus every non-diatonic strand from *creative_chord_choices.txt*: secondary dominants, modal interchange, ii-V's, tritone subs, diminished approach chords, and V-chord alternatives. Generates example chord progressions and plays them back.
- **Visualizer** — piano-roll-style bars that travel up from whichever keys you play.

Stats (Identification, Play The Chord, Scales) share one engine (`src/lib/practiceStats.js`): lifetime accuracy/speed per item, a 14-day trend, streaks, drill-down (e.g. a chord root's specific chord-type breakdown), and transition timing (how fast/accurate one specific item goes right after another).

Light / Dark theme toggle, a resizable docked keyboard, and a Settings panel (master volume/mute, key width, per-app options like staff size or visualizer color).

## Audio

Real sampled piano playback (Steinway grand, 4 velocity layers) via [smplr](https://github.com/danigb/smplr)'s `SplendidGrandPiano`, driven through `src/audio/engine.js`. Samples load the first time you play a note and are cached in the browser (Cache API) afterward, so it works fully offline from then on. Real MIDI keyboard input passes through its own velocity; on-screen/mouse clicks use a shared default.

## Quick start

1. Open a terminal in the project folder:

```cmd
cd /d e:\Projects\piano_app
```
2. Install dependencies and run the dev server:

```cmd
npm install
npm run dev
```
3. Open the local URL printed by Vite (usually `http://localhost:5173`) in Chrome or Edge. Allow MIDI access when prompted if you're using a MIDI keyboard; the on-screen keyboard works either way.

Notes
- Chord recognition is interval-based and prioritizes matches that include all pressed notes, falling back to the best partial matches.
- If your MIDI device does not appear, check the connection and browser permissions.

## Android (Capacitor)

The app ships to Android as a sideloaded APK via [Capacitor](https://capacitorjs.com/) — no server, no Play Store, works fully offline (aside from the piano's one-time sample download — see Audio above; capacitorjs.com hosts nothing for it). `capacitor.config.json` points Capacitor at Vite's `dist/` build output; the native project lives in `android/` (source/config is committed, build outputs are gitignored).

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
