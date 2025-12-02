import React, { useMemo } from 'react'
import { recognize, pcsToNotes, ROOTS, formatMatch, intervalName } from '../../lib/chords'

export default function ChordRecognition({ pressedNotes }) {
  // pressedNotes expected as Set or Array of MIDI numbers
  const pressedArr = useMemo(() => Array.isArray(pressedNotes) ? pressedNotes : Array.from(pressedNotes || []), [pressedNotes])

  const matches = useMemo(() => recognize(pressedArr), [pressedArr])
  const formatted = useMemo(() => matches.map(m => ({ ...m, formatted: formatMatch(m, pressedArr) })), [matches, pressedArr])

  return (
    <section className="chord-app">
      <h2>Chord Recognition</h2>
      <div className="chord-panels">
        <div className="main-match">
          {formatted.length === 0 ? (
            <div className="muted">No matching chords</div>
          ) : (
            (() => {
              const top = formatted[0]
              // prepare grid rows: for each chord pitch class, compute interval, note name, and presence
              const chordTones = (top.chordPCs || []).map(pc => {
                const interval = (pc - top.root + 12) % 12
                return {
                  pc,
                  note: ROOTS[pc],
                  interval,
                  intervalName: intervalName(interval),
                  present: top.matchedPCs.includes(pc)
                }
              })

              return (
                <div className="primary fixed-primary">
                  <div className="primary-name">{top.formatted.displayName}</div>
                  <div className="primary-long">{top.formatted.longName}</div>
                  <div className="primary-sub">{top.formatted.inversion ? top.formatted.inversion : ''}{top.formatted.bassName ? ` • bass ${top.formatted.bassName}` : ''}</div>
                  <div className="primary-grid">
                    <div className="grid-row grid-head">
                      <div>Degree</div>
                      <div>Semitones</div>
                      <div>Note</div>
                      <div>Present</div>
                    </div>
                    {chordTones.map((t, i) => (
                      <div key={i} className="grid-row">
                        <div className="cell-degree">{t.intervalName}</div>
                        <div className="cell-interval">{t.interval}</div>
                        <div className="cell-note">{t.note}</div>
                        <div className="cell-present">{t.present ? '✓' : ''}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()
          )}
        </div>

        <div className="alt-matches alt-below">
          <h4>Alternative interpretations</h4>
          {formatted.length <= 1 && <div className="muted">No alternatives</div>}
          <ul>
            {formatted.slice(1,6).map((m, idx) => (
              <li key={idx} className={`alt ${m.isSubset ? 'subset' : ''}`}>
                <div className="alt-name">{m.formatted.displayName}</div>
                <div className="alt-meta">{m.matchedCount}/{m.chordSize}{m.isSubset ? ' subset' : ''}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
