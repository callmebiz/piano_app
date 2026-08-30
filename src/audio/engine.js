// Audio engine.
// Two interchangeable note sources, both driven through the same shared
// AudioContext -> master volume -> limiter chain, so mute/volume apply
// identically regardless of which is active:
//  - 'piano': real sampled piano (Steinway, 4 velocity layers) via smplr's
//    SplendidGrandPiano, loaded lazily and cached in the browser (Cache API)
//    so after the first load it works fully offline.
//  - 'synth': the original small polyphonic oscillator synth (two detuned
//    oscillators per voice through an ADSR + lowpass filter) — kept as a
//    fallback/alternative, e.g. if sample loading fails or is unavailable.
// Tunable params are persisted as one JSON blob in localStorage.

import { SplendidGrandPiano, CacheStorage } from 'smplr'

const STORAGE_KEY = 'audio:synth'

export const SYNTH_DEFAULTS = {
  muted: false,
  masterVolume: 0.7,
  soundSource: 'piano', // 'piano' | 'synth'
  waveform: 'triangle', // 'sine' | 'triangle' | 'sawtooth' | 'square' — synth mode only
  attackMs: 4,
  decayMs: 300,
  sustain: 0.35, // 0..1, fraction of peak amplitude held while a note is down
  releaseMs: 250,
  brightness: 40 // 0..100 UI value, mapped to a filter-cutoff multiplier
}

// Fixed (not user-exposed) unison detune between the two oscillators per voice.
const UNISON_DETUNE_CENTS = 6
const RETRIGGER_FADE_S = 0.015

let params = { ...SYNTH_DEFAULTS }
try {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) params = { ...SYNTH_DEFAULTS, ...JSON.parse(raw) }
} catch (e) {}

let ctx = null
let masterGain = null
let limiter = null
const voices = new Map() // midi -> { oscA, oscB, voiceGain, filter, cleanupTimer }

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

function pianoNoteOn(midi, velocity) {
  const p = ensurePiano()
  if (!p) return false
  const existingStop = pianoStops.get(midi)
  if (existingStop) { try { existingStop() } catch (e) {} }
  const vel = Math.max(1, Math.min(127, Math.round(velocity * 127)))
  try {
    const stop = p.start({ note: midi, velocity: vel })
    pianoStops.set(midi, stop)
  } catch (e) {}
  return true
}

function pianoNoteOff(midi) {
  const stop = pianoStops.get(midi)
  if (stop) { try { stop() } catch (e) {} }
  pianoStops.delete(midi)
}

// Warm up the context (and start loading piano samples, if that's the active
// source) on the very first user gesture anywhere on the page, so the first
// real note has as little latency/missing-sample risk as possible.
if (typeof window !== 'undefined') {
  const warmup = () => {
    ensureAudioContext()
    if (params.soundSource === 'piano') ensurePiano()
    window.removeEventListener('pointerdown', warmup)
    window.removeEventListener('keydown', warmup)
  }
  window.addEventListener('pointerdown', warmup, { once: true })
  window.addEventListener('keydown', warmup, { once: true })
}

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

const brightnessMultiplier = () => 1 + (Math.max(0, Math.min(100, params.brightness)) / 100) * 9 // 1x..10x

function cleanupVoice(midi, voice) {
  try { if (voice.cleanupTimer) clearTimeout(voice.cleanupTimer) } catch (e) {}
  try { voice.oscA.stop() } catch (e) {}
  try { voice.oscB.stop() } catch (e) {}
  try { voice.oscA.disconnect() } catch (e) {}
  try { voice.oscB.disconnect() } catch (e) {}
  try { voice.filter.disconnect() } catch (e) {}
  try { voice.voiceGain.disconnect() } catch (e) {}
  if (voices.get(midi) === voice) voices.delete(midi)
}

function stealVoice(midi) {
  const voice = voices.get(midi)
  if (!voice) return
  const now = ctx.currentTime
  try {
    voice.voiceGain.gain.cancelScheduledValues(now)
    voice.voiceGain.gain.setValueAtTime(voice.voiceGain.gain.value, now)
    voice.voiceGain.gain.linearRampToValueAtTime(0, now + RETRIGGER_FADE_S)
  } catch (e) {}
  voices.delete(midi)
  setTimeout(() => cleanupVoice(midi, voice), Math.ceil(RETRIGGER_FADE_S * 1000) + 20)
}

