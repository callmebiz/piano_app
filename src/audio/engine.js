// Audio engine.
// Real sampled piano playback (Steinway grand, 4 velocity layers) via
// smplr's SplendidGrandPiano, driven through a shared AudioContext ->
// master volume -> limiter chain. Samples are loaded lazily on first use
// and cached in the browser (Cache API), so it works fully offline after
// that. Tunable params (mute, volume) are persisted as one JSON blob in
// localStorage.

import { SplendidGrandPiano, CacheStorage } from 'smplr'

const STORAGE_KEY = 'audio:synth'

// Single shared default note velocity for every non-MIDI trigger across
// every app — on-screen/mouse keyboard clicks, Key Center's chord chip
// previews, Key Center's example-progression playback, anything else that
// calls noteOn/playChord without an explicit velocity. Real MIDI input
// keeps reporting its own actual per-note velocity (that's genuine
// performance data, not a default to override) — see App.jsx's initMIDI
// callback, which always passes the device's real velocity explicitly.
export const DEFAULT_VELOCITY = 0.6

export const AUDIO_DEFAULTS = {
  muted: false,
  masterVolume: 0.7
}

let params = { ...AUDIO_DEFAULTS }
try {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) params = { ...AUDIO_DEFAULTS, ...JSON.parse(raw) }
} catch (e) {}

let ctx = null
let masterGain = null
let limiter = null

function ensureAudioContext() {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
    masterGain = ctx.createGain()
    masterGain.gain.value = params.muted ? 0 : params.masterVolume
    limiter = ctx.createDynamicsCompressor()
    // gentle safety limiting so stacked chord notes don't clip
    limiter.threshold.setValueAtTime(-6, ctx.currentTime)
    limiter.knee.setValueAtTime(12, ctx.currentTime)
    limiter.ratio.setValueAtTime(12, ctx.currentTime)
    limiter.attack.setValueAtTime(0.003, ctx.currentTime)
    limiter.release.setValueAtTime(0.15, ctx.currentTime)
    masterGain.connect(limiter)
    limiter.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') {
    try { ctx.resume() } catch (e) {}
  }
  return ctx
}

// --- Sampled piano (lazy — created on first use, not at module load) ---
let piano = null
const pianoStops = new Map() // midi -> stop() from the last start() on that note

function ensurePiano() {
  const audioCtx = ensureAudioContext()
  if (!audioCtx || piano) return piano
  let storage
  try { storage = CacheStorage() } catch (e) { storage = undefined } // Cache API unavailable (e.g. non-secure context) — falls back to re-fetching each session
  try {
    piano = SplendidGrandPiano(audioCtx, { destination: masterGain, storage })
  } catch (e) {
    piano = null
  }
  return piano
}

// Warm up the context and start loading piano samples on the very first
// user gesture anywhere on the page, so the first real note has as little
// latency/missing-sample risk as possible.
if (typeof window !== 'undefined') {
  const warmup = () => {
    ensureAudioContext()
    ensurePiano()
    window.removeEventListener('pointerdown', warmup)
    window.removeEventListener('keydown', warmup)
  }
  window.addEventListener('pointerdown', warmup, { once: true })
  window.addEventListener('keydown', warmup, { once: true })
}

export function noteOn(midi, velocity = DEFAULT_VELOCITY) {
  const audioCtx = ensureAudioContext()
  if (!audioCtx) return
  const p = ensurePiano()
  if (!p) return

  const existingStop = pianoStops.get(midi)
  if (existingStop) { try { existingStop() } catch (e) {} }
  const vel = Math.max(1, Math.min(127, Math.round(Math.max(0.05, Math.min(1, velocity)) * 127)))
  try {
    const stop = p.start({ note: midi, velocity: vel })
    pianoStops.set(midi, stop)
  } catch (e) {}
}

export function noteOff(midi) {
  const stop = pianoStops.get(midi)
  if (stop) { try { stop() } catch (e) {} }
  pianoStops.delete(midi)
}

export function allNotesOff() {
  for (const midi of Array.from(pianoStops.keys())) noteOff(midi)
}

export function playChord(midis, durationMs = 900, velocity = DEFAULT_VELOCITY) {
  if (!Array.isArray(midis) || midis.length === 0) return
  for (const m of midis) noteOn(m, velocity)
  setTimeout(() => { for (const m of midis) noteOff(m) }, durationMs)
}

export function getAudioParams() {
  return { ...params }
}

export function setAudioParams(partial) {
  params = { ...params, ...partial }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(params)) } catch (e) {}
  if (masterGain && ctx) {
    try { masterGain.gain.setTargetAtTime(params.muted ? 0 : params.masterVolume, ctx.currentTime, 0.01) } catch (e) {}
  }
  return getAudioParams()
}
