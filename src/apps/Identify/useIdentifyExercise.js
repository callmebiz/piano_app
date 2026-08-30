import { useEffect, useRef, useState } from 'react'
import { recordAttempt } from '../../lib/practiceStats'

// Generalized exercise engine shared by every Identify sub-type. Deliberately
// small: pick a prompt, check an answer, track score + shared practice
// stats (lifetime accuracy/speed, daily trend, streaks, and prev-prompt
// transition timing), advance. Nothing here is note-specific.

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
// (e.g. 'identify-note'). promptLabel: human display string for a prompt,
// used as that bucket's label in the Stats view.
export default function useIdentifyExercise({ pool, isCorrect, exercise, promptKey, promptLabel = (p) => promptKey(p), feedbackMs = 900 }) {
  const [current, setCurrent] = useState(() => (pool && pool.length > 0 ? pool[randomInt(pool.length)] : null))
  const [score, setScore] = useState({ correct: 0, total: 0 })
  const [lastResult, setLastResult] = useState(null) // { correct, answer } | null
  const advanceTimerRef = useRef(null)

  // Timing: reset whenever a new prompt actually appears.
  const promptShownAtRef = useRef(performance.now())
  useEffect(() => { promptShownAtRef.current = performance.now() }, [current])

  // Which prompt (by key) immediately preceded the current one — powers
  // transition timing ("how fast after X do I get Y"). Updated in beginNext
  // using the *outgoing* prompt, so it reflects "one before current" at the
  // moment submitAnswer reads it, not "current" itself.
  const lastPromptKeyRef = useRef(null)

  const beginNext = (avoid) => {
    lastPromptKeyRef.current = avoid ? promptKey(avoid) : null
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

    const key = promptKey(current)
    const timeMs = performance.now() - promptShownAtRef.current
    recordAttempt({
      exercise,
      buckets: [{ key, label: promptLabel(current) }],
      correct,
      timeMs,
      primaryKey: key,
      fromKey: lastPromptKeyRef.current
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
