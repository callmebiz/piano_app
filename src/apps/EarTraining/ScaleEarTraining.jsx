import React, { useEffect, useMemo, useState } from 'react'
import AnswerGrid from '../Identify/AnswerGrid'
import useIdentifyExercise from '../Identify/useIdentifyExercise'
import PlaybackBar from '../../components/PlaybackBar'
import { buildScaleSpelling, scaleLongNames, ROOTS } from '../../lib/scales'
import { playChord } from '../../audio/engine'
import StatsModal from '../../components/StatsModal'

// Major/minor family plus the 7 church modes — pentatonic/blues are left
// out of ear training specifically (they're not part of this listen-and-
// name set); Scales practice and Scale Identification still offer them.
const TYPES = ['major', 'natMinor', 'harMinor', 'melMinor', 'ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian']
// Short forms for the Enabled Scale Types profile field — same idea as
// Play The Chord's Enabled Chords tracking (see practiceStats.js).
const TYPE_ABBR = { major: 'Maj', natMinor: 'NMin', harMinor: 'HMin', melMinor: 'MMin', ionian: 'Ion', dorian: 'Dor', phrygian: 'Phr', lydian: 'Lyd', mixolydian: 'Mix', aeolian: 'Aeo', locrian: 'Loc' }

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
  for (let i = 0; i < TYPES.length; i += 2) {
    const a = TYPES[i]
    const b = TYPES[i + 1]
    rows.push([{ label: scaleLongNames[a], value: a }, b ? { label: scaleLongNames[b], value: b } : null])
  }
  return rows
})()

const DEFAULT_TYPES = Object.fromEntries(TYPES.map((t) => [t, true]))

export default function ScaleEarTraining() {
  const loadTypes = () => {
    try { const raw = localStorage.getItem('ear:scale:types2'); if (raw) return JSON.parse(raw) } catch (e) {}
    return DEFAULT_TYPES
  }
  const [types, setTypes] = useState(loadTypes)
  useEffect(() => { try { localStorage.setItem('ear:scale:types2', JSON.stringify(types)) } catch (e) {} }, [types])
  const selectAll = () => setTypes(Object.fromEntries(TYPES.map((t) => [t, true])))
  const clearAll = () => setTypes(Object.fromEntries(TYPES.map((t) => [t, false])))

  const pool = useMemo(() => buildPool(TYPES.filter((t) => types[t])), [types])

  const [showStats, setShowStats] = useState(false)

  const { current, score, lastResult, submitAnswer, skip, resetScore } = useIdentifyExercise({
    pool,
    isCorrect: (prompt, answer) => answer === prompt.name,
    exercise: 'ear-scale',
    promptKey: (p) => `${p.name}-${p.root}`,
    promptLabel: (p) => `${ROOTS[p.root]} ${scaleLongNames[p.name]}`,
    fields: (p) => {
      const enabledKeys = TYPES.filter((t) => types[t])
      return {
        scaleType: { value: p.name, label: scaleLongNames[p.name], dimension: 'Scale Type' },
        root: { value: p.root, label: ROOTS[p.root], dimension: 'Root' },
        enabledScaleTypes: { value: enabledKeys.join(','), label: enabledKeys.map((t) => TYPE_ABBR[t]).join(' ') || 'None', dimension: 'Enabled Scale Types' }
      }
    }
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
            {TYPES.map((t) => (
              <button key={t} className={`play-cat-btn ${types[t] ? 'active' : ''}`} onClick={() => setTypes((s) => ({ ...s, [t]: !s[t] }))}>
                {scaleLongNames[t]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="identify-header">Scale Ear Training</div>
      <div className="muted" style={{ textAlign: 'center', fontSize: 12, marginBottom: 8 }}>Press Space or 🔊 to play</div>
      <div className="identify-card">
        {current ? (
          <>
            <PlaybackBar onPlay={play} durationMs={current.midis.length * 260} revealText={lastResult ? `${ROOTS[current.root]} ${scaleLongNames[current.name]}` : null} />
          </>
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
