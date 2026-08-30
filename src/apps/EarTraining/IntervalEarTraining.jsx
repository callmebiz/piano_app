import React, { useEffect, useMemo, useState } from 'react'
import AnswerGrid from '../Identify/AnswerGrid'
import useIdentifyExercise from '../Identify/useIdentifyExercise'
import { parseSpelling, spellingMidi, vexKeyFor, CANONICAL_ROOTS } from '../../lib/staffNotes'
import { noteFromInterval, isPerfectFamily } from '../../lib/intervals'
import { playChord } from '../../audio/engine'
import StatsModal from '../../components/StatsModal'

const ROOT_OCTAVE = 4
const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8]
const NUMBER_LABELS = { 1: 'Unison', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th', 6: '6th', 7: '7th', 8: 'Octave' }

const QUALITIES = [
  { id: 'A', label: 'Augmented' },
  { id: 'MP', label: 'Major/Perfect' },
  { id: 'm', label: 'minor' },
  { id: 'd', label: 'Diminished' }
]

function combosFor(qualityId) {
  if (qualityId === 'A') return NUMBERS.map((n) => ({ quality: 'A', number: n }))
  if (qualityId === 'MP') return NUMBERS.map((n) => ({ quality: isPerfectFamily(n) ? 'P' : 'M', number: n }))
  if (qualityId === 'm') return NUMBERS.filter((n) => !isPerfectFamily(n)).map((n) => ({ quality: 'm', number: n }))
  return NUMBERS.filter((n) => n !== 1).map((n) => ({ quality: 'd', number: n }))
}

const ANSWER_ROWS = [
  NUMBERS.map((n) => ({ label: `A${n}`, value: `A${n}` })),
  NUMBERS.map((n) => ({ label: `${isPerfectFamily(n) ? 'P' : 'M'}${n}`, value: `${isPerfectFamily(n) ? 'P' : 'M'}${n}` })),
  NUMBERS.map((n) => (isPerfectFamily(n) ? null : { label: `m${n}`, value: `m${n}` })),
  NUMBERS.map((n) => (n === 1 ? null : { label: `d${n}`, value: `d${n}` }))
]
const DISTANCE_ROWS = [NUMBERS.map((n) => ({ label: NUMBER_LABELS[n], value: n }))]

// Same pool as Interval Identification, played through the speaker instead
// of shown on a staff — the point here is recognizing the sound, not the
// notation.
function buildPool(enabledQualityIds) {
  const combos = enabledQualityIds.flatMap(combosFor)
  const items = []
  for (let rootPc = 0; rootPc < 12; rootPc++) {
    const { letter, accidental } = parseSpelling(CANONICAL_ROOTS[rootPc])
    const rootNote = { name: CANONICAL_ROOTS[rootPc], midi: spellingMidi(letter, accidental, ROOT_OCTAVE), vexKey: vexKeyFor(letter, accidental, ROOT_OCTAVE) }
    for (const { quality, number } of combos) {
      const target = noteFromInterval(letter, accidental, ROOT_OCTAVE, quality, number)
      if (!target) continue
      items.push({ name: `${quality}${number}`, root: rootNote, target })
    }
  }
  return items
}

export default function IntervalEarTraining() {
  const loadQualities = () => {
    try { const raw = localStorage.getItem('ear:interval:qualities'); if (raw) return JSON.parse(raw) } catch (e) {}
    return { A: true, MP: true, m: true, d: true }
  }
  const [qualities, setQualities] = useState(loadQualities)
  useEffect(() => { try { localStorage.setItem('ear:interval:qualities', JSON.stringify(qualities)) } catch (e) {} }, [qualities])

  const loadDistanceMode = () => {
    try { const raw = localStorage.getItem('ear:interval:distanceMode'); if (raw) return JSON.parse(raw) } catch (e) {}
    return false
  }
  const [distanceMode, setDistanceMode] = useState(loadDistanceMode)
  useEffect(() => { try { localStorage.setItem('ear:interval:distanceMode', JSON.stringify(distanceMode)) } catch (e) {} }, [distanceMode])

  const loadHarmonic = () => {
    try { const raw = localStorage.getItem('ear:interval:harmonic'); if (raw) return JSON.parse(raw) } catch (e) {}
    return false
  }
  const [harmonic, setHarmonic] = useState(loadHarmonic)
  useEffect(() => { try { localStorage.setItem('ear:interval:harmonic', JSON.stringify(harmonic)) } catch (e) {} }, [harmonic])

  const pool = useMemo(() => buildPool(QUALITIES.filter((q) => qualities[q.id]).map((q) => q.id)), [qualities])

  const promptNumber = (prompt) => Number(prompt.name.slice(1))

  const [showStats, setShowStats] = useState(false)

  const { current, score, lastResult, submitAnswer, skip, resetScore } = useIdentifyExercise({
    pool,
    isCorrect: distanceMode
      ? (prompt, answer) => answer === promptNumber(prompt)
      : (prompt, answer) => answer === prompt.name,
    exercise: 'ear-interval',
    promptKey: (p) => `${p.root.name}${p.root.midi}-${p.name}`,
    promptLabel: (p) => `${p.root.name} ${p.name}`
  })

  useEffect(() => {
    skip()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qualities])

  const play = () => {
    if (!current) return
    if (harmonic) {
      playChord([current.root.midi, current.target.midi], 1100)
    } else {
      playChord([current.root.midi], 550)
      setTimeout(() => playChord([current.target.midi], 700), 600)
    }
  }

  // Auto-play a fresh prompt once it appears.
  useEffect(() => {
    if (current) play()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])

  const cellState = (value) => {
    if (!lastResult) return null
    const correctValue = distanceMode ? (current && promptNumber(current)) : current && current.name
    if (value === correctValue) return 'correct'
    if (value === lastResult.answer && !lastResult.correct) return 'wrong'
    return null
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <div className="filter-block">
          <div className="filter-title">Qualities</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            {QUALITIES.map((q) => (
              <button key={q.id} className={`play-cat-btn ${qualities[q.id] ? 'active' : ''}`} onClick={() => setQualities((s) => ({ ...s, [q.id]: !s[q.id] }))}>
                {q.label}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-block">
          <div className="filter-title">Options</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button className={`play-cat-btn ${distanceMode ? 'active' : ''}`} onClick={() => setDistanceMode((v) => !v)} title="Ask for the generic interval number instead of the spelled quality">Distance Only</button>
            <button className={`play-cat-btn ${harmonic ? 'active' : ''}`} onClick={() => setHarmonic((v) => !v)} title="Play both notes at once instead of one after the other">Harmonic</button>
          </div>
        </div>
      </div>

      <div className="identify-header">Interval Ear Training</div>
      <div className="identify-card">
        {current ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem 0' }}>
            <button className="primary-btn" onClick={play} style={{ fontSize: 20, padding: '16px 32px' }}>▶ Play</button>
            {lastResult && (
              <div style={{ marginTop: 16, fontSize: 15, color: 'var(--muted)' }}>
                That was <strong style={{ color: 'var(--accent)' }}>{current.root.name} → {current.target.name}</strong> ({current.name})
              </div>
            )}
          </div>
        ) : (
          <div className="muted" style={{ textAlign: 'center', padding: '2rem' }}>No intervals available for the current options</div>
        )}

        <AnswerGrid rows={distanceMode ? DISTANCE_ROWS : ANSWER_ROWS} columns={8} onSelect={submitAnswer} cellState={cellState} disabled={!current || !!lastResult} />

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
