import React, { useEffect, useRef, useState } from 'react'
import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } from 'vexflow'

// The construction-exercise counterpart to Staff.jsx: instead of just
// rendering notes, it turns a set of candidate pitches into clickable
// targets on the staff — "click where this note goes" instead of "name
// this note". Deliberately avoids inverting VexFlow's layout math (pixel
// position -> pitch) by never guessing at it: every candidate is built as
// a real StaveNote (all candidates as one simultaneous "chord" so they
// share a single x-slot, each at its own correct y), drawn once, and its
// *actual* rendered position read back via getYs()/getAbsoluteX() — the
// same "build it for real, then measure it" approach Staff.jsx's own
// measureNaturalWidth already uses. The chord itself is invisible
// (transparent style); only a plain transparent click-target div is placed
// at each key's real position.
const DARK_COLOR = '#f5f7fa'
const LIGHT_COLOR = '#1a2332'
const CORRECT_COLOR = '#6ee7b7'
const WRONG_COLOR = '#ff8a80'

function buildStaveNote(keys, clefName) {
  const sn = new StaveNote({ keys, duration: 'w', clef: clefName })
  keys.forEach((k, i) => {
    if (k.includes('#')) sn.addModifier(new Accidental('#'), i)
    else if (k.includes('b')) sn.addModifier(new Accidental('b'), i)
  })
  return sn
}

// givenNotes: vexKeys always shown as a normal fixed note (e.g. an
// interval's root) — rendered before the candidates/answer in the same
// voice, never interactive. candidates: [{ vexKey }, ...] the clickable
// set while guessing. placedNotes: [{ vexKey, state }] the answer once
// revealed (replaces candidates for that slot).
export default function ClickableStaff({
  clef = 'treble', keySignature, givenNotes = [], candidates = [], placedNotes = [],
  onSelect = () => {}, disabled = false, minHeight = 160, scale = 1
}) {
  const containerRef = useRef(null)
  const [width, setWidth] = useState(360)
  const [targets, setTargets] = useState([]) // [{ vexKey, x, y }] in CSS px within the container
  const [targetSize, setTargetSize] = useState(22) // click-target box height, adapted to actual note spacing

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
    const measure = () => { const w = el.clientWidth; if (w > 0) setWidth(w) }
    measure()
    let ro = null
    try { ro = new ResizeObserver(measure); ro.observe(el) } catch (e) { ro = null }
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
    setTargets([])

    try {
      const color = document.documentElement.classList.contains('light') ? LIGHT_COLOR : DARK_COLOR
      const height = minHeight * scale
      const renderer = new Renderer(el, Renderer.Backends.SVG)
      renderer.resize(width, height)
      const context = renderer.getContext()
      context.scale(scale, scale)

      const staveWidth = Math.max(120, (width - 20) / scale)
      const stave = new Stave(10, 20, staveWidth)
      stave.addClef(clef)
      if (keySignature) stave.addKeySignature(keySignature)
      stave.setStyle({ fillStyle: color, strokeStyle: color })
      stave.setContext(context).draw()

      const showingAnswer = placedNotes.length > 0
      if (candidates.length === 0 && placedNotes.length === 0 && givenNotes.length === 0) return

      // Visible draw — given note + the revealed answer (once there is one),
      // as one real chord/voice. Letting VexFlow's normal chord layout (incl.
      // its own seconds-apart notehead offsetting) apply here is correct and
      // wanted: this is an actual rendering, not a measurement.
      const tickables = []
      if (givenNotes.length > 0) {
        const givenNote = buildStaveNote(givenNotes, clef)
        givenNote.setStyle({ fillStyle: color, strokeStyle: color })
        tickables.push(givenNote)
      }
      if (showingAnswer) {
        const answerNote = buildStaveNote(placedNotes.map((n) => n.vexKey), clef)
        const st = placedNotes[0].state
        const noteColor = st === 'wrong' ? WRONG_COLOR : st === 'correct' ? CORRECT_COLOR : color
        answerNote.setStyle({ fillStyle: noteColor, strokeStyle: noteColor })
        tickables.push(answerNote)
      }
      if (tickables.length > 0) {
        const voice = new Voice({ numBeats: 4 * tickables.length, beatValue: 4 })
        voice.setStrict(false)
        voice.addTickables(tickables)
        new Formatter().joinVoices([voice]).format([voice], staveWidth - 60)
        voice.draw(context, stave)
      }

      // Click-target geometry — deliberately NOT one shared chord like above.
      // Candidates commonly include notes a 2nd apart (adjacent line/space),
      // and packing them into one StaveNote would trigger VexFlow's own
      // seconds-collision offsetting (alternating noteheads to the other
      // side of the stem), which would silently break the "every key shares
      // one x" assumption a shared chord's getAbsoluteX() relies on. Instead
      // each candidate is measured completely alone — its own single-note
      // voice on an identical detached stave — so there's never another
      // notehead for it to collide with, and every candidate lands at the
      // same, simple "first note after the clef" x deterministically.
      if (!showingAnswer && candidates.length > 0) {
        const newTargets = []
        for (const c of candidates) {
          const mDiv = document.createElement('div')
          const mRenderer = new Renderer(mDiv, Renderer.Backends.SVG)
          mRenderer.resize(Math.max(200, staveWidth + 40), height)
          const mContext = mRenderer.getContext()
          const mStave = new Stave(10, 20, staveWidth)
          mStave.addClef(clef)
          if (keySignature) mStave.addKeySignature(keySignature)
          mStave.setContext(mContext).draw()
          const note = buildStaveNote([c.vexKey], clef)
          const mVoice = new Voice({ numBeats: 4, beatValue: 4 })
          mVoice.setStrict(false)
          mVoice.addTickables([note])
          new Formatter().joinVoices([mVoice]).format([mVoice], staveWidth - 60)
          mVoice.draw(mContext, mStave)
          newTargets.push({ vexKey: c.vexKey, x: note.getAbsoluteX() * scale, y: note.getYs()[0] * scale })
        }
        // Size click-targets to the actual measured spacing between
        // candidates (adjacent line/space positions can be close together)
        // instead of a fixed guess that risks overlapping neighbors and
        // stealing their clicks.
        const sortedYs = newTargets.map((t) => t.y).sort((a, b) => a - b)
        let minGap = Infinity
        for (let i = 1; i < sortedYs.length; i++) minGap = Math.min(minGap, sortedYs[i] - sortedYs[i - 1])
        const boxHeight = Number.isFinite(minGap) ? Math.max(8, Math.min(24, minGap * 0.85)) : 22
        setTargetSize(boxHeight)
        setTargets(newTargets)
      }
    } catch (e) {
      console.error('ClickableStaff render error', e)
    }
  }, [clef, keySignature, givenNotes, candidates, placedNotes, width, minHeight, scale, themeTick])

  return (
    <div style={{ position: 'relative', width: '100%', minHeight }}>
      <div ref={containerRef} className="staff-container" style={{ width: '100%', minHeight }} />
      {targets.map((t) => (
        <div
          key={t.vexKey}
          onClick={() => !disabled && onSelect(t.vexKey)}
          title={t.vexKey}
          style={{
            position: 'absolute', left: t.x - 15, top: t.y - targetSize / 2, width: 30, height: targetSize,
            cursor: disabled ? 'default' : 'pointer'
          }}
        />
      ))}
    </div>
  )
}
