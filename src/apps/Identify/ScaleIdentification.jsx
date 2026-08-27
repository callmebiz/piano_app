import React from 'react'
import Staff from '../../components/Staff'
import AnswerGrid from './AnswerGrid'
import useIdentifyExercise from './useIdentifyExercise'
import { useStaffSettings } from '../../lib/staffSettings'
import { midiToVexKey } from '../../lib/staffNotes'
import { buildScaleSequence, SCALE_TYPES, scaleLongNames } from '../../lib/scales'

const ROOT_PCS = [0, 2, 4, 5, 7, 9, 11] // naturals — keeps the pool scoped for this first pass

const pool = (() => {
  const items = []
  for (const root of ROOT_PCS) {
    for (const type of SCALE_TYPES) {
      const { midis } = buildScaleSequence(root, type, { descending: false, octaves: 1, anchor: 60 })
      if (!midis || midis.length === 0) continue
      items.push({ name: type, root, midis, vexKeys: midis.map(midiToVexKey) })
    }
  }
  return items
})()

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

export default function ScaleIdentification() {
  const staffSettings = useStaffSettings()

  const { current, score, lastResult, submitAnswer, skip, resetScore } = useIdentifyExercise({
    pool,
    isCorrect: (prompt, answer) => answer === prompt.name,
    statsKey: 'identify:scale:stats',
    promptKey: (p) => `${p.name}-${p.root}`
  })

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
      <div className="identify-header">Scale Identification</div>
      <div className="identify-card">
        {current ? (
          <div className="identify-staff-wrap" style={{ justifyContent: staffSettings.align === 'left' ? 'flex-start' : staffSettings.align === 'right' ? 'flex-end' : 'center' }}>
            <div style={{ width: staffWidth }}>
              <Staff clef="treble" notes={staffNotes} minHeight={160} scale={staffSettings.scale} />
            </div>
          </div>
        ) : (
          <div className="muted" style={{ textAlign: 'center', padding: '2rem' }}>No scales available</div>
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
