import React, { useEffect, useMemo, useState } from 'react'
import Staff from '../../components/Staff'
import StatsModal from '../../components/StatsModal'
import useIdentifyExercise from '../Identify/useIdentifyExercise'
import { buildSpellingPool, ALL_SPELLINGS, NATURAL_NAMES, vexKeyFor } from '../../lib/staffNotes'
import { diatonicStep, stepToLetterOctave } from '../../lib/staffGeometry'
import { useStaffSettings } from '../../lib/staffSettings'

// The inverse of Note Identification: given a note NAME, build it on the
// staff — move it up/down by scale steps and pick its accidental, instead
// of naming a note that's already shown. Reuses the exact same pool as
// Note ID; only the answer surface differs (a note-position control here,
// AnswerGrid there).
const RANGES = {
  treble: { lowMidi: 60, highMidi: 84 }, // C4–C6
  bass: { lowMidi: 36, highMidi: 60 } // C2–C4
}
const START_STEP = { treble: diatonicStep('B', 4), bass: diatonicStep('D', 3) } // roughly mid-staff
const STEP_RANGE = 9 // how far up/down from the start the control allows — a couple ledger lines either side

export default function NoteConstruction() {
  const staffSettings = useStaffSettings()

  const loadClefMode = () => {
    try { const raw = localStorage.getItem('construct:note:clef'); if (raw) return raw } catch (e) {}
    return 'treble'
  }
  const [clefMode, setClefMode] = useState(loadClefMode)
  useEffect(() => { try { localStorage.setItem('construct:note:clef', clefMode) } catch (e) {} }, [clefMode])

  const loadAccidentals = () => {
    try { const raw = localStorage.getItem('construct:note:accidentals'); if (raw) return JSON.parse(raw) } catch (e) {}
    return true
  }
  const [accidentals, setAccidentals] = useState(loadAccidentals)
  useEffect(() => { try { localStorage.setItem('construct:note:accidentals', JSON.stringify(accidentals)) } catch (e) {} }, [accidentals])

  const pool = useMemo(() => {
    const { lowMidi, highMidi } = RANGES[clefMode]
    return buildSpellingPool({ lowMidi, highMidi, spellings: accidentals ? ALL_SPELLINGS : NATURAL_NAMES })
  }, [clefMode, accidentals])

  const [showStats, setShowStats] = useState(false)

  const { current, score, lastResult, submitAnswer, skip, resetScore } = useIdentifyExercise({
    pool,
    isCorrect: (prompt, answer) => answer === prompt.vexKey,
    exercise: 'construct-note',
    promptKey: (p) => `${p.name}${p.midi}`,
    promptLabel: (p) => p.name
  })

  useEffect(() => {
    skip()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clefMode, accidentals])

  // The note being built — resets to a fresh mid-staff start every time a
  // new prompt appears.
  const [step, setStep] = useState(START_STEP[clefMode])
  const [accidental, setAccidental] = useState('')
  useEffect(() => { setStep(START_STEP[clefMode]); setAccidental('') }, [current, clefMode])

  const { letter, octave } = stepToLetterOctave(step)
  const guessVexKey = vexKeyFor(letter, accidental, octave)
  const guessNotes = [{ keys: [guessVexKey], duration: 'w' }]

  const startStep = START_STEP[clefMode]
  const moveUp = () => setStep((s) => Math.min(startStep + STEP_RANGE, s + 1))
  const moveDown = () => setStep((s) => Math.max(startStep - STEP_RANGE, s - 1))

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <div className="filter-block">
          <div className="filter-title">Clef</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            {['treble', 'bass'].map((c) => (
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

      <div className="identify-header">Note Construction</div>
      <div className="identify-card">
        {current ? (
          <>
            <div className="identify-staff-wrap" style={{ justifyContent: staffSettings.align === 'left' ? 'flex-start' : staffSettings.align === 'right' ? 'flex-end' : 'center' }}>
              <div style={{ width: staffSettings.width * staffSettings.scale }}>
                <Staff clef={clefMode} notes={guessNotes} minHeight={160} scale={staffSettings.scale} />
              </div>
            </div>
            <div style={{ textAlign: 'center', fontSize: 32, fontWeight: 900, color: 'var(--accent)', margin: '8px 0 16px' }}>{current.name}</div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button className="play-cat-btn" onClick={moveUp} disabled={!!lastResult} title="Move up a step">▲</button>
                <button className="play-cat-btn" onClick={moveDown} disabled={!!lastResult} title="Move down a step">▼</button>
              </div>

              {accidentals && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className={`play-cat-btn ${accidental === 'b' ? 'active' : ''}`} onClick={() => setAccidental('b')} disabled={!!lastResult}>♭</button>
                    <button className={`play-cat-btn ${accidental === '' ? 'active' : ''}`} onClick={() => setAccidental('')} disabled={!!lastResult}>♮</button>
                    <button className={`play-cat-btn ${accidental === '#' ? 'active' : ''}`} onClick={() => setAccidental('#')} disabled={!!lastResult}>♯</button>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{accidental === 'b' ? 'Flat' : accidental === '#' ? 'Sharp' : 'None'}</div>
                </div>
              )}

              <button className="primary-btn" onClick={() => submitAnswer(guessVexKey)} disabled={!!lastResult}>Submit Answer</button>
            </div>

            {lastResult && (
              <div style={{ textAlign: 'center', marginTop: 12, fontSize: 13, color: lastResult.correct ? 'var(--accent)' : 'var(--muted)' }}>
                {lastResult.correct ? 'Correct!' : `Not quite — that was ${current.name}`}
              </div>
            )}
          </>
        ) : (
          <div className="muted" style={{ textAlign: 'center', padding: '2rem' }}>No notes available for the current options</div>
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

      <StatsModal exercise="construct-note" title="Note Construction" open={showStats} onClose={() => setShowStats(false)} />
    </div>
  )
}
