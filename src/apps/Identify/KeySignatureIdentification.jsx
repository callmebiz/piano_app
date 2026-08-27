import React from 'react'
import Staff from '../../components/Staff'
import AnswerGrid from './AnswerGrid'
import useIdentifyExercise from './useIdentifyExercise'
import { useStaffSettings } from '../../lib/staffSettings'
import { SHARP_NAMES, NATURAL_NAMES, FLAT_NAMES, MAJOR_KEY_SIGNATURES } from '../../lib/staffNotes'

const pool = MAJOR_KEY_SIGNATURES.map((name) => ({ name }))

// Same 21-cell grid shape as Note ID, but only the 15 real major-key names
// are populated — the rest (D#, A#, E#, B#, Fb, plus anything else outside
// the standard circle of fifths) are blank, since they're never valid keys.
const ANSWER_ROWS = [SHARP_NAMES, NATURAL_NAMES, FLAT_NAMES].map((row) =>
  row.map((name) => (MAJOR_KEY_SIGNATURES.includes(name) ? { label: name, value: name } : null))
)

export default function KeySignatureIdentification() {
  const staffSettings = useStaffSettings()

  const { current, score, lastResult, submitAnswer, skip, resetScore } = useIdentifyExercise({
    pool,
    isCorrect: (prompt, answer) => answer === prompt.name,
    statsKey: 'identify:keysig:stats',
    promptKey: (p) => p.name
  })

  const cellState = (name) => {
    if (!lastResult) return null
    if (current && name === current.name) return 'correct'
    if (name === lastResult.answer && !lastResult.correct) return 'wrong'
    return null
  }

  return (
    <div>
      <div className="identify-header">Key Signature Identification</div>
      <div className="identify-card">
        {current ? (
          <>
            <div className="identify-staff-wrap" style={{ justifyContent: staffSettings.align === 'left' ? 'flex-start' : staffSettings.align === 'right' ? 'flex-end' : 'center' }}>
              <div style={{ width: staffSettings.width * staffSettings.scale }}>
                <Staff clef="treble" notes={[]} keySignature={current.name} minHeight={160} scale={staffSettings.scale} />
              </div>
            </div>
            <div style={{ textAlign: 'center', marginTop: 8, fontSize: 20, color: 'var(--muted)' }}>___ Major</div>
          </>
        ) : (
          <div className="muted" style={{ textAlign: 'center', padding: '2rem' }}>No key signatures available</div>
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
