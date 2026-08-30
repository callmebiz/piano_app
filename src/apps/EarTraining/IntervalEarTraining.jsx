import React, { useEffect, useMemo, useState } from 'react'
import AnswerGrid from '../Identify/AnswerGrid'
import useIdentifyExercise from '../Identify/useIdentifyExercise'
import PlaybackBar from '../../components/PlaybackBar'
import { playChord } from '../../audio/engine'
import StatsModal from '../../components/StatsModal'

// Ear training's interval model is deliberately simpler than Interval
// Identification/Construction's spelled-quality one (M/m/P/A/d on every
// degree): by ear alone, an augmented 4th and a diminished 5th are the
// same 6 semitones and genuinely indistinguishable — there's no spelling
// to disambiguate them, so ear training asks for the semitone distance
// only, with that one ambiguous case named "Tritone" rather than forcing
// a choice between A4/d5.
const SEMITONE_LABELS = [
  'Unison', 'Minor 2nd', 'Major 2nd', 'Minor 3rd', 'Major 3rd', 'Perfect 4th', 'Tritone',
  'Perfect 5th', 'Minor 6th', 'Major 6th', 'Minor 7th', 'Major 7th', 'Octave'
]

function buildPool() {
  const items = []
  for (let root = 0; root < 12; root++) {
    for (let semitones = 0; semitones <= 12; semitones++) {
      items.push({ name: SEMITONE_LABELS[semitones], rootMidi: 60 + root, targetMidi: 60 + root + semitones, semitones })
    }
  }
  return items
}

// Matches the reference layout exactly: Unison and Octave each get a lone
// cell on the right, Tritone sits alone on the left next to Perfect 5th.
const ANSWER_ROWS = [
  [null, { label: 'Unison', value: 'Unison' }],
  [{ label: 'Minor 2nd', value: 'Minor 2nd' }, { label: 'Major 2nd', value: 'Major 2nd' }],
  [{ label: 'Minor 3rd', value: 'Minor 3rd' }, { label: 'Major 3rd', value: 'Major 3rd' }],
  [null, { label: 'Perfect 4th', value: 'Perfect 4th' }],
  [{ label: 'Tritone', value: 'Tritone' }, { label: 'Perfect 5th', value: 'Perfect 5th' }],
  [{ label: 'Minor 6th', value: 'Minor 6th' }, { label: 'Major 6th', value: 'Major 6th' }],
  [{ label: 'Minor 7th', value: 'Minor 7th' }, { label: 'Major 7th', value: 'Major 7th' }],
  [null, { label: 'Octave', value: 'Octave' }]
]

export default function IntervalEarTraining() {
  const loadHarmonic = () => {
    try { const raw = localStorage.getItem('ear:interval:harmonic'); if (raw) return JSON.parse(raw) } catch (e) {}
    return false
  }
  const [harmonic, setHarmonic] = useState(loadHarmonic)
  useEffect(() => { try { localStorage.setItem('ear:interval:harmonic', JSON.stringify(harmonic)) } catch (e) {} }, [harmonic])

  const pool = useMemo(() => buildPool(), [])

  const [showStats, setShowStats] = useState(false)

  const { current, score, lastResult, submitAnswer, skip, resetScore } = useIdentifyExercise({
    pool,
    isCorrect: (prompt, answer) => answer === prompt.name,
    exercise: 'ear-interval',
    promptKey: (p) => `${p.rootMidi}-${p.semitones}`,
    promptLabel: (p) => p.name
  })

  const play = () => {
    if (!current) return
    if (harmonic) {
      playChord([current.rootMidi, current.targetMidi], 1100)
    } else {
      playChord([current.rootMidi], 550)
      setTimeout(() => playChord([current.targetMidi], 700), 600)
    }
  }

  // Space plays/replays the current prompt — no auto-play on a fresh
  // prompt or on first load, only an explicit press (spacebar or the
  // PlaybackBar's own speaker icon).
  useEffect(() => {
    const handler = (e) => {
      if (e.code !== 'Space') return
      const tgt = e.target
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return
      e.preventDefault()
      play()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, harmonic])

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
          <div className="filter-title">Options</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button className={`play-cat-btn ${harmonic ? 'active' : ''}`} onClick={() => setHarmonic((v) => !v)} title="Play both notes at once instead of one after the other">Harmonic</button>
          </div>
        </div>
      </div>

      <div className="identify-header">Interval Ear Training</div>
      <div className="muted" style={{ textAlign: 'center', fontSize: 12, marginBottom: 8 }}>Press Space or 🔊 to play</div>
      <div className="identify-card">
        {current && <PlaybackBar onPlay={play} durationMs={harmonic ? 1100 : 1300} revealText={lastResult ? current.name : null} />}

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

      <StatsModal exercise="ear-interval" title="Interval Ear Training" open={showStats} onClose={() => setShowStats(false)} />
    </div>
  )
}
