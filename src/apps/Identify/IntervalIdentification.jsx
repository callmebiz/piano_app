import React, { useEffect, useMemo, useState } from 'react'
import Staff from '../../components/Staff'
import AnswerGrid from './AnswerGrid'
import StatsModal from '../../components/StatsModal'
import useIdentifyExercise from './useIdentifyExercise'
import { useStaffSettings } from '../../lib/staffSettings'
import { parseSpelling, spellingMidi, vexKeyFor, CANONICAL_ROOTS } from '../../lib/staffNotes'
import { noteFromInterval, isPerfectFamily } from '../../lib/intervals'

const ROOT_OCTAVE = 4

// Unison through octave — lib/intervals.js's own INTERVAL_DEGREES starts at
// 2 (matching the quality-grid reference layout), but this exercise also
// wants unison in scope, both as a quality (P1/A1) and as a "distance".
const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8]
const NUMBER_LABELS = { 1: 'Unison', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th', 6: '6th', 7: '7th', 8: 'Octave' }

const QUALITIES = [
  { id: 'A', label: 'Augmented' },
  { id: 'MP', label: 'Major/Perfect' },
  { id: 'm', label: 'minor' },
  { id: 'd', label: 'Diminished' }
]

function combosFor(qualityId) {
  if (qualityId === 'A') return NUMBERS.map((n) => ({ quality: 'A', number: n }))
  if (qualityId === 'MP') return NUMBERS.map((n) => ({ quality: isPerfectFamily(n) ? 'P' : 'M', number: n }))
  if (qualityId === 'm') return NUMBERS.filter((n) => !isPerfectFamily(n)).map((n) => ({ quality: 'm', number: n }))
  return NUMBERS.filter((n) => n !== 1).map((n) => ({ quality: 'd', number: n })) // 'd' — diminished unison isn't a real interval
}

const ANSWER_ROWS = [
  NUMBERS.map((n) => ({ label: `A${n}`, value: `A${n}` })),
  NUMBERS.map((n) => ({ label: `${isPerfectFamily(n) ? 'P' : 'M'}${n}`, value: `${isPerfectFamily(n) ? 'P' : 'M'}${n}` })),
  NUMBERS.map((n) => (isPerfectFamily(n) ? null : { label: `m${n}`, value: `m${n}` })),
  NUMBERS.map((n) => (n === 1 ? null : { label: `d${n}`, value: `d${n}` }))
]

// "Distance" mode ignores the spelled quality (M/m/P/A/d) entirely and just
// asks for the generic interval number — how many letter-names apart the
// two notes are, unison through octave — a simpler first skill than also
// judging major/minor/perfect/etc.
const DISTANCE_ROWS = [NUMBERS.map((n) => ({ label: NUMBER_LABELS[n], value: n }))]

// All 12 roots, correctly spelled via CANONICAL_ROOTS (flats on the black
// keys) so e.g. a Bb-rooted interval doesn't silently need a double
// accidental the way it would starting from A#.
function buildPool(enabledQualityIds) {
  const combos = enabledQualityIds.flatMap(combosFor)
  const items = []
  for (let rootPc = 0; rootPc < 12; rootPc++) {
    const { letter, accidental } = parseSpelling(CANONICAL_ROOTS[rootPc])
    const rootNote = { name: CANONICAL_ROOTS[rootPc], midi: spellingMidi(letter, accidental, ROOT_OCTAVE), vexKey: vexKeyFor(letter, accidental, ROOT_OCTAVE) }
    for (const { quality, number } of combos) {
      const target = noteFromInterval(letter, accidental, ROOT_OCTAVE, quality, number)
      if (!target) continue // would need a double sharp/flat — skip
      items.push({ name: `${quality}${number}`, root: rootNote, target })
    }
  }
  return items
}

export default function IntervalIdentification() {
  const staffSettings = useStaffSettings()

  const loadQualities = () => {
    try { const raw = localStorage.getItem('identify:interval:qualities'); if (raw) return JSON.parse(raw) } catch (e) {}
    return { A: true, MP: true, m: true, d: true }
  }
  const [qualities, setQualities] = useState(loadQualities)
  useEffect(() => { try { localStorage.setItem('identify:interval:qualities', JSON.stringify(qualities)) } catch (e) {} }, [qualities])

  const loadDistanceMode = () => {
    try { const raw = localStorage.getItem('identify:interval:distanceMode'); if (raw) return JSON.parse(raw) } catch (e) {}
    return false
  }
  const [distanceMode, setDistanceMode] = useState(loadDistanceMode)
  useEffect(() => { try { localStorage.setItem('identify:interval:distanceMode', JSON.stringify(distanceMode)) } catch (e) {} }, [distanceMode])

  const pool = useMemo(() => buildPool(QUALITIES.filter((q) => qualities[q.id]).map((q) => q.id)), [qualities])

  // Reads the number straight off prompt.name (e.g. 'P8' -> 8) rather than
  // re-deriving it from the two notes' letters — genericIntervalNumber can't
  // tell a unison from an octave (or a 15th) since same-letter pairs are
  // indistinguishable by letter alone; the pool already knows the real
  // answer from how it built the prompt, no need to re-derive it.
  const promptNumber = (prompt) => Number(prompt.name.slice(1))

  const [showStats, setShowStats] = useState(false)

  const { current, score, lastResult, submitAnswer, skip, resetScore } = useIdentifyExercise({
    pool,
    isCorrect: distanceMode
      ? (prompt, answer) => answer === promptNumber(prompt)
      : (prompt, answer) => answer === prompt.name,
    // Same stats bucket regardless of mode.
    exercise: 'identify-interval',
    promptKey: (p) => `${p.root.name}${p.root.midi}-${p.name}`,
    promptLabel: (p) => `${p.root.name} ${p.name}`
  })

  // Same stale-pick issue as Note ID: without forcing a fresh pick, toggling
  // a quality back on can leave the currently-shown prompt unchanged.
  useEffect(() => {
    skip()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qualities])

  const staffNotes = current
    ? [{ keys: [current.root, current.target].sort((a, b) => a.midi - b.midi).map((n) => n.vexKey), duration: 'w' }]
    : []

  const cellState = (value) => {
    if (!lastResult) return null
    const correctValue = distanceMode ? (current && promptNumber(current)) : current && current.name
    if (value === correctValue) return 'correct'
    if (value === lastResult.answer && !lastResult.correct) return 'wrong'
    return null
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <div className="filter-block">
          <div className="filter-title">Qualities</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            {QUALITIES.map((q) => (
              <button key={q.id} className={`play-cat-btn ${qualities[q.id] ? 'active' : ''}`} onClick={() => setQualities((s) => ({ ...s, [q.id]: !s[q.id] }))}>
                {q.label}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-block">
          <div className="filter-title">Options</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button className={`play-cat-btn ${distanceMode ? 'active' : ''}`} onClick={() => setDistanceMode((v) => !v)} title="Ask for the generic interval number (unison-octave) instead of the spelled quality">
              Distance Only
            </button>
          </div>
        </div>
      </div>

      <div className="identify-header">Interval Identification</div>
      <div className="identify-card">
        {current ? (
          <div className="identify-staff-wrap" style={{ justifyContent: staffSettings.align === 'left' ? 'flex-start' : staffSettings.align === 'right' ? 'flex-end' : 'center' }}>
            <div style={{ width: staffSettings.width * staffSettings.scale }}>
              <Staff clef="treble" notes={staffNotes} minHeight={160} scale={staffSettings.scale} />
            </div>
          </div>
        ) : (
          <div className="muted" style={{ textAlign: 'center', padding: '2rem' }}>No intervals available for the current options</div>
        )}

        <AnswerGrid rows={distanceMode ? DISTANCE_ROWS : ANSWER_ROWS} columns={8} onSelect={submitAnswer} cellState={cellState} disabled={!current || !!lastResult} />

        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 20 }}>
          <button className="primary-btn" onClick={skip} disabled={!current}>Skip</button>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            <strong>Score:</strong> {score.correct}/{score.total}
            {score.total > 0 ? ` (${Math.round((score.correct / score.total) * 100)}%)` : ''}
          </div>
          <button className="play-cat-btn" onClick={resetScore}>Reset Score</button>
          <button className="play-cat-btn" onClick={() => setShowStats(true)}>View Stats</button>
        </div>
      </div>

      <StatsModal exercise="identify-interval" title="Interval Identification" open={showStats} onClose={() => setShowStats(false)} />
    </div>
  )
}
