import React, { useEffect, useMemo, useRef, useState } from 'react'
import Staff from '../../components/Staff'
import useIdentifyExercise from './useIdentifyExercise'
import { buildNotePool, NATURAL_NOTE_NAMES, CHROMATIC_NOTE_NAMES } from '../../lib/staffNotes'

// Clef ranges: treble/bass span a comfortable couple of octaves either side
// of middle C; grand unions both and resolves each prompt to whichever
// single staff its register actually belongs on.
const RANGES = {
  treble: { lowMidi: 60, highMidi: 84 }, // C4–C6
  bass: { lowMidi: 36, highMidi: 60 }, // C2–C4
  grand: { lowMidi: 36, highMidi: 84 }
}
const clefForMidi = (midi) => (midi < 60 ? 'bass' : 'treble')

export default function NoteIdentification({ pressedNotes, setKeyboardTargetPCs = () => {} }) {
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
    return buildNotePool({ lowMidi, highMidi, accidentals })
  }, [clefMode, accidentals])

  const { current, score, lastResult, submitAnswer, skip, resetScore } = useIdentifyExercise({
    pool,
    isCorrect: (prompt, answer) => prompt.name === answer,
    statsKey: 'identify:note:stats',
    promptKey: (p) => String(p.midi)
  })

  const answerNames = accidentals ? CHROMATIC_NOTE_NAMES : NATURAL_NOTE_NAMES
  const staffClef = current ? (clefMode === 'grand' ? clefForMidi(current.midi) : clefMode) : 'treble'
  const staffNotes = current ? [{ keys: [current.vexKey], duration: 'w' }] : []

  // Answer by playing the note too (physical MIDI or the on-screen keyboard,
  // both already flow through the same pressedNotes prop) — a newly-pressed
  // key counts as your answer, same as clicking a name button.
  const prevPressedRef = useRef(new Set())
  useEffect(() => {
    const currSet = pressedNotes ? (pressedNotes instanceof Set ? pressedNotes : new Set(Array.from(pressedNotes))) : new Set()
    const prev = prevPressedRef.current
    const added = []
    for (const n of currSet) if (!prev.has(n)) added.push(n)
    prevPressedRef.current = currSet
    if (added.length > 0 && current && !lastResult) {
      const pc = ((added[0] % 12) + 12) % 12
      submitAnswer(CHROMATIC_NOTE_NAMES[pc])
    }
  }, [pressedNotes, current, lastResult, submitAnswer])

  // Don't reveal the answer via the target-highlight ring — only push the
  // correct pitch class for wrong-key (red) detection while guessing, then
  // reveal the actual key once feedback is showing, matching how the answer
  // buttons reveal the correct choice in green on a wrong guess.
  useEffect(() => {
    if (!current) { setKeyboardTargetPCs(new Set()); return }
    const pc = ((current.midi % 12) + 12) % 12
    setKeyboardTargetPCs({ mids: lastResult ? new Set([current.midi]) : new Set(), pcs: new Set([pc]) })
    return () => setKeyboardTargetPCs(new Set())
  }, [current, lastResult, setKeyboardTargetPCs])

  const buttonStyle = (name) => {
    if (lastResult) {
      if (current && name === current.name) return { background: '#6ee7b7', color: '#071025', borderColor: 'transparent' }
      if (name === lastResult.answer && !lastResult.correct) return { background: '#ff6b6b', color: '#071025', borderColor: 'transparent' }
    }
    return {}
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

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 700, background: 'rgba(255,255,255,0.02)', padding: 18, borderRadius: 8 }}>
          {current ? (
            <Staff clef={staffClef} notes={staffNotes} />
          ) : (
            <div className="muted" style={{ textAlign: 'center', padding: '2rem' }}>No notes available for the current options</div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 20 }}>
            {answerNames.map((name) => (
              <button
                key={name}
                className="play-cat-btn"
                style={{ minWidth: 48, fontSize: 15, fontWeight: 700, ...buttonStyle(name) }}
                onClick={() => submitAnswer(name)}
                disabled={!current || !!lastResult}
              >
                {name}
              </button>
            ))}
          </div>

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
    </div>
  )
}
