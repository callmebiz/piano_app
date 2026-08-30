import React, { useEffect, useMemo, useState } from 'react'
import AnswerGrid from '../Identify/AnswerGrid'
import useIdentifyExercise from '../Identify/useIdentifyExercise'
import PlaybackBar from '../../components/PlaybackBar'
import { buildChordSpelling, formatMatch, ROOTS } from '../../lib/chords'
import { playChord } from '../../audio/engine'
import StatsModal from '../../components/StatsModal'

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

// Same pool as Chord Identification, played as a block chord through the
// speaker instead of shown on a staff.
function buildPool(enabledTypes) {
  const items = []
  for (let root = 0; root < 12; root++) {
    for (const type of enabledTypes) {
      const notes = buildChordSpelling(root, type, { octave: 4 })
      if (!notes) continue
      items.push({ name: type, root, midis: notes.map((n) => n.midi) })
    }
  }
  return items
}

const ANSWER_ROWS = (() => {
  const rows = []
  for (let i = 0; i < CHORD_TYPES.length; i += 2) {
    const a = CHORD_TYPES[i]
    const b = CHORD_TYPES[i + 1]
    rows.push([{ label: CHORD_LABELS[a], value: a }, b ? { label: CHORD_LABELS[b], value: b } : null])
  }
  return rows
})()

export default function ChordEarTraining() {
  const loadTypes = () => {
    try { const raw = localStorage.getItem('ear:chord:types'); if (raw) return JSON.parse(raw) } catch (e) {}
    return Object.fromEntries(CHORD_TYPES.map((t) => [t, true]))
  }
  const [types, setTypes] = useState(loadTypes)
  useEffect(() => { try { localStorage.setItem('ear:chord:types', JSON.stringify(types)) } catch (e) {} }, [types])
  const selectAll = () => setTypes(Object.fromEntries(CHORD_TYPES.map((t) => [t, true])))
  const clearAll = () => setTypes(Object.fromEntries(CHORD_TYPES.map((t) => [t, false])))

  const pool = useMemo(() => buildPool(CHORD_TYPES.filter((t) => types[t])), [types])

  const [showStats, setShowStats] = useState(false)

  const { current, score, lastResult, submitAnswer, skip, resetScore } = useIdentifyExercise({
    pool,
    isCorrect: (prompt, answer) => answer === prompt.name,
    exercise: 'ear-chord',
    promptKey: (p) => `${p.name}-${p.root}`,
    promptLabel: (p) => formatMatch({ root: p.root, rootName: ROOTS[p.root], type: p.name, chordSize: p.midis.length }, []).displayName
  })

  useEffect(() => {
    skip()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [types])

  const play = () => { if (current) playChord(current.midis, 1400) }

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
  }, [current])

  const cellState = (value) => {
    if (!lastResult) return null
    if (current && value === current.name) return 'correct'
    if (value === lastResult.answer && !lastResult.correct) return 'wrong'
    return null
  }

  const revealName = current ? formatMatch({ root: current.root, rootName: ROOTS[current.root], type: current.name, chordSize: current.midis.length }, []).displayName : ''

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

      <div className="identify-header">Chord Ear Training</div>
      <div className="muted" style={{ textAlign: 'center', fontSize: 12, marginBottom: 8 }}>Press Space or 🔊 to play</div>
      <div className="identify-card">
        {current ? (
          <PlaybackBar onPlay={play} durationMs={1400} revealText={lastResult ? `${revealName} (${CHORD_LABELS[current.name]})` : null} />
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
          <button className="play-cat-btn" onClick={() => setShowStats(true)}>View Stats</button>
        </div>
      </div>

      <StatsModal exercise="ear-chord" title="Chord Ear Training" open={showStats} onClose={() => setShowStats(false)} />
    </div>
  )
}
