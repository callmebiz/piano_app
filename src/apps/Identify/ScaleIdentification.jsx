import React, { useEffect, useMemo, useState } from 'react'
import Staff from '../../components/Staff'
import AnswerGrid from './AnswerGrid'
import useIdentifyExercise from './useIdentifyExercise'
import { useStaffSettings } from '../../lib/staffSettings'
import { buildScaleSpelling, SCALE_TYPES, scaleLongNames } from '../../lib/scales'

// All 12 roots now that spelling is correctly handled (buildScaleSpelling
// skips any root/type combo that would need a double accidental).
function buildPool(enabledTypes) {
  const items = []
  for (let root = 0; root < 12; root++) {
    for (const type of enabledTypes) {
      const notes = buildScaleSpelling(root, type, { octave: 4 })
      if (!notes) continue
      items.push({ name: type, root, vexKeys: notes.map((n) => n.vexKey) })
    }
  }
  return items
}

// 2-column list of scale-type names, same shape as the Chord ID reference.
const ANSWER_ROWS = (() => {
  const rows = []
  for (let i = 0; i < SCALE_TYPES.length; i += 2) {
    const a = SCALE_TYPES[i]
    const b = SCALE_TYPES[i + 1]
    rows.push([{ label: scaleLongNames[a], value: a }, b ? { label: scaleLongNames[b], value: b } : null])
  }
  return rows
})()

const DEFAULT_TYPES = { major: true, natMinor: true, harMinor: false, melMinor: false, majPent: true, minPent: true, blues: false }

export default function ScaleIdentification() {
  const staffSettings = useStaffSettings()

  const loadTypes = () => {
    try { const raw = localStorage.getItem('identify:scale:types'); if (raw) return JSON.parse(raw) } catch (e) {}
    return DEFAULT_TYPES
  }
  const [types, setTypes] = useState(loadTypes)
  useEffect(() => { try { localStorage.setItem('identify:scale:types', JSON.stringify(types)) } catch (e) {} }, [types])
  const selectAll = () => setTypes(Object.fromEntries(SCALE_TYPES.map((t) => [t, true])))
  const clearAll = () => setTypes(Object.fromEntries(SCALE_TYPES.map((t) => [t, false])))

  const pool = useMemo(() => buildPool(SCALE_TYPES.filter((t) => types[t])), [types])

  const { current, score, lastResult, submitAnswer, skip, resetScore } = useIdentifyExercise({
    pool,
    isCorrect: (prompt, answer) => answer === prompt.name,
    statsKey: 'identify:scale:stats',
    promptKey: (p) => `${p.name}-${p.root}`
  })

  // Same stale-pick issue as Note ID: without forcing a fresh pick, toggling
  // a type back on can leave the currently-shown prompt unchanged.
  useEffect(() => {
    skip()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [types])

  const staffNotes = current ? current.vexKeys.map((k) => ({ keys: [k], duration: 'w' })) : []
  const staffWidth = current ? Math.max(staffSettings.width, 70 * current.vexKeys.length) * staffSettings.scale : staffSettings.width

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
          <div className="filter-title">Scale Types</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, marginBottom: 8 }}>
            <button className="play-cat-btn" onClick={selectAll}>Select All</button>
            <button className="play-cat-btn" onClick={clearAll}>Clear All</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SCALE_TYPES.map((t) => (
              <button key={t} className={`play-cat-btn ${types[t] ? 'active' : ''}`} onClick={() => setTypes((s) => ({ ...s, [t]: !s[t] }))}>
                {scaleLongNames[t]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="identify-header">Scale Identification</div>
      <div className="identify-card">
        {current ? (
          <div className="identify-staff-wrap" style={{ justifyContent: staffSettings.align === 'left' ? 'flex-start' : staffSettings.align === 'right' ? 'flex-end' : 'center' }}>
            <div style={{ width: staffWidth }}>
              <Staff clef="treble" notes={staffNotes} minHeight={160} scale={staffSettings.scale} />
            </div>
          </div>
        ) : (
          <div className="muted" style={{ textAlign: 'center', padding: '2rem' }}>No scales available for the current options</div>
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
