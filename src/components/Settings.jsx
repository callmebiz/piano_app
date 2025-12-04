import React, { useEffect, useState } from 'react'

export default function Settings({ open = false, onClose = () => {} }) {
  const DEFAULT_WHITE = 40
  const DEFAULT_BLACK = 25

  const readStored = (key, fallback) => {
    try { const v = localStorage.getItem(key); if (v) return Number(v) } catch(e) {}
    return fallback
  }

  const [whiteWidth, setWhiteWidth] = useState(() => readStored('piano:whiteKeyWidth', DEFAULT_WHITE))
  const [blackWidth, setBlackWidth] = useState(() => readStored('piano:blackKeyWidth', DEFAULT_BLACK))

  useEffect(() => {
    // apply initial values to CSS variables on mount
    try {
      document.documentElement.style.setProperty('--white-key-width', `${whiteWidth}px`)
      document.documentElement.style.setProperty('--black-key-width', `${blackWidth}px`)
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

        </div>
      </div>
    </div>
  )
}