export function noteOn(midi, velocity = 0.85) {
  const audioCtx = ensureAudioContext()
  if (!audioCtx) return
  if (params.soundSource === 'piano') { pianoNoteOn(midi, velocity); return }
  if (voices.has(midi)) stealVoice(midi)

  const freq = midiToFreq(midi)
  const now = audioCtx.currentTime
  const vel = Math.max(0.05, Math.min(1, velocity))

  const oscA = audioCtx.createOscillator()
  const oscB = audioCtx.createOscillator()
  oscA.type = params.waveform
  oscB.type = params.waveform
  oscA.frequency.setValueAtTime(freq, now)
  oscB.frequency.setValueAtTime(freq, now)
  oscA.detune.setValueAtTime(-UNISON_DETUNE_CENTS, now)
  oscB.detune.setValueAtTime(UNISON_DETUNE_CENTS, now)

  const filter = audioCtx.createBiquadFilter()
  filter.type = 'lowpass'
  const mult = brightnessMultiplier()
  const cutoffStart = Math.min(freq * mult, audioCtx.sampleRate / 2 - 100)
  const cutoffEnd = Math.min(Math.max(freq * 1.2, 200), audioCtx.sampleRate / 2 - 100)
  filter.frequency.setValueAtTime(cutoffStart, now)
  filter.frequency.linearRampToValueAtTime(cutoffEnd, now + Math.max(0.001, params.decayMs / 1000))
  filter.Q.setValueAtTime(0.7, now)

  const voiceGain = audioCtx.createGain()
  const attackS = Math.max(0.001, params.attackMs / 1000)
  const decayS = Math.max(0.001, params.decayMs / 1000)
  const peak = vel * 0.9
  const sustainLevel = peak * Math.max(0, Math.min(1, params.sustain))
  voiceGain.gain.setValueAtTime(0, now)
  voiceGain.gain.linearRampToValueAtTime(peak, now + attackS)
  voiceGain.gain.linearRampToValueAtTime(sustainLevel, now + attackS + decayS)

  oscA.connect(voiceGain)
  oscB.connect(voiceGain)
  voiceGain.connect(filter)
  filter.connect(masterGain)

  oscA.start(now)
  oscB.start(now)

  voices.set(midi, { oscA, oscB, voiceGain, filter, cleanupTimer: null })
}

function synthNoteOff(midi) {
  const voice = voices.get(midi)
  if (!voice || !ctx) return
  const now = ctx.currentTime
  const releaseS = Math.max(0.02, params.releaseMs / 1000)
  try {
    voice.voiceGain.gain.cancelScheduledValues(now)
    voice.voiceGain.gain.setValueAtTime(voice.voiceGain.gain.value, now)
    voice.voiceGain.gain.linearRampToValueAtTime(0, now + releaseS)
  } catch (e) {}
  voices.delete(midi)
  voice.cleanupTimer = setTimeout(() => cleanupVoice(midi, voice), Math.ceil(releaseS * 1000) + 30)
}

export function noteOff(midi) {
  if (params.soundSource === 'piano') { pianoNoteOff(midi); return }
  synthNoteOff(midi)
}

export function allNotesOff() {
  // Stop everything regardless of the *current* soundSource — notes can
  // still be ringing from before a live source switch.
  for (const midi of Array.from(voices.keys())) synthNoteOff(midi)
  for (const midi of Array.from(pianoStops.keys())) pianoNoteOff(midi)
}

export function playChord(midis, durationMs = 900) {
  if (!Array.isArray(midis) || midis.length === 0) return
  for (const m of midis) noteOn(m, 0.85)
  setTimeout(() => { for (const m of midis) noteOff(m) }, durationMs)
}

export function getSynthParams() {
  return { ...params }
}

export function setSynthParams(partial) {
  params = { ...params, ...partial }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(params)) } catch (e) {}
  if (masterGain && ctx) {
    try { masterGain.gain.setTargetAtTime(params.muted ? 0 : params.masterVolume, ctx.currentTime, 0.01) } catch (e) {}
  }
  // Switching to Piano mid-session — start loading samples right away
  // instead of waiting for the next note.
  if (partial && partial.soundSource === 'piano' && ctx) ensurePiano()
  return getSynthParams()
}
