import React, { useEffect, useRef, useState } from 'react'
import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } from 'vexflow'

// Thin VexFlow wrapper shared by every staff-based exercise (note ID today;
// key signature/interval/scale/chord ID and construction later reuse this
// unchanged). `notes` is a sequence of moments — each moment is one or more
// simultaneous pitches, so a single note, an interval, and a chord are all
// just a `notes` array of length 1 with 1/2/3+ keys, and a scale is a longer
// sequence — no changes needed here to support any of those later.
//
// notes: [{ keys: ['c/4'], duration: 'w' }, ...]
const DARK_COLOR = '#f5f7fa' // staff/notes in dark theme: white
const LIGHT_COLOR = '#1a2332' // staff/notes in light theme: dark

export default function Staff({ clef = 'treble', notes = [], keySignature, minHeight = 160, scale = 1 }) {
  const containerRef = useRef(null)
  const [width, setWidth] = useState(360)

  // VexFlow draws directly into an SVG context (not normal CSS-cascaded
  // elements), so it doesn't pick up --muted/theme changes on its own —
  // watch the <html> class the theme toggle flips and redraw when it does.
  const [themeTick, setThemeTick] = useState(0)
  useEffect(() => {
    const root = document.documentElement
    const mo = new MutationObserver(() => setThemeTick((t) => t + 1))
    mo.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      if (w > 0) setWidth(w)
    }
    measure()
    let ro = null
    try {
      ro = new ResizeObserver(measure)
      ro.observe(el)
    } catch (e) { ro = null }
    window.addEventListener('resize', measure)
    return () => {
      try { if (ro) ro.disconnect() } catch (e) {}
      window.removeEventListener('resize', measure)
    }
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el || width <= 0) return
    el.innerHTML = ''

    try {
      // Scale up/down uniformly: keep the visible box the same size (width x
      // minHeight) but lay out and draw everything in a proportionally
      // smaller/larger logical space, so a higher scale reads as a bigger
      // clef/staff/notehead rather than a wider box.
      const height = minHeight * scale
      const renderer = new Renderer(el, Renderer.Backends.SVG)
      renderer.resize(width, height)
      const context = renderer.getContext()
      context.scale(scale, scale)

      const color = document.documentElement.classList.contains('light') ? LIGHT_COLOR : DARK_COLOR
      context.setFillStyle(color)
      context.setStrokeStyle(color)

      const staveWidth = Math.max(120, (width - 20) / scale)
      const stave = new Stave(10, 20, staveWidth)
      stave.addClef(clef)
      if (keySignature) stave.addKeySignature(keySignature)
      stave.setStyle({ fillStyle: color, strokeStyle: color })
      stave.setContext(context).draw()

      if (!notes || notes.length === 0) return

      const staveNotes = notes.map((moment) => {
        const sn = new StaveNote({ keys: moment.keys, duration: moment.duration || 'w', clef })
        sn.setStyle({ fillStyle: color, strokeStyle: color })
        moment.keys.forEach((k, i) => {
          if (k.includes('#')) sn.addModifier(new Accidental('#'), i)
          else if (k.includes('b')) sn.addModifier(new Accidental('b'), i)
        })
        return sn
      })

      const voice = new Voice({ numBeats: staveNotes.length * 4, beatValue: 4 })
      voice.setStrict(false)
      voice.addTickables(staveNotes)
      new Formatter().joinVoices([voice]).format([voice], staveWidth - 60)
      voice.draw(context, stave)
    } catch (e) {
      console.error('Staff render error', e)
    }
  }, [clef, notes, keySignature, width, minHeight, scale, themeTick])

  return <div ref={containerRef} className="staff-container" style={{ width: '100%', minHeight }} />
}
