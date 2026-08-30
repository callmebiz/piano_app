// Scale library
// Parallel to lib/chords.js but for scale practice: interval formulas for a core
// set of scale types, plus a helper that builds an ordered, playable MIDI
// sequence (ascending, optionally + descending) anchored near middle C.

import { ROOTS } from './chords'
import { parseSpelling, spellingMidi, vexKeyFor, CANONICAL_ROOTS } from './staffNotes'

// Interval formulas relative to root (semitones, ascending order — index 0 is always 0/root).
// The 7 modes are each just the major scale's own step pattern (W W H W W W H)
// starting from a different degree — ionian/aeolian duplicate major/natMinor
// numerically (same notes), kept as separate entries anyway since they're
// taught as distinct labels (verified by rotating the major step pattern
// from each of the 7 starting points and checking against known modal
// formulas before adding).
export const scaleFormulas = {
  major: [0, 2, 4, 5, 7, 9, 11],
  natMinor: [0, 2, 3, 5, 7, 8, 10],
  harMinor: [0, 2, 3, 5, 7, 8, 11],
  melMinor: [0, 2, 3, 5, 7, 9, 11],
  majPent: [0, 2, 4, 7, 9],
  minPent: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10]
}

// Ordered list of scale-type keys for consistent iteration/display order.
export const SCALE_TYPES = ['major', 'natMinor', 'harMinor', 'melMinor', 'majPent', 'minPent', 'blues', 'ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian']

// Human-readable long names for each scale type.
export const scaleLongNames = {
  major: 'Major',
  natMinor: 'Natural Minor',
  harMinor: 'Harmonic Minor',
  melMinor: 'Melodic Minor',
  majPent: 'Major Pentatonic',
  minPent: 'Minor Pentatonic',
  blues: 'Blues',
  ionian: 'Ionian',
  dorian: 'Dorian',
  phrygian: 'Phrygian',
  lydian: 'Lydian',
  mixolydian: 'Mixolydian',
  aeolian: 'Aeolian',
  locrian: 'Locrian'
}

export const MAX_OCTAVES = 4
const clampOctaves = (n) => Math.max(1, Math.min(MAX_OCTAVES, Math.round(n) || 1))

// Build the ascending pitch-class walk for `octaves` octaves of a scale type,
// starting and ending on the root's pitch class. Length is always octaves*n + 1
// where n is the number of degrees in one octave of the scale.
function buildAscendingPcs(type, octaves) {
  const ints = scaleFormulas[type]
  if (!Array.isArray(ints) || ints.length === 0) return []
  const oct = clampOctaves(octaves)
  const pcs = ints.map((i) => ((i % 12) + 12) % 12) // relative degrees, index 0 is root (0)
  const out = [pcs[0]]
  for (let o = 0; o < oct; o++) {
    for (let idx = 1; idx < pcs.length; idx++) out.push(pcs[idx])
    out.push(pcs[0])
  }
  return out
}

