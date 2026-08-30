import React, { useEffect, useMemo, useState } from 'react'
import AnswerGrid from '../Identify/AnswerGrid'
import useIdentifyExercise from '../Identify/useIdentifyExercise'
import PlaybackBar from '../../components/PlaybackBar'
import { playChord } from '../../audio/engine'
import StatsModal from '../../components/StatsModal'

// Naming an isolated pitch by ear alone is absolute-pitch recognition
// (needs perfect pitch, a rare skill) — what makes this learnable is the
// fixed Reference Note (always middle C) played alongside every prompt,
// turning it into a relative-pitch skill: "how far is the question note
// from a C I just heard".
export const REFERENCE_MIDI = 60 // C4
const NATURAL_PCS = [0, 2, 4, 5, 7, 9, 11]
const NOTE_NAMES = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' }

export function buildNotePool(lowMidi = 55, highMidi = 72) {
  const items = []
  for (let midi = lowMidi; midi <= highMidi; midi++) {
    const pc = ((midi % 12) + 12) % 12
    if (!NATURAL_PCS.includes(pc)) continue
    items.push({ midi, pc, name: NOTE_NAMES[pc] })
  }
  return items
}

// Matches Note Identification's own sparse checkerboard layout.
export const NOTE_ANSWER_ROWS = [
  [{ label: 'C', value: 'C' }, null, { label: 'D', value: 'D' }],
  [null, { label: 'E', value: 'E' }, { label: 'F', value: 'F' }],
  [null, { label: 'G', value: 'G' }, null],
  [{ label: 'A', value: 'A' }, null, { label: 'B', value: 'B' }]
]

export default function NoteEarTraining() {
  const pool = useMemo(() => buildNotePool(), [])

  const [showStats, setShowStats] = useState(false)

  const { current, score, lastResult, submitAnswer, skip, resetScore } = useIdentifyExercise({
    pool,
    isCorrect: (prompt, answer) => answer === prompt.name,
    exercise: 'ear-note',
    promptKey: (p) => String(p.midi),
    promptLabel: (p) => p.name
  })

  const playQuestion = () => { if (current) playChord([current.midi], 800) }
  const playReference = () => playChord([REFERENCE_MIDI], 800)

  useEffect(() => {
    if (!current) return
    playQuestion()
    const t = setTimeout(playReference, 950)
    return () => clearTimeout(t)
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
      <div className="identify-header">Note Ear Training</div>
      <div className="identify-card">
        {current ? (
          <>
            <PlaybackBar label="Question Note" onPlay={playQuestion} durationMs={800} revealText={lastResult ? current.name : null} />
            <PlaybackBar label="Reference Note" onPlay={playReference} durationMs={800} revealText="C" />
          </>
        ) : (
          <div className="muted" style={{ textAlign: 'center', padding: '2rem' }}>No notes available</div>
        )}

        <AnswerGrid rows={NOTE_ANSWER_ROWS} columns={3} onSelect={submitAnswer} cellState={cellState} disabled={!current || !!lastResult} />

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

      <StatsModal exercise="ear-note" title="Note Ear Training" open={showStats} onClose={() => setShowStats(false)} />
    </div>
  )
}
