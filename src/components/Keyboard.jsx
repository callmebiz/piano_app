import React, { useRef, useState } from 'react'

const LOWEST = 21
const HIGHEST = 108

const isBlackKey = (midi) => {
  const mod = midi % 12
  return [1, 3, 6, 8, 10].includes(mod)
}

function midiToLabel(midi) {
  const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
  const name = names[midi % 12]
  const octave = Math.floor(midi / 12) - 1
  return `${name}${octave}`
}

export default function Keyboard({ pressedNotes, onNoteOn, onNoteOff, onHeightChange }) {
  const keys = []
  for (let n = LOWEST; n <= HIGHEST; n++) keys.push(n)

  const DEFAULT_HEIGHT = 160
  const [height, setHeight] = useState(DEFAULT_HEIGHT)
  const [collapsed, setCollapsed] = useState(false)
  const [labelMode, setLabelMode] = useState('all')
  const dragRef = useRef(null)
  const [localPressed, setLocalPressed] = useState(() => new Set())
  const pointerMapRef = useRef(new Map())

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

  const onPointerDown = (e) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startY: e.clientY, startHeight: height }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  const onHandleDoubleClick = () => {
    setHeight(DEFAULT_HEIGHT)
  }

  const onPointerMove = (e) => {
    if (!dragRef.current) return
    const dy = dragRef.current.startY - e.clientY
    const newH = clamp(dragRef.current.startHeight + dy, 80, 420)
    setHeight(newH)
  }

  const onPointerUp = () => {
    dragRef.current = null
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  }

  const showLabelFor = (n) => {
    if (labelMode === 'none') return ''
    const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
    const name = names[n % 12]
    const lab = midiToLabel(n)
    if (labelMode === 'c-only') return name === 'C' ? lab : ''
    return lab
  }

  const wrapperRef = useRef(null)

  const inlineVars = {
    '--white-key-height': `${height}px`,
    '--black-key-height': `${Math.round(height * 0.62)}px`
  }

  // notify parent about the total keyboard wrapper height so other UI (apps pane)
  // can avoid overlapping the piano. Called whenever height or collapsed changes.
  React.useEffect(() => {
    const h = wrapperRef.current ? wrapperRef.current.offsetHeight : 0
    try { if (typeof onHeightChange === 'function') onHeightChange(h) } catch (e) {}
  }, [height, collapsed, onHeightChange])

  return (
    <div ref={wrapperRef} className={`keyboard-wrapper ${collapsed ? 'collapsed' : 'expanded'}`} style={inlineVars}>
      <div className="piano-header">
        <div className="piano-title">Piano</div>
          {!collapsed && <div className="kbd-handle" title="Drag to resize (double-click to reset)" onPointerDown={onPointerDown} onDoubleClick={onHandleDoubleClick} />}
        <div className="piano-right">
          {!collapsed && (
            <div className="piano-controls">
              <div className="show-keys-label">Show Keys:</div>
              <div className={`toggle ${labelMode === 'all' ? 'active' : ''}`} onClick={() => setLabelMode('all')}>All</div>
              <div className={`toggle ${labelMode === 'c-only' ? 'active' : ''}`} onClick={() => setLabelMode('c-only')}>C Only</div>
              <div className={`toggle ${labelMode === 'none' ? 'active' : ''}`} onClick={() => setLabelMode('none')}>None</div>
            </div>
          )}
          <div className="piano-actions">
            <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)}>{collapsed ? 'Show' : 'Hide'}</button>
          </div>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="keyboard" role="application" aria-label="88-key keyboard">
            {keys.map((n) => {
              const black = isBlackKey(n)
              const active = pressedNotes.has(n) || localPressed.has(n)
              const cls = `${black ? 'black' : 'white'} key ${active ? 'active' : ''}`

              const handlePointerDown = (e) => {
                e.preventDefault()
                try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) {}
                pointerMapRef.current.set(e.pointerId, n)
                setLocalPressed(prev => {
                  const s = new Set(prev)
                  s.add(n)
                  return s
                })
                if (typeof onNoteOn === 'function') onNoteOn(n)
              }

              const handlePointerUp = (e) => {
                const note = pointerMapRef.current.get(e.pointerId)
                if (note != null) {
                  pointerMapRef.current.delete(e.pointerId)
                  setLocalPressed(prev => {
                    const s = new Set(prev)
                    s.delete(note)
                    return s
                  })
                  if (typeof onNoteOff === 'function') onNoteOff(note)
                }
                try { e.currentTarget.releasePointerCapture(e.pointerId) } catch (err) {}
              }

              const handlePointerCancel = (e) => {
                const note = pointerMapRef.current.get(e.pointerId)
                if (note != null) {
                  pointerMapRef.current.delete(e.pointerId)
                  setLocalPressed(prev => {
                    const s = new Set(prev)
                    s.delete(note)
                    return s
                  })
                  if (typeof onNoteOff === 'function') onNoteOff(note)
                }
              }

              const handleKeyDown = (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  // simulate press
                  setLocalPressed(prev => {
                    const s = new Set(prev)
                    s.add(n)
                    return s
                  })
                  if (typeof onNoteOn === 'function') onNoteOn(n)
                }
              }

              const handleKeyUp = (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setLocalPressed(prev => {
                    const s = new Set(prev)
                    s.delete(n)
                    return s
                  })
                  if (typeof onNoteOff === 'function') onNoteOff(n)
                }
              }

              return (
                <div
                  key={n}
                  className={cls}
                  title={`${midiToLabel(n)} (${n})`}
                  role="button"
                  tabIndex={0}
                  onPointerDown={handlePointerDown}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerCancel}
                  onKeyDown={handleKeyDown}
                  onKeyUp={handleKeyUp}
                >
                  <div className="label">{showLabelFor(n)}</div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