// Build the ordered practice sequence for a scale: ascending from root through
// `octaves` octaves, then (optionally) mirrored back down to root. Anchors the
// run near middle C (60) and shifts by whole octaves to best fit the given range.
// Returns { midis: number[], orderedPcs: number[] } — parallel arrays, same length.
export function buildScaleSequence(root, type, opts = {}) {
  const { descending = true, octaves = 1, lowest = 21, highest = 108, anchor = 60 } = opts
  const relPcs = buildAscendingPcs(type, octaves)
  if (relPcs.length === 0) return { midis: [], orderedPcs: [] }
  const ascPcs = relPcs.map((i) => ((root + i) % 12 + 12) % 12)

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

  const rootMidi = findClosest(ascPcs[0], anchor)
  if (rootMidi == null) return { midis: [], orderedPcs: [] }

  // Walk up through every scale degree across all octaves, staying monotonic increasing.
  const ascMidis = [rootMidi]
  let prev = rootMidi
  for (let i = 1; i < ascPcs.length; i++) {
    const pc = ascPcs[i]
    const offset = ((pc - (prev % 12)) + 12) % 12
    let cand = prev + offset
    if (cand <= prev) cand += 12
    ascMidis.push(cand)
    prev = cand
  }

  let full = ascMidis.slice()
  let orderedPcs = ascPcs.slice()
  if (descending) {
    // Mirror back down: same notes, reversed, excluding the duplicated top note.
    full = full.concat(ascMidis.slice(0, -1).reverse())
    orderedPcs = orderedPcs.concat(ascPcs.slice(0, -1).reverse())
  }

  // Shift the whole run by whole octaves to best fit the range, closest to anchor.
  const tryShifts = (seq) => {
    let bestK = null
    let bestDist = Infinity
    for (let k = -6; k <= 6; k++) {
      const cand = seq.map((v) => v + k * 12)
      const minC = Math.min(...cand)
      const maxC = Math.max(...cand)
      if (minC < lowest || maxC > highest) continue
      const dist = Math.abs(cand[0] - anchor)
      if (dist < bestDist) { bestDist = dist; bestK = k }
    }
    return bestK
  }
  const bestK = tryShifts(full)
  if (bestK !== null) {
    full = full.map((v) => v + bestK * 12)
  } else {
    // Fallback: clamp into range by shifting whole octaves.
    while (Math.max(...full) > highest) full = full.map((v) => v - 12)
    while (Math.min(...full) < lowest) full = full.map((v) => v + 12)
  }

  return { midis: full, orderedPcs }
}

// Build the same practice sequence for two hands, one octave apart (the
// standard hands-together convention), automatically reserving keyboard
// headroom so the left hand's copy (right hand shifted down) still fits.
// Returns { left: {midis, orderedPcs}, right: {midis, orderedPcs} } — both
// orderedPcs are identical since the hands are exactly an octave apart.
export function buildTwoHandSequence(root, type, opts = {}) {
  const { octaves = 1, descending = true, lowest = 21, highest = 108, anchor = 60, handGapSemitones = 12 } = opts
  const right = buildScaleSequence(root, type, {
    octaves, descending, anchor, highest, lowest: lowest + handGapSemitones
  })
  const left = { midis: right.midis.map((m) => m - handGapSemitones), orderedPcs: right.orderedPcs }
  return { left, right }
}

// Degree numbers (1-based, continuous across octaves) matching the length and
// order of buildScaleSequence's orderedPcs for the same (type, octaves, descending).
export function buildDegreeLabels(type, opts = {}) {
  const { octaves = 1, descending = true } = opts
  const relPcs = buildAscendingPcs(type, octaves)
  if (relPcs.length === 0) return []
  const asc = relPcs.map((_, i) => i + 1)
  return descending ? asc.concat(asc.slice(0, -1).reverse()) : asc
}

// Display name for a scale, e.g. "C Major", "F# Harmonic Minor".
export function scaleDisplayName(root, type) {
  const rootName = ROOTS[((root % 12) + 12) % 12]
  const longName = scaleLongNames[type] || type
  return `${rootName} ${longName}`
}

// Which letter-name step (0-6, from the root's own letter) each scale degree
// uses, for correct notation spelling — one letter per degree, no repeats or
// skips for the 7-note scales; pentatonic/blues intentionally skip letters
// (matching which degrees of the parent major/minor scale they keep), and
// blues' added chromatic "blue note" reuses the same letter as the degree
// before it (spelled as a sharp on that letter — the conventional #4).
const SCALE_LETTER_STEPS = {
  major: [0, 1, 2, 3, 4, 5, 6],
  natMinor: [0, 1, 2, 3, 4, 5, 6],
  harMinor: [0, 1, 2, 3, 4, 5, 6],
  melMinor: [0, 1, 2, 3, 4, 5, 6],
  majPent: [0, 1, 2, 4, 5],
  minPent: [0, 2, 3, 4, 6],
  blues: [0, 2, 3, 3, 4, 6],
  // Every mode is a 7-note diatonic scale too — one consecutive letter per
  // degree, same as major/natMinor/harMinor/melMinor above.
  ionian: [0, 1, 2, 3, 4, 5, 6],
  dorian: [0, 1, 2, 3, 4, 5, 6],
  phrygian: [0, 1, 2, 3, 4, 5, 6],
  lydian: [0, 1, 2, 3, 4, 5, 6],
  mixolydian: [0, 1, 2, 3, 4, 5, 6],
  aeolian: [0, 1, 2, 3, 4, 5, 6],
  locrian: [0, 1, 2, 3, 4, 5, 6]
}
const LETTER_ORDER = ['C', 'D', 'E', 'F', 'G', 'A', 'B']

