// Key-center library
// Parallel to lib/scales.js / lib/chords.js: given a key root, generates the
// diatonic chords of that key and the first layer of non-diatonic color
// (secondary dominants) built on top of them. Every chord *type* this needs
// already exists in chordFormulas — this file only adds the scale-degree
// relationships that decide which type goes on which root.

import { ROOTS, chordFormulas } from './chords'

// Major scale degree offsets (semitones from the key root).
export const DEGREE_INTERVALS = [0, 2, 4, 5, 7, 9, 11]

// Roman numeral per degree, case reflecting quality (upper = major, lower = minor/dim).
export const ROMAN = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']

const DEGREE_QUALITY_TRIAD = ['major', 'minor', 'minor', 'major', 'major', 'minor', 'dim']
const DEGREE_QUALITY_7TH = ['M7', 'm7', 'm7', 'M7', '7', 'm7', 'm7b5']

// The 7 diatonic chords of a major key, as triads or (optionally) 7th chords.
// Returns [{ degree, roman, root, type }], degree 0..6 = I..vii°.
export function getDiatonicChords(keyRoot, opts = {}) {
  const sevenths = !!opts.sevenths
  const qualities = sevenths ? DEGREE_QUALITY_7TH : DEGREE_QUALITY_TRIAD
  return DEGREE_INTERVALS.map((interval, i) => {
    const root = ((keyRoot + interval) % 12 + 12) % 12
    return { degree: i, roman: ROMAN[i], root, type: qualities[i] }
  })
}

// The dominant-7 chord a 5th above each non-tonic diatonic degree — "V/ii",
// "V/iii", etc. Skips degree 0 (I): its dominant is already the diatonic V.
// Returns [{ targetDegree, targetRoman, root, type: '7', label }].
export function getSecondaryDominants(keyRoot) {
  const diatonic = getDiatonicChords(keyRoot)
  return diatonic.slice(1).map((target) => {
    const root = ((target.root + 7) % 12 + 12) % 12
    return { targetDegree: target.degree, targetRoman: target.roman, root, type: '7', label: `V/${target.roman}` }
  })
}

// A simple close-position voicing for a chord, stacked upward from the root
// and anchored near middle C (60) — same "walk up, then shift whole octaves
// to fit range/anchor" approach buildScaleSequence uses for scale runs.
export function voiceChordNearMiddleC(root, type, opts = {}) {
  const { lowest = 21, highest = 108, anchor = 60 } = opts
  const ints = chordFormulas[type] || [0, 4, 7]
  const pcs = ints.map((i) => ((root + i) % 12 + 12) % 12)

  const findClosest = (pc, target) => {
    let best = null
    let bestDist = Infinity
    for (let m = lowest; m <= highest; m++) {
      if (((m % 12) + 12) % 12 !== pc) continue
      const d = Math.abs(m - target)
      if (d < bestDist) { bestDist = d; best = m }
    }
    return best
  }

  const rootMidi = findClosest(pcs[0], anchor)
  if (rootMidi == null) return []

  const midis = [rootMidi]
  let prev = rootMidi
  for (let i = 1; i < pcs.length; i++) {
    const pc = pcs[i]
    const offset = ((pc - (prev % 12)) + 12) % 12
    let cand = prev + offset
    if (cand <= prev) cand += 12
    midis.push(cand)
    prev = cand
  }
  return midis
}

export { ROOTS }
