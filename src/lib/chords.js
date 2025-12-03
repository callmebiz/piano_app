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

  // Single-note rule: if all pressed notes collapse to a single pitch-class (octaves),
  // treat as a single note and return a single, simple result (no chord labeling).
  if (pressedPCs.size === 1) {
    const onlyPC = Array.from(pressedPCs)[0]
    return [{
      root: onlyPC,
      rootName: ROOT_NAMES[onlyPC],
      type: 'single',
      typeIndex: -1,
      matchedCount: 1,
      chordSize: 1,
      isSubset: true,
      exactMatch: true,
      matchedPCs: [onlyPC],
      missingPCs: [],
      extraPCs: [],
      chordPCs: [onlyPC]
    }]
  }

  // Two-note special handling (power chords & fourths): use real musical conventions.
  // Build map from pitch-class -> lowest MIDI value seen for that PC so we can determine
  // which pitch is lower in actual pitch (not just by PC).
  if (pressedPCs.size === 2) {
    const pcs = Array.from(pressedPCs)
    const pcToMinMidi = new Map()
    for (const m of pressedArr) {
      const pc = ((m % 12) + 12) % 12
      if (!pcToMinMidi.has(pc) || m < pcToMinMidi.get(pc)) pcToMinMidi.set(pc, m)
    }
    const pcA = pcs[0], pcB = pcs[1]
    const minA = pcToMinMidi.get(pcA)
    const minB = pcToMinMidi.get(pcB)
    // determine which is lower in pitch
    const lowerPC = minA <= minB ? pcA : pcB
    const higherPC = lowerPC === pcA ? pcB : pcA
    const interval = ((higherPC - lowerPC) + 12) % 12

    // Octave / unison across octaves (interval 0) — already handled above by pressedPCs.size===1,
    // but keep safe guard
    if (interval === 0) {
      const onlyPC = lowerPC
      return [{
        root: onlyPC,
        rootName: ROOT_NAMES[onlyPC],
        type: 'single',
        typeIndex: -1,
        matchedCount: 1,
        chordSize: 1,
        isSubset: true,
        exactMatch: true,
        matchedPCs: [onlyPC],
        missingPCs: [],
        extraPCs: [],
        chordPCs: [onlyPC]
      }]
    }

    // Perfect fifth (7 semitones): root is the lower note
    if (interval === 7) {
      const root = lowerPC
      return [{
        root,
        rootName: ROOT_NAMES[root],
        type: 'fifth',
        typeIndex: chordPriority.indexOf('fifth'),
        matchedCount: 2,
        chordSize: 2,
        isSubset: true,
        exactMatch: true,
        matchedPCs: [lowerPC, higherPC],
        missingPCs: [],
        extraPCs: [],
        chordPCs: [lowerPC, higherPC]
      }]
    }

    // Perfect fourth (5 semitones): interpret as an inverted fifth — root is the higher note
    if (interval === 5) {
      const root = higherPC
      return [{
        root,
        rootName: ROOT_NAMES[root],
        type: 'fifth',
        typeIndex: chordPriority.indexOf('fifth'),
        matchedCount: 2,
        chordSize: 2,
        isSubset: true,
        exactMatch: true,
        matchedPCs: [lowerPC, higherPC],
        missingPCs: [],
        extraPCs: [],
        chordPCs: [lowerPC, higherPC]
      }]
    }
    // otherwise fall through to normal template matching (e.g., 2-note dyads that are not perfect 4/5)
  }

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

