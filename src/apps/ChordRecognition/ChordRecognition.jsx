import React, { useMemo } from 'react'
import { recognize, pcsToNotes, ROOTS, formatMatch, intervalName } from '../../lib/chords'

export default function ChordRecognition({ pressedNotes }) {
  // pressedNotes expected as Set or Array of MIDI numbers
  const pressedArr = useMemo(() => Array.isArray(pressedNotes) ? pressedNotes : Array.from(pressedNotes || []), [pressedNotes])

  const matches = useMemo(() => recognize(pressedArr), [pressedArr])
  const formatted = useMemo(() => matches.map(m => ({ ...m, formatted: formatMatch(m, pressedArr) })), [matches, pressedArr])

  return (
    <section className="chord-app">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%'}}>
        <h2 style={{margin:0}}>Chord Recognition</h2>
        <div style={{marginLeft:12,fontSize:14}}></div>
      </div>
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
        {formatted.length === 0 ? (
          <div className="muted">No matching chords</div>
        ) : (
          (() => {
            const top = formatted[0]
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
              <div style={{width:'100%',maxWidth:1100,background:'rgba(255,255,255,0.02)',padding:18,borderRadius:8,display:'flex',flexDirection:'column',alignItems:'center'}}>
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:220}}>
                  <div style={{fontSize:120,fontWeight:900,color:'var(--accent)',lineHeight:1,textAlign:'center',transform:'translateY(6px)'}}>{top.formatted.displayName}</div>
                  <div style={{marginTop:8,fontSize:16,color:'var(--muted)',textAlign:'center'}}>{top.formatted.longName}</div>
                  <div style={{marginTop:6,fontSize:14,color:'var(--muted)'}}>{top.formatted.inversion ? top.formatted.inversion : ''}{top.formatted.bassName ? ` • bass ${top.formatted.bassName}` : ''}</div>
                </div>

                {/* Transposed table below the chord */}
                <div style={{display:'flex',justifyContent:'center',marginTop:6}}>
                  <table className="primary-grid" style={{width:'auto',minWidth:160,borderCollapse:'collapse'}}>
                    <tbody>
                      <tr>
                        <th style={{padding:8,textAlign:'left'}}>Degree</th>
                        {chordTones.map((t, i) => (
                          <td key={`d-${i}`} style={{padding:8,textAlign:'center'}}>{t.intervalName}</td>
                        ))}
                      </tr>
                      <tr>
                        <th style={{padding:8,textAlign:'left'}}>Note</th>
                        {chordTones.map((t, i) => (
                          <td key={`n-${i}`} style={{padding:8,textAlign:'center', ...(t.present ? {background:'var(--accent)', color:'#000'} : {})}}>{t.note}</td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Alternatives below */}
                <div style={{width:'100%',marginTop:12}}>
                  <h4 style={{margin:'6px 0',color:'var(--muted)'}}>Alternative interpretations</h4>
                  {formatted.length <= 1 ? <div className="muted">No alternatives</div> : (
                    <ul style={{listStyle:'none',padding:0,margin:0,display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:8}}>
                      {formatted.slice(1,6).map((m, idx) => (
                        <li key={idx} className={`alt ${m.isSubset ? 'subset' : ''}`}>
                          <div className="alt-name">{m.formatted.displayName}</div>
                          <div className="alt-meta">{m.matchedCount}/{m.chordSize}{m.isSubset ? ' subset' : ''}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )
          })()
        )}
      </div>
    </section>
  )
}
