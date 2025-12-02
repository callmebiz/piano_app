// Chord recognition library
// Implements interval-based chord templates and a recognition function.
// - chordFormulas: map of chord-type keys to interval arrays (in semitones from root)
// - chordPriority: array ordering chord-type keys by priority (higher priority first)
// - generateTemplates(): precomputes all 12 transpositions (pitch classes) for fast matching
// - recognize(pressedMidiArray): given an array (or Set) of MIDI note numbers, returns
//   an ordered list of candidate chord matches sorted by: matchedCount desc, then chord priority order.

// NOTE: This file contains thorough comments for traceability.

const ROOT_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

// Define chord formulas relative to root. These are pitch classes (0 = root)
// The selection here covers the primary chords listed in tmp_chords.txt. Each formula
// is an array of semitones from root. We include common extensions as required.

// For some chord types we include optional notes as separate types (e.g., add9 vs 9th)
// Recognizer logic will treat the chord's pitch-class set as the canonical set.

export const chordFormulas = {
  // Basic / Extended Triads
  'fifth': [0,7],
  'major': [0,4,7],
  'minor': [0,3,7],
  'dim': [0,3,6],
  'aug': [0,4,8],
  'sus2': [0,2,7],
  'sus4': [0,5,7],
  'flat5': [0,4,6], // C♭5 interpreted as C (with a flat 5) -> intervals 0,4,6? but common: (0,7) lowered 5? keep conservative
  '6': [0,4,7,9],
  'm6': [0,3,7,9],

  // Sevenths
  '7': [0,4,7,10], // dominant
  'm7': [0,3,7,10],
  'dim7': [0,3,6,9],
  'M7': [0,4,7,11],
  'mM7': [0,3,7,11],
  '7sus2': [0,2,7,10],
  '7sus4': [0,5,7,10],
  '7b5': [0,4,6,10],
  '7#5': [0,4,8,10],
  'm7b5': [0,3,6,10],
  'm7#5': [0,3,8,10],

  // Added-Tone
  'add9': [0,4,7,14],
  'madd9': [0,3,7,14],
  'add11': [0,4,7,17],
  'madd11': [0,3,7,17],
  'add13': [0,4,7,21],
  'madd13': [0,3,7,21],

  // Six-Seven combos (represent as union of intervals)
  '7/6': [0,4,7,9,10],
  '9/6': [0,4,7,9,14],
  'm9/6': [0,3,7,9,14],

  // Ninths
  '9': [0,4,7,10,14],
  'm9': [0,3,7,10,14],
  'b9': [0,4,7,10,13],
  'mb9': [0,3,7,10,13],
  '9#5': [0,4,8,10,14],
  '9sus4': [0,5,7,10,14],
  '9b5': [0,4,6,10,14],

  // Altered ninth variants (examples)
  'm9b5': [0,3,6,10,14],
  'm9#5': [0,3,8,10,14],

  // Major ninths
  'M9': [0,4,7,11,14],

  // Elevenths
  '11': [0,4,7,10,14,17],
  'm11': [0,3,7,10,14,17],
  'M11': [0,4,7,11,14,17],

  // Altered 11ths (examples)
  '11b5': [0,4,6,10,14,17],
  '11#5': [0,4,8,10,14,17],
  '11M7': [0,4,7,11,14,17],
  '11b9': [0,4,7,10,13,17],
  '11#9': [0,4,7,10,15,17],

  // 13ths
  '13': [0,4,7,10,14,17,21],
  'M13': [0,4,7,11,14,17,21],
  'm13': [0,3,7,10,14,17,21],

  // Altered 13ths (examples)
  '13b5': [0,4,6,10,14,17,21],
  '13#5': [0,4,8,10,14,17,21]
}

