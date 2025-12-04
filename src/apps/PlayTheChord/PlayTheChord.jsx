import React, { useEffect, useMemo, useState, useRef } from 'react'
import { getTemplates, ROOTS, pcsToNotes, chordFormulas } from '../../lib/chords'
import { formatMatch } from '../../lib/chords'

function randomInt(max) { return Math.floor(Math.random() * max) }

export default function PlayTheChord({ pressedNotes, setKeyboardTargetPCs = () => {} }) {
  const templates = useMemo(() => getTemplates(), [])

  const centerCardRef = useRef(null)
  const chordRef = useRef(null)
  const [tableLeft, setTableLeft] = useState(null)
  const tableRef = useRef(null)
  const [tableTop, setTableTop] = useState(null)
  const [currentTargetMids, setCurrentTargetMids] = useState(() => new Set())
  const [currentTargetPcs, setCurrentTargetPcs] = useState(() => new Set())
  const [currentOrderedPcs, setCurrentOrderedPcs] = useState(() => [])

  // --- Settings: categories and allowed roots (persisted)
  // New filter groups requested by user (sorted):
  // Major, Minor, Diminished, Augmented, Suspended, Flat/Raised, 6th, 7th, add9, add11, add13, 9th, 11th, 13th
  const CATEGORIES = {
    major: { label: 'Major', types: ['fifth','major','M7','M9','M11','M13'] },
    minor: { label: 'Minor', types: ['minor','m6','m7','m9','m11','m13'] },
    diminished: { label: 'Diminished', types: ['dim','dim7'] },
    augmented: { label: 'Augmented', types: ['aug','9#5','11#5','13#5','m9#5','m7#5'] },
    suspended: { label: 'Suspended', types: ['sus2','sus4','7sus2','7sus4','9sus4'] },
    flatRaised: { label: 'Flat/Raised', types: ['flat5','7b5','9b5','11b5','13b5','b9','mb9','m9b5'] },
    sixth: { label: '6th', types: ['6','m6','7/6','9/6','m9/6'] },
    seventh: { label: '7th', types: ['7','m7','dim7','M7','mM7','7b5','7#5','m7b5','m7#5','7sus2','7sus4','7/6'] },
    add9: { label: 'add9', types: ['add9','madd9'] },
    add11: { label: 'add11', types: ['add11','madd11'] },
    add13: { label: 'add13', types: ['add13','madd13'] },
    ninth: { label: '9th', types: ['9','m9','b9','mb9','9#5','9sus4','9b5','m9b5','m9#5','M9','9/6','m9/6'] },
    eleventh: { label: '11th', types: ['11','m11','M11','11b5','11#5','11M7','11b9','11#9'] },
    thirteenth: { label: '13th', types: ['13','M13','m13','13b5','13#5'] }
  }

  const loadCategories = () => {
    // Do not read persisted main app filters; always start with defaults here
    const def = {}
    for (const k of Object.keys(CATEGORIES)) def[k] = false
    if (def.hasOwnProperty('major')) def.major = true
    if (def.hasOwnProperty('minor')) def.minor = true
    if (def.hasOwnProperty('diminished')) def.diminished = true
    if (def.hasOwnProperty('augmented')) def.augmented = true
    if (def.hasOwnProperty('suspended')) def.suspended = true
    return def
  }

  const loadRoots = () => {
    // Do not read persisted main app roots; default to naturals only
    return new Set([0,2,4,5,7,9,11])
  }

  const [selectedCats, setSelectedCats] = useState(loadCategories)
  const [selectedRoots, setSelectedRoots] = useState(loadRoots)
  const loadAllowInversions = () => {
    try { const raw = localStorage.getItem('play:allowInversions'); if (raw) return JSON.parse(raw) } catch(e){}
    return false
  }
  const [allowInversions, setAllowInversions] = useState(loadAllowInversions)
  useEffect(() => { try { localStorage.setItem('play:allowInversions', JSON.stringify(allowInversions)) } catch(e){} }, [allowInversions])
  const loadShowNotes = () => {
    try { const raw = localStorage.getItem('play:showNotes'); if (raw) return JSON.parse(raw) } catch(e){}
    return true
  }
  const [showNotes, setShowNotes] = useState(loadShowNotes)
  useEffect(() => { try { localStorage.setItem('play:showNotes', JSON.stringify(showNotes)) } catch(e){} }, [showNotes])

  const loadHoldSeconds = () => {
    try { const raw = localStorage.getItem('play:holdSeconds'); if (raw) return Number(raw) } catch(e){}
    return 2
  }
  const [holdSeconds, setHoldSeconds] = useState(loadHoldSeconds)
  useEffect(() => { try { localStorage.setItem('play:holdSeconds', String(holdSeconds)) } catch(e){} }, [holdSeconds])

  // main app filters are intentionally non-persistent (initialized each session)

  // --- Stats modal independent filters (initialized same as play filters but independent)
  const loadStatsCategories = () => {
    try {
      const raw = localStorage.getItem('play:stats:categories')
      if (!raw) return loadCategories()
      const parsed = JSON.parse(raw)
      // Validate shape: must be an object with at least one matching category key
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const out = {}
        let seenAny = false
        for (const k of Object.keys(CATEGORIES)) {
          if (Object.prototype.hasOwnProperty.call(parsed, k)) {
            out[k] = !!parsed[k]
            seenAny = true
          }
        }
        if (seenAny) return out
      }
    } catch (e) {}
    // fallback to same defaults as loadCategories
    return loadCategories()
  }
  const [statsSelectedCats, setStatsSelectedCats] = useState(loadStatsCategories)
  useEffect(() => { try { localStorage.setItem('play:stats:categories', JSON.stringify(statsSelectedCats)) } catch(e){} }, [statsSelectedCats])

  const loadStatsRoots = () => {
    try {
      const raw = localStorage.getItem('play:stats:roots')
      if (!raw) return loadRoots()
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const sel = new Set()
        for (const v of parsed) {
          const n = Number(v)
          if (!Number.isNaN(n) && n >= 0 && n < 12) sel.add(n)
        }
        if (sel.size > 0) return sel
      }
    } catch (e) {}
    return loadRoots()
  }
  const [statsSelectedRoots, setStatsSelectedRoots] = useState(loadStatsRoots)
  useEffect(() => { try { localStorage.setItem('play:stats:roots', JSON.stringify(Array.from(statsSelectedRoots))) } catch(e){} }, [statsSelectedRoots])

  // Helpers for stats modal filters
  const selectAllStatsCats = () => {
    const out = {}
    for (const k of Object.keys(CATEGORIES)) out[k] = true
    setStatsSelectedCats(out)
  }
  const clearAllStatsCats = () => {
    const out = {}
    for (const k of Object.keys(CATEGORIES)) out[k] = false
    setStatsSelectedCats(out)
  }
  const selectAllStatsRoots = () => {
    setStatsSelectedRoots(new Set(Array.from({length:12}, (_,i) => i)))
  }
  const clearAllStatsRoots = () => {
    setStatsSelectedRoots(new Set())
  }

  // Helpers: select or clear all chord-type filters
  const selectAllCats = () => {
    const out = {}
    for (const k of Object.keys(CATEGORIES)) out[k] = true
    setSelectedCats(out)
  }
  const clearAllCats = () => {
    const out = {}
    for (const k of Object.keys(CATEGORIES)) out[k] = false
    setSelectedCats(out)
  }
  // Helpers for roots
  const selectAllRoots = () => {
    setSelectedRoots(new Set(Array.from({length:12}, (_,i) => i)))
  }
  const clearAllRoots = () => {
    setSelectedRoots(new Set())
  }
  const selectNaturalsRoots = () => {
    // naturals: C, D, E, F, G, A, B -> pcs 0,2,4,5,7,9,11
    setSelectedRoots(new Set([0,2,4,5,7,9,11]))
  }

  // allowed types and roots derived from settings
  const allowedTypes = useMemo(() => {
    const s = new Set()
    for (const k of Object.keys(selectedCats)) if (selectedCats[k]) {
      for (const t of (CATEGORIES[k]?.types || [])) s.add(t)
    }
    return s
  }, [selectedCats])

  const statsAllowedTypes = useMemo(() => {
    const s = new Set()
    for (const k of Object.keys(statsSelectedCats || {})) if (statsSelectedCats[k]) {
      for (const t of (CATEGORIES[k]?.types || [])) s.add(t)
    }
    return s
  }, [statsSelectedCats])

  const allowedRoots = useMemo(() => new Set(Array.from(selectedRoots)), [selectedRoots])

  // Build reverse mapping: type -> categories that include it
  // Explicit atomic tag mapping for each chord type. Each tag name corresponds
  // to a filter key in `CATEGORIES`. A chord is allowed only if ALL of its
  // tags are enabled by the user (atomic filters). This ensures combining
  // filters expands allowed chord types predictably.
  const TYPE_TAGS = useMemo(() => ({
    'fifth': [],
    'major': ['major'],
    'minor': ['minor'],
    'dim': ['diminished'],
    'aug': ['augmented'],
    'sus2': ['suspended'],
    'sus4': ['suspended'],
    'flat5': ['flatRaised'],
    '6': ['sixth'],
    'm6': ['minor','sixth'],

    '7': ['seventh'],
    'm7': ['minor','seventh'],
    'dim7': ['diminished','seventh'],
    'M7': ['major','seventh'],
    'mM7': ['minor','seventh'],
    '7sus2': ['seventh','suspended'],
    '7sus4': ['seventh','suspended'],
    '7b5': ['seventh','flatRaised'],
    '7#5': ['seventh','augmented'],
    'm7b5': ['minor','seventh','flatRaised'],
    'm7#5': ['minor','seventh','augmented'],

    'add9': ['add9','major'],
    'madd9': ['add9','minor'],
    'add11': ['add11','major'],
    'madd11': ['add11','minor'],
    'add13': ['add13','major'],
    'madd13': ['add13','minor'],

    '7/6': ['seventh','sixth'],
    '9/6': ['ninth','sixth'],
    'm9/6': ['ninth','sixth','minor'],

    '9': ['ninth','seventh'],
    'm9': ['ninth','seventh','minor'],
    'b9': ['ninth','seventh','flatRaised'],
    'mb9': ['ninth','seventh','minor','flatRaised'],
    '9#5': ['ninth','seventh','augmented'],
    '9sus4': ['ninth','seventh','suspended'],
    '9b5': ['ninth','seventh','flatRaised'],
    'm9b5': ['ninth','seventh','minor','flatRaised'],
    'm9#5': ['ninth','seventh','minor','augmented'],
    'M9': ['major','ninth','seventh'],

    '11': ['eleventh'],
    'm11': ['eleventh','minor'],
    'M11': ['eleventh','major'],
    '11b5': ['eleventh','flatRaised'],
    '11#5': ['eleventh','augmented'],
    '11M7': ['eleventh','major','seventh'],
    '11b9': ['eleventh','ninth','flatRaised'],
    '11#9': ['eleventh','ninth','augmented'],

    '13': ['thirteenth'],
    'M13': ['major','thirteenth'],
    'm13': ['minor','thirteenth'],
    '13b5': ['thirteenth','flatRaised'],
    '13#5': ['thirteenth','augmented']
  }), [])

  // templates filtered by settings
  // A template is allowed only if its root is allowed AND all atomic tags
  // associated with the template are enabled. This makes each filter atomic
  // (e.g., 'sixth' and 'seventh' are separate flags) and combinations permit
  // composite chord types when all required tags are selected.
  const allowedTemplates = useMemo(() => {
    return templates.filter(t => {
      if (!allowedRoots.has(t.root)) return false
      const tags = TYPE_TAGS[t.type] || []
      // if no tags are defined for this type, fall back to allowedTypes (legacy)
      if (tags.length === 0) return allowedTypes.has(t.type)
      for (const tg of tags) {
        if (!selectedCats[tg]) return false
      }
      return true
    })
  }, [templates, allowedRoots, TYPE_TAGS, selectedCats, allowedTypes])

  const pickInitial = () => {
    // If user settings produce no allowed templates, return null (no selection)
    if (allowedTemplates && allowedTemplates.length > 0) return allowedTemplates[randomInt(allowedTemplates.length)]
    return null
  }

  // pick a random template different from `avoid` (by type+root) when possible
  const pickDifferent = (pool, avoid) => {
    if (!pool || pool.length === 0) return null
    if (!avoid) return pool[randomInt(pool.length)]
    if (pool.length === 1) return pool[0]
    // try up to 8 times then fallback to any different
    for (let i = 0; i < 8; i++) {
      const cand = pool[randomInt(pool.length)]
      if (!(cand.type === avoid.type && cand.root === avoid.root)) return cand
    }
    for (const p of pool) if (!(p.type === avoid.type && p.root === avoid.root)) return p
    return pool[0]
  }

  const [current, setCurrent] = useState(() => pickInitial())
  // Ensure current updates immediately when filters change
  useEffect(() => {
    try {
      if (!allowedTemplates || allowedTemplates.length === 0) {
        if (current !== null) setCurrent(null)
        return
      }
      if (!current) {
        setCurrent(allowedTemplates[randomInt(allowedTemplates.length)])
        return
      }
      const stillAllowed = allowedTemplates.some(t => t.type === current.type && t.root === current.root)
      if (!stillAllowed) {
        setCurrent(allowedTemplates[randomInt(allowedTemplates.length)])
      }
    } catch (e) {
      // swallow errors here to avoid breaking the UI
      console.warn('PlayTheChord filter update error', e)
    }
  }, [allowedTemplates])
  const [status, setStatus] = useState('idle')
  const [score, setScore] = useState(0)
  const [countdown, setCountdown] = useState(null)
  const [roundActive, setRoundActive] = useState(false)
  const [roundCanceled, setRoundCanceled] = useState(false)
  const [roundStartTs, setRoundStartTs] = useState(null)
  const [hadWrongPress, setHadWrongPress] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [stats, setStats] = useState(() => {
    try { const raw = localStorage.getItem('play:stats'); if (raw) return JSON.parse(raw) } catch(e){}
    return { byType: {}, byRoot: {}, byChord: {} }
  })
  const loadTrackStats = () => {
    try { const raw = localStorage.getItem('play:trackStats'); if (raw) return JSON.parse(raw) } catch(e){}
    return false
  }
  const [trackStats, setTrackStats] = useState(loadTrackStats)
  useEffect(() => { try { localStorage.setItem('play:trackStats', JSON.stringify(trackStats)) } catch(e){} }, [trackStats])

  // Stats table sorting
  const [statsSortKey, setStatsSortKey] = useState('attempts')
  const [statsSortDir, setStatsSortDir] = useState('desc')
  const toggleStatsSort = (key) => {
    if (statsSortKey === key) setStatsSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setStatsSortKey(key); setStatsSortDir('desc') }
  }

  

  // Start per-chord timing for free-play when tracking is enabled and we're not in a timed round
  useEffect(() => {
    try {
      if (trackStats && current && !roundActive) {
        // if there is no start timestamp, start one for this suggestion
        setRoundStartTs(performance.now())
      }
    } catch (e) {}
  }, [current, trackStats, roundActive])

  // no stats view toggle: consolidated stats modal
  const countdownRef = useRef(null)
  const holdTimerRef = useRef(null)
  const holdStartRef = useRef(null)
  const [holdProgress, setHoldProgress] = useState(0)
  const hadWrongRef = useRef(false)

  useEffect(() => { hadWrongRef.current = hadWrongPress }, [hadWrongPress])

  // compute and push target MIDI notes to the global keyboard for highlighting
  // This supports ordered/inversion-aware targets when `allowInversions` is enabled.
  const computeTargetMidisForTemplate = (tmpl, allowInv) => {
    if (!tmpl || !tmpl.type) return { mids: new Set(), inv: 0, orderedPcs: [] }
    const LOWEST = 21, HIGHEST = 108
    // fallback: use pitch-classes only
    const ints = chordFormulas[tmpl.type]
    let orderedPCs = []
    if (Array.isArray(ints) && ints.length > 0) {
      orderedPCs = ints.map(i => ((tmpl.root + i) % 12 + 12) % 12)
    } else {
      orderedPCs = Array.from(tmpl.pcs)
    }
    // choose inversion index
    let inv = 0
    if (allowInv && orderedPCs.length > 1) inv = Math.floor(Math.random() * orderedPCs.length)

    // Find root index in orderedPCs (fallback to 0)
    const rootPC = tmpl.root
    const rootIdx = orderedPCs.indexOf(rootPC)
    const startIdx = rootIdx >= 0 ? rootIdx : 0

    // Build sequence starting from rootPC so we can anchor root near C4
    const seqFromRoot = orderedPCs.slice(startIdx).concat(orderedPCs.slice(0, startIdx))

    // helper: find closest MIDI for a given pc near a target (C4 = 60)
    const findClosestToTarget = (pc, target) => {
      let best = null, bestDist = Infinity
      for (let m = LOWEST; m <= HIGHEST; m++) {
        if (((m % 12) + 12) % 12 !== pc) continue
        const d = Math.abs(m - target)
        if (d < bestDist) { bestDist = d; best = m }
      }
      return best
    }

    // Anchor root to nearest to C4
    const TARGET_ROOT_MIDI = 60
    const rootMidi = findClosestToTarget(rootPC, TARGET_ROOT_MIDI)
    if (rootMidi == null) return new Set()

    // build ascending sequence starting from rootMidi
    const resultAsc = []
    let prev = rootMidi
    resultAsc.push(prev)
    for (let i = 1; i < seqFromRoot.length; i++) {
      const pc = seqFromRoot[i]
      // compute candidate at or above prev
      const offset = ((pc - (prev % 12)) + 12) % 12
      let cand = prev + offset
      if (cand <= prev) cand += 12
      while (cand > HIGHEST) cand -= 12
      while (cand < LOWEST) cand += 12
      // if still invalid, pick nearest occurrence
      if (cand < LOWEST || cand > HIGHEST) {
        const f = findClosestToTarget(pc, TARGET_ROOT_MIDI)
        if (f != null) cand = f
      }
      resultAsc.push(cand)
      prev = cand
    }

    // Now apply inversion rotation if requested. Rotation is applied to the ascending sequence
    // but we must ensure the rotated sequence is monotonic (bass lowest). We'll adjust octaves.
    const n = resultAsc.length
    let rotated = resultAsc.slice(inv).concat(resultAsc.slice(0, inv))
    // rotatedPcs mirrors the order of pitch-classes corresponding to `rotated` MIDIs
    const rotatedPcs = seqFromRoot.slice(inv).concat(seqFromRoot.slice(0, inv))

    // make monotonic increasing by adding octaves where needed
    for (let i = 1; i < n; i++) {
      while (rotated[i] <= rotated[i-1]) rotated[i] += 12
    }
    // Choose an overall octave shift so that the bass (rotated[0]) is as close
    // as possible to TARGET_ROOT_MIDI (C4=60) while keeping all notes within
    // the instrument range. Try multiple octave shifts and pick the best fit.
    const tryShifts = (seq) => {
      let bestK = null
      let bestDist = Infinity
      for (let k = -6; k <= 6; k++) {
        const cand = seq.map(v => v + k * 12)
        const minC = Math.min(...cand)
        const maxC = Math.max(...cand)
        if (minC < LOWEST || maxC > HIGHEST) continue
        const dist = Math.abs(cand[0] - TARGET_ROOT_MIDI)
        if (dist < bestDist) { bestDist = dist; bestK = k }
      }
      return bestK
    }

    const bestK = tryShifts(rotated)
    if (bestK !== null) {
      for (let i = 0; i < n; i++) rotated[i] += bestK * 12
    } else {
      // fallback: bring range into bounds by shifting octaves until in range
      const maxVal = () => Math.max(...rotated)
      const minVal = () => Math.min(...rotated)
      while (maxVal() > HIGHEST) {
        for (let i = 0; i < n; i++) rotated[i] -= 12
      }
      while (minVal() < LOWEST) {
        for (let i = 0; i < n; i++) rotated[i] += 12
      }
    }

    // final clamp to range
    for (let i = 0; i < n; i++) {
      while (rotated[i] > HIGHEST) rotated[i] -= 12
      while (rotated[i] < LOWEST) rotated[i] += 12
    }

    return { mids: new Set(rotated), inv, orderedPcs: rotatedPcs }
  }

  useEffect(() => {
    // compute and cache the target mids/pcs when current or allowInversions changes
  }, [])

  // Measure chord element and position the degree table to hug the chord's right edge
  useEffect(() => {
    if (typeof window === 'undefined') return
    const TABLE_W = 160
    const GAP = 12
    const measure = () => {
      try {
        const card = centerCardRef.current
        const chordEl = chordRef.current
        const tableEl = tableRef.current
        if (!card || !chordEl) return
        const cardRect = card.getBoundingClientRect()
        const chordRect = chordEl.getBoundingClientRect()
        // compute left offset relative to card
        let left = (chordRect.right - cardRect.left) + GAP
        const maxLeft = Math.max(0, cardRect.width - TABLE_W - 12)
        if (left > maxLeft) left = maxLeft
        if (left < 0) left = 0
        setTableLeft(Math.round(left))
        // compute top so table vertically centers on chord center
        if (tableEl) {
          const tableRect = tableEl.getBoundingClientRect()
          const chordCenterY = chordRect.top + chordRect.height / 2
          let top = chordCenterY - cardRect.top - (tableRect.height / 2)
          // clamp top into card bounds
          const maxTop = Math.max(0, cardRect.height - tableRect.height - 12)
          if (top > maxTop) top = maxTop
          if (top < 0) top = 0
          setTableTop(Math.round(top))
        }
      } catch (e) {}
    }
    measure()
    let ro = null
    try {
      ro = new ResizeObserver(measure)
      if (centerCardRef.current) ro.observe(centerCardRef.current)
      if (chordRef.current) ro.observe(chordRef.current)
    } catch (e) { ro = null }
    window.addEventListener('resize', measure)
    return () => {
      try { if (ro) ro.disconnect() } catch (e) {}
      window.removeEventListener('resize', measure)
    }
  }, [current, currentOrderedPcs, allowInversions])

  const [currentInversion, setCurrentInversion] = useState(null)

  useEffect(() => {
    try {
      const res = computeTargetMidisForTemplate(current, allowInversions)
      const mids = res && res.mids ? res.mids : new Set()
      const inv = res && typeof res.inv === 'number' ? res.inv : 0
      const pcs = new Set(current && current.pcs ? Array.from(current.pcs) : [])
      const ordered = (res && Array.isArray(res.orderedPcs) ? res.orderedPcs : (current ? Array.from(current.pcs) : []))
      setCurrentTargetMids(mids)
      setCurrentTargetPcs(pcs)
      setCurrentOrderedPcs(ordered)
      // only expose inversion when inversions are allowed; otherwise null
      setCurrentInversion(allowInversions ? inv : null)
    } catch (e) {}
  }, [current, allowInversions])

  // push the (possibly hidden) targets to the host whenever showNotes or current targets change
  useEffect(() => {
    try {
      if (typeof setKeyboardTargetPCs === 'function') setKeyboardTargetPCs({ mids: showNotes ? currentTargetMids : new Set(), pcs: currentTargetPcs })
    } catch (e) {}
    return () => { try { if (typeof setKeyboardTargetPCs === 'function') setKeyboardTargetPCs(new Set()) } catch (e) {} }
  }, [currentTargetMids, currentTargetPcs, showNotes, setKeyboardTargetPCs])

  // target pitch-classes (used for checking correctness/wrong presses)
  const targetPCs = useMemo(() => new Set(current && current.pcs ? Array.from(current.pcs) : []), [current])

  // list of allowed templates with root == C (0) for display when filters change
  const allowedForC = useMemo(() => (allowedTemplates || []).filter(t => t.root === 0), [allowedTemplates])

  // save stats helper
  const saveStats = (s) => {
    try { localStorage.setItem('play:stats', JSON.stringify(s)) } catch (e) {}
    setStats(s)
  }

  const resetStats = () => {
    const s = { byType: {}, byRoot: {}, byChord: {} }
    saveStats(s)
  }

  const recordRound = (tmpl, correct, timeMs) => {
    if (!tmpl) return
    if (!trackStats) return
    try { console.debug('recordRound:', tmpl && tmpl.type, 'root', tmpl && tmpl.root, 'correct', correct, 'timeMs', timeMs) } catch(e){}
    // read latest stats from localStorage to reduce race overwrites
    let base = { byType: {}, byRoot: {}, byChord: {} }
    try { const raw = localStorage.getItem('play:stats'); if (raw) base = JSON.parse(raw) } catch(e){}
    const s = JSON.parse(JSON.stringify(base))
    // by type
    const t = tmpl.type
    if (!s.byType[t]) s.byType[t] = { attempts: 0, correct: 0, totalTimeMs: 0 }
    s.byType[t].attempts += 1
    if (correct) { s.byType[t].correct += 1; s.byType[t].totalTimeMs += (timeMs || 0) }
    // by root
    const r = String(tmpl.root)
    if (!s.byRoot[r]) s.byRoot[r] = { attempts: 0, correct: 0, totalTimeMs: 0 }
    s.byRoot[r].attempts += 1
    if (correct) { s.byRoot[r].correct += 1; s.byRoot[r].totalTimeMs += (timeMs || 0) }
    // by chord (type + root) - prevents collisions and preserves per-root stats per type
    const chordKey = `${t}@${r}`
    if (!s.byChord) s.byChord = {}
    if (!s.byChord[chordKey]) s.byChord[chordKey] = { attempts: 0, correct: 0, totalTimeMs: 0, type: t, root: Number(r) }
    s.byChord[chordKey].attempts += 1
    if (correct) { s.byChord[chordKey].correct += 1; s.byChord[chordKey].totalTimeMs += (timeMs || 0) }
    saveStats(s)
  }

  // compute pressed PCs from pressedNotes (Set or Array)
  const pressedPCs = useMemo(() => {
    const s = new Set()
    if (!pressedNotes) return s
    const arr = Array.isArray(pressedNotes) ? pressedNotes : Array.from(pressedNotes)
    for (const m of arr) s.add(((m % 12) + 12) % 12)
    return s
  }, [pressedNotes])

  const [pendingNext, setPendingNext] = useState(null)

  // check for success: user pressed includes all targetPCs — now requires holding
  useEffect(() => {
    if (targetPCs.size === 0) {
      // reset any hold state
      if (holdTimerRef.current) { clearInterval(holdTimerRef.current); holdTimerRef.current = null }
      holdStartRef.current = null
      setHoldProgress(0)
      return
    }

    // helper tests
    let allPresent = true
    for (const p of targetPCs) if (!pressedPCs.has(p)) { allPresent = false; break }
    let noExtras = true
    for (const p of pressedPCs) if (!targetPCs.has(p)) { noExtras = false; break }

    // mark if any wrong pitch-class present during active rounds
    if (roundActive) {
      for (const p of pressedPCs) if (!targetPCs.has(p)) { setHadWrongPress(true); break }
    }

    // If currently all present and no extras, start or continue hold timer
    if (allPresent && noExtras) {
      if (!holdStartRef.current) {
        holdStartRef.current = performance.now()
      }
      // start an interval to update progress (if not running)
      if (!holdTimerRef.current) {
        holdTimerRef.current = setInterval(() => {
          const now = performance.now()
          const elapsed = now - (holdStartRef.current || now)
          const prog = Math.min(1, elapsed / (holdSeconds * 1000))
          setHoldProgress(prog)
          if (prog >= 1) {
            // completed hold — register success
            if (holdTimerRef.current) { clearInterval(holdTimerRef.current); holdTimerRef.current = null }
            holdStartRef.current = null
            setHoldProgress(1)
            // commit solved behavior depending on roundActive
            const rawElapsed = roundStartTs ? (performance.now() - roundStartTs) : 0
            // subtract hold time (the required holdSeconds) from the recorded elapsed
            const elapsedRound = Math.max(0, rawElapsed - (holdSeconds * 1000))
            if (roundActive) {
              setRoundActive(false)
              setStatus('solved')
              setScore(s => s + 1)
              if (!roundCanceled) recordRound(current, !hadWrongRef.current, elapsedRound)
              const pool = (allowedTemplates && allowedTemplates.length > 0) ? allowedTemplates : []
              if (pool.length > 0) setPendingNext(pickDifferent(pool, current)); else setPendingNext(null)
            } else {
              // free-play: also record successes so user's plays appear in stats
              const pool = (allowedTemplates && allowedTemplates.length > 0) ? allowedTemplates : []
              setStatus('solved')
              // record free-play results as well (recordRound will no-op if trackStats is false)
              recordRound(current, !hadWrongRef.current, elapsedRound)
              if (pool.length > 0) {
                setPendingNext(pickDifferent(pool, current))
              } else {
                setPendingNext(null)
              }
            }
          }
        }, 60)
      }
    } else {
      // not holding correctly — reset hold
      if (holdTimerRef.current) { clearInterval(holdTimerRef.current); holdTimerRef.current = null }
      holdStartRef.current = null
      setHoldProgress(0)
    }

    return () => {
      // cleanup interval when pressedPCs/targetPCs change
      if (holdTimerRef.current) { clearInterval(holdTimerRef.current); holdTimerRef.current = null }
      holdStartRef.current = null
    }
  }, [pressedPCs, targetPCs, roundActive, roundStartTs, roundCanceled, hadWrongPress, allowedTemplates, holdSeconds])

  // When solved and all keys released, advance to the pending next chord
  useEffect(() => {
    if (status === 'solved' && pendingNext && pressedPCs.size === 0) {
      setCurrent(pendingNext)
      setPendingNext(null)
      setStatus('idle')
      setHadWrongPress(false)
      setRoundCanceled(false)
      // new suggestion — start per-chord timer if tracking is enabled and not in a timed round
      if (trackStats) setRoundStartTs(performance.now())
    }
  }, [pressedPCs, status, pendingNext])

  // Start/Stop controls
  const start = () => {
    if (!allowedTemplates || allowedTemplates.length === 0) return
    // countdown 3..1 then show chord and begin timing
    let c = 3
    setCountdown(c)
    countdownRef.current = setInterval(() => {
      c -= 1
      if (c <= 0) {
        clearInterval(countdownRef.current)
        setCountdown(null)
        // pick and show chord (avoid repeating current)
        const next = pickDifferent(allowedTemplates, current)
        setCurrent(next)
        setRoundActive(true)
        setRoundCanceled(false)
        setHadWrongPress(false)
        setRoundStartTs(performance.now())
        // enable stat tracking when a timed round actually starts (after the countdown)
        try { setTrackStats(true) } catch (e) {}
        setStatus('running')
      } else {
        setCountdown(c)
      }
    }, 1000)
  }

  const stop = () => {
    // cancel current active round; do not record stats for it
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; setCountdown(null) }
    if (roundActive) {
      setRoundActive(false)
      setRoundCanceled(true)
      setStatus('stopped')
    }
    // Turning Stop should also disable stat tracking
    try { setTrackStats(false) } catch (e) {}
    // clear per-chord timer
    setRoundStartTs(null)
  }

  // Skip helper: pick a different allowed template and reset round state
  const skip = () => {
    if (!allowedTemplates || allowedTemplates.length === 0) return
    const next = pickDifferent(allowedTemplates, current)
    if (next) {
      setCurrent(next)
      setRoundActive(false)
      setRoundCanceled(false)
      setHadWrongPress(false)
      setPendingNext(null)
      setStatus('idle')
      setRoundStartTs(null)
    }
  }

  // Keyboard shortcut: press 'S' to skip (ignore when typing in inputs)
  useEffect(() => {
    const handler = (e) => {
      try {
        if (e.key !== 's' && e.key !== 'S' && e.code !== 'KeyS') return
        const tgt = e.target
        const tag = tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)
        if (tag) return
        e.preventDefault()
        skip()
      } catch (err) {}
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [allowedTemplates, current])

  const showName = () => {
    if (!current) return ''
    const fakeMatch = { root: current.root, rootName: ROOTS[current.root], type: current.type, chordSize: current.size }
    const fm = formatMatch(fakeMatch, [])
    return fm.displayName
  }

  // Helper: parse alteration tokens from a type key into human-friendly phrases
  const parseAlterations = (typeKey) => {
    if (!typeKey || typeof typeKey !== 'string') return []
    const phrases = []
    // common tokens
    if (typeKey.includes('b9') || typeKey.includes('mb9')) phrases.push('Flat 9th')
    if (typeKey.includes('#9') || typeKey.includes('9#5') || typeKey.includes('11#9') || typeKey.includes('11#9')) phrases.push('Raised 9th')
    if (typeKey.includes('b5') || typeKey.includes('9b5') || typeKey.includes('11b5') || typeKey.includes('13b5')) phrases.push('Flat 5th')
    if (typeKey.includes('#5') || typeKey.includes('9#5') || typeKey.includes('11#5') || typeKey.includes('13#5')) phrases.push('Raised 5th')
    if (typeKey.includes('sus2')) phrases.push('Suspended 2nd')
    if (typeKey.includes('sus4')) phrases.push('Suspended 4th')
    if (typeKey.startsWith('m') && typeKey !== 'm6' && typeKey !== 'm7' && typeKey !== 'm9' && typeKey !== 'm11' && typeKey !== 'm13') {
      // many types use leading 'm' for minor; the TYPE_TAGS will also surface 'Minor'
    }
    if (typeKey.includes('add9') || typeKey.includes('madd9')) phrases.push('Added 9th')
    if (typeKey.includes('add11') || typeKey.includes('madd11')) phrases.push('Added 11th')
    if (typeKey.includes('add13') || typeKey.includes('madd13')) phrases.push('Added 13th')
    return Array.from(new Set(phrases))
  }

  return (
    <div className="chord-app">
      <h2>Play The Chord</h2>
      <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:12}}>
        {/* Top: Filters and options (full-width, above the center card) */}
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
            <div className="filter-block">
              <div className="filter-title">Chord Types</div>
              <div style={{display:'flex',gap:8,marginTop:6,marginBottom:8}}>
                <button className="play-cat-btn" onClick={selectAllCats}>Select All</button>
                <button className="play-cat-btn" onClick={clearAllCats}>Clear All</button>
              </div>
              <div className="cats-row" role="toolbar" aria-label="Chord type filters" style={{display:'flex',flexWrap:'wrap',gap:6}}>
                {Object.keys(CATEGORIES).map(k => (
                  <button key={k} className={`play-cat-btn ${selectedCats[k] ? 'active' : ''}`} onClick={() => setSelectedCats(s => ({...s, [k]: !s[k]}))}>
                    {CATEGORIES[k].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-block">
              <div className="filter-title">Options</div>
              <div style={{display:'flex',gap:8,marginTop:6}}>
                <button className={`play-cat-btn ${allowInversions ? 'active' : ''}`} onClick={() => setAllowInversions(v => !v)}>Allow Inversions</button>
                <button className={`play-cat-btn ${showNotes ? 'active' : ''}`} onClick={() => setShowNotes(v => !v)}>Show Notes</button>
                <div style={{display:'flex',alignItems:'center',gap:6,marginLeft:6}}>
                  <label style={{fontSize:12,color:'var(--muted)'}}>Hold (s)</label>
                  <select value={holdSeconds} onChange={e => setHoldSeconds(Number(e.target.value))} style={{background:'transparent',border:'1px solid rgba(255,255,255,0.04)',color:'var(--muted)',padding:'4px 6px',borderRadius:6}}>
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                    <option value={5}>5</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="filter-block roots-block">
              <div className="filter-title">Allowed Roots</div>
              <div style={{display:'flex',gap:8,marginTop:6,marginBottom:8}}>
                <button className="play-cat-btn" onClick={selectAllRoots}>Select All</button>
                <button className="play-cat-btn" onClick={clearAllRoots}>Clear All</button>
                <button className="play-cat-btn" onClick={selectNaturalsRoots}>Naturals Only</button>
              </div>
              <div className="roots" style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:8}}>
                {ROOTS.map((rName, rIdx) => (
                  <button key={rIdx} className={`play-root-btn play-cat-btn ${selectedRoots.has(rIdx)?'active':''}`} onClick={() => {
                    setSelectedRoots(prev => {
                      const s = new Set(prev)
                      if (s.has(rIdx)) s.delete(rIdx); else s.add(rIdx)
                      return s
                    })
                  }}>{rName}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Center: full-width centered card with chord display + compact table */}
        <div style={{display:'flex',justifyContent:'center'}}>
          <div ref={centerCardRef} style={{width:'100%',maxWidth:1100,height:460,display:'flex',flexDirection:'column',justifyContent:'space-between',background:'rgba(255,255,255,0.02)',padding:18,borderRadius:8,position:'relative'}}>
            <div style={{display:'flex',flexDirection:'row',gap:20,alignItems:'center',justifyContent:'center',height:260}}>
              <div style={{flex:'1 1 auto',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minWidth:0}}>
                <div ref={chordRef} style={{fontSize:150,fontWeight:900,color:'var(--accent)',lineHeight:1,overflowWrap:'break-word',wordBreak:'break-word',maxWidth:'100%',textAlign:'center'}}>{showName()}</div>
                {(!allowedTemplates || allowedTemplates.length === 0 || !current) ? (
                  <div style={{marginTop:14,textAlign:'center',fontSize:16,color:'var(--muted)'}}><strong>Pick chord types or roots to enable templates</strong></div>
                ) : (
                  (() => {
                    const fakeMatch = { root: current.root, rootName: ROOTS[current.root], type: current.type, chordSize: current.size }
                    const fm = formatMatch(fakeMatch, [])
                    return (
                      <div style={{marginTop:12,textAlign:'center',fontSize:15,color:'var(--muted)'}}>
                        {allowInversions && currentInversion !== null ? (
                          <div style={{marginBottom:6}}>Inversion: {currentInversion}{currentInversion === 0 ? ' (root position)' : ''}</div>
                        ) : null}
                        <div><strong>{fm.longName}</strong></div>
                      </div>
                    )
                  })()
                )}
              </div>

              {/* table moved below - kept blank here so chord remains centered */}
            </div>

            {/* Transposed table below the chord: left header column 'Degree'/'Note' and columns per degree */}
            <div style={{display:'flex',justifyContent:'center',marginTop:6}}>
              <table className="primary-grid" style={{width:'auto',minWidth:160,borderCollapse:'collapse'}}>
                <tbody>
                  <tr>
                    <th style={{padding:8,textAlign:'left'}}>Degree</th>
                    {(currentOrderedPcs && currentOrderedPcs.length > 0 ? currentOrderedPcs : (current ? Array.from(current.pcs) : [])).map((pc, i) => (
                      <td key={`d-${i}`} style={{padding:8,textAlign:'center'}}>{i+1}</td>
                    ))}
                  </tr>
                  <tr>
                    <th style={{padding:8,textAlign:'left'}}>Note</th>
                    {(currentOrderedPcs && currentOrderedPcs.length > 0 ? currentOrderedPcs : (current ? Array.from(current.pcs) : [])).map((pc, i) => {
                      const present = pressedPCs.has(pc)
                      const cellStyle = present ? { background: 'var(--accent)', color: '#000' } : {}
                      return (<td key={`n-${i}`} style={{padding:8,textAlign:'center',...cellStyle}}>{ROOTS[pc]}</td>)
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{height:8}} />
            {/* Hold progress bar: fills while user holds the correct keys */}
            <div style={{display:'flex',justifyContent:'center',marginTop:8}}>
              <div style={{width:300,height:10,background:'rgba(255,255,255,0.06)',borderRadius:6,overflow:'hidden'}}>
                <div style={{height:'100%',width:`${Math.round(holdProgress*100)}%`,background:'var(--accent)',transition:'width 60ms linear'}} />
              </div>
            </div>
            <div style={{fontSize:13,color:'var(--muted)'}}>Templates available: {(allowedTemplates&&allowedTemplates.length)||0}</div>
            <div style={{marginTop:6,fontSize:13,color:'var(--muted)'}}>
              <strong>Possible C chords:</strong>
              {allowedForC && allowedForC.length > 0 ? (
                <span style={{marginLeft:8}}>{allowedForC.map(t => formatMatch({ root: 0, rootName: ROOTS[0], type: t.type, chordSize: t.size }, []).displayName).join(', ')}</span>
              ) : (
                <span style={{marginLeft:8,opacity:0.7}}>none</span>
              )}
            </div>
          </div>
        </div>

        {/* Bottom: Controls (full-width, below the center card) */}
        <div style={{display:'flex',justifyContent:'center'}}>
          <div style={{width:'100%',maxWidth:1100,display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8}}>
            <div style={{display:'flex',gap:8}}>
              <button className="primary-btn" onClick={start} disabled={!allowedTemplates || allowedTemplates.length === 0}>Start</button>
              <button className="primary-btn" onClick={stop}>Stop</button>
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <button className="primary-btn" onClick={() => setShowStats(true)}>View Stats</button>
              <div style={{display:'flex',alignItems:'center',gap:8,marginLeft:6}} />
              <button
                className="primary-btn"
                onClick={() => {
                  if (!allowedTemplates || allowedTemplates.length === 0) return
                  const next = pickDifferent(allowedTemplates, current)
                  if (next) {
                    setCurrent(next)
                    setRoundActive(false)
                    setRoundCanceled(false)
                    setHadWrongPress(false)
                    setPendingNext(null)
                    setStatus('idle')
                    setRoundStartTs(null)
                  }
                }}
                disabled={!allowedTemplates || allowedTemplates.length === 0}
              >
                Skip (S)
              </button>
              <div style={{marginLeft:12}}>{countdown != null ? <span style={{fontSize:18,fontWeight:800}}>Starting in {countdown}…</span> : null}</div>
              <div style={{marginLeft:12,fontSize:13,color:'var(--muted)'}}>
                <strong>Score:</strong> {score}
              </div>
              <div style={{marginLeft:12,padding:'6px 8px',borderRadius:8,fontWeight:700,display:'flex',alignItems:'center',gap:8,
                background: trackStats ? 'var(--accent)' : 'transparent',
                color: trackStats ? '#071025' : 'var(--muted)',
                border: trackStats ? 'none' : '1px solid rgba(255,255,255,0.04)'
              }}>
                <div style={{fontWeight:900}}>{trackStats ? 'Stat tracking: ON' : 'Stat tracking: OFF'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showStats ? (
        <div className="stats-modal">
          <h3>Play The Chord — Stats</h3>
          <button className="close-btn" onClick={() => setShowStats(false)}>Close</button>
          <div style={{display:'flex',alignItems:'center',gap:12,marginTop:12}}>
            <div style={{marginLeft:'auto'}}>
              <button className="primary-btn" onClick={resetStats}>Reset Stats</button>
              <button className="play-cat-btn" style={{marginLeft:8}} onClick={() => { setStatsSelectedCats(loadCategories()); setStatsSelectedRoots(loadRoots()) }}>Reset Filters</button>
            </div>
          </div>

          <div style={{marginTop:12}}>
            {/* Combined filters: Type filters + Root filters together */}
            <div style={{display:'flex',gap:18,flexWrap:'wrap',alignItems:'flex-start'}}>
              <div style={{minWidth:320}}>
                <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
                  <div className="filter-title" style={{marginRight:8}}>Type Filters</div>
                  <button className="play-cat-btn" onClick={selectAllStatsCats}>Select All</button>
                  <button className="play-cat-btn" onClick={clearAllStatsCats}>Clear All</button>
                </div>
                <div className="cats-row" role="toolbar" aria-label="Stats type filters" style={{display:'flex',flexWrap:'wrap',gap:6}}>
                  {Object.keys(CATEGORIES).map(k => (
                    <button key={`s-${k}`} className={`play-cat-btn ${statsSelectedCats[k] ? 'active' : ''}`} onClick={() => setStatsSelectedCats(s => ({...s, [k]: !s[k]}))}>
                      {CATEGORIES[k].label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{minWidth:260}}>
                <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
                  <div className="filter-title" style={{marginRight:8}}>Root Filters</div>
                  <button className="play-cat-btn" onClick={selectAllStatsRoots}>Select All</button>
                  <button className="play-cat-btn" onClick={clearAllStatsRoots}>Clear All</button>
                  <button className="play-cat-btn" onClick={() => setStatsSelectedRoots(new Set([0,2,4,5,7,9,11]))}>Naturals Only</button>
                </div>
                <div className="roots" style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:12}}>
                  {ROOTS.map((rName, rIdx) => (
                    <button key={`sr-${rIdx}`} className={`play-root-btn play-cat-btn ${statsSelectedRoots.has(rIdx)?'active':''}`} onClick={() => {
                      setStatsSelectedRoots(prev => {
                        const s = new Set(prev)
                        if (s.has(rIdx)) s.delete(rIdx); else s.add(rIdx)
                        return s
                      })
                    }}>{rName}</button>
                  ))}
                </div>
              </div>
            </div>

            <h4 style={{color:'var(--muted)',marginTop:6}}>Stats</h4>
            <table className="stats-table" style={{width:'100%'}}>
              <thead>
                <tr>
                  <th className="sortable" onClick={() => toggleStatsSort('chord')}>Chord {statsSortKey === 'chord' ? (statsSortDir === 'asc' ? '▲' : '▼') : ''}</th>
                  <th className="sortable" onClick={() => toggleStatsSort('description')}>Description {statsSortKey === 'description' ? (statsSortDir === 'asc' ? '▲' : '▼') : ''}</th>
                  <th className="sortable" onClick={() => toggleStatsSort('root')}>Root {statsSortKey === 'root' ? (statsSortDir === 'asc' ? '▲' : '▼') : ''}</th>
                  <th className="sortable" onClick={() => toggleStatsSort('accuracy')}>Accuracy {statsSortKey === 'accuracy' ? (statsSortDir === 'asc' ? '▲' : '▼') : ''}</th>
                  <th className="sortable" onClick={() => toggleStatsSort('attempts')}>Attempts {statsSortKey === 'attempts' ? (statsSortDir === 'asc' ? '▲' : '▼') : ''}</th>
                  <th className="sortable" onClick={() => toggleStatsSort('correct')}>Correct {statsSortKey === 'correct' ? (statsSortDir === 'asc' ? '▲' : '▼') : ''}</th>
                  <th className="sortable" onClick={() => toggleStatsSort('avg')}>Avg Speed (ms) {statsSortKey === 'avg' ? (statsSortDir === 'asc' ? '▲' : '▼') : ''}</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const entries = Object.entries((stats && stats.byChord) || {})
                  const rows = []
                    for (const [key, o] of entries) {
                    const [t, rStr] = key.split('@')
                    // type filter via tags
                    const tags = TYPE_TAGS[t] || []
                    if (tags.length === 0) {
                      if (!statsAllowedTypes.has(t)) continue
                    } else {
                      let ok = true
                      for (const tg of tags) if (!statsSelectedCats[tg]) { ok = false; break }
                      if (!ok) continue
                    }
                    const rnum = Number(rStr)
                    if (statsSelectedRoots && statsSelectedRoots.size > 0 && !statsSelectedRoots.has(rnum)) continue
                    const fakeMatch = { root: rnum, rootName: ROOTS[rnum], type: t, chordSize: 0 }
                    const fm = formatMatch(fakeMatch, [])
                    const avg = o.correct ? Math.round(o.totalTimeMs / o.correct) : Infinity
                    const accuracy = o.attempts ? (o.correct / o.attempts) * 100 : 0
                    rows.push({ key, entry: o, type: t, root: rnum, fm, avg, accuracy })
                  }

                  if (rows.length === 0) return (<tr><td colSpan={6} className="muted">No data</td></tr>)

                  rows.sort((a,b) => {
                    const dir = statsSortDir === 'asc' ? 1 : -1
                    switch (statsSortKey) {
                      case 'chord': return a.fm.displayName.localeCompare(b.fm.displayName) * dir
                      case 'description': return a.fm.longName.localeCompare(b.fm.longName) * dir
                      case 'root': return (a.root - b.root) * dir
                      case 'accuracy': return (a.accuracy - b.accuracy) * dir
                      case 'attempts': return (a.entry.attempts - b.entry.attempts) * dir
                      case 'correct': return (a.entry.correct - b.entry.correct) * dir
                      case 'avg': return (a.avg - b.avg) * dir
                      default: return 0
                    }
                  })

                  return rows.map(r => (
                    <tr key={r.key} style={{borderTop:'1px solid rgba(255,255,255,0.03)'}}>
                      <td style={{padding:6,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{r.fm.displayName}</td>
                      <td style={{padding:6,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{r.fm.longName}</td>
                      <td style={{padding:6}}>{ROOTS[r.root]}</td>
                      <td style={{padding:6}}>{`${r.accuracy.toFixed(1)}% (${r.entry.correct}/${r.entry.attempts})`}</td>
                      <td style={{padding:6}}>{r.entry.attempts}</td>
                      <td style={{padding:6}}>{r.entry.correct}</td>
                      <td style={{padding:6}}>{r.entry.correct? Math.round(r.entry.totalTimeMs / r.entry.correct) : '—'}</td>
                    </tr>
                  ))
                })()}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}
