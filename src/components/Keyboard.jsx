import React, { useRef, useState, useMemo } from 'react'

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

export default function Keyboard({ pressedNotes, onNoteOn, onNoteOff, onHeightChange, targetPCs = new Set(), targetMidis = new Set(), mode = 'chord', labelMode: labelModeProp, onLabelModeChange, collapsed: collapsedProp, onCollapsedChange }) {
  const keys = []
  for (let n = LOWEST; n <= HIGHEST; n++) keys.push(n)

  // key heights are controlled by CSS variables; no manual resize state
  const [internalCollapsed, setInternalCollapsed] = useState(false)
  const [internalLabelMode, setInternalLabelMode] = useState('all')

  const collapsed = typeof collapsedProp === 'boolean' ? collapsedProp : internalCollapsed
  const setCollapsed = typeof onCollapsedChange === 'function' ? onCollapsedChange : setInternalCollapsed
  const labelMode = typeof labelModeProp === 'string' ? labelModeProp : internalLabelMode
  const setLabelMode = typeof onLabelModeChange === 'function' ? onLabelModeChange : setInternalLabelMode
  const [localPressed, setLocalPressed] = useState(() => new Set())
  const pointerMapRef = useRef(new Map())
  const lastMoveRef = useRef(0)

  // compute combined pressed set (global MIDI + local pointer presses)
  const combinedPressed = useMemo(() => {
    const s = new Set()
    if (pressedNotes) {
      const arr = Array.isArray(pressedNotes) ? pressedNotes : Array.from(pressedNotes)
      for (const n of arr) s.add(n)
    }
    for (const n of localPressed) s.add(n)
    return s
  }, [pressedNotes, localPressed])

  // compute target MIDI keys (only use explicit `targetMidis` provided by the app).
  // Do NOT fall back to mapping from `targetPCs` here — apps may want to provide
  // pitch-classes for detection while hiding visual mids (showNotes=false).
  const computedTargetMidis = useMemo(() => {
    if (targetMidis && targetMidis.size > 0) return new Set(Array.from(targetMidis).filter(n => typeof n === 'number' && n >= LOWEST && n <= HIGHEST))
    return new Set()
  }, [targetMidis])

  // detection target PCs: prefer explicit `targetPCs` provided by the app (for wrong-note detection).
  // If none provided, fall back to pitch-classes derived from explicit MIDI targets.
  const detectionTargetPCs = useMemo(() => {
    if (targetPCs && targetPCs.size > 0) return targetPCs
    const s = new Set()
    for (const m of computedTargetMidis) s.add(((m % 12) + 12) % 12)
    return s
  }, [targetPCs, computedTargetMidis])

  

  const showLabelFor = (n) => {
    if (labelMode === 'none') return ''
    const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
    const name = names[n % 12]
    const lab = midiToLabel(n)
    if (labelMode === 'c-only') return name === 'C' ? lab : ''
    return lab
  }

  const wrapperRef = useRef(null)

  // no inline CSS vars required; CSS controls key heights
  const inlineVars = undefined

  // notify parent about the total keyboard wrapper height so other UI (apps pane)
  // can avoid overlapping the piano. Called whenever height or collapsed changes.
  React.useEffect(() => {
    const h = wrapperRef.current ? wrapperRef.current.offsetHeight : 0
    try { if (typeof onHeightChange === 'function') onHeightChange(h) } catch (e) {}
  }, [collapsed, onHeightChange])

  return (
    <div ref={wrapperRef} data-mode={mode} className={`keyboard-wrapper ${collapsed ? 'collapsed' : 'expanded'}`}>
      <div className="piano-header">
        {/* Title and controls moved to site footer; resize control removed */}
      </div>

      {!collapsed && (
        <>
          <div className="keyboard" role="application" aria-label="88-key keyboard">
            {keys.map((n) => {
              const black = isBlackKey(n)
              const active = combinedPressed.has(n)
              const isTarget = computedTargetMidis.has(n)
              const pc = ((n % 12) + 12) % 12
              const wrong = combinedPressed.has(n) && (detectionTargetPCs && detectionTargetPCs.size > 0) && !detectionTargetPCs.has(pc)
              const cls = `${black ? 'black' : 'white'} key ${active ? 'active' : ''} ${isTarget ? 'target' : ''} ${wrong ? 'wrong' : ''}`

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

              const handlePointerMove = (e) => {
                // Only handle pointer moves for pointers that started on a key (we captured them).
                // This prevents hover-only motion from triggering notes.
                const pid = e.pointerId
                if (!pointerMapRef.current.has(pid)) return
                // throttle pointermove to ~30fps to reduce CPU pressure
                const now = performance.now()
                if (now - lastMoveRef.current < 33) return
                lastMoveRef.current = now
                const prev = pointerMapRef.current.get(pid)
                let el
                try { el = document.elementFromPoint(e.clientX, e.clientY) } catch (err) { el = null }
                const keyEl = el && el.closest ? el.closest('.keyboard .key') : null
                if (keyEl && keyEl.dataset && keyEl.dataset.midi) {
                  const midi = Number(keyEl.dataset.midi)
                  if (midi !== prev) {
                    // switch active note for this pointer
                    if (prev != null) {
                      pointerMapRef.current.delete(pid)
                      setLocalPressed(prevSet => {
                        const s = new Set(prevSet)
                        s.delete(prev)
                        return s
                      })
                      if (typeof onNoteOff === 'function') onNoteOff(prev)
                    }
                    pointerMapRef.current.set(pid, midi)
                    setLocalPressed(prevSet => {
                      const s = new Set(prevSet)
                      s.add(midi)
                      return s
                    })
                    if (typeof onNoteOn === 'function') onNoteOn(midi)
                  }
                } else {
                  // not over any key; if we had a previous note for this pointer, release it
                  if (prev != null) {
                    pointerMapRef.current.delete(pid)
                    setLocalPressed(prevSet => {
                      const s = new Set(prevSet)
                      s.delete(prev)
                      return s
                    })
                    if (typeof onNoteOff === 'function') onNoteOff(prev)
                  }
                }
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
                  data-midi={n}
                  className={cls}
                  title={`${midiToLabel(n)} (${n})`}
                  role="button"
                  tabIndex={0}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
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
          {/* Controls positioned between piano bottom edge and site footer */}
          <div className="keyboard-controls" style={{display:'flex',justifyContent:'center',alignItems:'center',gap:10,width:'100%',boxSizing:'border-box'}}>
            <div className="show-keys-label" style={{fontSize:13,fontWeight:600,marginRight:8}}>Key Labels:</div>
            <div className={`toggle ${labelMode === 'all' ? 'active' : ''}`} onClick={() => setLabelMode('all')}>All</div>
            <div className={`toggle ${labelMode === 'c-only' ? 'active' : ''}`} onClick={() => setLabelMode('c-only')}>C Only</div>
            <div className={`toggle ${labelMode === 'none' ? 'active' : ''}`} onClick={() => setLabelMode('none')}>None</div>
          </div>
        </>
      )}
    </div>
  )
}
