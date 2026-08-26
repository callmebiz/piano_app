// Scale library
// Parallel to lib/chords.js but for scale practice: interval formulas for a core
// set of scale types, plus a helper that builds an ordered, playable MIDI
// sequence (ascending, optionally + descending) anchored near middle C.

import { ROOTS } from './chords'

// Interval formulas relative to root (semitones, ascending order — index 0 is always 0/root).
export const scaleFormulas = {
  major: [0, 2, 4, 5, 7, 9, 11],
  natMinor: [0, 2, 3, 5, 7, 8, 10],
  harMinor: [0, 2, 3, 5, 7, 8, 11],
  melMinor: [0, 2, 3, 5, 7, 9, 11],
  majPent: [0, 2, 4, 7, 9],
  minPent: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10]
}

// Ordered list of scale-type keys for consistent iteration/display order.
export const SCALE_TYPES = ['major', 'natMinor', 'harMinor', 'melMinor', 'majPent', 'minPent', 'blues']

// Human-readable long names for each scale type.
export const scaleLongNames = {
  major: 'Major',
  natMinor: 'Natural Minor',
  harMinor: 'Harmonic Minor',
  melMinor: 'Melodic Minor',
  majPent: 'Major Pentatonic',
  minPent: 'Minor Pentatonic',
  blues: 'Blues'
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

export { ROOTS }
