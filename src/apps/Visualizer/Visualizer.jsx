import React, { useEffect, useRef, useState } from 'react'

// Visualizer: emits upward-traveling bars from the top edge of keyboard keys.
// Optimized: bar DOM nodes are updated directly in the RAF loop to avoid React
// re-renders each frame (which causes high CPU usage).

function ensureArray(s) {
  if (!s) return []
  if (Array.isArray(s)) return s
  if (s instanceof Set) return Array.from(s)
  return Array.from(s)
}

export default function Visualizer({ pressedNotes, shrinkOn = false, freezeOn = false }) {
  const pressedRef = useRef(new Set())
  const barsRef = useRef([])
  const barElsRef = useRef({}) // map id -> DOM element
  const rafRef = useRef(null)
  const containerRef = useRef(null)
  const [version, setVersion] = useState(0) // trigger render when bars are added/removed
  const shrinkOnRef = useRef(shrinkOn)
  const freezeOnRef = useRef(freezeOn)
  const scaleRef = useRef(1)
  const freezeAtRef = useRef(null)

  const DEFAULT_SPEED = 120
  function getSpeed() {
    try {
      const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--visualizer-speed'))
      if (Number.isFinite(v) && v > 0) return v
    } catch (e) {}
    try {
      const stored = localStorage.getItem('visualizer:speed')
      const sv = parseFloat(stored)
      if (Number.isFinite(sv) && sv > 0) return sv
    } catch (e) {}
    return DEFAULT_SPEED
  }

  function readColorsOnce() {
    try {
      const s = getComputedStyle(document.documentElement)
      const w = (s.getPropertyValue('--visualizer-color-white') || '').trim()
      const bk = (s.getPropertyValue('--visualizer-color-black') || '').trim()
      const borderCol = (s.getPropertyValue('--visualizer-border-color') || '').trim()
      const borderWidthRaw = (s.getPropertyValue('--visualizer-border-width') || '').trim()
      const borderWidth = parseFloat(borderWidthRaw) || 1
      return {
        white: w || 'rgba(110,231,183,0.98)',
        black: bk || 'rgba(110,231,183,0.98)',
        borderColor: borderCol || 'rgba(0,0,0,0.12)',
        borderWidth: borderWidth
      }
    } catch (e) {
      return { white: 'rgba(110,231,183,0.98)', black: 'rgba(110,231,183,0.98)', borderColor: 'rgba(0,0,0,0.12)', borderWidth: 1 }
    }
  }

  // start a new bar for a midi note
  function startBar(midi) {
    if (freezeOnRef.current) return
    const keyEl = document.querySelector(`.keyboard .key[data-midi="${midi}"]`)
    if (!keyEl) return
    const keyRect = keyEl.getBoundingClientRect()
    const left = keyRect.left
    const width = keyRect.width
    const id = `${midi}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`
    const now = performance.now()
    const bar = {
      id,
      midi,
      left,
      width,
      isBlack: keyEl.classList.contains('black'),
      startTime: now,
      releaseTime: null,
      released: false,
      baseHeight: 4,
      height: 4,
      translate: 0,
      // shrinkable: only bars started while shrink mode was active
      shrinkable: !!shrinkOnRef.current
    }
    barsRef.current.push(bar)
    // create DOM node on next render
    setVersion(v => v + 1)
  }

  function releaseBarFor(midi) {
    for (let i = barsRef.current.length - 1; i >= 0; i--) {
      const b = barsRef.current[i]
      if (b.midi === midi && !b.released) {
        b.released = true
        b.releaseTime = performance.now()
        if (typeof b.height === 'number') b.heldHeight = b.height
        else {
          const held = (b.releaseTime - b.startTime) / 1000
          b.heldHeight = Math.max(b.baseHeight, held * getSpeed())
        }
        break
      }
    }
  }

  useEffect(() => {
    // If frozen, ignore pressed-notes changes (preserve the frozen visual state).
    if (freezeOnRef.current) return

    const arr = ensureArray(pressedNotes)
    const newSet = new Set(arr.map(n => Number(n)))
    const prev = pressedRef.current
    for (const n of newSet) if (!prev.has(n)) startBar(n)
    for (const n of prev) if (!newSet.has(n)) releaseBarFor(n)
    pressedRef.current = newSet
  }, [pressedNotes])

  // keep refs in sync with latest props and handle shrink on->off transition
  const prevShrinkRef = useRef(shrinkOn)
  useEffect(() => {
    const prev = prevShrinkRef.current
    // if shrink turned off, convert existing shrinkable bars into non-shrinkable
    // but preserve their currently displayed (scaled) height/translate so they don't jump.
    if (prev && !shrinkOn) {
      // Convert shrinkable bars into non-shrinkable while preserving their displayed
      // (scaled) height/translate by adjusting their timestamps so the time-based
      // RAF calculations continue from that visual state without jumps.
      const scale = scaleRef.current || 1
      const now = performance.now()
      const speed = getSpeed()
      for (const b of barsRef.current) {
        if (!b.shrinkable) continue

        // compute displayed (scaled) values
        const displayedHeight = (b.height || b.baseHeight) * scale
        const displayedTranslate = (b.translate || 0) * scale

        if (!b.released) {
          // For a held bar, set startTime so that (now - startTime)/1000 * speed === displayedHeight
          const wantedSeconds = displayedHeight / Math.max(1, speed)
          b.startTime = now - (wantedSeconds * 1000)
          b.height = displayedHeight
        } else {
          // For a released bar, set heldHeight and releaseTime so translate continues from displayedTranslate
          b.heldHeight = displayedHeight
          const wantedSecondsSinceRelease = displayedTranslate / Math.max(1, speed)
          b.releaseTime = now - (wantedSecondsSinceRelease * 1000)
          b.translate = displayedTranslate
        }

        // update DOM element immediately to match the displayed values
        const el = barElsRef.current[b.id]
        if (el) {
          el.style.height = `${displayedHeight}px`
          el.style.transform = `translateY(${-(displayedTranslate)}px)`
        }

        b.shrinkable = false
      }
      // re-render in case DOM list needs to update attributes
      setVersion(v => v + 1)
    }
    prevShrinkRef.current = shrinkOn
    shrinkOnRef.current = shrinkOn
  }, [shrinkOn])
  useEffect(() => {
    // Keep freeze ref in sync and handle transitions.
    const prev = freezeOnRef.current
    freezeOnRef.current = freezeOn

    // Transition: freeze turned ON -> capture freeze timestamp, compute and apply current scale
    if (!prev && freezeOn) {
      freezeAtRef.current = performance.now()
      const containerRect = containerRef.current ? containerRef.current.getBoundingClientRect() : { height: 0 }
      let maxTop = 0
      for (const b of barsRef.current) {
        const topUnscaled = (b.height || b.baseHeight) + (b.translate || 0)
        if (topUnscaled > maxTop) maxTop = topUnscaled
      }
      let scale = 1
      if (maxTop > containerRect.height && maxTop > 0) scale = containerRect.height / maxTop
      scaleRef.current = scale

      // apply styles immediately so freeze preserves the exact displayed look
      const colors = readColorsOnce()
      for (const b of barsRef.current) {
        const el = barElsRef.current[b.id]
        if (!el) continue
        const displayedHeight = (b.height || b.baseHeight) * scale
        const displayedTranslate = (b.translate || 0) * scale
        const ty = -(displayedTranslate)
        el.style.height = `${displayedHeight}px`
        el.style.transform = `translateY(${ty}px)`
        el.style.background = b.isBlack ? colors.black : colors.white
        el.style.border = `${colors.borderWidth || 1}px solid ${colors.borderColor || 'rgba(0,0,0,0.12)'}`
      }
    }

    // Transition: freeze turned OFF -> advance bar timestamps by freeze duration so animation resumes smoothly
    // Also release any notes that were released while frozen (so bars don't persist when they shouldn't).
    if (prev && !freezeOn) {
      const now = performance.now()
      const freezeAt = freezeAtRef.current || now
      const delta = Math.max(0, now - freezeAt)
      for (const b of barsRef.current) {
        if (typeof b.startTime === 'number') b.startTime += delta
        if (typeof b.releaseTime === 'number') b.releaseTime += delta
      }
      freezeAtRef.current = null

      // Determine which notes were released while frozen and release their bars now
      const arr = ensureArray(pressedNotes)
      const newSet = new Set(arr.map(n => Number(n)))
      const prevSet = pressedRef.current || new Set()
      // notes that were in prevSet but are no longer in newSet were released during freeze
      for (const n of prevSet) {
        if (!newSet.has(n)) {
          try { releaseBarFor(n) } catch (e) {}
        }
      }

      // Do NOT start bars for notes that were pressed while frozen (i.e., in newSet but not prevSet).
      // Just update pressedRef to the new set so future releases are handled normally.
      pressedRef.current = newSet
    }
  }, [freezeOn, pressedNotes])

  // animation: update bar DOM nodes directly
  useEffect(() => {
    let last = performance.now()
    const colorsCache = { ...readColorsOnce(), lastRead: performance.now() }

    function frame(now) {
      const dt = (now - last) / 1000
      last = now

      // refresh colors occasionally (in case Settings changed) - every 200ms
      if (now - colorsCache.lastRead > 200) {
        const c = readColorsOnce()
        colorsCache.white = c.white
        colorsCache.black = c.black
        colorsCache.borderColor = c.borderColor
        colorsCache.borderWidth = c.borderWidth
        colorsCache.lastRead = now
      }

      const containerRect = containerRef.current ? containerRef.current.getBoundingClientRect() : { height: 0 }
      const speed = getSpeed()
      const growRate = speed
      const removeIds = []

      // If frozen, do not update bar growth/translation or scale — but still apply
      // live color/border updates so Settings changes are visible while frozen.
      if (freezeOnRef.current) {
        // read colors immediately and apply to all bars
        const liveColors = readColorsOnce()
        for (const b of barsRef.current) {
          const el = barElsRef.current[b.id]
          if (!el) continue
          el.style.background = b.isBlack ? liveColors.black : liveColors.white
          el.style.border = `${liveColors.borderWidth || 1}px solid ${liveColors.borderColor || 'rgba(0,0,0,0.12)'}`
        }
        rafRef.current = requestAnimationFrame(frame)
        return
      }

      // first compute unscaled heights/translates for all bars
      for (const b of barsRef.current) {
        if (!b.released) {
          const heldElapsed = (now - b.startTime) / 1000
          b.height = Math.max(b.baseHeight, heldElapsed * growRate)
          b.translate = 0
        } else {
          b.height = b.heldHeight || b.height || b.baseHeight
          const sinceRelease = (now - b.releaseTime) / 1000
          b.translate = sinceRelease * speed
        }
      }

      // compute global scale when shrink mode is active so nothing exceeds the top anchor
      // Only consider bars that were created while shrink was active (b.shrinkable)
      let scale = 1
      if (shrinkOnRef.current) {
        let maxTop = 0
        for (const b of barsRef.current) {
          if (!b.shrinkable) continue
          const topUnscaled = (b.height || b.baseHeight) + (b.translate || 0)
          if (topUnscaled > maxTop) maxTop = topUnscaled
        }
        if (maxTop > containerRect.height && maxTop > 0) {
          scale = containerRect.height / maxTop
        }
      }
      scaleRef.current = scale

      // update DOM for each bar using scaled values
      for (const b of barsRef.current) {
        const el = barElsRef.current[b.id]
        if (el) {
          const displayScale = b.shrinkable ? scale : 1
          const displayedHeight = (b.height || b.baseHeight) * displayScale
          const displayedTranslate = (b.translate || 0) * displayScale
          const ty = -(displayedTranslate)
          el.style.left = `${b.left}px`
          el.style.width = `${b.width}px`
          el.style.height = `${displayedHeight}px`
          el.style.transform = `translateY(${ty}px)`
          el.style.background = b.isBlack ? colorsCache.black : colorsCache.white
          el.style.border = `${colorsCache.borderWidth || 1}px solid ${colorsCache.borderColor || 'rgba(0,0,0,0.12)'}`
          el.style.borderTopLeftRadius = '6px'
          el.style.borderTopRightRadius = '6px'
          el.style.borderBottomLeftRadius = b.released ? '6px' : '0px'
          el.style.borderBottomRightRadius = b.released ? '6px' : '0px'
          el.style.zIndex = b.isBlack ? '30' : '10'
        }

        // removal policy:
        // - if bar is not shrinkable, always allow removal when it translates offscreen
        // - if bar is shrinkable and shrink mode is OFF, allow removal
        // - if bar is shrinkable and shrink mode is ON, do NOT remove (they persist in-frame)
        if (!b.shrinkable) {
          if (b.translate > containerRect.height + b.height + 50) removeIds.push(b.id)
        } else {
          if (!shrinkOnRef.current) {
            if (b.translate > containerRect.height + b.height + 50) removeIds.push(b.id)
          }
        }
      }

      if (removeIds.length) {
        barsRef.current = barsRef.current.filter(b => !removeIds.includes(b.id))
        // cleanup DOM refs for removed bars
        for (const id of removeIds) {
          try { delete barElsRef.current[id] } catch (e) {}
        }
        // re-render to remove DOM nodes
        setVersion(v => v + 1)
      }

      rafRef.current = requestAnimationFrame(frame)
    }

    rafRef.current = requestAnimationFrame(frame)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  // recompute left/widths on resize
  useEffect(() => {
    function recompute() {
      for (const b of barsRef.current) {
        const keyEl = document.querySelector(`.keyboard .key[data-midi="${b.midi}"]`)
        if (keyEl) {
          const r = keyEl.getBoundingClientRect()
          b.left = r.left
          b.width = r.width
          const el = barElsRef.current[b.id]
          if (el) {
            el.style.left = `${b.left}px`
            el.style.width = `${b.width}px`
          }
        }
      }
      // no need to re-render for layout-only updates
    }
    window.addEventListener('resize', recompute)
    const ro = new ResizeObserver(recompute)
    const kwrap = document.querySelector('.keyboard-wrapper')
    if (kwrap) ro.observe(kwrap)
    return () => { window.removeEventListener('resize', recompute); ro.disconnect() }
  }, [])

  // container height to match keyboard top
  useEffect(() => {
    function updateHeight() {
      const kwrap = document.querySelector('.keyboard-wrapper')
      if (!kwrap || !containerRef.current) return
      const rect = kwrap.getBoundingClientRect()
      containerRef.current.style.height = `${rect.top}px`
    }
    updateHeight()
    window.addEventListener('resize', updateHeight)
    const obs = new MutationObserver(updateHeight)
    const k = document.querySelector('.keyboard-wrapper')
    if (k) obs.observe(k, { attributes: true, childList: false, subtree: false })
    return () => { window.removeEventListener('resize', updateHeight); obs.disconnect() }
  }, [])

  // render bar nodes; React only renders when bars are added/removed
  return (
    <div ref={containerRef} className="visualizer-container" aria-hidden>
      {barsRef.current.map(b => (
        <div
          key={b.id}
          className="viz-bar"
          ref={el => {
            if (el) barElsRef.current[b.id] = el
            else delete barElsRef.current[b.id]
          }}
          style={{
            position: 'absolute',
            left: `${b.left}px`,
            width: `${b.width}px`,
            bottom: 0,
            height: `${((b.height || b.baseHeight) * (b.shrinkable ? (scaleRef.current || 1) : 1))}px`,
            transform: `translateY(${ -((b.translate || 0) * (b.shrinkable ? (scaleRef.current || 1) : 1)) }px)`,
            background: b.isBlack ? 'transparent' : 'transparent',
            border: 'none',
            boxSizing: 'border-box',
            borderTopLeftRadius: '6px',
            borderTopRightRadius: '6px',
            borderBottomLeftRadius: b.released ? '6px' : '0px',
            borderBottomRightRadius: b.released ? '6px' : '0px',
            pointerEvents: 'none',
            opacity: 1,
            zIndex: b.isBlack ? 30 : 10,
            transition: 'border-radius .12s ease, opacity .18s linear'
          }}
        />
      ))}
    </div>
  )
}

