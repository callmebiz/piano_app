import { useEffect, useRef, useState } from 'react'

// Gesture: double-tap the same note, then hold the second press down for
// HOLD_DURATION_MS to trigger a skip. Strict solo requirement: exactly one
// note may be down at any point in the sequence (first tap, the gap between
// taps, and the hold) — the instant a second note joins, or the sequence
// passes through a multi-note chord, the gesture is disqualified. This is
// what keeps it from firing by accident during normal chord/scale playing.
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
    if (!enabled) { clearHold(); prevRef.current = new Set(); lastReleaseRef.current = { note: null, ts: 0 }; return }

    const currSet = pressedNotes ? (pressedNotes instanceof Set ? pressedNotes : new Set(Array.from(pressedNotes))) : new Set()
    const prev = prevRef.current
    const now = performance.now()

    if (currSet.size > 1) {
      // more than one key down right now — the gesture is impossible, reset everything
      clearHold()
      lastReleaseRef.current = { note: null, ts: 0 }
      prevRef.current = currSet
      return
    }

    if (prev.size > 1) {
      // coming down from a multi-key chord to <=1 key — whatever just
      // happened wasn't a clean solo tap, don't treat it as one
      lastReleaseRef.current = { note: null, ts: 0 }
    } else {
      // clean transition: at most one note involved on either side
      for (const n of prev) {
        if (currSet.has(n)) continue
        if (holdingNoteRef.current === n) clearHold()
        lastReleaseRef.current = { note: n, ts: now }
      }
      for (const n of currSet) {
        if (prev.has(n)) continue
        if (lastReleaseRef.current.note === n && (now - lastReleaseRef.current.ts) <= doubleTapWindowMs) {
          // second tap of a double-tap, played solo: start the hold
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
        }
      }
    }

    prevRef.current = currSet
  }, [pressedNotes, enabled, doubleTapWindowMs, holdDurationMs])

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  return progress
}
