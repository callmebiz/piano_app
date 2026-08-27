import React from 'react'
import Staff from '../../components/Staff'
import AnswerGrid from './AnswerGrid'
import useIdentifyExercise from './useIdentifyExercise'
import { useStaffSettings } from '../../lib/staffSettings'
import { spellingMidi, vexKeyFor, NATURAL_NAMES } from '../../lib/staffNotes'
import { noteFromInterval, INTERVAL_DEGREES, isPerfectFamily } from '../../lib/intervals'

const ROOT_OCTAVE = 4

// The 25 valid quality+degree combinations — matches the reference grid:
// Augmented every degree, Major/Perfect every degree, minor only on
// 2/3/6/7 (4/5/8 have no minor form), diminished every degree.
const VALID_COMBOS = [
  ...INTERVAL_DEGREES.map((n) => ({ quality: 'A', number: n })),
  ...INTERVAL_DEGREES.map((n) => ({ quality: isPerfectFamily(n) ? 'P' : 'M', number: n })),
  ...INTERVAL_DEGREES.filter((n) => !isPerfectFamily(n)).map((n) => ({ quality: 'm', number: n })),
  ...INTERVAL_DEGREES.map((n) => ({ quality: 'd', number: n }))
]

const ANSWER_ROWS = [
  INTERVAL_DEGREES.map((n) => ({ label: `A${n}`, value: `A${n}` })),
  INTERVAL_DEGREES.map((n) => ({ label: `${isPerfectFamily(n) ? 'P' : 'M'}${n}`, value: `${isPerfectFamily(n) ? 'P' : 'M'}${n}` })),
  INTERVAL_DEGREES.map((n) => (isPerfectFamily(n) ? null : { label: `m${n}`, value: `m${n}` })),
  INTERVAL_DEGREES.map((n) => ({ label: `d${n}`, value: `d${n}` }))
]

// Root notes fixed to naturals at one octave for this first pass — keeps the
// combinatorics (7 roots x 25 qualities) manageable; can widen later.
const pool = (() => {
  const items = []
  for (const rootName of NATURAL_NAMES) {
    const rootMidi = spellingMidi(rootName, '', ROOT_OCTAVE)
    const rootVexKey = vexKeyFor(rootName, '', ROOT_OCTAVE)
    for (const { quality, number } of VALID_COMBOS) {
      const target = noteFromInterval(rootName, '', ROOT_OCTAVE, quality, number)
      if (!target) continue // would need a double sharp/flat — skip
      items.push({
        name: `${quality}${number}`,
        root: { name: rootName, midi: rootMidi, vexKey: rootVexKey },
        target
      })
    }
  }
  return items
})()

export default function IntervalIdentification() {
  const staffSettings = useStaffSettings()

  const { current, score, lastResult, submitAnswer, skip, resetScore } = useIdentifyExercise({
    pool,
    isCorrect: (prompt, answer) => answer === prompt.name,
    statsKey: 'identify:interval:stats',
    promptKey: (p) => `${p.root.name}${p.root.midi}-${p.name}`
  })

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
      <div className="identify-header">Interval Identification</div>
      <div className="identify-card">
        {current ? (
          <div className="identify-staff-wrap" style={{ justifyContent: staffSettings.align === 'left' ? 'flex-start' : staffSettings.align === 'right' ? 'flex-end' : 'center' }}>
            <div style={{ width: staffSettings.width * staffSettings.scale }}>
              <Staff clef="treble" notes={staffNotes} minHeight={160} scale={staffSettings.scale} />
            </div>
          </div>
        ) : (
          <div className="muted" style={{ textAlign: 'center', padding: '2rem' }}>No intervals available</div>
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
