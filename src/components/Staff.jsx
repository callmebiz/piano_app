import React, { useEffect, useRef, useState } from 'react'
import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, StaveConnector } from 'vexflow'

// Thin VexFlow wrapper shared by every staff-based exercise (note ID today;
// key signature/interval/scale/chord ID and construction later reuse this
// unchanged). `notes` is a sequence of moments — each moment is one or more
// simultaneous pitches, so a single note, an interval, and a chord are all
// just a `notes` array of length 1 with 1/2/3+ keys, and a scale is a longer
// sequence — no changes needed here to support any of those later.
//
// notes: [{ keys: ['c/4'], duration: 'w', clef: 'treble', state: 'done'|'current' }, ...] —
// `clef` on a moment only matters when the component's own `clef` prop is
// 'grand'; it picks which of the two staves that moment is drawn on (falls
// back to a register-based guess — octave >= 4 is treble — if omitted).
// `state` is optional progress highlighting (e.g. a scale being played
// through): 'done' colors the notehead like an already-played key, 'current'
// like the next one expected; omitted/anything else uses the plain theme color.
const DARK_COLOR = '#f5f7fa' // staff/notes in dark theme: white
const LIGHT_COLOR = '#1a2332' // staff/notes in light theme: dark
const DONE_COLOR = '#6ee7b7' // matches --accent — already-played notes
const CURRENT_COLOR = '#ffd24a' // warm highlight — the next note expected
const GRAND_STAVE_GAP = 120 // px between the treble/bass stave y-origins, before scale
const MIN_AUTO_FIT_SCALE = 0.2

function defaultClefFor(moment) {
  const k = moment.keys && moment.keys[0]
  if (!k) return 'treble'
  const octave = Number(k.split('/')[1])
  return octave >= 4 ? 'treble' : 'bass'
}

function buildStaveNote(moment, clefName) {
  const sn = new StaveNote({ keys: moment.keys, duration: moment.duration || 'w', clef: clefName })
  moment.keys.forEach((k, i) => {
    if (k.includes('#')) sn.addModifier(new Accidental('#'), i)
    else if (k.includes('b')) sn.addModifier(new Accidental('b'), i)
  })
  return sn
}

// VexFlow enforces a real minimum width per note (accidentals, noteheads,
// spacing) and will NOT compress below it — asking it to fit into a width
// that's too small just makes it silently render wider than requested and
// overflow the container. Measure the true minimum width a run of notes
// needs (at scale 1, via a detached/never-drawn context — VexFlow's
// formatter math is font-metric-driven, not dependent on being on-screen)
// so the caller can compute a scale that's *guaranteed* to fit instead of
// guessing.
function measureNaturalWidth(moments, clefName, keySignature) {
  if (!moments || moments.length === 0) return 0
  const measureDiv = document.createElement('div')
  const renderer = new Renderer(measureDiv, Renderer.Backends.SVG)
  renderer.resize(4000, 400)
  const context = renderer.getContext()
  const stave = new Stave(10, 20, 3900)
  stave.addClef(clefName)
  if (keySignature) stave.addKeySignature(keySignature)
  stave.setContext(context)

  const staveNotes = moments.map((m) => buildStaveNote(m, clefName))
  const voice = new Voice({ numBeats: staveNotes.length * 4, beatValue: 4 })
  voice.setStrict(false)
  voice.addTickables(staveNotes)
  const formatter = new Formatter()
  formatter.joinVoices([voice])
  const minNoteWidth = formatter.preCalculateMinTotalWidth([voice])
  const clefWidth = stave.getNoteStartX() - stave.getX()
  return clefWidth + minNoteWidth + 20 // + a little end padding
}

export default function Staff({ clef = 'treble', notes = [], keySignature, minHeight = 160, scale = 1 }) {
  const containerRef = useRef(null)
  const [width, setWidth] = useState(360)
  const isGrand = clef === 'grand'

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
      // For a single staff with actual notes, guarantee everything fits
      // within `width` by shrinking scale below the caller's requested value
      // if the natural (scale-1) content is too wide — never grows past it.
      let effectiveScale = scale
      if (!isGrand && notes && notes.length > 0) {
        const naturalWidth = measureNaturalWidth(notes, clef, keySignature)
        if (naturalWidth > 0) {
          const fitScale = (width - 20) / naturalWidth
          effectiveScale = Math.max(MIN_AUTO_FIT_SCALE, Math.min(scale, fitScale))
        }
      }

      // Scale up/down uniformly: keep the visible box the same size but lay
      // out and draw everything in a proportionally smaller/larger logical
      // space, so a higher scale reads as a bigger clef/staff/notehead
      // rather than a wider/taller box.
      const height = (isGrand ? minHeight + GRAND_STAVE_GAP : minHeight) * effectiveScale
      const renderer = new Renderer(el, Renderer.Backends.SVG)
      renderer.resize(width, height)
      const context = renderer.getContext()
      context.scale(effectiveScale, effectiveScale)

      const color = document.documentElement.classList.contains('light') ? LIGHT_COLOR : DARK_COLOR
      context.setFillStyle(color)
      context.setStrokeStyle(color)

      const staveWidth = Math.max(120, (width - 20) / effectiveScale)

      const drawStave = (x, y, clefName) => {
        const st = new Stave(x, y, staveWidth)
        st.addClef(clefName)
        if (keySignature) st.addKeySignature(keySignature)
        st.setStyle({ fillStyle: color, strokeStyle: color })
        st.setContext(context).draw()
        return st
      }

      const makeNote = (moment, clefName) => {
        const sn = buildStaveNote(moment, clefName)
        const noteColor = moment.state === 'done' ? DONE_COLOR : moment.state === 'current' ? CURRENT_COLOR : color
        sn.setStyle({ fillStyle: noteColor, strokeStyle: noteColor })
        return sn
      }

      const drawVoice = (moments, stave, clefName) => {
        if (!moments || moments.length === 0) return
        const staveNotes = moments.map((m) => makeNote(m, clefName))
        const voice = new Voice({ numBeats: staveNotes.length * 4, beatValue: 4 })
        voice.setStrict(false)
        voice.addTickables(staveNotes)
        new Formatter().joinVoices([voice]).format([voice], staveWidth - 60)
        voice.draw(context, stave)
      }

      if (!isGrand) {
        const stave = drawStave(10, 20, clef)
        drawVoice(notes, stave, clef)
        return
      }

      const trebleStave = drawStave(10, 20, 'treble')
      const bassStave = drawStave(10, 20 + GRAND_STAVE_GAP, 'bass')
      new StaveConnector(trebleStave, bassStave).setType('brace').setContext(context).draw()
      new StaveConnector(trebleStave, bassStave).setType('singleLeft').setContext(context).draw()

      const trebleMoments = notes.filter((m) => (m.clef || defaultClefFor(m)) === 'treble')
      const bassMoments = notes.filter((m) => (m.clef || defaultClefFor(m)) === 'bass')
      drawVoice(trebleMoments, trebleStave, 'treble')
      drawVoice(bassMoments, bassStave, 'bass')
    } catch (e) {
      console.error('Staff render error', e)
    }
  }, [clef, notes, keySignature, width, minHeight, scale, themeTick, isGrand])

  return <div ref={containerRef} className="staff-container" style={{ width: '100%', minHeight: isGrand ? minHeight + GRAND_STAVE_GAP : minHeight }} />
}
