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

// --- Modal Interchange / Borrowed Chords ---
// Chords borrowed from the parallel minor modes (Aeolian/Dorian/Phrygian) —
// same tonic, different mode, then back to the major key. Root offsets are
// semitones from the key root; `source` names which minor mode(s) it's
// conventionally drawn from (informational only, doesn't affect the chord).
const MODAL_INTERCHANGE_DEGREES = [
  { label: 'bII', offset: 1, triad: 'major', seventh: 'M7', source: 'Phrygian' },
  { label: 'iiø', offset: 2, triad: 'dim', seventh: 'm7b5', source: 'Aeolian' },
  { label: 'bIII', offset: 3, triad: 'major', seventh: 'M7', source: 'Dorian/Aeolian' },
  { label: 'ivm', offset: 5, triad: 'minor', seventh: 'm7', source: 'Aeolian/Phrygian' },
  { label: 'vm', offset: 7, triad: 'minor', seventh: 'm7', source: 'Aeolian/Dorian' },
  { label: 'vø', offset: 7, triad: 'dim', seventh: 'm7b5', source: 'Phrygian' },
  { label: 'bVI', offset: 8, triad: 'major', seventh: 'M7', source: 'Aeolian/Phrygian' },
  { label: 'bVII', offset: 10, triad: 'major', seventh: '7', source: 'Aeolian' }
]

// Returns [{ label, root, type, source }] — the borrowed-chord palette for a key.
export function getModalInterchangeChords(keyRoot, opts = {}) {
  const sevenths = !!opts.sevenths
  return MODAL_INTERCHANGE_DEGREES.map((d) => ({
    label: d.label,
    root: ((keyRoot + d.offset) % 12 + 12) % 12,
    type: sevenths ? d.seventh : d.triad,
    source: d.source
  }))
}

// --- ii-V's ---
// The ii chord that precedes each secondary dominant's V, borrowed from the
// destination's own key — a plain minor7 ii when the target is major, or the
// half-diminished "minor ii-V" shape when the target is minor/diminished.
// Same target set (and degree ordering) as getSecondaryDominants, so the two
// line up column-for-column in a grid.
export function getTwoFiveChords(keyRoot) {
  const diatonic = getDiatonicChords(keyRoot)
  return diatonic.slice(1).map((target) => {
    const isMinorTarget = target.type !== 'major'
    const iiRoot = ((target.root + 2) % 12 + 12) % 12
    const vRoot = ((target.root + 7) % 12 + 12) % 12
    return {
      targetDegree: target.degree,
      targetRoman: target.roman,
      ii: { root: iiRoot, type: isMinorTarget ? 'm7b5' : 'm7' },
      v: { root: vRoot, type: '7' },
      label: `ii-V/${target.roman}`
    }
  })
}

// Named ii-V variants that don't fit the per-degree pattern above — fixed
// pairs relative to the key root, each resolving to a specific target chord.
export function getSpecialTwoFives(keyRoot) {
  const at = (offset) => ((keyRoot + offset) % 12 + 12) % 12
  return [
    { label: 'Backdoor ii-V', ii: { root: at(5), type: 'm7' }, v: { root: at(10), type: '7' }, targetRoman: 'I' },
    { label: 'Tritone ii-V', ii: { root: at(8), type: 'm7' }, v: { root: at(1), type: '7' }, targetRoman: 'I' },
    { label: 'vi-II', ii: { root: at(9), type: 'm7' }, v: { root: at(2), type: '7' }, targetRoman: 'IV' },
    { label: 'vii-III', ii: { root: at(11), type: 'm7' }, v: { root: at(4), type: '7' }, targetRoman: 'IV' }
  ]
}

// --- Tritone substitution ---
// A dominant 7 chord shares its 3rd and 7th (inverted) with the dominant 7
// a tritone away, so either can stand in for the other.
export function tritoneSub(root) { return ((root + 6) % 12 + 12) % 12 }

// Swaps every dominant-7 chord in a list for its tritone substitute; leaves
// non-dominant chords untouched. Marks substituted entries with `tritoned`.
export function applyTritoneSub(chords) {
  return chords.map((c) => (c.type === '7' ? { ...c, root: tritoneSub(c.root), tritoned: true } : c))
}

// --- Diminished approach chords ---
// A leading-tone diminished 7th a half-step below each non-tonic diatonic
// degree — functionally interchangeable with that degree's secondary
// dominant (raise its root a half-step and you get the same dominant chord
// back). Same target set as getSecondaryDominants.
export function getDiminishedApproachChords(keyRoot) {
  const diatonic = getDiatonicChords(keyRoot)
  return diatonic.slice(1).map((target) => ({
    targetDegree: target.degree,
    targetRoman: target.roman,
    root: ((target.root - 1) % 12 + 12) % 12,
    type: 'dim7',
    label: `°7/${target.roman}`
  }))
}

