// Interval theory — letter-distance-aware, unlike lib/chords.js's
// intervalName() (which is semitone-only and can't distinguish e.g. M3 from
// d4, both 4 semitones). Needed for Interval Identification/Construction,
// where the exact spelled quality (m/M/P/A/d) + generic number matters.

import { parseSpelling, spellingMidi, vexKeyFor } from './staffNotes'

const LETTER_ORDER = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const PERFECT_NUMBERS = new Set([1, 4, 5, 8])
// Reference (Perfect/Major) semitone size for each simple generic interval number.
const REF_SEMITONES = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 8: 12 }

const letterIndex = (letter) => LETTER_ORDER.indexOf(letter)

export const INTERVAL_DEGREES = [2, 3, 4, 5, 6, 7, 8]
export const isPerfectFamily = (number) => PERFECT_NUMBERS.has(number)

// Generic interval number (1-8) counting letters inclusively from note1 to
// note2, ascending (e.g. C→E is a 3rd regardless of accidentals).
export function genericIntervalNumber(letter1, letter2) {
  return ((letterIndex(letter2) - letterIndex(letter1) + 7) % 7) + 1
}

// Full spelled interval name (e.g. 'M3', 'P5', 'A4', 'd7') between two
// ascending notes, each { name, midi } (name = letter+accidental, as
// produced by lib/staffNotes.js's spelling pool).
export function intervalName(note1, note2) {
  const { letter: l1 } = parseSpelling(note1.name)
  const { letter: l2 } = parseSpelling(note2.name)
  const number = genericIntervalNumber(l1, l2)
  const delta = (note2.midi - note1.midi) - REF_SEMITONES[number]
  const perfect = isPerfectFamily(number)
  let quality
  if (delta === 0) quality = perfect ? 'P' : 'M'
  else if (delta === 1) quality = 'A'
  else if (delta === -1) quality = perfect ? 'd' : 'm'
  else if (delta === -2 && !perfect) quality = 'd'
  else quality = delta > 0 ? 'A' : 'd'
  return `${quality}${number}`
}

// The reverse: given a root spelling and a target quality ('P'|'M'|'m'|'A'|'d')
// + generic number (1-8), compute the resulting note. Returns null if that
// would require a double sharp/flat (outside this app's 21-name spelling set).
export function noteFromInterval(rootLetter, rootAccidental, rootOctave, quality, number) {
  const steps = number - 1
  const rootIdx = letterIndex(rootLetter)
  const targetIdx = (rootIdx + steps) % 7
  const targetLetter = LETTER_ORDER[targetIdx]
  const targetOctave = rootOctave + Math.floor((rootIdx + steps) / 7)

  const rootMidi = spellingMidi(rootLetter, rootAccidental, rootOctave)
  const perfect = isPerfectFamily(number)
  const deltaMap = { P: 0, M: 0, m: -1, A: 1, d: perfect ? -1 : -2 }
  const targetMidi = rootMidi + REF_SEMITONES[number] + deltaMap[quality]

  const naturalTargetMidi = spellingMidi(targetLetter, '', targetOctave)
  const shift = targetMidi - naturalTargetMidi
  if (shift < -1 || shift > 1) return null
  const targetAccidental = shift === 1 ? '#' : shift === -1 ? 'b' : ''
  return {
    name: `${targetLetter}${targetAccidental}`,
    letter: targetLetter,
    accidental: targetAccidental,
    octave: targetOctave,
    midi: targetMidi,
    vexKey: vexKeyFor(targetLetter, targetAccidental, targetOctave)
  }
}
