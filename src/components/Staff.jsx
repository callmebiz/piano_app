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
export default function Staff({ clef = 'treble', notes = [], keySignature, minHeight = 160 }) {
  const containerRef = useRef(null)
  const [width, setWidth] = useState(360)

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
    if (!notes || notes.length === 0) return

    try {
      const height = minHeight
      const renderer = new Renderer(el, Renderer.Backends.SVG)
      renderer.resize(width, height)
      const context = renderer.getContext()

      const staveWidth = Math.max(120, width - 20)
      const stave = new Stave(10, 20, staveWidth)
      stave.addClef(clef)
      if (keySignature) stave.addKeySignature(keySignature)
      stave.setContext(context).draw()

      const staveNotes = notes.map((moment) => {
        const sn = new StaveNote({ keys: moment.keys, duration: moment.duration || 'w', clef })
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
  }, [clef, notes, keySignature, width, minHeight])

  return <div ref={containerRef} className="staff-container" style={{ width: '100%', minHeight }} />
}
