import React, { useEffect, useMemo, useRef, useState } from 'react'
import useIdentifyExercise from '../Identify/useIdentifyExercise'
import PlaybackBar from '../../components/PlaybackBar'
import { playChord } from '../../audio/engine'
import { buildNotePool, REFERENCE_MIDI } from './NoteEarTraining'
import StatsModal from '../../components/StatsModal'

// Same Question/Reference pair as Note Ear Training, but answered by
// pressing the actual key on the app's own keyboard (already visible below
// every app) instead of a letter-name button — requires the exact octave,
// not just the pitch class, since a real key press picks one specific key.
export default function KeyboardEarTraining({ pressedNotes }) {
  const pool = useMemo(() => buildNotePool(), [])

  const [showStats, setShowStats] = useState(false)

  const { current, score, lastResult, submitAnswer, skip, resetScore } = useIdentifyExercise({
    pool,
    isCorrect: (prompt, answer) => answer === prompt.midi,
    exercise: 'ear-keyboard-note',
    promptKey: (p) => String(p.midi),
    promptLabel: (p) => p.name
  })

  const playQuestion = () => { if (current) playChord([current.midi], 800) }
  const playReference = () => playChord([REFERENCE_MIDI], 800)

  // Space plays/replays the full prompt (question then reference, same
  // pairing as before) — no auto-play on a fresh prompt or on first load,
  // only an explicit press (spacebar) or clicking a bar's own speaker icon
  // (which plays just that one note).
  const pendingRef = useRef(null)
  const playBoth = () => {
    if (!current) return
    if (pendingRef.current) clearTimeout(pendingRef.current)
    playQuestion()
    pendingRef.current = setTimeout(playReference, 950)
  }
  useEffect(() => () => { if (pendingRef.current) clearTimeout(pendingRef.current) }, [])

  useEffect(() => {
    const handler = (e) => {
      if (e.code !== 'Space') return
      const tgt = e.target
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return
      e.preventDefault()
      playBoth()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])

  // A newly-pressed key on the app's keyboard counts as the answer, same
  // pattern Note Identification already uses.
  const prevPressedRef = useRef(new Set())
  useEffect(() => {
    const currSet = pressedNotes ? (pressedNotes instanceof Set ? pressedNotes : new Set(Array.from(pressedNotes))) : new Set()
    const prev = prevPressedRef.current
    const added = []
    for (const n of currSet) if (!prev.has(n)) added.push(n)
    prevPressedRef.current = currSet
    if (added.length > 0 && current && !lastResult) submitAnswer(added[0])
  }, [pressedNotes, current, lastResult, submitAnswer])

  return (
    <div>
      <div className="identify-header">Keyboard Ear Training</div>
      <div className="muted" style={{ textAlign: 'center', fontSize: 12, marginBottom: 8 }}>Press Space or 🔊 to play</div>
      <div className="identify-card">
        {current ? (
          <>
            <PlaybackBar label="Question Note" onPlay={playBoth} durationMs={800} revealText={lastResult ? current.name : null} />
            <PlaybackBar label="Reference Note" onPlay={playReference} durationMs={800} revealText="C" />
            <div className="muted" style={{ textAlign: 'center', marginTop: 4 }}>
              {lastResult ? (lastResult.correct ? 'Correct!' : 'Not quite —') : 'Press the key on the keyboard below'}
            </div>
          </>
        ) : (
          <div className="muted" style={{ textAlign: 'center', padding: '2rem' }}>No notes available</div>
        )}

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

      <StatsModal exercise="ear-keyboard-note" title="Keyboard Ear Training" open={showStats} onClose={() => setShowStats(false)} />
    </div>
  )
}
