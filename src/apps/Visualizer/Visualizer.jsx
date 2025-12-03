import React, { useRef, useEffect } from 'react'

// Visualizer: draws upward-traveling bars emitted from the top of the piano
// Bars grow while the note is held; once released their height is fixed (proportional to held duration)
// and they continue moving upwards until off-screen.

export default function Visualizer({ pressedNotes = new Set(), keyboardHeight = 220, footerHeight = 0, keyboardLayout = null }) {
  const canvasRef = useRef(null)
  const barsRef = useRef([]) // active bars
  const prevPressedRef = useRef(new Set())
  const rafRef = useRef(null)
  const dprRef = useRef(1)

  // mapping MIDI note (21..108) -> x position on canvas
  const midiMin = 21
  const midiMax = 108
  const totalKeys = midiMax - midiMin + 1

  function nowMs() { return performance.now() }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    function resize() {
      const dpr = window.devicePixelRatio || 1
      dprRef.current = dpr
      const availHeight = Math.max(0, window.innerHeight - keyboardHeight - footerHeight)

      if (keyboardLayout && keyboardLayout.wrapperWidth != null && keyboardLayout.wrapperLeft != null) {
        // position the canvas fixed so its left/width match the keyboard wrapper exactly
        const widthPx = Math.max(1, Math.floor(keyboardLayout.wrapperWidth))
        const heightPx = Math.max(1, Math.floor(availHeight))
        canvas.style.position = 'fixed'
        canvas.style.left = Math.round(keyboardLayout.wrapperLeft) + 'px'
        canvas.style.bottom = Math.round(keyboardHeight + footerHeight) + 'px'
        canvas.style.width = widthPx + 'px'
        canvas.style.height = heightPx + 'px'
        canvas.width = Math.max(1, Math.floor(widthPx * dpr))
        canvas.height = Math.max(1, Math.floor(heightPx * dpr))
      } else {
        // fallback to filling the container width
        const rect = canvas.getBoundingClientRect()
        const width = Math.max(1, Math.floor(rect.width * dpr))
        const height = Math.max(1, Math.floor(availHeight * dpr))
        canvas.width = width
        canvas.height = height
        canvas.style.width = rect.width + 'px'
        canvas.style.height = availHeight + 'px'
        canvas.style.position = ''
        canvas.style.left = ''
        canvas.style.bottom = ''
      }
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    window.addEventListener('resize', resize)
    return () => { ro.disconnect(); window.removeEventListener('resize', resize) }
  }, [])

  useEffect(() => {
    // detect note-on and note-off by comparing prevPressedRef to pressedNotes
    const prev = prevPressedRef.current
    const curr = pressedNotes || new Set()
    const now = nowMs()

    // newly pressed
    for (const n of curr) {
      if (!prev.has(n)) {
        // start a new bar
        barsRef.current.push({
          id: `${n}@${now}`,
          note: n,
          start: now,
          released: false,
          releaseTime: null,
          duration: 0,
        })
      }
    }

    // released
    for (const n of prev) {
      if (!curr.has(n)) {
        // find the most recent active bar for this note
        for (let i = barsRef.current.length - 1; i >= 0; i--) {
          const b = barsRef.current[i]
          if (b.note === n && !b.released) {
            b.released = true
            b.releaseTime = now
            b.duration = Math.max(0, now - b.start)
            break
          }
        }
      }
    }

    prevPressedRef.current = new Set(curr)
  }, [pressedNotes])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    // px per ms for upward motion AND for converting held duration to bar length
    // Using one value keeps emission behavior simple: while held, new material is emitted at the base
    // and rises at `riseSpeed`; the length of the bar after release is (releaseTime - start) * riseSpeed.
    const riseSpeed = 0.08 // px per ms (tunable)

    function noteToX(note, width) {
      const clamped = Math.max(midiMin, Math.min(midiMax, note))
      const keyWidth = width / totalKeys
      // return center x of the note's key region
      return (clamped - midiMin) * keyWidth + keyWidth / 2
    }

    // use a single accent color from CSS variables so all bars match
    let accentColor = '#6ee7b7'
    try {
      const cs = getComputedStyle(document.documentElement)
      const val = cs.getPropertyValue('--accent')
      if (val) accentColor = val.trim()
    } catch (e) {}
    function colorForNote(_n) { return accentColor }

    let lastTs = nowMs()

    function frame() {
      const now = nowMs()
      const dt = now - lastTs
      lastTs = now

      const dpr = dprRef.current || 1
      const cw = canvas.width / dpr
      const ch = canvas.height / dpr
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // draw subtle background grid (optional)
      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.globalAlpha = 0.06
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, cw, ch)
      ctx.globalAlpha = 1

      const bars = barsRef.current
      // iterate and draw bars
      for (let i = bars.length - 1; i >= 0; i--) {
        const b = bars[i]

        // emission baseline is the bottom of the canvas (top edge of the piano)
        const baseY = ch

        // while held: newest material is at baseY, oldest is at baseY - (now - start) * riseSpeed
        // when released: emission stops at releaseTime; the material occupies [baseY - (now - start)*riseSpeed, baseY - (now - releaseTime)*riseSpeed]
        const topY = baseY - (now - b.start) * riseSpeed

        let bottomY
        if (!b.released) {
          // still holding: bottom is anchored to the emission line
          bottomY = baseY
        } else {
          // after release: bottom moves upward as time progresses
          bottomY = baseY - (now - b.releaseTime) * riseSpeed
        }

        const heightPx = bottomY - topY

        let barLeft = 0
        let barWidth = Math.max(2, cw / totalKeys)
        if (keyboardLayout && keyboardLayout.keyRects && keyboardLayout.wrapperWidth) {
          const entry = keyboardLayout.keyRects.find(r => r.midi === b.note)
          if (entry) {
            const scale = cw / Math.max(1, keyboardLayout.wrapperWidth)
            barLeft = entry.left * scale
            barWidth = Math.max(2, entry.width * scale)
          } else {
            const keyWidth = cw / totalKeys
            barLeft = Math.max(0, (b.note - midiMin) * keyWidth)
            barWidth = Math.max(2, keyWidth)
          }
        } else {
          const keyWidth = cw / totalKeys
          barLeft = Math.max(0, (b.note - midiMin) * keyWidth)
          barWidth = Math.max(2, keyWidth)
        }

        // remove when fully above the top (both top and bottom passed the top)
        if (bottomY < -200) {
          bars.splice(i, 1)
          continue
        }

        // draw rounded rect
        ctx.fillStyle = colorForNote(b.note)
        ctx.globalAlpha = 0.95
        // convert to device pixels
        const drawLeft = Math.round(barLeft * dpr)
        const drawTop = Math.round(topY * dpr)
        const drawW = Math.round(barWidth * dpr)
        const drawH = Math.max(1, Math.round(heightPx * dpr))

        // rounded corners: radius in device pixels
        const radius = Math.max(1, Math.min(8 * dpr, Math.floor(drawW / 2), Math.floor(drawH / 2)))
        ctx.beginPath()
        ctx.moveTo(drawLeft + radius, drawTop)
        ctx.lineTo(drawLeft + drawW - radius, drawTop)
        ctx.quadraticCurveTo(drawLeft + drawW, drawTop, drawLeft + drawW, drawTop + radius)
        ctx.lineTo(drawLeft + drawW, drawTop + drawH - radius)
        ctx.quadraticCurveTo(drawLeft + drawW, drawTop + drawH, drawLeft + drawW - radius, drawTop + drawH)
        ctx.lineTo(drawLeft + radius, drawTop + drawH)
        ctx.quadraticCurveTo(drawLeft, drawTop + drawH, drawLeft, drawTop + drawH - radius)
        ctx.lineTo(drawLeft, drawTop + radius)
        ctx.quadraticCurveTo(drawLeft, drawTop, drawLeft + radius, drawTop)
        ctx.closePath()
        ctx.fill()

        // subtle stroke
        ctx.strokeStyle = 'rgba(0,0,0,0.12)'
        ctx.lineWidth = Math.max(1, Math.round(1 * dpr))
        ctx.stroke()
      }

      ctx.restore()
      rafRef.current = requestAnimationFrame(frame)
    }

    rafRef.current = requestAnimationFrame(frame)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null }
  }, [])

  // container should reserve space equal to keyboardHeight + footer so bars emit from top of the keyboard area
  return (
    <div style={{ position: 'relative', height: `calc(100vh - ${keyboardHeight}px - ${footerHeight}px)`, overflow: 'hidden', borderRadius: 8, background: 'linear-gradient(180deg, rgba(0,0,0,0.02), transparent)' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div style={{ position: 'absolute', left: 8, top: 8, color: 'var(--muted)', fontSize: 13 }}>
        Visualizer — play notes to emit bars
      </div>
    </div>
  )
}