// --- V Chord Alternatives ---
// Non-diatonic stand-ins for the V chord specifically, all sharing its pull
// back to the tonic: the leading-tone diminished 7th itself, the "backdoor"
// bVII7 (one of its notes lowered a half-step), and the m6/half-diminished
// pairs you get by raising its notes instead of lowering them.
export function getVAlternatives(keyRoot) {
  const at = (offset) => ((keyRoot + offset) % 12 + 12) % 12
  return [
    { label: '°7', root: at(8), type: 'dim7' },
    { label: 'bVII7', root: at(10), type: '7' },
    { label: 'iiø', root: at(2), type: 'm7b5' },
    { label: 'ivm6', root: at(5), type: 'm6' },
    { label: 'ivø', root: at(5), type: 'm7b5' },
    { label: 'bVIm6', root: at(8), type: 'm6' }
  ]
}

// --- Example progression generator ---
// Builds a short, playable example progression that showcases whichever
// strands are currently enabled — same idea as the worked examples in
// creative_chord_choices.txt (|C E7 |Am7 A7 |Dm7 D7 G7 |C |, etc.), just
// generated on demand instead of hand-picked. Picks a random diatonic
// "backbone" (a common progression shape by scale degree), then for each
// transition into a non-tonic degree, optionally prepends an approach
// (secondary dominant / ii-V / diminished 7th); transitions back to the
// tonic instead draw from V Alternatives / the special ii-Vs / plain V.
// Returns an array of bars, each an array of { root, type, label } chords.
const PROGRESSION_TEMPLATES = [
  [0, 5, 3, 4, 0], // I vi IV V I
  [0, 3, 4, 0], // I IV V I
  [0, 1, 4, 0], // I ii V I
  [0, 5, 1, 4, 0], // I vi ii V I
  [0, 2, 5, 3, 4, 0], // I iii vi IV V I
  [0, 3, 1, 4, 0] // I IV ii V I
]

