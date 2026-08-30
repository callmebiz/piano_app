import React, { useEffect, useMemo, useState } from 'react'
import ClickableStaff from '../../components/ClickableStaff'
import StatsModal from '../../components/StatsModal'
import useIdentifyExercise from '../Identify/useIdentifyExercise'
import { buildSpellingPool, ALL_SPELLINGS, NATURAL_NAMES } from '../../lib/staffNotes'
import { useStaffSettings } from '../../lib/staffSettings'

// The inverse of Note Identification: given a note NAME, click where it
// goes on the staff instead of naming a note that's already shown. Reuses
// the exact same pool-building/exercise-engine as Note ID — only the
// prompt/answer roles are swapped (name shown, staff position is the
// answer) and the answer surface is ClickableStaff instead of AnswerGrid.
const RANGES = {
  treble: { lowMidi: 60, highMidi: 84 }, // C4–C6
  bass: { lowMidi: 36, highMidi: 60 } // C2–C4
}

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

  const placedNotes = lastResult && current
    ? [{ vexKey: current.vexKey, state: lastResult.correct ? 'correct' : 'wrong' }]
    : []

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
            <div style={{ textAlign: 'center', fontSize: 48, fontWeight: 900, color: 'var(--accent)', marginBottom: 12 }}>{current.name}</div>
            <div className="identify-staff-wrap" style={{ justifyContent: staffSettings.align === 'left' ? 'flex-start' : staffSettings.align === 'right' ? 'flex-end' : 'center' }}>
              <div style={{ width: staffSettings.width * staffSettings.scale }}>
                <ClickableStaff
                  clef={clefMode}
                  candidates={pool}
                  placedNotes={placedNotes}
                  onSelect={submitAnswer}
                  disabled={!current || !!lastResult}
                  minHeight={160}
                  scale={staffSettings.scale}
                />
              </div>
            </div>
            {lastResult && !lastResult.correct && (
              <div style={{ textAlign: 'center', marginTop: 8, fontSize: 13, color: 'var(--muted)' }}>That was {current.name} — shown above</div>
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
