import { useEffect, useRef, useState } from 'react'
import { recordFact, getIdleThresholdMs, newSessionId } from '../../lib/practiceStats'

// Generalized exercise engine shared by every Identify sub-type AND every
// Ear Training sub-type. Deliberately small: pick a prompt, check an
// answer, track score + shared practice stats (lifetime accuracy/speed,
// daily trend, streaks, prev-prompt transition timing, AND — via
// recordFact — a real per-attempt fact row with whatever dimensions the
// caller supplies), advance. Nothing here is note/interval/chord-specific.

function randomInt(max) { return Math.floor(Math.random() * max) }

function pickDifferent(pool, avoidKey, keyFn) {
  if (!pool || pool.length === 0) return null
  if (pool.length === 1) return pool[0]
  for (let i = 0; i < 8; i++) {
    const cand = pool[randomInt(pool.length)]
    if (keyFn(cand) !== avoidKey) return cand
  }
  for (const p of pool) if (keyFn(p) !== avoidKey) return p
  return pool[0]
}

// exercise: id this exercise's stats live under in lib/practiceStats.js
// (e.g. 'identify-note', 'ear-note'). promptLabel: human display string for
// a prompt, used as its bucket's label in the Stats view. `fields`
// (optional): (prompt, answer) -> { [fieldKey]: { value, label, dimension } }
// — every tracked dimension for this attempt (e.g. Note Ear Training's own
// Note + Reference Note, or Chord Ear Training's Chord Type + Root +
// whichever chord types are currently enabled), same shape PlayTheChord.jsx
// uses. Defaults to no extra fields — a caller that doesn't pass one still
// gets a real fact row (so Progress/Explore/Details have SOMETHING), just
// without its own dimension breakdown.
export default function useIdentifyExercise({ pool, isCorrect, exercise, promptKey, promptLabel = (p) => promptKey(p), fields = () => ({}), feedbackMs = 900 }) {
  const [current, setCurrent] = useState(() => (pool && pool.length > 0 ? pool[randomInt(pool.length)] : null))
  const [score, setScore] = useState({ correct: 0, total: 0 })
  const [lastResult, setLastResult] = useState(null) // { correct, answer } | null
  const advanceTimerRef = useRef(null)

  // Timing: reset whenever a new prompt actually appears.
  const promptShownAtRef = useRef(performance.now())
  useEffect(() => { promptShownAtRef.current = performance.now() }, [current])

  // A session groups attempts made without a real gap between them — same
  // idle-detection PlayTheChord.jsx uses (see getIdleThresholdMs), so
  // Progress's "By Session"/"By Date" modes and Details' session list work
  // the same way here as they do there. Fresh one on mount; rotates
  // whenever a clean correct answer's elapsed time blows past this
  // exercise's own adaptive idle threshold (stepped away, then came back).
  const sessionIdRef = useRef(newSessionId())

  const beginNext = (avoid) => {
    const next = pickDifferent(pool, avoid ? promptKey(avoid) : null, promptKey)
    setCurrent(next)
    setLastResult(null)
  }

  // Keep current valid whenever the pool changes (options toggled) — always
  // picks fresh rather than trusting reference identity, since a pool of 1
  // can otherwise return the exact same object and silently no-op setCurrent.
  useEffect(() => {
    if (!pool || pool.length === 0) { setCurrent(null); return }
    const stillValid = current && pool.some((p) => promptKey(p) === promptKey(current))
    if (!stillValid) beginNext(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool])

  useEffect(() => () => { if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current) }, [])

  const submitAnswer = (answer) => {
    if (!current || lastResult) return // ignore clicks while feedback is showing
    const correct = isCorrect(current, answer)
    setScore((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }))
    setLastResult({ correct, answer })

    const timeMs = performance.now() - promptShownAtRef.current
    const wasIdleGap = correct && timeMs > getIdleThresholdMs(exercise)
    if (wasIdleGap) sessionIdRef.current = newSessionId()

    recordFact({
      exercise,
      correct,
      timeMs: wasIdleGap ? null : timeMs,
      promptKey: promptKey(current),
      promptLabel: promptLabel(current),
      fields: fields(current, answer),
      sessionId: sessionIdRef.current
    })

    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
    advanceTimerRef.current = setTimeout(() => beginNext(current), feedbackMs)
  }

  const skip = () => {
    if (advanceTimerRef.current) { clearTimeout(advanceTimerRef.current); advanceTimerRef.current = null }
    beginNext(current)
  }

  const resetScore = () => setScore({ correct: 0, total: 0 })

  return { current, score, lastResult, submitAnswer, skip, resetScore }
}