// Priority ordering. This should reflect the order in tmp_chords.txt: basic triads first, then sevenths, added tones, six-seven, ninths, etc.
export const chordPriority = [
  // Basic triads
  'fifth','major','minor','dim','aug','sus2','sus4','flat5','6','m6',
  // Sevenths
  '7','m7','dim7','M7','mM7','7sus2','7sus4','7b5','7#5','m7b5','m7#5',
  // Added tone
  'add9','madd9','add11','madd11','add13','madd13',
  // Six-seven combos
  '7/6','9/6','m9/6',
  // Ninths and variants
  '9','m9','b9','mb9','9#5','9sus4','9b5','m9b5','m9#5','M9',
  // Elevenths
  '11','m11','M11','11b5','11#5','11M7','11b9','11#9',
  // Thirteenths
  '13','M13','m13','13b5','13#5'
]

// Helper: convert interval (possibly >12) to pitch class set (0-11)
const intervalsToPCSet = (intervals) => {
  const s = new Set()
  intervals.forEach(i => s.add(((i % 12) + 12) % 12))
  return s
}

// Precompute templates: for each root (0..11) and each chord type, compute pitch class set and store meta
const templates = []

function generateTemplates() {
  templates.length = 0
  const types = Object.keys(chordFormulas)
  for (let root = 0; root < 12; root++) {
    for (const type of types) {
      const ints = chordFormulas[type]
      // compute transposed intervals (root + interval) then to pitch classes
      const pcs = new Set()
      ints.forEach(i => pcs.add(((root + i) % 12 + 12) % 12))
      templates.push({ root, type, pcs, size: pcs.size })
    }
  }
}

generateTemplates()

// Utility: get pitch-class set from pressed MIDI notes
function midiArrayToPCSet(notes) {
  const s = new Set()
  for (const n of notes) s.add(((n % 12) + 12) % 12)
  return s
}

// Recognize chords from pressed notes (Array or Set of midi numbers)
// Returns ordered array of matches: { rootName, type, typeLabel, matchedCount, chordSize, matchedPCs:[], missingPCs:[], extraPCs:[] }
export function recognize(pressedNotes) {
  if (!pressedNotes || pressedNotes.size === 0 || pressedNotes.length === 0) return []
  const pressedArr = Array.isArray(pressedNotes) ? pressedNotes : Array.from(pressedNotes)
  const pressedPCs = midiArrayToPCSet(pressedArr)

  const results = []
  // For performance, we iterate templates and compute intersection sizes.
  for (const t of templates) {
    const chordPCs = t.pcs
    // matched PCs = intersection of pressedPCs and chordPCs
    let matched = 0
    for (const p of pressedPCs) if (chordPCs.has(p)) matched++
    if (matched === 0) continue // no overlap

    // check if pressedPCs is subset of chordPCs (i.e., user played subset of chord tones)
    let isSubset = true
    for (const p of pressedPCs) if (!chordPCs.has(p)) { isSubset = false; break }

    // compute missing and extra
    const missing = []
    for (const cp of chordPCs) if (!pressedPCs.has(cp)) missing.push(cp)
    const extra = []
    for (const pp of pressedPCs) if (!chordPCs.has(pp)) extra.push(pp)

    results.push({
      root: t.root,
      rootName: ROOT_NAMES[t.root],
      type: t.type,
      typeIndex: chordPriority.indexOf(t.type),
      matchedCount: matched,
      chordSize: t.size,
      isSubset,
      exactMatch: false, // will set below when we know pressed size
      matchedPCs: Array.from(pressedPCs).filter(p => chordPCs.has(p)),
      missingPCs: missing,
      extraPCs: extra,
      chordPCs: Array.from(chordPCs)
    })
  }

  // Sort results: first by matchedCount desc (more matched notes first), then prefer subset matches,
  // then by chordSize asc (fewer chord tones matched? optional), then by priority order (lower index first),
  // finally by root (for determinism).
  // compute exactMatch flags (match all pressed pitch-classes)
  const pressedSize = pressedPCs.size
  for (const r of results) r.exactMatch = (r.matchedCount === pressedSize)

  results.sort((a,b) => {
    // 1) exact matches (chords that contain all pressed PCs) first
    if ((b.exactMatch?1:0) !== (a.exactMatch?1:0)) return (b.exactMatch?1:0) - (a.exactMatch?1:0)
    // 2) more matched pitch-classes next
    if (b.matchedCount !== a.matchedCount) return b.matchedCount - a.matchedCount
    // 3) prefer higher-priority chord types (lower index)
    const ai = a.typeIndex === -1 ? 999 : a.typeIndex
    const bi = b.typeIndex === -1 ? 999 : b.typeIndex
    if (ai !== bi) return ai - bi
    // 4) smaller chord size (fewer tones) as a tie-breaker
    if (a.chordSize !== b.chordSize) return a.chordSize - b.chordSize
    // 5) finally deterministic by root
    if (a.root !== b.root) return a.root - b.root
    return 0
  })

  return results
}

