import React, { useEffect, useMemo, useState } from 'react'
import Staff from '../../components/Staff'
import AnswerGrid from './AnswerGrid'
import useIdentifyExercise from './useIdentifyExercise'
import { useStaffSettings } from '../../lib/staffSettings'
import { buildChordSpelling } from '../../lib/chords'

const CHORD_TYPES = ['major', 'minor', 'aug', 'dim', '7', 'M7', 'm7', 'm7b5', 'dim7']
const CHORD_LABELS = {
  major: 'Major Triad',
  minor: 'Minor Triad',
  aug: 'Augmented Triad',
  dim: 'Diminished Triad',
  '7': 'Dominant 7th',
  M7: 'Major 7th',
  m7: 'Minor 7th',
  m7b5: 'Half-diminished 7th',
  dim7: 'Diminished 7th'
}

function buildPool(enabledTypes) {
  const items = []
  for (let root = 0; root < 12; root++) {
    for (const type of enabledTypes) {
      const notes = buildChordSpelling(root, type, { octave: 4 })
      if (!notes) continue // would need a double sharp/flat at this root — skip
      items.push({ name: type, root, vexKeys: notes.map((n) => n.vexKey) })
    }
  }
  return items
}

// 2-column list of chord-type names, matching the reference layout.
const ANSWER_ROWS = (() => {
  const rows = []
  for (let i = 0; i < CHORD_TYPES.length; i += 2) {
    const a = CHORD_TYPES[i]
    const b = CHORD_TYPES[i + 1]
    rows.push([{ label: CHORD_LABELS[a], value: a }, b ? { label: CHORD_LABELS[b], value: b } : null])
  }
  return rows
})()

export default function ChordIdentification() {
  const staffSettings = useStaffSettings()

  const loadTypes = () => {
    try { const raw = localStorage.getItem('identify:chord:types'); if (raw) return JSON.parse(raw) } catch (e) {}
    return Object.fromEntries(CHORD_TYPES.map((t) => [t, true]))
  }
  const [types, setTypes] = useState(loadTypes)
  useEffect(() => { try { localStorage.setItem('identify:chord:types', JSON.stringify(types)) } catch (e) {} }, [types])
  const selectAll = () => setTypes(Object.fromEntries(CHORD_TYPES.map((t) => [t, true])))
  const clearAll = () => setTypes(Object.fromEntries(CHORD_TYPES.map((t) => [t, false])))

  const pool = useMemo(() => buildPool(CHORD_TYPES.filter((t) => types[t])), [types])

  const { current, score, lastResult, submitAnswer, skip, resetScore } = useIdentifyExercise({
    pool,
    isCorrect: (prompt, answer) => answer === prompt.name,
    statsKey: 'identify:chord:stats',
    promptKey: (p) => `${p.name}-${p.root}`
  })

  // Same stale-pick issue as Note ID: without forcing a fresh pick, toggling
  // a type back on can leave the currently-shown prompt unchanged.
  useEffect(() => {
    skip()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [types])

  const staffNotes = current ? [{ keys: current.vexKeys, duration: 'w' }] : []

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
          <div className="filter-title">Chord Types</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, marginBottom: 8 }}>
            <button className="play-cat-btn" onClick={selectAll}>Select All</button>
            <button className="play-cat-btn" onClick={clearAll}>Clear All</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {CHORD_TYPES.map((t) => (
              <button key={t} className={`play-cat-btn ${types[t] ? 'active' : ''}`} onClick={() => setTypes((s) => ({ ...s, [t]: !s[t] }))}>
                {CHORD_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="identify-header">Chord Identification</div>
      <div className="identify-card">
        {current ? (
          <div className="identify-staff-wrap" style={{ justifyContent: staffSettings.align === 'left' ? 'flex-start' : staffSettings.align === 'right' ? 'flex-end' : 'center' }}>
            <div style={{ width: staffSettings.width * staffSettings.scale }}>
              <Staff clef="treble" notes={staffNotes} minHeight={160} scale={staffSettings.scale} />
            </div>
          </div>
        ) : (
          <div className="muted" style={{ textAlign: 'center', padding: '2rem' }}>No chords available for the current options</div>
        )}

        <AnswerGrid rows={ANSWER_ROWS} columns={2} onSelect={submitAnswer} cellState={cellState} disabled={!current || !!lastResult} />

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
