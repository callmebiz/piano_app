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
function spellingMidi(letter, accidental, octave) {
  return (octave + 1) * 12 + LETTER_PC[letter] + accidentalShift(accidental)
}

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
