import React, { useEffect, useMemo, useState } from 'react'
import { getDiatonicChords, getSecondaryDominants, voiceChordNearMiddleC, ROOTS } from '../../lib/harmony'
import { chordFormulas, formatMatch, intervalName, recognize } from '../../lib/chords'
import { playChord } from '../../audio/engine'

export default function KeyCenter({ pressedNotes, setKeyboardTargetPCs = () => {} }) {
  const loadRoot = () => {
    try { const raw = localStorage.getItem('keycenter:root'); if (raw != null) return Number(raw) } catch (e) {}
    return 0
  }
  const [keyRoot, setKeyRoot] = useState(loadRoot)
  useEffect(() => { try { localStorage.setItem('keycenter:root', String(keyRoot)) } catch (e) {} }, [keyRoot])

  const loadSevenths = () => {
    try { const raw = localStorage.getItem('keycenter:sevenths'); if (raw) return JSON.parse(raw) } catch (e) {}
    return false
  }
  const [sevenths, setSevenths] = useState(loadSevenths)
  useEffect(() => { try { localStorage.setItem('keycenter:sevenths', JSON.stringify(sevenths)) } catch (e) {} }, [sevenths])

  const loadShowSecondary = () => {
    try { const raw = localStorage.getItem('keycenter:showSecondaryDominants'); if (raw) return JSON.parse(raw) } catch (e) {}
    return true
  }
  const [showSecondaryDominants, setShowSecondaryDominants] = useState(loadShowSecondary)
  useEffect(() => { try { localStorage.setItem('keycenter:showSecondaryDominants', JSON.stringify(showSecondaryDominants)) } catch (e) {} }, [showSecondaryDominants])

  const [activeChip, setActiveChip] = useState(null)
  useEffect(() => { setActiveChip(null) }, [keyRoot, sevenths])

  // What the player is actually playing right now, reusing the same
  // recognizer Chord Recognition uses — lets them study the chart while
  // getting live feedback on what their hands are actually doing. Always on.
  const pressedArr = useMemo(() => Array.isArray(pressedNotes) ? pressedNotes : Array.from(pressedNotes || []), [pressedNotes])
  const playedMatches = useMemo(() => {
    if (pressedArr.length === 0) return []
    const matches = recognize(pressedArr)
    return matches.map((m) => ({ ...m, formatted: formatMatch(m, pressedArr) }))
  }, [pressedArr])
  const playedMatch = playedMatches[0] || null
  const playedAlternatives = playedMatches.slice(1, 6)

  const diatonic = useMemo(() => getDiatonicChords(keyRoot, { sevenths }), [keyRoot, sevenths])
  const secondaryDominants = useMemo(() => getSecondaryDominants(keyRoot), [keyRoot])

  const chipLabel = (root, type) => {
    const fakeMatch = { root, rootName: ROOTS[root], type, chordSize: (chordFormulas[type] || []).length }
    return formatMatch(fakeMatch, []).displayName
  }

  const isActive = (root, type) => !!activeChip && activeChip.root === root && activeChip.type === type
  const onChipClick = (root, type, label) => {
    setActiveChip((prev) => (prev && prev.root === root && prev.type === type) ? null : { root, type, label })
    playChord(voiceChordNearMiddleC(root, type))
  }

  // Push the active chip's notes to the keyboard for highlighting.
  useEffect(() => {
    try {
      if (typeof setKeyboardTargetPCs !== 'function') return
      if (activeChip) {
        const midis = voiceChordNearMiddleC(activeChip.root, activeChip.type)
        const pcs = new Set(midis.map((m) => ((m % 12) + 12) % 12))
        setKeyboardTargetPCs({ mids: new Set(midis), pcs })
      } else {
        setKeyboardTargetPCs(new Set())
      }
    } catch (e) {}
    return () => { try { if (typeof setKeyboardTargetPCs === 'function') setKeyboardTargetPCs(new Set()) } catch (e) {} }
  }, [activeChip, setKeyboardTargetPCs])

  const activeTones = useMemo(() => {
    if (!activeChip) return []
    const ints = chordFormulas[activeChip.type] || [0, 4, 7]
    return ints.map((i) => {
      const pc = ((activeChip.root + i) % 12 + 12) % 12
      return { pc, note: ROOTS[pc], interval: intervalName(i) }
    })
  }, [activeChip])

  const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }
  const chipStyle = (active) => ({
    padding: '14px 6px',
    borderRadius: 8,
    textAlign: 'center',
    cursor: 'pointer',
    border: active ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.06)',
    background: active ? 'var(--accent)' : 'rgba(255,255,255,0.02)',
    color: active ? '#071025' : 'var(--muted)',
    transition: 'all 0.1s ease'
  })

  return (
    <div className="chord-app">
      <h2>Key Center</h2>
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Key picker + options */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="filter-block">
            <div className="filter-title">Key</div>
            <div className="roots" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {ROOTS.map((rName, rIdx) => (
                <button
                  key={rIdx}
                  className={`play-root-btn play-cat-btn ${keyRoot === rIdx ? 'active' : ''}`}
                  onClick={() => setKeyRoot(rIdx)}
                >
                  {rName}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-block">
            <div className="filter-title">Options</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button className={`play-cat-btn ${sevenths ? 'active' : ''}`} onClick={() => setSevenths((v) => !v)}>Sevenths</button>
              <button className={`play-cat-btn ${showSecondaryDominants ? 'active' : ''}`} onClick={() => setShowSecondaryDominants((v) => !v)}>Secondary Dominants</button>
            </div>
          </div>
        </div>

        {/* Chord grid */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 1100, background: 'rgba(255,255,255,0.02)', padding: 18, borderRadius: 8 }}>
            <div style={{ textAlign: 'center', fontSize: 32, fontWeight: 900, color: 'var(--accent)', marginBottom: 16 }}>
              {ROOTS[keyRoot]} Major
            </div>

            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ minHeight: 28, fontSize: 15, color: 'var(--muted)' }}>
                {playedMatch ? (
                  <span>You're playing: <strong style={{ color: 'var(--accent)' }}>{playedMatch.formatted.displayName}</strong> <span style={{ opacity: 0.75 }}>({playedMatch.formatted.longName})</span></span>
                ) : (
                  <span style={{ opacity: 0.6 }}>Play something on the keyboard…</span>
                )}
              </div>
              {playedAlternatives.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 8 }}>
                  {playedAlternatives.map((m, idx) => (
                    <span key={idx} className={`alt ${m.isSubset ? 'subset' : ''}`} style={{ fontSize: 12, padding: '4px 8px' }}>
                      <span className="alt-name">{m.formatted.displayName}</span>
                      <span className="alt-meta" style={{ marginLeft: 6 }}>{m.matchedCount}/{m.chordSize}{m.isSubset ? ' subset' : ''}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div style={gridStyle}>
              {diatonic.map((c) => (
                <div key={`d-${c.degree}`} style={chipStyle(isActive(c.root, c.type))} onClick={() => onChipClick(c.root, c.type, c.roman)}>
                  <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 700 }}>{c.roman}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{chipLabel(c.root, c.type)}</div>
                </div>
              ))}
            </div>

            {showSecondaryDominants && (
              <div style={{ ...gridStyle, marginTop: 10 }}>
                {secondaryDominants.map((c) => (
                  <div key={`sd-${c.targetDegree}`} style={{ gridColumn: c.targetDegree + 1 }}>
                    <div style={chipStyle(isActive(c.root, c.type))} onClick={() => onChipClick(c.root, c.type, c.label)}>
                      <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 700 }}>{c.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{chipLabel(c.root, c.type)}</div>
                    </div>
                    <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginTop: 2, opacity: 0.7 }}>↓ {c.targetRoman}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Active chord info panel */}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
              {activeChip ? (
                <table className="primary-grid" style={{ width: 'auto', minWidth: 160, borderCollapse: 'collapse' }}>
                  <tbody>
                    <tr>
                      <th style={{ padding: 8, textAlign: 'left' }}>Degree</th>
                      {activeTones.map((t, i) => (
                        <td key={`i-${i}`} style={{ padding: 8, textAlign: 'center' }}>{t.interval}</td>
                      ))}
                    </tr>
                    <tr>
                      <th style={{ padding: 8, textAlign: 'left' }}>Note</th>
                      {activeTones.map((t, i) => (
                        <td key={`n-${i}`} style={{ padding: 8, textAlign: 'center' }}>{t.note}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              ) : (
                <div className="muted">Click a chord to hear/see its notes on the keyboard</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
