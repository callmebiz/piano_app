import React, { useEffect, useMemo, useRef, useState } from 'react'
import Staff from '../../components/Staff'
import AnswerGrid from './AnswerGrid'
import useIdentifyExercise from './useIdentifyExercise'
import { buildSpellingPool, SHARP_NAMES, NATURAL_NAMES, FLAT_NAMES, ALL_SPELLINGS } from '../../lib/staffNotes'
import { useStaffSettings } from '../../lib/staffSettings'

// Clef ranges: treble/bass span a comfortable couple of octaves either side
// of middle C; grand unions both and resolves each prompt to whichever
// single staff its register actually belongs on.
const RANGES = {
  treble: { lowMidi: 60, highMidi: 84 }, // C4–C6
  bass: { lowMidi: 36, highMidi: 60 }, // C2–C4
  grand: { lowMidi: 36, highMidi: 84 }
}
const clefForMidi = (midi) => (midi < 60 ? 'bass' : 'treble')

// Fixed 21-cell answer grid (sharp row / natural row / flat row) — always
// shown in full regardless of the current options, same as the reference
// layout; which spellings are actually eligible to be *asked* is controlled
// by the Accidentals toggle below.
const ANSWER_ROWS = [SHARP_NAMES, NATURAL_NAMES, FLAT_NAMES].map((row) => row.map((name) => ({ label: name, value: name })))

export default function NoteIdentification({ pressedNotes, setKeyboardTargetPCs = () => {} }) {
  const staffSettings = useStaffSettings()

  const loadClefMode = () => {
    try { const raw = localStorage.getItem('identify:note:clef'); if (raw) return raw } catch (e) {}
    return 'treble'
  }
  const [clefMode, setClefMode] = useState(loadClefMode)
  useEffect(() => { try { localStorage.setItem('identify:note:clef', clefMode) } catch (e) {} }, [clefMode])

  const loadAccidentals = () => {
    try { const raw = localStorage.getItem('identify:note:accidentals'); if (raw) return JSON.parse(raw) } catch (e) {}
    return true
  }
  const [accidentals, setAccidentals] = useState(loadAccidentals)
  useEffect(() => { try { localStorage.setItem('identify:note:accidentals', JSON.stringify(accidentals)) } catch (e) {} }, [accidentals])

  const pool = useMemo(() => {
    const { lowMidi, highMidi } = RANGES[clefMode]
    return buildSpellingPool({ lowMidi, highMidi, spellings: accidentals ? ALL_SPELLINGS : NATURAL_NAMES })
  }, [clefMode, accidentals])

  const { current, score, lastResult, submitAnswer, skip, resetScore } = useIdentifyExercise({
    pool,
    // Button answers are exact-spelling strings; keyboard answers are a
    // sounding pitch class (a physical key can't disambiguate spelling).
    isCorrect: (prompt, answer) => (typeof answer === 'number' ? answer === prompt.pc : answer === prompt.name),
    statsKey: 'identify:note:stats',
    promptKey: (p) => `${p.name}${p.midi}`
  })

  const staffClef = current ? (clefMode === 'grand' ? clefForMidi(current.midi) : clefMode) : 'treble'
  const staffNotes = current ? [{ keys: [current.vexKey], duration: 'w' }] : []

  // Answer by playing the note too (physical MIDI or the on-screen keyboard,
  // both already flow through the same pressedNotes prop) — a newly-pressed
  // key counts as your answer, same as clicking a name cell.
  const prevPressedRef = useRef(new Set())
  useEffect(() => {
    const currSet = pressedNotes ? (pressedNotes instanceof Set ? pressedNotes : new Set(Array.from(pressedNotes))) : new Set()
    const prev = prevPressedRef.current
    const added = []
    for (const n of currSet) if (!prev.has(n)) added.push(n)
    prevPressedRef.current = currSet
    if (added.length > 0 && current && !lastResult) {
      submitAnswer(((added[0] % 12) + 12) % 12)
    }
  }, [pressedNotes, current, lastResult, submitAnswer])

  // Don't reveal the answer via the target-highlight ring — only push the
  // correct pitch class for wrong-key (red) detection while guessing, then
  // reveal the actual key once feedback is showing, matching how the answer
  // grid reveals the correct cell in green after a wrong guess.
  useEffect(() => {
    if (!current) { setKeyboardTargetPCs(new Set()); return }
    setKeyboardTargetPCs({ mids: lastResult ? new Set([current.midi]) : new Set(), pcs: new Set([current.pc]) })
    return () => setKeyboardTargetPCs(new Set())
  }, [current, lastResult, setKeyboardTargetPCs])

  const cellState = (name) => {
    if (!lastResult) return null
    if (current && name === current.name) return 'correct'
    if (typeof lastResult.answer === 'string' && name === lastResult.answer && !lastResult.correct) return 'wrong'
    return null
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <div className="filter-block">
          <div className="filter-title">Clef</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            {['treble', 'bass', 'grand'].map((c) => (
              <button key={c} className={`play-cat-btn ${clefMode === c ? 'active' : ''}`} onClick={() => setClefMode(c)}>
                {c[0].toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-block">
          <div className="filter-title">Options</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button className={`play-cat-btn ${accidentals ? 'active' : ''}`} onClick={() => setAccidentals((v) => !v)}>Accidentals</button>
          </div>
        </div>
      </div>

      <div className="identify-header">Note Identification</div>
      <div className="identify-card">
        {current ? (
          <div className="identify-staff-wrap" style={{ justifyContent: staffSettings.align === 'left' ? 'flex-start' : staffSettings.align === 'right' ? 'flex-end' : 'center' }}>
            {/* width grows with scale too, so turning "Staff & note size" up
                enlarges the whole staff box + its rendered content together,
                rather than cramming a bigger note into a fixed-size box */}
            <div style={{ width: staffSettings.width * staffSettings.scale }}>
              <Staff clef={staffClef} notes={staffNotes} minHeight={160} scale={staffSettings.scale} />
            </div>
          </div>
        ) : (
          <div className="muted" style={{ textAlign: 'center', padding: '2rem' }}>No notes available for the current options</div>
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