// Utility: pretty-print pitch classes as note names relative to root
export function pcsToNotes(pcs) {
  return pcs.map(pc => ROOT_NAMES[pc]).join(' ')
}

// Map internal type keys to common chord suffixes used in standard notation
const typeSuffixMap = {
  'fifth': '5',
  'major': '',
  'minor': 'm',
  'dim': 'dim',
  'aug': 'aug',
  'sus2': 'sus2',
  'sus4': 'sus4',
  'flat5': 'b5',
  '6': '6',
  'm6': 'm6',
  '7': '7',
  'm7': 'm7',
  'dim7': 'dim7',
  'M7': 'maj7',
  'mM7': 'm(maj7)',
  '7sus2': '7sus2',
  '7sus4': '7sus4',
  '7b5': '7b5',
  '7#5': '7#5',
  'm7b5': 'm7b5',
  'm7#5': 'm7#5',
  'add9': 'add9',
  'madd9': 'madd9',
  'add11': 'add11',
  'madd11': 'madd11',
  'add13': 'add13',
  'madd13': 'madd13',
  '7/6': '7/6',
  '9/6': '9/6',
  'm9/6': 'm9/6',
  '9': '9',
  'm9': 'm9',
  'b9': 'b9',
  'mb9': 'mb9',
  '9#5': '9#5',
  '9sus4': '9sus4',
  '9b5': '9b5',
  'm9b5': 'm9b5',
  'm9#5': 'm9#5',
  'M9': 'maj9',
  '11': '11',
  'm11': 'm11',
  'M11': 'maj11',
  '11b5': '11b5',
  '11#5': '11#5',
  '11M7': '11(maj7)',
  '11b9': '11b9',
  '11#9': '11#9',
  '13': '13',
  'M13': 'maj13',
  'm13': 'm13',
  '13b5': '13b5',
  '13#5': '13#5'
}

// Determine inversion and format a display name for a recognition match.
// pressedMidiArray: Array of midi numbers (can be empty)
export function formatMatch(match, pressedMidiArray = []) {
  // display chord name in standard notation: Root + suffix
  const rootName = match.rootName
  const suffix = typeSuffixMap[match.type] !== undefined ? typeSuffixMap[match.type] : match.type
  const displayName = `${rootName}${suffix ? suffix : ''}`

  // determine inversion: look at the lowest pressed MIDI note (if any)
  let inversion = null
  let bassName = null
  if (pressedMidiArray && pressedMidiArray.length > 0) {
    const bassMidi = Math.min(...pressedMidiArray)
    const bassPC = ((bassMidi % 12) + 12) % 12
    bassName = ROOT_NAMES[bassPC]
    // get ordered chord tones for this type using the original intervals
    const baseIntervals = chordFormulas[match.type] || []
    const orderedTones = baseIntervals.map(i => (((match.root + i) % 12) + 12) % 12)
    const idx = orderedTones.indexOf(bassPC)
    if (idx === -1) {
      inversion = 'no chord tone in bass'
    } else if (idx === 0) {
      inversion = 'root position'
    } else {
      // 1st inversion means third in bass -> idx 1 -> '1st inversion'
      const ord = idx
      const suffixOrd = ord === 1 ? '1st' : ord === 2 ? '2nd' : ord === 3 ? '3rd' : `${ord}th`
      inversion = `${suffixOrd} inversion`
    }
  }

  return { displayName, inversion, bassName, longName: longNameFor(match.type) }
}

