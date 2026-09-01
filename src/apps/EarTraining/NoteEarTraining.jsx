import React, { useEffect, useMemo, useRef, useState } from 'react'
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

// Answered either via the letter-name grid or by pressing the actual key on
// the app's own keyboard below — both fire the same submitAnswer, matching
// how Note Identification already supports both. A pressed key resolves to
// its pitch class rather than requiring the exact octave, same precision
// as the button grid; a black-key press (no natural-letter equivalent in
// this pool) is just ignored rather than counted as a wrong answer.
export default function NoteEarTraining({ pressedNotes }) {
  const pool = useMemo(() => buildNotePool(), [])

  const [showStats, setShowStats] = useState(false)

  const { current, score, lastResult, submitAnswer, skip, resetScore } = useIdentifyExercise({
    pool,
    isCorrect: (prompt, answer) => answer === prompt.name,
    exercise: 'ear-note',
    promptKey: (p) => String(p.midi),
    promptLabel: (p) => p.name,
    // Reference Note is always C today, but tracked anyway — it's a real
    // property of the attempt, not just a fixed constant, so it's ready if
    // the reference note ever becomes adjustable without needing to touch
    // this again.
    fields: (p) => ({
      note: { value: p.name, label: p.name, dimension: 'Note' },
      referenceNote: { value: 'C', label: 'C', dimension: 'Reference Note' }
    })
  })

  // Each bar plays only its own single note — no chaining. Playing the
  // Question note right into the Reference note reads as a two-note
  // interval, which isn't what this exercise is (a single pitch, judged
  // against an anchor you can check independently, not a melodic phrase).
  const playQuestion = () => { if (current) playChord([current.midi], 800) }
  const playReference = () => playChord([REFERENCE_MIDI], 800)

  // Space plays/replays just the question note — no auto-play on a fresh
  // prompt or on first load, only an explicit press (spacebar, or a bar's
  // own speaker icon for that one note specifically).
  useEffect(() => {
    const handler = (e) => {
      if (e.code !== 'Space') return
      const tgt = e.target
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return
      e.preventDefault()
      playQuestion()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])

  // A newly-pressed key on the app's keyboard counts as an answer too, same
  // pattern Note Identification already uses — resolved to its natural-
  // letter name so it matches the button grid's own answer format exactly.
  const prevPressedRef = useRef(new Set())
  useEffect(() => {
    const currSet = pressedNotes ? (pressedNotes instanceof Set ? pressedNotes : new Set(Array.from(pressedNotes))) : new Set()
    const prev = prevPressedRef.current
    const added = []
    for (const n of currSet) if (!prev.has(n)) added.push(n)
    prevPressedRef.current = currSet
    if (added.length === 0 || !current || lastResult) return
    const pc = ((added[0] % 12) + 12) % 12
    const letter = NOTE_NAMES[pc]
    if (letter) submitAnswer(letter)
  }, [pressedNotes, current, lastResult, submitAnswer])

  const cellState = (value) => {
    if (!lastResult) return null
    if (current && value === current.name) return 'correct'
    if (value === lastResult.answer && !lastResult.correct) return 'wrong'
    return null
  }

  return (
    <div>
      <div className="identify-header">Note Ear Training</div>
      <div className="muted" style={{ textAlign: 'center', fontSize: 12, marginBottom: 8 }}>Press Space or 🔊 to play</div>
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
