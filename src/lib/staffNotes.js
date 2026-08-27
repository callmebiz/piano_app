// Staff-notation note helpers — pure data, no React, no VexFlow import (keeps
// this testable/reusable independent of the rendering layer).

const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']

export const SHARP_NAMES = LETTERS.map((l) => `${l}#`)
export const NATURAL_NAMES = LETTERS.slice()
export const FLAT_NAMES = LETTERS.map((l) => `${l}b`)
export const ALL_SPELLINGS = [...SHARP_NAMES, ...NATURAL_NAMES, ...FLAT_NAMES]

function accidentalShift(accidental) {
  return accidental === '#' ? 1 : accidental === 'b' ? -1 : 0
}

// A written note name's sounding MIDI pitch depends on the *letter's* own
// octave, not the sounding pitch's octave — e.g. B#3 sounds as C4 (midi 60)
// but is written in octave 3's B position; Cb4 sounds as B3 (midi 59). Not
// pre-wrapping the pitch class before adding the octave base is what makes
// that fall out correctly.
export function spellingMidi(letter, accidental, octave) {
  return (octave + 1) * 12 + LETTER_PC[letter] + accidentalShift(accidental)
}

export function vexKeyFor(letter, accidental, octave) {
  return `${letter.toLowerCase()}${accidental}/${octave}`
}

// Canonical root spelling for scale/chord identification & construction —
// prefers flats for the five non-natural pitch classes (the near-universal
// convention for naming major scales/chords built on black keys), unlike
// lib/chords.js's ROOTS (sharp-only). Using sharp-only ROOTS here was a real
// bug: it silently turned "Bb7" into "A#7", which then needed a double
// accidental to spell correctly and got dropped from the exercise pool
// entirely. lib/chords.js's ROOTS stays sharp-only on purpose — chord
// *recognition* already picks sharp vs flat per case via the bass-note
// tiebreak in recognize(), which doesn't apply here.
export const CANONICAL_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

const VEX_LETTERS_SHARP = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b']

// Simple sharp-spelled midi -> vexKey, for reusing the existing pitch-class-
// only sequences from lib/scales.js/lib/chords.js (Scale ID, Chord ID) where
// exact enharmonic spelling isn't the point of the exercise — unlike Note ID,
// which needs the full letter+accidental model above.
export function midiToVexKey(midi) {
  const pc = ((midi % 12) + 12) % 12
  const octave = Math.floor(midi / 12) - 1
  return `${VEX_LETTERS_SHARP[pc]}/${octave}`
}

// The 15 standard major key signatures, in circle-of-fifths order (natural,
// then sharp side, then flat side) — VexFlow's addKeySignature draws the
// correct sharps/flats for each from the name alone.
export const MAJOR_KEY_SIGNATURES = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb']

export function parseSpelling(name) {
  const letter = name[0]
  const accidental = name.length > 1 ? name[1] : ''
  return { letter, accidental }
}

// Every (letter, accidental, octave) combination within [lowMidi, highMidi]
// for the given set of eligible spellings (e.g. NATURAL_NAMES, or
// ALL_SPELLINGS for the full enharmonic set) — one prompt candidate each.
export function buildSpellingPool({ lowMidi, highMidi, spellings = ALL_SPELLINGS }) {
  const pool = []
  for (const name of spellings) {
    const { letter, accidental } = parseSpelling(name)
    for (let octave = 0; octave <= 8; octave++) {
      const midi = spellingMidi(letter, accidental, octave)
      if (midi < lowMidi || midi > highMidi) continue
      const pc = ((midi % 12) + 12) % 12
      pool.push({ name, midi, pc, vexKey: `${letter.toLowerCase()}${accidental}/${octave}` })
    }
  }
  return pool
}
