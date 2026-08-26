import { useEffect, useRef, useState } from 'react'

// Gesture: double-tap the same note, then hold the second press down for
// HOLD_DURATION_MS to trigger a skip. Any other note pressed while holding
// cancels the gesture (so it can't fire by accident during normal playing).
// Returns a 0..1 progress value for driving a loading-bar UI.
const DOUBLE_TAP_WINDOW_MS = 400
const HOLD_DURATION_MS = 700
const TICK_MS = 40

export default function useHoldToSkip(pressedNotes, onSkip, opts = {}) {
  const doubleTapWindowMs = opts.doubleTapWindowMs || DOUBLE_TAP_WINDOW_MS
  const holdDurationMs = opts.holdDurationMs || HOLD_DURATION_MS
  const enabled = opts.enabled !== false

  const [progress, setProgress] = useState(0)
  const prevRef = useRef(new Set())
  const lastReleaseRef = useRef({ note: null, ts: 0 })
  const holdingNoteRef = useRef(null)
  const holdStartRef = useRef(null)
  const timerRef = useRef(null)
  const onSkipRef = useRef(onSkip)
  useEffect(() => { onSkipRef.current = onSkip }, [onSkip])

  const clearHold = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    holdingNoteRef.current = null
    holdStartRef.current = null
    setProgress(0)
  }

  useEffect(() => {
    if (!enabled) { clearHold(); prevRef.current = new Set(); return }

    const currSet = pressedNotes ? (pressedNotes instanceof Set ? pressedNotes : new Set(Array.from(pressedNotes))) : new Set()
    const prev = prevRef.current
    const now = performance.now()

    // released notes
    for (const n of prev) {
      if (currSet.has(n)) continue
      if (holdingNoteRef.current === n) clearHold()
      lastReleaseRef.current = { note: n, ts: now }
    }

    // newly-pressed notes
    for (const n of currSet) {
      if (prev.has(n)) continue
      if (lastReleaseRef.current.note === n && (now - lastReleaseRef.current.ts) <= doubleTapWindowMs) {
        // second tap of a double-tap: start the hold
        holdingNoteRef.current = n
        holdStartRef.current = now
        if (timerRef.current) clearInterval(timerRef.current)
        timerRef.current = setInterval(() => {
          const elapsed = performance.now() - (holdStartRef.current || performance.now())
          const p = Math.min(1, elapsed / holdDurationMs)
          setProgress(p)
          if (p >= 1) {
            clearHold()
            try { onSkipRef.current && onSkipRef.current() } catch (e) {}
          }
        }, TICK_MS)
      } else if (holdingNoteRef.current !== null && n !== holdingNoteRef.current) {
        // some other note joined in while holding — cancel, this isn't the gesture
        clearHold()
      }
    }

    prevRef.current = currSet
  }, [pressedNotes, enabled, doubleTapWindowMs, holdDurationMs])

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  return progress
}
