import React, { useEffect, useMemo, useState } from 'react'
import {
  getDiatonicChords, getSecondaryDominants, voiceChordNearMiddleC, ROOTS,
  getModalInterchangeChords, getTwoFiveChords, getSpecialTwoFives,
  tritoneSub, getDiminishedApproachChords, getVAlternatives
} from '../../lib/harmony'
import { chordFormulas, formatMatch, intervalName, recognize } from '../../lib/chords'
import { playChord } from '../../audio/engine'

// Module-scope so it keeps a stable component identity across KeyCenter's
// frequent re-renders (this component re-renders on every pressed-note
// change) — defining it inside KeyCenter's own render body would make React
// remount every chip each time instead of just updating its props.
function chipStyle(active, small) {
  return {
    padding: small ? '8px 6px' : '14px 6px',
    borderRadius: 8,
    textAlign: 'center',
    cursor: 'pointer',
    border: active ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.06)',
    background: active ? 'var(--accent)' : 'rgba(255,255,255,0.02)',
    color: active ? '#071025' : 'var(--muted)',
    transition: 'all 0.1s ease'
  }
}

function ChordChip({ active, small, onClick, sub, label, displayName }) {
  return (
    <div style={chipStyle(active, small)} onClick={onClick} title={sub || undefined}>
      <div style={{ fontSize: small ? 11 : 12, opacity: 0.75, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: small ? 14 : 20, fontWeight: 800, marginTop: 4 }}>{displayName}</div>
    </div>
  )
}

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

  // New non-diatonic strands (each independently toggleable/persisted, same pattern as above)
  const makeToggle = (key, def) => {
    const load = () => {
      try { const raw = localStorage.getItem(key); if (raw) return JSON.parse(raw) } catch (e) {}
      return def
    }
    const [val, setVal] = useState(load)
    useEffect(() => { try { localStorage.setItem(key, JSON.stringify(val)) } catch (e) {} }, [val])
    return [val, setVal]
  }
  const [showModalInterchange, setShowModalInterchange] = makeToggle('keycenter:showModalInterchange', false)
  const [showTwoFives, setShowTwoFives] = makeToggle('keycenter:showTwoFives', false)
  const [tritoneSubs, setTritoneSubs] = makeToggle('keycenter:tritoneSubs', false)
  const [showDiminishedApproach, setShowDiminishedApproach] = makeToggle('keycenter:showDiminishedApproach', false)
  const [showVAlternatives, setShowVAlternatives] = makeToggle('keycenter:showVAlternatives', false)

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
  const modalInterchangeChords = useMemo(() => getModalInterchangeChords(keyRoot, { sevenths }), [keyRoot, sevenths])
  const twoFives = useMemo(() => getTwoFiveChords(keyRoot), [keyRoot])
  const specialTwoFives = useMemo(() => getSpecialTwoFives(keyRoot), [keyRoot])
  const diminishedApproachChords = useMemo(() => getDiminishedApproachChords(keyRoot), [keyRoot])
  const vAlternativesChords = useMemo(() => getVAlternatives(keyRoot), [keyRoot])

  // Tritone-sub a dominant-7 chord for display when the toggle is on — used
  // for both the plain Secondary Dominants row and each ii-V's own V chord,
  // so the two stay consistent with each other.
  const subDom = (chord) => (tritoneSubs && chord.type === '7' ? { ...chord, root: tritoneSub(chord.root), tritoned: true } : chord)

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

  // Thin wrapper around the hoisted ChordChip that closes over this render's
  // isActive/onChipClick/chipLabel — still a plain function (not a component
  // itself), so it doesn't reintroduce the remount issue above.
  const renderChip = (root, type, label, opts = {}) => (
    <ChordChip
      active={isActive(root, type)}
      small={!!opts.small}
      sub={opts.sub}
      label={label}
      displayName={chipLabel(root, type)}
      onClick={() => onChipClick(root, type, label)}
    />
  )

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

          <div className="filter-block" style={{ minWidth: 300, maxWidth: 460 }}>
            <div className="filter-title">Options</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
              {[
                { active: sevenths, toggle: () => setSevenths((v) => !v), label: 'Sevenths', desc: 'Show the diatonic chords as 7th chords instead of plain triads.' },
                { active: showSecondaryDominants, toggle: () => setShowSecondaryDominants((v) => !v), label: 'Secondary Dominants', desc: "The dominant (V) of each diatonic chord — not itself diatonic, but pulls strongly into the chord it targets." },
                { active: showTwoFives, toggle: () => setShowTwoFives((v) => !v), label: "ii-V's", desc: "The ii chord preceding each secondary dominant's V, plus four named pairs (Backdoor, Tritone, vi-II, vii-III) that lead to a specific target rather than a scale degree." },
                { active: tritoneSubs, toggle: () => setTritoneSubs((v) => !v), label: 'Tritone Subs', desc: 'Swaps every dominant chord shown (Secondary Dominants and ii-V\'s V chord) for the dominant a tritone away — same 3rd/7th inverted, resolves by half-step instead of a 5th.' },
                { active: showDiminishedApproach, toggle: () => setShowDiminishedApproach((v) => !v), label: 'Diminished Approach', desc: "A diminished 7th chord a half-step below each target — interchangeable with that target's secondary dominant (raise its root a half-step and you get the dominant chord back)." },
                { active: showModalInterchange, toggle: () => setShowModalInterchange((v) => !v), label: 'Modal Interchange', desc: 'Chords borrowed from the parallel minor modes (Aeolian, Dorian, Phrygian) — same tonic, different mode, then back to the major key.' },
                { active: showVAlternatives, toggle: () => setShowVAlternatives((v) => !v), label: 'V Alternatives', desc: 'Non-diatonic chords that can stand in for V specifically, all sharing its pull back to the tonic.' }
              ].map((o) => (
                <div key={o.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <button className={`play-cat-btn ${o.active ? 'active' : ''}`} style={{ flexShrink: 0 }} onClick={o.toggle}>{o.label}</button>
                  <div style={{ fontSize: 11, color: 'var(--muted)', opacity: 0.8, paddingTop: 5, lineHeight: 1.35 }}>{o.desc}</div>
                </div>
              ))}
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

            {(showSecondaryDominants || showTwoFives || showDiminishedApproach) && (
              <div style={{ ...gridStyle, marginTop: 10 }}>
                {secondaryDominants.map((c) => {
                  const v = subDom(c)
                  const twoFive = twoFives.find((t) => t.targetDegree === c.targetDegree)
                  const dimApproach = diminishedApproachChords.find((d) => d.targetDegree === c.targetDegree)
                  const stacked = [showTwoFives, showSecondaryDominants, showDiminishedApproach].filter(Boolean).length > 1
                  return (
                    <div key={`sd-${c.targetDegree}`} style={{ gridColumn: c.targetDegree + 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {showTwoFives && twoFive && renderChip(twoFive.ii.root, twoFive.ii.type, 'ii', { small: true })}
                      {showSecondaryDominants && renderChip(v.root, v.type, v.tritoned ? `${c.label} (T.T.)` : c.label, { small: stacked })}
                      {showDiminishedApproach && dimApproach && renderChip(dimApproach.root, dimApproach.type, '°7', { small: true })}
                      <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginTop: 2, opacity: 0.7 }}>↓ {c.targetRoman}</div>
                    </div>
                  )
                })}
              </div>
            )}

            {showModalInterchange && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, textAlign: 'center' }}>Modal Interchange</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                  {modalInterchangeChords.map((c, i) => (
                    <div key={`mi-${i}`} style={{ width: 100 }}>
                      {renderChip(c.root, c.type, c.label, { sub: c.source, small: true })}
                      <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--muted)', marginTop: 2, opacity: 0.6 }}>{c.source}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {showTwoFives && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, textAlign: 'center' }}>Special ii-V's</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
                  {specialTwoFives.map((t, i) => {
                    const v = subDom(t.v)
                    return (
                      <div key={`stf-${i}`} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{t.label}</div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {renderChip(t.ii.root, t.ii.type, 'ii', { small: true })}
                          {renderChip(v.root, v.type, v.tritoned ? 'V (T.T.)' : 'V', { small: true })}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, opacity: 0.7 }}>↓ {t.targetRoman}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {showVAlternatives && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, textAlign: 'center' }}>V Chord Alternatives <span style={{ opacity: 0.6, fontWeight: 400 }}>(→ I)</span></div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                  {vAlternativesChords.map((c, i) => (
                    <div key={`va-${i}`}>{renderChip(c.root, c.type, c.label, { small: true })}</div>
                  ))}
                </div>
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