// Extends one octave's worth of (semitone offset, letter step) pairs into a
// full ascending walk across `octaves` repeats (mirroring buildAscendingPcs's
// oct*n+1-note shape above, but keeping absolute — not mod-12/mod-7 wrapped —
// values, since spelling needs real ascending octave/letter position, not a
// wrapped pitch class).
function extendScalePattern(type, octaves) {
  const intervals = scaleFormulas[type]
  const steps = SCALE_LETTER_STEPS[type]
  if (!intervals || !steps) return null
  const oct = clampOctaves(octaves)
  const n = intervals.length

  const outIntervals = [intervals[0]]
  const outSteps = [steps[0]]
  for (let o = 0; o < oct; o++) {
    for (let idx = 1; idx < n; idx++) {
      outIntervals.push(intervals[idx] + 12 * o)
      outSteps.push(steps[idx] + 7 * o)
    }
    outIntervals.push(intervals[0] + 12 * (o + 1))
    outSteps.push(steps[0] + 7 * (o + 1))
  }
  return { intervals: outIntervals, steps: outSteps }
}

// Correctly-spelled (proper accidentals, no letter reused where avoidable)
// note sequence for a scale — unlike buildScaleSequence above, which is
// pitch-class-only and fine for Scales practice (highlighting keyboard keys)
// but would show e.g. F major's Bb as A# on a staff. Root is a pitch class
// (0-11); returns one note per degree, ascending from the given octave
// (optionally repeated across `octaves` and mirrored back down if
// `descending`, matching buildScaleSequence's own options). Returns null if
// any degree would need a double sharp/flat.
export function buildScaleSpelling(root, type, opts = {}) {
  const octave = opts.octave != null ? opts.octave : 4
  const octaves = opts.octaves != null ? opts.octaves : 1
  const descending = !!opts.descending

  const pattern = extendScalePattern(type, octaves)
  if (!pattern) return null
  let { intervals, steps } = pattern
  if (descending) {
    intervals = intervals.concat(intervals.slice(0, -1).reverse())
    steps = steps.concat(steps.slice(0, -1).reverse())
  }

  const rootName = CANONICAL_ROOTS[((root % 12) + 12) % 12]
  const { letter: rootLetter, accidental: rootAccidental } = parseSpelling(rootName)
  const rootLetterIdx = LETTER_ORDER.indexOf(rootLetter)
  const rootMidi = spellingMidi(rootLetter, rootAccidental, octave)

  const notes = []
  for (let i = 0; i < intervals.length; i++) {
    const step = steps[i]
    const letterIdx = ((rootLetterIdx + step) % 7 + 7) % 7
    const letter = LETTER_ORDER[letterIdx]
    const noteOctave = octave + Math.floor((rootLetterIdx + step) / 7)
    const naturalMidi = spellingMidi(letter, '', noteOctave)
    const targetMidi = rootMidi + intervals[i]
    const shift = targetMidi - naturalMidi
    if (shift < -1 || shift > 1) return null
    const accidental = shift === 1 ? '#' : shift === -1 ? 'b' : ''
    notes.push({ name: `${letter}${accidental}`, midi: targetMidi, vexKey: vexKeyFor(letter, accidental, noteOctave) })
  }
  return notes
}

export { ROOTS }
