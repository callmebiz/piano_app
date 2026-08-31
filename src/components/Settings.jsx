import React, { useEffect, useState } from 'react'
import { getAudioParams, setAudioParams, AUDIO_DEFAULTS } from '../audio/engine'
import { getStaffSettings, setStaffSettings, STAFF_DEFAULTS } from '../lib/staffSettings'

// MIDI -> "A3"-style label (standard convention: MIDI 60 = C4), used for
// the Play The Chord hand-threshold slider so it reads as a note, not a
// raw MIDI number.
const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
function midiToNoteLabel(midi) {
  const pc = ((midi % 12) + 12) % 12
  const octave = Math.floor(midi / 12) - 1
  return `${NOTE_NAMES_SHARP[pc]}${octave}`
}

export default function Settings({ open = false, onClose = () => {}, app = '', shrinkOn = false }) {
  const DEFAULT_WHITE = 40
  const DEFAULT_BLACK = 25
  const DEFAULT_VIS_SPEED = 120
  const DEFAULT_VIS_COLOR_WHITE = '#6ee7b7'
  const DEFAULT_VIS_COLOR_BLACK = '#6ee7b7'
  const DEFAULT_VIS_BORDER_COLOR = 'rgba(0,0,0,0.12)'
  const DEFAULT_VIS_BORDER_WIDTH = 1
  const DEFAULT_HAND_THRESHOLD = 57 // A3 — see PlayTheChord.jsx

  const readStored = (key, fallback) => {
    try { const v = localStorage.getItem(key); if (v) return Number(v) } catch(e) {}
    return fallback
  }

  const [whiteWidth, setWhiteWidth] = useState(() => readStored('piano:whiteKeyWidth', DEFAULT_WHITE))
  const [blackWidth, setBlackWidth] = useState(() => readStored('piano:blackKeyWidth', DEFAULT_BLACK))
  const [visualSpeed, setVisualSpeed] = useState(() => readStored('visualizer:speed', DEFAULT_VIS_SPEED))
  const [visualColorWhite, setVisualColorWhite] = useState(() => {
    try { return localStorage.getItem('visualizer:color:white') || DEFAULT_VIS_COLOR_WHITE } catch(e) { return DEFAULT_VIS_COLOR_WHITE }
  })
  const [visualColorBlack, setVisualColorBlack] = useState(() => {
    try { return localStorage.getItem('visualizer:color:black') || DEFAULT_VIS_COLOR_BLACK } catch(e) { return DEFAULT_VIS_COLOR_BLACK }
  })
  const [visualBorderColor, setVisualBorderColor] = useState(() => {
    try { return localStorage.getItem('visualizer:border:color') || DEFAULT_VIS_BORDER_COLOR } catch(e) { return DEFAULT_VIS_BORDER_COLOR }
  })
  const [visualBorderWidth, setVisualBorderWidth] = useState(() => readStored('visualizer:border:width', DEFAULT_VIS_BORDER_WIDTH))
  const [visualColorsLocked, setVisualColorsLocked] = useState(() => {
    try { return localStorage.getItem('visualizer:colorsLocked') === '1' } catch(e) { return true }
  })

  const [handThreshold, setHandThreshold] = useState(() => readStored('play:handThresholdMidi', DEFAULT_HAND_THRESHOLD))
  const onHandThresholdChange = (v) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return
    setHandThreshold(n)
    try { localStorage.setItem('play:handThresholdMidi', String(n)) } catch(e) {}
  }

  const [audio, setAudio] = useState(() => getAudioParams())
  const updateAudio = (partial) => setAudio(setAudioParams(partial))
  const resetAudio = () => setAudio(setAudioParams(AUDIO_DEFAULTS))

  const [staff, setStaff] = useState(() => getStaffSettings())
  const updateStaff = (partial) => setStaff(setStaffSettings(partial))
  const resetStaff = () => setStaff(setStaffSettings(STAFF_DEFAULTS))

  useEffect(() => {
    // apply initial values to CSS variables on mount
    try {
      document.documentElement.style.setProperty('--white-key-width', `${whiteWidth}px`)
      document.documentElement.style.setProperty('--black-key-width', `${blackWidth}px`)
      document.documentElement.style.setProperty('--visualizer-speed', String(visualSpeed))
      document.documentElement.style.setProperty('--visualizer-color-white', visualColorWhite)
      document.documentElement.style.setProperty('--visualizer-color-black', visualColorBlack)
        document.documentElement.style.setProperty('--visualizer-border-color', visualBorderColor)
        document.documentElement.style.setProperty('--visualizer-border-width', `${visualBorderWidth}px`)
    } catch (e) {}
  }, [])

  const applyAndStore = (varName, value, storageKey) => {
    try {
      document.documentElement.style.setProperty(varName, `${value}px`)
      localStorage.setItem(storageKey, String(value))
    } catch (e) {}
  }

  const onWhiteChange = (v) => {
    const n = Number(v) || 0
    setWhiteWidth(n)
    applyAndStore('--white-key-width', n, 'piano:whiteKeyWidth')
  }

  const onBlackChange = (v) => {
    const n = Number(v) || 0
    setBlackWidth(n)
    applyAndStore('--black-key-width', n, 'piano:blackKeyWidth')
  }

  const onVisualSpeedChange = (v) => {
    const n = Number(v) || 0
    setVisualSpeed(n)
    try {
      document.documentElement.style.setProperty('--visualizer-speed', String(n))
      localStorage.setItem('visualizer:speed', String(n))
    } catch (e) {}
  }

  const applyColorAndStore = (varName, value, storageKey) => {
    try {
      document.documentElement.style.setProperty(varName, value)
      localStorage.setItem(storageKey, value)
    } catch (e) {}
  }

  const applyBorderAndStore = (varName, value, storageKey) => {
    try {
      document.documentElement.style.setProperty(varName, `${value}px`)
      localStorage.setItem(storageKey, String(value))
    } catch (e) {}
  }

  const onVisualColorWhiteChange = (val) => {
    setVisualColorWhite(val)
    applyColorAndStore('--visualizer-color-white', val, 'visualizer:color:white')
    if (visualColorsLocked) {
      setVisualColorBlack(val)
      applyColorAndStore('--visualizer-color-black', val, 'visualizer:color:black')
    }
  }

  const onVisualColorBlackChange = (val) => {
    setVisualColorBlack(val)
    applyColorAndStore('--visualizer-color-black', val, 'visualizer:color:black')
  }

  const onVisualBorderColorChange = (val) => {
    setVisualBorderColor(val)
    try { document.documentElement.style.setProperty('--visualizer-border-color', val); localStorage.setItem('visualizer:border:color', val) } catch(e) {}
  }

  const onVisualBorderWidthChange = (v) => {
    const n = Number(v) || 0
    setVisualBorderWidth(n)
    applyBorderAndStore('--visualizer-border-width', n, 'visualizer:border:width')
  }

  const onToggleColorsLocked = (checked) => {
    setVisualColorsLocked(checked)
    try { localStorage.setItem('visualizer:colorsLocked', checked ? '1' : '0') } catch(e) {}
    if (checked) {
      // lock: copy white into black
      setVisualColorBlack(visualColorWhite)
      applyColorAndStore('--visualizer-color-black', visualColorWhite, 'visualizer:color:black')
    }
  }

  // Reset helpers
  const resetVisualColors = () => {
    // Reset both colors to defaults. If locked, black will match white.
    setVisualColorWhite(DEFAULT_VIS_COLOR_WHITE)
    applyColorAndStore('--visualizer-color-white', DEFAULT_VIS_COLOR_WHITE, 'visualizer:color:white')
    const blackVal = visualColorsLocked ? DEFAULT_VIS_COLOR_WHITE : DEFAULT_VIS_COLOR_BLACK
    setVisualColorBlack(blackVal)
    applyColorAndStore('--visualizer-color-black', blackVal, 'visualizer:color:black')
    // reset border color/width too
    setVisualBorderColor(DEFAULT_VIS_BORDER_COLOR)
    try { document.documentElement.style.setProperty('--visualizer-border-color', DEFAULT_VIS_BORDER_COLOR); localStorage.setItem('visualizer:border:color', DEFAULT_VIS_BORDER_COLOR) } catch(e) {}
    setVisualBorderWidth(DEFAULT_VIS_BORDER_WIDTH)
    applyBorderAndStore('--visualizer-border-width', DEFAULT_VIS_BORDER_WIDTH, 'visualizer:border:width')
  }

  if (!open) return null

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{position:'fixed',left:0,top:0,right:0,bottom:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000}}
    >
      <div onClick={(e) => e.stopPropagation()} style={{width:560,maxWidth:'94%',background:'var(--panel-solid)',padding:18,borderRadius:10,color:'var(--muted)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <div style={{fontWeight:700}}>Settings</div>
          <button onClick={onClose} className="collapse-btn">Close</button>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 220px',gap:12,alignItems:'center',marginTop:8}}>
          <div style={{fontWeight:600}}>White key width (px)</div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <input type="range" min={16} max={64} value={whiteWidth} onChange={e => onWhiteChange(e.target.value)} onDoubleClick={() => onWhiteChange(DEFAULT_WHITE)} style={{flex:1, minWidth:0}} />
            <input type="number" value={whiteWidth} onChange={e => onWhiteChange(e.target.value)} style={{width:48,flex:'0 0 48px',padding:'6px 8px',borderRadius:6,border:'1px solid rgba(255,255,255,0.06)',background:'transparent',color:'var(--muted)'}} />
          </div>

          <div style={{fontWeight:600}}>Black key width (px)</div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <input type="range" min={8} max={40} value={blackWidth} onChange={e => onBlackChange(e.target.value)} onDoubleClick={() => onBlackChange(DEFAULT_BLACK)} style={{flex:1, minWidth:0}} />
            <input type="number" value={blackWidth} onChange={e => onBlackChange(e.target.value)} style={{width:48,flex:'0 0 48px',padding:'6px 8px',borderRadius:6,border:'1px solid rgba(255,255,255,0.06)',background:'transparent',color:'var(--muted)'}} />
          </div>

          <div style={{gridColumn:'1 / -1', marginTop:10, paddingTop:10, borderTop:'1px solid rgba(255,255,255,0.06)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <div style={{fontWeight:700, color:'var(--accent)'}}>Sound</div>
            <div style={{display:'flex', gap:8, alignItems:'center'}}>
              <label style={{fontSize:12,display:'flex',alignItems:'center',gap:6}}>
                <input type="checkbox" checked={!!audio.muted} onChange={e => updateAudio({ muted: e.target.checked })} />
                Mute
              </label>
              <button onClick={resetAudio} title="Reset sound to defaults" style={{padding:'6px 10px',borderRadius:6,border:'1px solid rgba(255,255,255,0.06)',background:'transparent',color:'var(--muted)'}}>Reset sound</button>
            </div>
          </div>

          <div style={{fontWeight:600}}>Master volume</div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <input type="range" min={0} max={100} value={Math.round(audio.masterVolume * 100)} onChange={e => updateAudio({ masterVolume: Number(e.target.value) / 100 })} style={{flex:1, minWidth:0}} />
            <div style={{width:40,textAlign:'right',fontSize:12}}>{Math.round(audio.masterVolume * 100)}%</div>
          </div>

          <div style={{gridColumn:'1 / -1', fontSize:12, opacity:0.7}}>Sampled Steinway grand piano. Samples load the first time you play a note and are cached in the browser afterward, so it works offline from then on.</div>

          {app === 'identify' && (
            <>
              <div style={{gridColumn:'1 / -1', marginTop:10, paddingTop:10, borderTop:'1px solid rgba(255,255,255,0.06)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div style={{fontWeight:700, color:'var(--accent)'}}>Staff</div>
                <button onClick={resetStaff} title="Reset staff size/position to defaults" style={{padding:'6px 10px',borderRadius:6,border:'1px solid rgba(255,255,255,0.06)',background:'transparent',color:'var(--muted)'}}>Reset staff</button>
              </div>

              <div style={{fontWeight:600}}>Staff width (px)</div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <input type="range" min={150} max={500} step={10} value={staff.width} onChange={e => updateStaff({ width: Number(e.target.value) })} style={{flex:1, minWidth:0}} />
                <div style={{width:40,textAlign:'right',fontSize:12}}>{staff.width}</div>
              </div>

              <div style={{fontWeight:600}}>Staff & note size</div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <input type="range" min={70} max={250} value={Math.round(staff.scale * 100)} onChange={e => updateStaff({ scale: Number(e.target.value) / 100 })} style={{flex:1, minWidth:0}} />
                <div style={{width:40,textAlign:'right',fontSize:12}}>{Math.round(staff.scale * 100)}%</div>
              </div>

              <div style={{fontWeight:600}}>Alignment</div>
              <div style={{display:'flex',gap:8}}>
                {['left','center','right'].map(a => (
                  <button
                    key={a}
                    onClick={() => updateStaff({ align: a })}
                    style={{
                      padding:'6px 10px',borderRadius:6,cursor:'pointer',textTransform:'capitalize',
                      border: staff.align === a ? '1px solid transparent' : '1px solid rgba(255,255,255,0.06)',
                      background: staff.align === a ? 'var(--accent)' : 'transparent',
                      color: staff.align === a ? '#071025' : 'var(--muted)'
                    }}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </>
          )}

          {app === 'play' && (
            <>
              <div style={{gridColumn:'1 / -1', marginTop:10, paddingTop:10, borderTop:'1px solid rgba(255,255,255,0.06)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div style={{fontWeight:700, color:'var(--accent)'}}>Play The Chord</div>
                <button onClick={() => onHandThresholdChange(DEFAULT_HAND_THRESHOLD)} title="Reset hand threshold to default" style={{padding:'6px 10px',borderRadius:6,border:'1px solid rgba(255,255,255,0.06)',background:'transparent',color:'var(--muted)'}}>Reset</button>
              </div>

              <div style={{fontWeight:600}}>Hand threshold</div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <input type="range" min={36} max={84} value={handThreshold} onChange={e => onHandThresholdChange(e.target.value)} onDoubleClick={() => onHandThresholdChange(DEFAULT_HAND_THRESHOLD)} style={{flex:1, minWidth:0}} />
                <div style={{width:44,textAlign:'right',fontSize:13,fontWeight:700}}>{midiToNoteLabel(handThreshold)}</div>
              </div>
              <div style={{gridColumn:'1 / -1', fontSize:12, opacity:0.7}}>A played chord's lowest note at or above this counts as right hand for stats; below it, left hand.</div>
            </>
          )}

          {app === 'visualizer' && (
            <>
              <div style={{fontWeight:600}}>Visualizer speed (px/sec)</div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <input type="range" min={40} max={600} step={10} value={visualSpeed} onChange={e => onVisualSpeedChange(e.target.value)} onDoubleClick={() => onVisualSpeedChange(DEFAULT_VIS_SPEED)} style={{flex:1, minWidth:0}} disabled={shrinkOn} title={shrinkOn ? 'Speed not adjustable while Shrink is ON' : undefined} />
                <input type="number" value={visualSpeed} onChange={e => onVisualSpeedChange(e.target.value)} style={{width:72,flex:'0 0 72px',padding:'6px 8px',borderRadius:6,border:'1px solid rgba(255,255,255,0.06)',background:'transparent',color:'var(--muted)'}} disabled={shrinkOn} title={shrinkOn ? 'Speed not adjustable while Shrink is ON' : undefined} />
              </div>
            </>
          )}

          {app === 'visualizer' && (
            <>
              <div style={{fontWeight:600}}>Visualizer color</div>
              <div style={{display:'flex',flexDirection:'column',gap:8,alignItems:'stretch'}}>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <div style={{display:'flex',flexDirection:'column',gap:6,flex:1,minWidth:0}}>
                    <label style={{fontSize:12}}>White-key bars</label>
                    <input type="color" value={visualColorWhite} onChange={e => onVisualColorWhiteChange(e.target.value)} title="Color for bars emitted from white keys" style={{width:'100%'}} />
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:6,flex:1,minWidth:0}}>
                    <label style={{fontSize:12}}>Black-key bars</label>
                    <input type="color" value={visualColorBlack} onChange={e => onVisualColorBlackChange(e.target.value)} title="Color for bars emitted from black keys" disabled={visualColorsLocked} style={{width:'100%'}} />
                  </div>
                </div>
                <div style={{display:'flex',gap:8,alignItems:'center',justifyContent:'flex-end'}}>
                  <label style={{fontSize:12,display:'flex',alignItems:'center',gap:8}}>
                    <input type="checkbox" checked={visualColorsLocked} onChange={e => onToggleColorsLocked(e.target.checked)} title="Lock black color to match white" />
                    Lock black to white
                  </label>
                  <button onClick={resetVisualColors} title="Reset visualizer colors to defaults" style={{padding:'6px 10px',borderRadius:6,border:'1px solid rgba(255,255,255,0.06)',background:'transparent',color:'var(--muted)'}}>Reset colors</button>
                </div>
                <div style={{display:'flex',gap:8,alignItems:'center',marginTop:6}}>
                  <div style={{display:'flex',flexDirection:'column',gap:6,flex:1,minWidth:0}}>
                    <label style={{fontSize:12}}>Border color</label>
                    <input type="color" value={visualBorderColor} onChange={e => onVisualBorderColorChange(e.target.value)} title="Border color for bars" style={{width:'100%'}} />
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:6,width:120}}>
                    <label style={{fontSize:12}}>Border width (px)</label>
                    <input type="number" min={0} max={8} value={visualBorderWidth} onChange={e => onVisualBorderWidthChange(e.target.value)} style={{width:'100%'}} />
                  </div>
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
