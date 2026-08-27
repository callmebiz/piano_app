import React, { useEffect, useMemo, useState } from 'react'
import Staff from '../../components/Staff'
import AnswerGrid from './AnswerGrid'
import useIdentifyExercise from './useIdentifyExercise'
import { useStaffSettings } from '../../lib/staffSettings'
import { parseSpelling, spellingMidi, vexKeyFor, CANONICAL_ROOTS } from '../../lib/staffNotes'
import { noteFromInterval, INTERVAL_DEGREES, isPerfectFamily } from '../../lib/intervals'

const ROOT_OCTAVE = 4

const QUALITIES = [
  { id: 'A', label: 'Augmented' },
  { id: 'MP', label: 'Major/Perfect' },
  { id: 'm', label: 'minor' },
  { id: 'd', label: 'Diminished' }
]

function combosFor(qualityId) {
  if (qualityId === 'A') return INTERVAL_DEGREES.map((n) => ({ quality: 'A', number: n }))
  if (qualityId === 'MP') return INTERVAL_DEGREES.map((n) => ({ quality: isPerfectFamily(n) ? 'P' : 'M', number: n }))
  if (qualityId === 'm') return INTERVAL_DEGREES.filter((n) => !isPerfectFamily(n)).map((n) => ({ quality: 'm', number: n }))
  return INTERVAL_DEGREES.map((n) => ({ quality: 'd', number: n })) // 'd'
}

const ANSWER_ROWS = [
  INTERVAL_DEGREES.map((n) => ({ label: `A${n}`, value: `A${n}` })),
  INTERVAL_DEGREES.map((n) => ({ label: `${isPerfectFamily(n) ? 'P' : 'M'}${n}`, value: `${isPerfectFamily(n) ? 'P' : 'M'}${n}` })),
  INTERVAL_DEGREES.map((n) => (isPerfectFamily(n) ? null : { label: `m${n}`, value: `m${n}` })),
  INTERVAL_DEGREES.map((n) => ({ label: `d${n}`, value: `d${n}` }))
]

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

  const pool = useMemo(() => buildPool(QUALITIES.filter((q) => qualities[q.id]).map((q) => q.id)), [qualities])

  const { current, score, lastResult, submitAnswer, skip, resetScore } = useIdentifyExercise({
    pool,
    isCorrect: (prompt, answer) => answer === prompt.name,
    statsKey: 'identify:interval:stats',
    promptKey: (p) => `${p.root.name}${p.root.midi}-${p.name}`
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
    if (current && value === current.name) return 'correct'
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

        <AnswerGrid rows={ANSWER_ROWS} columns={7} onSelect={submitAnswer} cellState={cellState} disabled={!current || !!lastResult} />

        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 20 }}>
          <button className="primary-btn" onClick={skip} disabled={!current}>Skip</button>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            <strong>Score:</strong> {score.correct}/{score.total}
            {score.total > 0 ? ` (${Math.round((score.correct / score.total) * 100)}%)` : ''}
          </div>
          <button className="play-cat-btn" onClick={resetScore}>Reset Score</button>
        </div>
      </div>
    </div>
  )
}
