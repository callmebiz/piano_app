import React, { useEffect, useMemo, useRef, useState } from 'react'
import ClickableStaff from '../../components/ClickableStaff'
import StatsModal from '../../components/StatsModal'
import useIdentifyExercise from '../Identify/useIdentifyExercise'
import { useStaffSettings } from '../../lib/staffSettings'
import { parseSpelling, spellingMidi, vexKeyFor, buildSpellingPool, ALL_SPELLINGS, CANONICAL_ROOTS } from '../../lib/staffNotes'
import { noteFromInterval, isPerfectFamily } from '../../lib/intervals'

const ROOT_OCTAVE = 4
const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8]

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

// Root shown on the staff; click where the named interval above it goes —
// the inverse of Interval Identification (two notes shown, name the
// interval). Reuses the same pool-building as Interval ID.
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

export default function IntervalConstruction({ pressedNotes }) {
  const staffSettings = useStaffSettings()

  const loadQualities = () => {
    try { const raw = localStorage.getItem('construct:interval:qualities'); if (raw) return JSON.parse(raw) } catch (e) {}
    return { A: true, MP: true, m: true, d: true }
  }
  const [qualities, setQualities] = useState(loadQualities)
  useEffect(() => { try { localStorage.setItem('construct:interval:qualities', JSON.stringify(qualities)) } catch (e) {} }, [qualities])

  // Staff: click where the target goes (exact spelling, like Note
  // Construction). Keyboard: press the target's key — the specific octave
  // it's actually written in, not any octave of that pitch class, so this
  // still tests the real interval shape rather than just the pitch class.
  const loadAnswerMode = () => {
    try { const raw = localStorage.getItem('construct:interval:answerMode'); if (raw) return raw } catch (e) {}
    return 'staff'
  }
  const [answerMode, setAnswerMode] = useState(loadAnswerMode)
  useEffect(() => { try { localStorage.setItem('construct:interval:answerMode', answerMode) } catch (e) {} }, [answerMode])

  const pool = useMemo(() => buildPool(QUALITIES.filter((q) => qualities[q.id]).map((q) => q.id)), [qualities])

  const [showStats, setShowStats] = useState(false)

  const { current, score, lastResult, submitAnswer, skip, resetScore } = useIdentifyExercise({
    pool,
    isCorrect: (prompt, answer) => (typeof answer === 'number' ? answer === prompt.target.midi : answer === prompt.target.vexKey),
    exercise: 'construct-interval',
    promptKey: (p) => `${p.root.name}${p.root.midi}-${p.name}`,
    promptLabel: (p) => `${p.root.name} ${p.name}`
  })

  useEffect(() => {
    skip()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qualities, answerMode])

  // Keyboard-mode answering: a newly-pressed key counts as the answer, same
  // pattern Note Identification already uses for its own keyboard input.
  const prevPressedRef = useRef(new Set())
  useEffect(() => {
    if (answerMode !== 'keyboard') return
    const currSet = pressedNotes ? (pressedNotes instanceof Set ? pressedNotes : new Set(Array.from(pressedNotes))) : new Set()
    const prev = prevPressedRef.current
    const added = []
    for (const n of currSet) if (!prev.has(n)) added.push(n)
    prevPressedRef.current = currSet
    if (added.length > 0 && current && !lastResult) submitAnswer(added[0])
  }, [pressedNotes, current, lastResult, submitAnswer, answerMode])

  // Click candidates: every valid staff spelling within an octave either
  // side of the root — wide enough to cover every interval up to an
  // octave without offering the whole keyboard's worth of positions.
  const candidates = useMemo(() => {
    if (!current) return []
    return buildSpellingPool({ lowMidi: current.root.midi - 13, highMidi: current.root.midi + 13, spellings: ALL_SPELLINGS })
  }, [current])

  const placedNotes = lastResult && current
    ? [{ vexKey: current.target.vexKey, state: lastResult.correct ? 'correct' : 'wrong' }]
    : []

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
          <div className="filter-title">Answer via</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button className={`play-cat-btn ${answerMode === 'staff' ? 'active' : ''}`} onClick={() => setAnswerMode('staff')}>Staff</button>
            <button className={`play-cat-btn ${answerMode === 'keyboard' ? 'active' : ''}`} onClick={() => setAnswerMode('keyboard')}>Keyboard</button>
          </div>
        </div>
      </div>

      <div className="identify-header">Interval Construction</div>
      <div className="identify-card">
        {current ? (
          <>
            <div style={{ textAlign: 'center', fontSize: 40, fontWeight: 900, color: 'var(--accent)', marginBottom: 12 }}>{current.root.name} — {current.name}</div>
            {answerMode === 'staff' ? (
              <div className="identify-staff-wrap" style={{ justifyContent: staffSettings.align === 'left' ? 'flex-start' : staffSettings.align === 'right' ? 'flex-end' : 'center' }}>
                <div style={{ width: staffSettings.width * staffSettings.scale }}>
                  <ClickableStaff
                    clef="treble"
                    givenNotes={[current.root.vexKey]}
                    candidates={candidates}
                    placedNotes={placedNotes}
                    onSelect={submitAnswer}
                    disabled={!current || !!lastResult}
                    minHeight={160}
                    scale={staffSettings.scale}
                  />
                </div>
              </div>
            ) : (
              <div className="muted" style={{ textAlign: 'center', padding: '1rem' }}>
                {lastResult ? (lastResult.correct ? 'Correct!' : 'Not quite —') : `Play ${current.name} above ${current.root.name} on the keyboard`}
              </div>
            )}
            {lastResult && !lastResult.correct && (
              <div style={{ textAlign: 'center', marginTop: 8, fontSize: 13, color: 'var(--muted)' }}>{current.name} above {current.root.name} is {current.target.name} — shown above</div>
            )}
          </>
        ) : (
          <div className="muted" style={{ textAlign: 'center', padding: '2rem' }}>No intervals available for the current options</div>
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

      <StatsModal exercise="construct-interval" title="Interval Construction" open={showStats} onClose={() => setShowStats(false)} />
    </div>
  )
}
