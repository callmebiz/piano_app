// Staff-notation note helpers — pure data, no React, no VexFlow import (keeps
// this testable/reusable independent of the rendering layer). Converts
// between this app's MIDI-based note representation (same convention used
// throughout lib/chords.js and lib/scales.js) and VexFlow's "c/4"-style keys.

import { ROOTS } from './chords'

const VEX_LETTERS = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b']
const NATURAL_PCS = new Set([0, 2, 4, 5, 7, 9, 11])

// Scientific pitch notation octave numbering matches MIDI's (midi 60 = C4 = "c/4").
export function midiToVexKey(midi) {
  const pc = ((midi % 12) + 12) % 12
  const octave = Math.floor(midi / 12) - 1
  return `${VEX_LETTERS[pc]}/${octave}`
}

export function isNatural(midi) {
  return NATURAL_PCS.has(((midi % 12) + 12) % 12)
}

// Prompt pool for note-identification-style exercises: every MIDI note in
// [lowMidi, highMidi], optionally restricted to naturals only.
export function buildNotePool({ lowMidi, highMidi, accidentals = true }) {
  const pool = []
  for (let m = lowMidi; m <= highMidi; m++) {
    if (!accidentals && !isNatural(m)) continue
    const pc = ((m % 12) + 12) % 12
    pool.push({ midi: m, vexKey: midiToVexKey(m), name: ROOTS[pc] })
  }
  return pool
}

export const NATURAL_NOTE_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
export const CHROMATIC_NOTE_NAMES = ROOTS