// Long human-readable names for chord types (used in the UI as verbose descriptors)
const typeLongNameMap = {
  'fifth': 'Power Fifth',
  'major': 'Major',
  'minor': 'Minor',
  'dim': 'Diminished',
  'aug': 'Augmented',
  'sus2': 'Suspended 2nd',
  'sus4': 'Suspended 4th',
  'flat5': 'Flat Fifth',
  '6': 'Sixth',
  'm6': 'Minor Sixth',
  '7': 'Dominant Seventh',
  'm7': 'Minor Seventh',
  'dim7': 'Diminished Seventh',
  'M7': 'Major Seventh',
  'mM7': 'Minor Major Seventh',
  '7sus2': 'Seventh Suspended 2nd',
  '7sus4': 'Seventh Suspended 4th',
  '7b5': 'Seventh Flat Fifth',
  '7#5': 'Seventh Raised Fifth',
  'm7b5': 'Half-Diminished (Minor Seventh Flat Five)',
  'm7#5': 'Minor Seventh Raised Fifth',
  'add9': 'Added Ninth',
  'madd9': 'Minor Added Ninth',
  'add11': 'Added Eleventh',
  'madd11': 'Minor Added Eleventh',
  'add13': 'Added Thirteenth',
  'madd13': 'Minor Added Thirteenth',
  '7/6': 'Seven-Six Combination',
  '9/6': 'Nine-Six Combination',
  'm9/6': 'Minor Nine-Six Combination',
  '9': 'Ninth',
  'm9': 'Minor Ninth',
  'b9': 'Flat Ninth',
  'mb9': 'Minor Flat Ninth',
  '9#5': 'Ninth Raised Fifth',
  '9sus4': 'Ninth Suspended 4th',
  '9b5': 'Ninth Flat Fifth',
  'm9b5': 'Minor Ninth Flat Fifth',
  'm9#5': 'Minor Ninth Raised Fifth',
  'M9': 'Major Ninth',
  '11': 'Eleventh',
  'm11': 'Minor Eleventh',
  'M11': 'Major Eleventh',
  '11b5': 'Eleventh Flat Fifth',
  '11#5': 'Eleventh Raised Fifth',
  '11M7': 'Eleventh with Major Seventh',
  '11b9': 'Eleventh Flat Ninth',
  '11#9': 'Eleventh Raised Ninth',
  '13': 'Thirteenth',
  'M13': 'Major Thirteenth',
  'm13': 'Minor Thirteenth',
  '13b5': 'Thirteenth Flat Fifth',
  '13#5': 'Thirteenth Raised Fifth'
}

// Helper to get long name
function longNameFor(type) {
  return typeLongNameMap[type] || type
}


// Map semitone offset to a conventional interval name relative to root
// 0 -> 1, 1 -> b2, 2 -> 2, 3 -> b3, 4 -> 3, 5 -> 4, 6 -> b5, 7 -> 5, 8 -> #5, 9 -> 6, 10 -> b7, 11 -> 7
export function intervalName(semitones) {
  const map = {
    0: '1',
    1: 'b2',
    2: '2',
    3: 'b3',
    4: '3',
    5: '4',
    6: 'b5',
    7: '5',
    8: '#5',
    9: '6',
    10: 'b7',
    11: '7'
  }
  return map[((semitones % 12) + 12) % 12] || `${semitones}`
}

// Expose templates and regenerate function for testing/debugging
export function getTemplates() { return templates }
export function regenTemplates() { generateTemplates(); return templates }

// Export root names for convenience
export const ROOTS = ROOT_NAMES
