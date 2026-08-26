import React, { useEffect, useMemo, useState, useRef } from 'react'
import { SCALE_TYPES, scaleLongNames, buildScaleSequence, buildTwoHandSequence, buildDegreeLabels, scaleDisplayName, ROOTS, MAX_OCTAVES } from '../../lib/scales'
import useHoldToSkip from '../../hooks/useHoldToSkip'

function randomInt(max) { return Math.floor(Math.random() * max) }

export default function Scales({ pressedNotes, setKeyboardTargetPCs = () => {} }) {
  // --- Filters (main filters are intentionally non-persistent, like Play The Chord)
  const loadTypes = () => {
    const def = {}
    for (const k of SCALE_TYPES) def[k] = false
    def.major = true
    def.natMinor = true
    def.majPent = true
    def.minPent = true
    return def
  }
  const loadRoots = () => new Set([0, 2, 4, 5, 7, 9, 11])

  const [selectedTypes, setSelectedTypes] = useState(loadTypes)
  const [selectedRoots, setSelectedRoots] = useState(loadRoots)

  const loadShowNotes = () => {
    try { const raw = localStorage.getItem('scales:showNotes'); if (raw) return JSON.parse(raw) } catch (e) {}
    return true
  }
  const [showNotes, setShowNotes] = useState(loadShowNotes)
  useEffect(() => { try { localStorage.setItem('scales:showNotes', JSON.stringify(showNotes)) } catch (e) {} }, [showNotes])

  const loadDescending = () => {
    try { const raw = localStorage.getItem('scales:descending'); if (raw) return JSON.parse(raw) } catch (e) {}
    return true
  }
  const [descending, setDescending] = useState(loadDescending)
  useEffect(() => { try { localStorage.setItem('scales:descending', JSON.stringify(descending)) } catch (e) {} }, [descending])

  const loadOctaves = () => {
    try { const raw = localStorage.getItem('scales:octaves'); if (raw) return Number(raw) } catch (e) {}
    return 1
  }
  const [octaves, setOctaves] = useState(loadOctaves)
  useEffect(() => { try { localStorage.setItem('scales:octaves', String(octaves)) } catch (e) {} }, [octaves])

  const loadTwoHands = () => {
    try { const raw = localStorage.getItem('scales:twoHands'); if (raw) return JSON.parse(raw) } catch (e) {}
    return false
  }
  const [twoHands, setTwoHands] = useState(loadTwoHands)
  useEffect(() => { try { localStorage.setItem('scales:twoHands', JSON.stringify(twoHands)) } catch (e) {} }, [twoHands])

  const selectAllTypes = () => { const out = {}; for (const k of SCALE_TYPES) out[k] = true; setSelectedTypes(out) }
  const clearAllTypes = () => { const out = {}; for (const k of SCALE_TYPES) out[k] = false; setSelectedTypes(out) }
  const selectAllRoots = () => setSelectedRoots(new Set(Array.from({ length: 12 }, (_, i) => i)))
  const clearAllRoots = () => setSelectedRoots(new Set())
  const selectNaturalsRoots = () => setSelectedRoots(new Set([0, 2, 4, 5, 7, 9, 11]))

  // allowed root/type combinations
  const allowedCombos = useMemo(() => {
    const combos = []
    for (const t of SCALE_TYPES) {
      if (!selectedTypes[t]) continue
      for (const r of Array.from(selectedRoots)) combos.push({ type: t, root: r })
    }
    return combos
  }, [selectedTypes, selectedRoots])

  const pickInitial = () => {
    if (allowedCombos && allowedCombos.length > 0) return allowedCombos[randomInt(allowedCombos.length)]
    return null
  }
  const pickDifferent = (pool, avoid) => {
    if (!pool || pool.length === 0) return null
    if (!avoid) return pool[randomInt(pool.length)]
    if (pool.length === 1) return pool[0]
    for (let i = 0; i < 8; i++) {
      const cand = pool[randomInt(pool.length)]
      if (!(cand.type === avoid.type && cand.root === avoid.root)) return cand
    }
    for (const p of pool) if (!(p.type === avoid.type && p.root === avoid.root)) return p
    return pool[0]
  }

  const [current, setCurrent] = useState(() => pickInitial())

  // Bumped every time a fresh attempt begins (Start, Skip, solved->next, filter
  // repick). `current` alone can't drive that: when only one combo is allowed,
  // pickDifferent legitimately returns the very same object, so setCurrent(...)
  // is a referential no-op and effects keyed off `current` never re-fire.
  const [attemptSeq, setAttemptSeq] = useState(0)
  const beginAttempt = (next) => {
    setCurrent(next)
    setAttemptSeq(s => s + 1)
  }

  // keep current valid as filters change
  useEffect(() => {
    try {
      if (!allowedCombos || allowedCombos.length === 0) {
        if (current !== null) setCurrent(null)
        return
      }
      if (!current) {
        beginAttempt(allowedCombos[randomInt(allowedCombos.length)])
        return
      }
      const stillAllowed = allowedCombos.some(c => c.type === current.type && c.root === current.root)
      if (!stillAllowed) beginAttempt(allowedCombos[randomInt(allowedCombos.length)])
    } catch (e) {
      console.warn('Scales filter update error', e)
    }
  }, [allowedCombos])

  const [status, setStatus] = useState('idle')
  const [score, setScore] = useState(0)
  const [countdown, setCountdown] = useState(null)
  const [roundActive, setRoundActive] = useState(false)
  const [roundCanceled, setRoundCanceled] = useState(false)
  const [roundStartTs, setRoundStartTs] = useState(null)
  const [hadWrongPress, setHadWrongPress] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [pendingNext, setPendingNext] = useState(null)

  const [stats, setStats] = useState(() => {
    try { const raw = localStorage.getItem('scales:stats'); if (raw) return JSON.parse(raw) } catch (e) {}
    return { byType: {}, byRoot: {}, byScale: {} }
  })
  const loadTrackStats = () => {
    try { const raw = localStorage.getItem('scales:trackStats'); if (raw) return JSON.parse(raw) } catch (e) {}
    return false
  }
  const [trackStats, setTrackStats] = useState(loadTrackStats)
  useEffect(() => { try { localStorage.setItem('scales:trackStats', JSON.stringify(trackStats)) } catch (e) {} }, [trackStats])

  // Stats modal independent filters
  const loadStatsTypes = () => {
    try {
      const raw = localStorage.getItem('scales:stats:types')
      if (!raw) return loadTypes()
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const out = {}
        let seenAny = false
        for (const k of SCALE_TYPES) {
          if (Object.prototype.hasOwnProperty.call(parsed, k)) { out[k] = !!parsed[k]; seenAny = true }
        }
        if (seenAny) return out
      }
    } catch (e) {}
    return loadTypes()
  }
  const [statsSelectedTypes, setStatsSelectedTypes] = useState(loadStatsTypes)
  useEffect(() => { try { localStorage.setItem('scales:stats:types', JSON.stringify(statsSelectedTypes)) } catch (e) {} }, [statsSelectedTypes])

  const loadStatsRoots = () => {
    try {
      const raw = localStorage.getItem('scales:stats:roots')
      if (!raw) return loadRoots()
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const sel = new Set()
        for (const v of parsed) { const n = Number(v); if (!Number.isNaN(n) && n >= 0 && n < 12) sel.add(n) }
        if (sel.size > 0) return sel
      }
    } catch (e) {}
    return loadRoots()
  }
  const [statsSelectedRoots, setStatsSelectedRoots] = useState(loadStatsRoots)
  useEffect(() => { try { localStorage.setItem('scales:stats:roots', JSON.stringify(Array.from(statsSelectedRoots))) } catch (e) {} }, [statsSelectedRoots])

  const selectAllStatsTypes = () => { const out = {}; for (const k of SCALE_TYPES) out[k] = true; setStatsSelectedTypes(out) }
  const clearAllStatsTypes = () => { const out = {}; for (const k of SCALE_TYPES) out[k] = false; setStatsSelectedTypes(out) }
  const selectAllStatsRoots = () => setStatsSelectedRoots(new Set(Array.from({ length: 12 }, (_, i) => i)))
  const clearAllStatsRoots = () => setStatsSelectedRoots(new Set())

  const [statsSortKey, setStatsSortKey] = useState('attempts')
  const [statsSortDir, setStatsSortDir] = useState('desc')
  const toggleStatsSort = (key) => {
    if (statsSortKey === key) setStatsSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setStatsSortKey(key); setStatsSortDir('desc') }
  }

  const countdownRef = useRef(null)

  // The keyboard suggests a starting register near middle C, but the player can
  // begin on any octave of the root — whichever octave they actually start on
  // is captured here and the whole sequence re-anchors around it.
  const [startAnchor, setStartAnchor] = useState(null)
  const startAnchorRef = useRef(null)
  // Two Hands: the gap between hands (in semitones, a multiple of 12) is
  // likewise discovered from wherever the player actually places their hands,
  // not fixed to exactly one octave.
  const [handGap, setHandGap] = useState(null)

  // --- Build the practice sequence for the current scale (single line — used for
  // the highlighted-note fallback, the degree/note table, and the pitch classes
  // both hands share).
  const { midis: sequence, orderedPcs } = useMemo(() => {
    if (!current) return { midis: [], orderedPcs: [] }
    return buildScaleSequence(current.root, current.type, { descending, octaves, anchor: startAnchor || 60 })
  }, [current, descending, octaves, startAnchor])

  // --- Two-hand variant: right hand as above, left hand `handGap` semitones below.
  const { left: leftHand, right: rightHand } = useMemo(() => {
    if (!current || !twoHands) return { left: { midis: [] }, right: { midis: [] } }
    return buildTwoHandSequence(current.root, current.type, { descending, octaves, anchor: startAnchor || 60, handGapSemitones: handGap || 12 })
  }, [current, twoHands, descending, octaves, startAnchor, handGap])

  const degreeLabels = useMemo(() => {
    if (!current) return []
    return buildDegreeLabels(current.type, { octaves, descending })
  }, [current, descending, octaves])

  // reset progress whenever a fresh attempt begins or the scale's shape changes
  const lastAdvancedStepRef = useRef(-1)
  useEffect(() => {
    setStepIndex(0)
    setHadWrongPress(false)
    lastAdvancedStepRef.current = -1
    startAnchorRef.current = null
    setStartAnchor(null)
    setHandGap(null)
  }, [attemptSeq, descending, octaves, twoHands])

  // Start per-scale timing for free-play when tracking is enabled and we're not in a timed round
  useEffect(() => {
    try {
      if (trackStats && current && !roundActive) setRoundStartTs(performance.now())
    } catch (e) {}
  }, [attemptSeq, trackStats, roundActive])

  useEffect(() => {
    if (!trackStats) {
      setPendingNext(null)
      setRoundStartTs(null)
      setRoundActive(false)
      setStatus('idle')
      setRoundCanceled(false)
    }
  }, [trackStats])

  const saveStats = (s) => {
    try { localStorage.setItem('scales:stats', JSON.stringify(s)) } catch (e) {}
    setStats(s)
  }
  const resetStats = () => saveStats({ byType: {}, byRoot: {}, byScale: {} })

  const recordRound = (combo, correct, timeMs) => {
    if (!combo) return
    if (!trackStats) return
    let base = { byType: {}, byRoot: {}, byScale: {} }
    try { const raw = localStorage.getItem('scales:stats'); if (raw) base = JSON.parse(raw) } catch (e) {}
    const s = JSON.parse(JSON.stringify(base))
    const t = combo.type
    if (!s.byType[t]) s.byType[t] = { attempts: 0, correct: 0, totalTimeMs: 0 }
    s.byType[t].attempts += 1
    if (correct) { s.byType[t].correct += 1; s.byType[t].totalTimeMs += (timeMs || 0) }
    const r = String(combo.root)
    if (!s.byRoot[r]) s.byRoot[r] = { attempts: 0, correct: 0, totalTimeMs: 0 }
    s.byRoot[r].attempts += 1
    if (correct) { s.byRoot[r].correct += 1; s.byRoot[r].totalTimeMs += (timeMs || 0) }
    const key = `${t}@${r}`
    if (!s.byScale) s.byScale = {}
    if (!s.byScale[key]) s.byScale[key] = { attempts: 0, correct: 0, totalTimeMs: 0, type: t, root: Number(r) }
    s.byScale[key].attempts += 1
    if (correct) { s.byScale[key].correct += 1; s.byScale[key].totalTimeMs += (timeMs || 0) }
    saveStats(s)
  }

  // number of notes currently held (used to know when the player has released everything)
  const pressedCount = useMemo(() => {
    if (!pressedNotes) return 0
    return Array.isArray(pressedNotes) ? pressedNotes.length : pressedNotes.size
  }, [pressedNotes])

  // --- Single-hand sequence tracking: diff pressed notes across renders and
  // advance stepIndex on each newly-attacked note that matches the next
  // expected pitch class (any octave — register is flexible one-handed).
  const prevPressedRef = useRef(new Set())
  const stepIndexRef = useRef(0)
  useEffect(() => { stepIndexRef.current = stepIndex }, [stepIndex])

  useEffect(() => {
    const currSet = pressedNotes ? (pressedNotes instanceof Set ? pressedNotes : new Set(Array.from(pressedNotes))) : new Set()
    if (twoHands) { prevPressedRef.current = currSet; return }
    const prev = prevPressedRef.current
    const added = []
    for (const n of currSet) if (!prev.has(n)) added.push(n)
    added.sort((a, b) => a - b)
    prevPressedRef.current = currSet

    if (added.length > 0 && sequence.length > 0 && stepIndexRef.current < sequence.length) {
      let idx = stepIndexRef.current
      let wrong = false
      for (const n of added) {
        if (idx >= sequence.length) break
        const expectedPc = orderedPcs[idx]
        const pc = ((n % 12) + 12) % 12
        if (pc === expectedPc) {
          // first note of the run: lock in whichever octave the player actually started on
          if (idx === 0 && startAnchorRef.current == null) {
            startAnchorRef.current = n
            setStartAnchor(n)
          }
          idx += 1
        } else {
          wrong = true
        }
      }
      if (idx !== stepIndexRef.current) {
        stepIndexRef.current = idx
        setStepIndex(idx)
      }
      if (wrong) setHadWrongPress(true)
    }
  }, [pressedNotes, sequence, orderedPcs, twoHands])

  // --- Two-hand sequence tracking: strict — the step only advances once both
  // hands' exact notes for that step are held down at the same time. Any other
  // note held alongside them taints the round (hadWrongPress) but doesn't block.
  // Step 0 is register-flexible: any two held notes an octave apart on the
  // expected pitch class are accepted, and that pair becomes the new anchor —
  // the player can start both hands anywhere on the keyboard.
  useEffect(() => {
    if (!twoHands) return
    const rMidis = rightHand.midis
    const lMidis = leftHand.midis
    if (!rMidis || rMidis.length === 0 || stepIndex >= rMidis.length) return
    const currSet = pressedNotes ? (pressedNotes instanceof Set ? pressedNotes : new Set(Array.from(pressedNotes))) : new Set()

    if (stepIndex === 0 && startAnchorRef.current == null) {
      // Find any two held notes on the expected pitch class that are a whole
      // number of octaves apart — that pair's gap becomes the hand gap, and
      // its higher note becomes the anchor. Prefer the smallest valid gap.
      const expectedPc = orderedPcs[0]
      const held = Array.from(currSet).filter(n => ((n % 12) + 12) % 12 === expectedPc).sort((a, b) => a - b)
      let best = null
      for (let i = 0; i < held.length; i++) {
        for (let j = i + 1; j < held.length; j++) {
          const gap = held[j] - held[i]
          if (gap % 12 !== 0 || gap > 12 * MAX_OCTAVES) continue
          if (!best || gap < best.gap) best = { hi: held[j], gap }
        }
      }
      if (best) {
        startAnchorRef.current = best.hi
        setStartAnchor(best.hi)
        setHandGap(best.gap)
        lastAdvancedStepRef.current = 0
        setStepIndex(1)
      }
      return
    }

    const reqL = lMidis[stepIndex]
    const reqR = rMidis[stepIndex]
    const hasBoth = currSet.has(reqL) && currSet.has(reqR)

    let wrong = false
    for (const n of currSet) if (n !== reqL && n !== reqR) { wrong = true; break }
    if (wrong) setHadWrongPress(true)

    if (hasBoth && lastAdvancedStepRef.current !== stepIndex) {
      lastAdvancedStepRef.current = stepIndex
      setStepIndex(i => i + 1)
    }
  }, [pressedNotes, twoHands, stepIndex, leftHand, rightHand, orderedPcs])

  // --- Completion: reached the end of the sequence
  useEffect(() => {
    if (sequence.length > 0 && stepIndex >= sequence.length && status !== 'solved') {
      const elapsed = roundStartTs ? Math.max(0, performance.now() - roundStartTs) : 0
      const pool = allowedCombos && allowedCombos.length > 0 ? allowedCombos : []
      if (roundActive) {
        setRoundActive(false)
        setScore(s => s + 1)
        if (!roundCanceled) recordRound(current, !hadWrongPress, elapsed)
      } else {
        recordRound(current, !hadWrongPress, elapsed)
      }
      setPendingNext(pool.length > 0 ? pickDifferent(pool, current) : null)
      setStatus('solved')
    }
  }, [stepIndex, sequence, status, roundActive, roundStartTs, roundCanceled, hadWrongPress, allowedCombos, current])

  // When solved and all keys released, advance to the pending next scale
  useEffect(() => {
    if (status === 'solved' && pendingNext && pressedCount === 0) {
      beginAttempt(pendingNext)
      setPendingNext(null)
      setStatus('idle')
      setRoundCanceled(false)
      if (trackStats) setRoundStartTs(performance.now())
    }
  }, [pressedCount, status, pendingNext, trackStats])

  // Push the current expected note(s) to the keyboard for highlighting — both
  // hands' exact keys when Two Hands is on, otherwise just the single next note.
  useEffect(() => {
    try {
      if (typeof setKeyboardTargetPCs !== 'function') return
      if (sequence.length > 0 && stepIndex < sequence.length) {
        const nextPc = orderedPcs[stepIndex]
        let mids
        if (twoHands && rightHand.midis.length > stepIndex && leftHand.midis.length > stepIndex) {
          mids = new Set([leftHand.midis[stepIndex], rightHand.midis[stepIndex]])
        } else {
          mids = new Set([sequence[stepIndex]])
        }
        setKeyboardTargetPCs({ mids: showNotes ? mids : new Set(), pcs: new Set([nextPc]) })
      } else {
        setKeyboardTargetPCs(new Set())
      }
    } catch (e) {}
    return () => { try { if (typeof setKeyboardTargetPCs === 'function') setKeyboardTargetPCs(new Set()) } catch (e) {} }
  }, [sequence, orderedPcs, stepIndex, showNotes, twoHands, leftHand, rightHand, setKeyboardTargetPCs])

  const start = () => {
    if (!allowedCombos || allowedCombos.length === 0) return
    let c = 3
    setCountdown(c)
    countdownRef.current = setInterval(() => {
      c -= 1
      if (c <= 0) {
        clearInterval(countdownRef.current)
        setCountdown(null)
        const next = pickDifferent(allowedCombos, current)
        beginAttempt(next)
        setRoundActive(true)
        setRoundCanceled(false)
        setRoundStartTs(performance.now())
        try { setTrackStats(true) } catch (e) {}
        setStatus('running')
      } else {
        setCountdown(c)
      }
    }, 1000)
  }

  const stop = () => {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; setCountdown(null) }
    if (roundActive) { setRoundActive(false); setRoundCanceled(true); setStatus('stopped') }
    try { setTrackStats(false) } catch (e) {}
    setRoundStartTs(null)
  }

  const skip = () => {
    if (!allowedCombos || allowedCombos.length === 0) return
    const next = pickDifferent(allowedCombos, current)
    if (next) {
      beginAttempt(next)
      setRoundActive(false)
      setRoundCanceled(false)
      setPendingNext(null)
      setStatus('idle')
      setRoundStartTs(null)
    }
  }

  // Double-tap-and-hold any note to skip (mirrors the Skip button/'S' shortcut)
  const skipHoldProgress = useHoldToSkip(pressedNotes, skip)

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
  }, [allowedCombos, current])

  const showName = () => current ? scaleDisplayName(current.root, current.type) : ''
  const allowedForC = useMemo(() => (allowedCombos || []).filter(c => c.root === 0), [allowedCombos])

  return (
    <div className="chord-app">
      <h2>Scales</h2>
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="filter-block">
            <div className="filter-title">Scale Types</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, marginBottom: 8 }}>
              <button className="play-cat-btn" onClick={selectAllTypes}>Select All</button>
              <button className="play-cat-btn" onClick={clearAllTypes}>Clear All</button>
            </div>
            <div className="cats-row" role="toolbar" aria-label="Scale type filters" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SCALE_TYPES.map(k => (
                <button key={k} className={`play-cat-btn ${selectedTypes[k] ? 'active' : ''}`} onClick={() => setSelectedTypes(s => ({ ...s, [k]: !s[k] }))}>
                  {scaleLongNames[k]}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-block">
            <div className="filter-title">Options</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className={`play-cat-btn ${showNotes ? 'active' : ''}`} onClick={() => setShowNotes(v => !v)}>Show Notes</button>
              <button className={`play-cat-btn ${descending ? 'active' : ''}`} onClick={() => setDescending(v => !v)}>Descending</button>
              <button className={`play-cat-btn ${twoHands ? 'active' : ''}`} onClick={() => setTwoHands(v => !v)}>Two Hands</button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 6 }}>
                <label style={{ fontSize: 12, color: 'var(--muted)' }}>Octaves</label>
                <select value={octaves} onChange={e => setOctaves(Number(e.target.value))} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.04)', color: 'var(--muted)', padding: '4px 6px', borderRadius: 6 }}>
                  {Array.from({ length: MAX_OCTAVES }, (_, i) => i + 1).map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="filter-block roots-block">
            <div className="filter-title">Allowed Roots</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, marginBottom: 8 }}>
              <button className="play-cat-btn" onClick={selectAllRoots}>Select All</button>
              <button className="play-cat-btn" onClick={clearAllRoots}>Clear All</button>
              <button className="play-cat-btn" onClick={selectNaturalsRoots}>Naturals Only</button>
            </div>
            <div className="roots" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {ROOTS.map((rName, rIdx) => (
                <button key={rIdx} className={`play-root-btn play-cat-btn ${selectedRoots.has(rIdx) ? 'active' : ''}`} onClick={() => {
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

        {/* Center card */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 1100, minHeight: 460, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)', padding: 18, borderRadius: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 160 }}>
              <div style={{ fontSize: 56, fontWeight: 900, color: 'var(--accent)', lineHeight: 1.1, textAlign: 'center' }}>{showName()}</div>
              {(!allowedCombos || allowedCombos.length === 0 || !current) ? (
                <div style={{ marginTop: 14, textAlign: 'center', fontSize: 16, color: 'var(--muted)' }}><strong>Pick scale types or roots to enable practice</strong></div>
              ) : (
                <div style={{ marginTop: 12, textAlign: 'center', fontSize: 15, color: 'var(--muted)' }}>
                  <div><strong>{scaleLongNames[current.type]}</strong></div>
                  <div style={{ marginTop: 4 }}>
                    {descending ? 'Ascending + Descending' : 'Ascending only'}
                    {octaves > 1 ? ` • ${octaves} octaves` : ''}
                    {twoHands ? ` • Two Hands${handGap ? ` (${handGap / 12} octave${handGap === 12 ? '' : 's'} apart)` : ' (start both hands to set the gap)'}` : ''}
                  </div>
                </div>
              )}
            </div>

            {/* Degree/Note table showing the full sequence with progress */}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12, overflowX: 'auto' }}>
              <table className="primary-grid" style={{ width: 'auto', minWidth: 160, borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <th style={{ padding: 8, textAlign: 'left' }}>Degree</th>
                    {degreeLabels.map((d, i) => (
                      <td key={`d-${i}`} style={{ padding: 8, textAlign: 'center' }}>{d}</td>
                    ))}
                  </tr>
                  <tr>
                    <th style={{ padding: 8, textAlign: 'left' }}>Note</th>
                    {orderedPcs.map((pc, i) => {
                      const isDone = i < stepIndex
                      const isCurrent = i === stepIndex
                      const cellStyle = isDone
                        ? { background: 'var(--accent)', color: '#000' }
                        : isCurrent
                          ? { border: '2px solid var(--accent)', fontWeight: 800 }
                          : { opacity: 0.55 }
                      return (<td key={`n-${i}`} style={{ padding: 8, textAlign: 'center', ...cellStyle }}>{ROOTS[pc]}</td>)
                    })}
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ height: 8 }} />
            {/* Sequence progress bar */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 8, gap: 6 }}>
              <div style={{ width: 300, height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${sequence.length ? Math.round((stepIndex / sequence.length) * 100) : 0}%`, background: 'var(--accent)', transition: 'width 120ms linear' }} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{sequence.length ? `${stepIndex}/${sequence.length} notes` : ''}</div>
            </div>

            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>Scales available: {(allowedCombos && allowedCombos.length) || 0}</div>
            <div style={{ marginTop: 6, fontSize: 13, color: 'var(--muted)' }}>
              <strong>Possible C scales:</strong>
              {allowedForC && allowedForC.length > 0 ? (
                <span style={{ marginLeft: 8 }}>{allowedForC.map(c => scaleDisplayName(0, c.type)).join(', ')}</span>
              ) : (
                <span style={{ marginLeft: 8, opacity: 0.7 }}>none</span>
              )}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 1100, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="primary-btn" onClick={start} disabled={!allowedCombos || allowedCombos.length === 0}>Start</button>
              <button className="primary-btn" onClick={stop}>Stop</button>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="primary-btn" onClick={() => setShowStats(true)}>View Stats</button>
              <button className="primary-btn" onClick={skip} disabled={!allowedCombos || allowedCombos.length === 0} style={{ position: 'relative', overflow: 'hidden' }} title="Double-tap and hold any note to skip">
                <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${skipHoldProgress * 100}%`, background: 'rgba(0,0,0,0.28)', transition: skipHoldProgress === 0 ? 'width 150ms ease-out' : 'none', pointerEvents: 'none' }} />
                <span style={{ position: 'relative' }}>Skip (S)</span>
              </button>
              <div style={{ marginLeft: 12 }}>{countdown != null ? <span style={{ fontSize: 18, fontWeight: 800 }}>Starting in {countdown}…</span> : null}</div>
              <div style={{ marginLeft: 12, fontSize: 13, color: 'var(--muted)' }}>
                <strong>Score:</strong> {score}
              </div>
              <div style={{
                marginLeft: 12, padding: '6px 8px', borderRadius: 8, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8,
                background: trackStats ? 'var(--accent)' : 'transparent',
                color: trackStats ? '#071025' : 'var(--muted)',
                border: trackStats ? 'none' : '1px solid rgba(255,255,255,0.04)'
              }}>
                <div style={{ fontWeight: 900 }}>{trackStats ? 'Stat tracking: ON' : 'Stat tracking: OFF'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showStats ? (
        <div className="stats-modal">
          <h3>Scales — Stats</h3>
          <button className="close-btn" onClick={() => setShowStats(false)}>Close</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <div style={{ marginLeft: 'auto' }}>
              <button className="primary-btn" onClick={resetStats}>Reset Stats</button>
              <button className="play-cat-btn" style={{ marginLeft: 8 }} onClick={() => { setStatsSelectedTypes(loadTypes()); setStatsSelectedRoots(loadRoots()) }}>Reset Filters</button>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 320 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <div className="filter-title" style={{ marginRight: 8 }}>Type Filters</div>
                  <button className="play-cat-btn" onClick={selectAllStatsTypes}>Select All</button>
                  <button className="play-cat-btn" onClick={clearAllStatsTypes}>Clear All</button>
                </div>
                <div className="cats-row" role="toolbar" aria-label="Stats type filters" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {SCALE_TYPES.map(k => (
                    <button key={`s-${k}`} className={`play-cat-btn ${statsSelectedTypes[k] ? 'active' : ''}`} onClick={() => setStatsSelectedTypes(s => ({ ...s, [k]: !s[k] }))}>
                      {scaleLongNames[k]}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ minWidth: 260 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <div className="filter-title" style={{ marginRight: 8 }}>Root Filters</div>
                  <button className="play-cat-btn" onClick={selectAllStatsRoots}>Select All</button>
                  <button className="play-cat-btn" onClick={clearAllStatsRoots}>Clear All</button>
                  <button className="play-cat-btn" onClick={() => setStatsSelectedRoots(new Set([0, 2, 4, 5, 7, 9, 11]))}>Naturals Only</button>
                </div>
                <div className="roots" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {ROOTS.map((rName, rIdx) => (
                    <button key={`sr-${rIdx}`} className={`play-root-btn play-cat-btn ${statsSelectedRoots.has(rIdx) ? 'active' : ''}`} onClick={() => {
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

            <h4 style={{ color: 'var(--muted)', marginTop: 6 }}>Stats</h4>
            <table className="stats-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th className="sortable" onClick={() => toggleStatsSort('scale')}>Scale {statsSortKey === 'scale' ? (statsSortDir === 'asc' ? '▲' : '▼') : ''}</th>
                  <th className="sortable" onClick={() => toggleStatsSort('root')}>Root {statsSortKey === 'root' ? (statsSortDir === 'asc' ? '▲' : '▼') : ''}</th>
                  <th className="sortable" onClick={() => toggleStatsSort('accuracy')}>Accuracy {statsSortKey === 'accuracy' ? (statsSortDir === 'asc' ? '▲' : '▼') : ''}</th>
                  <th className="sortable" onClick={() => toggleStatsSort('attempts')}>Attempts {statsSortKey === 'attempts' ? (statsSortDir === 'asc' ? '▲' : '▼') : ''}</th>
                  <th className="sortable" onClick={() => toggleStatsSort('correct')}>Correct {statsSortKey === 'correct' ? (statsSortDir === 'asc' ? '▲' : '▼') : ''}</th>
                  <th className="sortable" onClick={() => toggleStatsSort('avg')}>Avg Speed (ms) {statsSortKey === 'avg' ? (statsSortDir === 'asc' ? '▲' : '▼') : ''}</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const entries = Object.entries((stats && stats.byScale) || {})
                  const rows = []
                  for (const [key, o] of entries) {
                    const [t, rStr] = key.split('@')
                    if (!statsSelectedTypes[t]) continue
                    const rnum = Number(rStr)
                    if (statsSelectedRoots && statsSelectedRoots.size > 0 && !statsSelectedRoots.has(rnum)) continue
                    const name = scaleDisplayName(rnum, t)
                    const avg = o.correct ? Math.round(o.totalTimeMs / o.correct) : Infinity
                    const accuracy = o.attempts ? (o.correct / o.attempts) * 100 : 0
                    rows.push({ key, entry: o, type: t, root: rnum, name, avg, accuracy })
                  }

                  if (rows.length === 0) return (<tr><td colSpan={6} className="muted">No data</td></tr>)

                  rows.sort((a, b) => {
                    const dir = statsSortDir === 'asc' ? 1 : -1
                    switch (statsSortKey) {
                      case 'scale': return a.name.localeCompare(b.name) * dir
                      case 'root': return (a.root - b.root) * dir
                      case 'accuracy': return (a.accuracy - b.accuracy) * dir
                      case 'attempts': return (a.entry.attempts - b.entry.attempts) * dir
                      case 'correct': return (a.entry.correct - b.entry.correct) * dir
                      case 'avg': return (a.avg - b.avg) * dir
                      default: return 0
                    }
                  })

                  return rows.map(r => (
                    <tr key={r.key} style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: 6, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{r.name}</td>
                      <td style={{ padding: 6 }}>{ROOTS[r.root]}</td>
                      <td style={{ padding: 6 }}>{`${r.accuracy.toFixed(1)}% (${r.entry.correct}/${r.entry.attempts})`}</td>
                      <td style={{ padding: 6 }}>{r.entry.attempts}</td>
                      <td style={{ padding: 6 }}>{r.entry.correct}</td>
                      <td style={{ padding: 6 }}>{r.entry.correct ? Math.round(r.entry.totalTimeMs / r.entry.correct) : '—'}</td>
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
