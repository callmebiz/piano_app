import React, { useEffect, useMemo, useState } from 'react'
import AnswerGrid from '../Identify/AnswerGrid'
import useIdentifyExercise from '../Identify/useIdentifyExercise'
import { buildScaleSpelling, SCALE_TYPES, scaleLongNames, ROOTS } from '../../lib/scales'
import { playChord } from '../../audio/engine'
import StatsModal from '../../components/StatsModal'

// Same pool as Scale Identification, played as an ascending run through the
// speaker instead of shown on a staff.
function buildPool(enabledTypes) {
  const items = []
  for (let root = 0; root < 12; root++) {
    for (const type of enabledTypes) {
      const notes = buildScaleSpelling(root, type, { octave: 4 })
      if (!notes) continue
      items.push({ name: type, root, midis: notes.map((n) => n.midi) })
    }
  }
  return items
}

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

export default function ScaleEarTraining() {
  const loadTypes = () => {
    try { const raw = localStorage.getItem('ear:scale:types'); if (raw) return JSON.parse(raw) } catch (e) {}
    return DEFAULT_TYPES
  }
  const [types, setTypes] = useState(loadTypes)
  useEffect(() => { try { localStorage.setItem('ear:scale:types', JSON.stringify(types)) } catch (e) {} }, [types])
  const selectAll = () => setTypes(Object.fromEntries(SCALE_TYPES.map((t) => [t, true])))
  const clearAll = () => setTypes(Object.fromEntries(SCALE_TYPES.map((t) => [t, false])))

  const pool = useMemo(() => buildPool(SCALE_TYPES.filter((t) => types[t])), [types])

  const [showStats, setShowStats] = useState(false)

  const { current, score, lastResult, submitAnswer, skip, resetScore } = useIdentifyExercise({
    pool,
    isCorrect: (prompt, answer) => answer === prompt.name,
    exercise: 'ear-scale',
    promptKey: (p) => `${p.name}-${p.root}`,
    promptLabel: (p) => `${ROOTS[p.root]} ${scaleLongNames[p.name]}`
  })

  useEffect(() => {
    skip()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [types])

  const play = () => {
    if (!current) return
    const stepMs = 260
    current.midis.forEach((midi, i) => {
      setTimeout(() => playChord([midi], stepMs + 40), i * stepMs)
    })
  }

  useEffect(() => {
    if (current) play()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])

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

      <div className="identify-header">Scale Ear Training</div>
      <div className="identify-card">
        {current ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem 0' }}>
            <button className="primary-btn" onClick={play} style={{ fontSize: 20, padding: '16px 32px' }}>▶ Play</button>
            {lastResult && (
              <div style={{ marginTop: 16, fontSize: 15, color: 'var(--muted)' }}>
                That was <strong style={{ color: 'var(--accent)' }}>{ROOTS[current.root]} {scaleLongNames[current.name]}</strong>
              </div>
            )}
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
          <button className="play-cat-btn" onClick={() => setShowStats(true)}>View Stats</button>
        </div>
      </div>

      <StatsModal exercise="ear-scale" title="Scale Ear Training" open={showStats} onClose={() => setShowStats(false)} />
    </div>
  )
}