export function generateProgression(keyRoot, opts = {}) {
  const sevenths = !!opts.sevenths
  const useSD = !!opts.secondaryDominants
  const useTwoFives = !!opts.twoFives
  const useTritone = !!opts.tritoneSubs
  const useDim = !!opts.diminishedApproach
  const useModal = !!opts.modalInterchange
  const useVAlt = !!opts.vAlternatives

  const diatonic = getDiatonicChords(keyRoot, { sevenths })
  const secondaryDominants = getSecondaryDominants(keyRoot)
  const twoFives = getTwoFiveChords(keyRoot)
  const specialTwoFives = getSpecialTwoFives(keyRoot)
  const diminishedApproachChords = getDiminishedApproachChords(keyRoot)
  const vAlternativesChords = getVAlternatives(keyRoot)
  const modalInterchangeChords = getModalInterchangeChords(keyRoot, { sevenths })

  const rnd = (n) => Math.floor(Math.random() * n)
  const pick = (arr) => (arr && arr.length > 0 ? arr[rnd(arr.length)] : null)

  const applyTT = (chord, label) => (useTritone && chord.type === '7'
    ? { root: tritoneSub(chord.root), type: '7', label: `${label} (T.T.)` }
    : { root: chord.root, type: chord.type, label })

  // Every strand toggle needs to actually show up when it's on — otherwise
  // checking a box and seeing a plain diatonic progression (which happened
  // with Modal Interchange: only a 30% roll per opportunity, easy to miss
  // every one in a run) reads as broken. Tritone Subs is excluded here: it's
  // a modifier of dominant chords another strand produces (see its own
  // description), not a strand of its own — with nothing else enabled there's
  // no dominant chord for it to act on, so it correctly does nothing.
  const requiredKinds = []
  if (useSD) requiredKinds.push('sd')
  if (useTwoFives) requiredKinds.push('twoFives')
  if (useDim) requiredKinds.push('dim')
  if (useModal) requiredKinds.push('modal')
  if (useVAlt) requiredKinds.push('vAlt')

  // One full generation attempt — returns the bars plus which enabled
  // strands actually got used at least once, so the caller can retry a
  // dry roll instead of silently handing back an unembellished progression.
  const attempt = () => {
    const used = new Set()
    const backbone = pick(PROGRESSION_TEMPLATES)
    const bars = [[{ root: diatonic[backbone[0]].root, type: diatonic[backbone[0]].type, label: diatonic[backbone[0]].roman }]]

    for (let i = 1; i < backbone.length; i++) {
      const deg = backbone[i]
      const target = diatonic[deg]
      let approachChords = []

      if (deg === 0) {
        // Resolving back to the tonic — draw from whichever of V Alternatives /
        // the special ii-Vs (that target I) / the plain diatonic V is enabled.
        // Skip the plain-V option when the previous bar's chord is already the
        // diatonic V itself — otherwise it shows up twice in a row (V, then V
        // again as a redundant "approach" to I) instead of resolving directly.
        const prevDeg = backbone[i - 1]
        const choices = []
        if (prevDeg !== 4) choices.push('plain')
        if (useVAlt) choices.push('valt')
        if (useTwoFives) choices.push('special')
        const choice = pick(choices)
        if (choice === 'valt') {
          const alt = pick(vAlternativesChords)
          approachChords = [{ root: alt.root, type: alt.type, label: alt.label }]
          used.add('vAlt')
        } else if (choice === 'special') {
          const stf = pick(specialTwoFives.filter((s) => s.targetRoman === 'I'))
          approachChords = [{ root: stf.ii.root, type: stf.ii.type, label: 'ii' }, applyTT(stf.v, 'V')]
          used.add('twoFives')
        } else if (choice === 'plain') {
          const v5 = diatonic[4]
          approachChords = [applyTT({ root: v5.root, type: sevenths ? '7' : v5.type }, 'V')]
        }
        // choice === null (no options applied and we already just landed on V) — resolve directly, no pickup
      } else {
        // Approaching a non-tonic degree — secondary dominant (optionally
        // preceded by its ii, optionally tritone-subbed) or a diminished
        // approach chord instead.
        const sd = secondaryDominants.find((s) => s.targetDegree === deg)
        const tf = twoFives.find((s) => s.targetDegree === deg)
        const da = diminishedApproachChords.find((s) => s.targetDegree === deg)
        const choices = []
        if (useSD && sd) choices.push('sd')
        if (useDim && da) choices.push('dim')
        const choice = pick(choices)
        if (choice === 'sd') {
          used.add('sd')
          if (useTwoFives && tf) {
            approachChords = [{ root: tf.ii.root, type: tf.ii.type, label: 'ii' }, applyTT(sd, sd.label)]
            used.add('twoFives')
          } else {
            approachChords = [applyTT(sd, sd.label)]
          }
        } else if (choice === 'dim') {
          approachChords = [{ root: da.root, type: da.type, label: da.label }]
          used.add('dim')
        }
      }

      // Approach chords (however many) land at the END of the bar that's
      // already in progress — same convention every worked example in
      // creative_chord_choices.txt uses (|C Gm7 C7 |F |, |C E7 |Am C7 |F D7 |G |,
      // etc.): the chord(s) leading somewhere never get a bar of their own,
      // they're a pickup into whatever bar comes next. The target they resolve
      // to always DOES start a fresh bar — most visibly the final tonic, which
      // previously ended up sharing (and looking like the tail of) the bar
      // before it instead of starting its own, like a real chart's last
      // measure would.
      if (approachChords.length > 0) bars[bars.length - 1].push(...approachChords)

      // Occasionally borrow the target itself from a parallel minor mode
      // instead of using its plain diatonic form.
      let targetChord = { root: target.root, type: target.type, label: target.roman }
      if (useModal && Math.random() < 0.3) {
        const swap = modalInterchangeChords.find((m) => m.root === target.root && m.type !== target.type)
        if (swap) { targetChord = { root: swap.root, type: swap.type, label: swap.label }; used.add('modal') }
      }
      bars.push([targetChord])
    }

    return { bars, used }
  }

  // Keep re-rolling (new backbone + fresh randomness each time) until at
  // least one enabled strand actually appears, rather than leaving it to
  // chance whether a checked option ever shows up. Capped well above what
  // any real combination needs (modal interchange, the slowest to land, is
  // still >99.9% likely inside a handful of tries) so a genuinely impossible
  // combination (e.g. Tritone Subs alone, with nothing to substitute) can't
  // spin forever — it just returns its last, honestly-plain attempt.
  if (requiredKinds.length === 0) return attempt().bars
  for (let n = 0; n < 30; n++) {
    const { bars, used } = attempt()
    if (requiredKinds.some((k) => used.has(k))) return bars
    if (n === 29) return bars
  }
}

// Assigns each chord in a bar a real note value (in beats, 4/4) instead of
// splitting the bar evenly N ways — a bar can hold at most 3 chords (the
// previous target, plus up to a ii and a V), and evenly dividing 4 beats by
// 3 isn't a quarter/half/whole note at all. A single chord fills the bar
// (whole note); two share it evenly (half + half); three give the first
// chord — normally the one already sustaining from the previous bar — a
// half note, and the two chords passing quickly through afterward a
// quarter note each (half + quarter + quarter = 4 beats).
export function beatsForBar(n) {
  if (n <= 1) return [4]
  if (n === 2) return [2, 2]
  if (n === 3) return [2, 1, 1]
  return new Array(n).fill(4 / n) // shouldn't happen in practice — even fallback
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