// Map internal type keys to chord suffixes using the user's preferred notation
// Uses superscript numerals and musical symbols where appropriate (e.g. ⁹ ¹¹ ¹³, ♭, ⁺)
const typeSuffixMap = {
  'fifth': '⁵',
  'major': '',
  'minor': 'm',
  'dim': '°',
  'aug': '⁺',
  'sus2': 'sus²',
  'sus4': 'sus⁴',
  'flat5': '♭⁵',
  '6': '⁶',
  'm6': 'm⁶',
  '7': '⁷',
  'm7': 'm⁷',
  'dim7': '°⁷',
  'M7': 'M⁷',
  'mM7': 'mM⁷',
  '7sus2': '⁷sus²',
  '7sus4': '⁷sus⁴',
  '7b5': '⁷♭⁵',
  '7#5': '⁷⁺⁵',
  'm7b5': 'm⁷♭⁵',
  'm7#5': 'm⁷⁺⁵',
  'add9': 'add⁹',
  'madd9': 'madd⁹',
  'add11': 'add¹¹',
  'madd11': 'madd¹¹',
  'add13': 'add¹³',
  'madd13': 'madd¹³',
  '7/6': '⁷/⁶',
  '9/6': '⁹/⁶',
  'm9/6': 'm⁹/⁶',
  '9': '⁹',
  'm9': 'm⁹',
  'b9': '♭⁹',
  'mb9': 'm♭⁹',
  '9#5': '⁹⁺⁵',
  '9sus4': '⁹sus⁴',
  '9b5': '⁹♭⁵',
  'm9b5': 'm⁹♭⁵',
  'm9#5': 'm⁹⁺⁵',
  'M9': 'M⁹',
  '11': '¹¹',
  'm11': 'm¹¹',
  'M11': 'M¹¹',
  '11b5': '¹¹♭⁵',
  '11#5': '¹¹⁺⁵',
  '11M7': '¹¹M⁷',
  '11b9': '¹¹♭⁹',
  '11#9': '¹¹⁺⁹',
  '13': '¹³',
  'M13': 'M¹³',
  'm13': 'm¹³',
  '13b5': '¹³♭⁵',
  '13#5': '¹³⁺⁵'
}

// Determine inversion and format a display name for a recognition match.
// pressedMidiArray: Array of midi numbers (can be empty)
export function formatMatch(match, pressedMidiArray = []) {
  // display chord name in standard notation: Root + suffix
  const rootName = match.rootName
  const suffix = typeSuffixMap[match.type] !== undefined ? typeSuffixMap[match.type] : match.type
  // For single-note matches, display only the root name.
  if (match.type === 'single') {
    return { displayName: rootName, inversion: null, bassName: rootName, longName: 'Single Note' }
  }

  // Determine bass note (lowest pressed MIDI) if available
  let inversion = null
  let bassName = null
  if (pressedMidiArray && pressedMidiArray.length > 0) {
    const bassMidi = Math.min(...pressedMidiArray)
    const bassPC = ((bassMidi % 12) + 12) % 12
    bassName = ROOT_NAMES[bassPC]

    // Decide whether to use inversion ordinal (triads & sevenths) or slash notation (9ths+)
    const chordToneIntervals = chordFormulas[match.type] || []
    const orderedTones = chordToneIntervals.map(i => (((match.root + i) % 12) + 12) % 12)
    const idx = orderedTones.indexOf(bassPC)

    // Triads (3-note) and sevenths (4-note) use inversion names when the bass is a chord tone
    if (match.chordSize <= 4) {
      if (idx === -1) {
        inversion = 'no chord tone in bass'
      } else if (idx === 0) {
        inversion = 'root position'
      } else {
        const ord = idx
        const suffixOrd = ord === 1 ? '1st' : ord === 2 ? '2nd' : ord === 3 ? '3rd' : `${ord}th`
        inversion = `${suffixOrd} inversion`
      }
    } else {
      // For 9ths and above (chordSize > 4), prefer slash-chord notation instead of calling it a high-number inversion
      // We'll leave inversion null (or a short note) and include the bass as a slash in the display name below.
      if (idx === -1) inversion = 'slash bass'
      else inversion = 'slash bass'
    }
  }

  // Build displayName: use slash notation for large chords (9+) or if bass is non-chord-tone
  let displayName = `${rootName}${suffix ? suffix : ''}`
  if (pressedMidiArray && pressedMidiArray.length > 0 && match.chordSize > 4 && bassName) {
    // 9th and up -> use slash notation
    displayName = `${displayName}/${bassName}`
  } else if (pressedMidiArray && pressedMidiArray.length > 0 && bassName && match.chordSize === 2 && match.type === 'fifth') {
    // For two-note fifths, prefer showing as root+5 (no inversion wording) but include explicit bassName
    // If bass differs from root, show slash notation (e.g., inverted fourth interpreted as F5 when root is F)
    if (bassName !== rootName) displayName = `${displayName}/${bassName}`
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
    1: '♭2',
    2: '2',
    3: '♭3',
    4: '3',
    5: '4',
    6: '♭5',
    7: '5',
    8: '#5',
    9: '6',
    10: '♭7',
    11: '7'
  }
  return map[((semitones % 12) + 12) % 12] || `${semitones}`
}

// Expose templates and regenerate function for testing/debugging
export function getTemplates() { return templates }
export function regenTemplates() { generateTemplates(); return templates }

// Export root names for convenience
export const ROOTS = ROOT_NAMES
