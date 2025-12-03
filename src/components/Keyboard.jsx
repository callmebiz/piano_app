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

export default function Keyboard({ pressedNotes, onNoteOn, onNoteOff, onHeightChange, onLayoutChange, targetPCs = new Set(), targetMidis = new Set(), mode = 'chord', labelMode: labelModeProp, onLabelModeChange, collapsed: collapsedProp, onCollapsedChange, disableResize = false }) {
  const keys = []
  for (let n = LOWEST; n <= HIGHEST; n++) keys.push(n)

  const DEFAULT_HEIGHT = 160
  const [height, setHeight] = useState(DEFAULT_HEIGHT)
  const [internalCollapsed, setInternalCollapsed] = useState(false)
  const [internalLabelMode, setInternalLabelMode] = useState('all')
  const collapsed = typeof collapsedProp === 'boolean' ? collapsedProp : internalCollapsed
  const setCollapsed = onCollapsedChange ? onCollapsedChange : setInternalCollapsed
  const labelMode = typeof labelModeProp === 'string' ? labelModeProp : internalLabelMode
  const setLabelMode = onLabelModeChange ? onLabelModeChange : setInternalLabelMode
  const dragRef = useRef(null)
  const [localPressed, setLocalPressed] = useState(() => new Set())
  const pointerMapRef = useRef(new Map())

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

  // provide precise key layout info to parent via onLayoutChange
  React.useEffect(() => {
    if (typeof onLayoutChange !== 'function') return
    const obs = new ResizeObserver(() => {
      try {
        const wrap = wrapperRef.current
        if (!wrap) return
        const wrapperRect = wrap.getBoundingClientRect()
        const keyNodes = wrap.querySelectorAll('.keyboard .key')
        const keyRects = []
        keyNodes.forEach((el, idx) => {
          const rect = el.getBoundingClientRect()
          // left relative to wrapper
          keyRects.push({ midi: LOWEST + idx, left: rect.left - wrapperRect.left, width: rect.width })
        })
        onLayoutChange({ midiMin: LOWEST, midiMax: HIGHEST, wrapperLeft: wrapperRect.left, wrapperWidth: wrapperRect.width, keyRects })
      } catch (e) {}
    })
    if (wrapperRef.current) obs.observe(wrapperRef.current)
    // run once immediately (best-effort)
    try {
      const wrap = wrapperRef.current
      if (wrap) {
        const wrapperRect = wrap.getBoundingClientRect()
        const keyNodes = wrap.querySelectorAll('.keyboard .key')
        const keyRects = []
        keyNodes.forEach((el, idx) => {
          const rect = el.getBoundingClientRect()
          keyRects.push({ midi: LOWEST + idx, left: rect.left - wrapperRect.left, width: rect.width })
        })
        onLayoutChange({ midiMin: LOWEST, midiMax: HIGHEST, wrapperLeft: wrapperRect.left, wrapperWidth: wrapperRect.width, keyRects })
      }
    } catch (e) {}
    return () => { try { obs.disconnect() } catch (e) {} }
  }, [onLayoutChange, height, collapsed])

  return (
    <div ref={wrapperRef} data-mode={mode} className={`keyboard-wrapper ${collapsed ? 'collapsed' : 'expanded'}`} style={inlineVars}>
      <div className="piano-header">
        {/* header is now minimal; controls moved to the app footer */}
        {!disableResize && !collapsed && <div className="kbd-handle" title="Drag to resize (double-click to reset)" onPointerDown={onPointerDown} onDoubleClick={onHandleDoubleClick} />}
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
