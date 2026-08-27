import { useEffect, useRef, useState } from 'react'

// Generalized exercise engine shared by every Identify sub-type (Note today;
// Key Signature/Interval/Scale/Chord next, then Construction reuses the same
// shape). Deliberately small: pick a prompt, check an answer, track score +
// per-prompt stats, advance. Nothing here is note-specific.

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

export default function useIdentifyExercise({ pool, isCorrect, statsKey, promptKey = (p) => JSON.stringify(p), feedbackMs = 900 }) {
  const [current, setCurrent] = useState(() => (pool && pool.length > 0 ? pool[randomInt(pool.length)] : null))
  const [score, setScore] = useState({ correct: 0, total: 0 })
  const [lastResult, setLastResult] = useState(null) // { correct, answer } | null
  const [stats, setStats] = useState(() => {
    try { const raw = localStorage.getItem(statsKey); if (raw) return JSON.parse(raw) } catch (e) {}
    return {}
  })
  const advanceTimerRef = useRef(null)

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

  const saveStats = (s) => {
    try { localStorage.setItem(statsKey, JSON.stringify(s)) } catch (e) {}
    setStats(s)
  }

  const submitAnswer = (answer) => {
    if (!current || lastResult) return // ignore clicks while feedback is showing
    const correct = isCorrect(current, answer)
    setScore((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }))
    setLastResult({ correct, answer })

    const key = promptKey(current)
    const s = JSON.parse(JSON.stringify(stats))
    if (!s[key]) s[key] = { attempts: 0, correct: 0 }
    s[key].attempts += 1
    if (correct) s[key].correct += 1
    saveStats(s)

    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
    advanceTimerRef.current = setTimeout(() => beginNext(current), feedbackMs)
  }

  const skip = () => {
    if (advanceTimerRef.current) { clearTimeout(advanceTimerRef.current); advanceTimerRef.current = null }
    beginNext(current)
  }

  const resetScore = () => setScore({ correct: 0, total: 0 })
  const resetStats = () => saveStats({})

  return { current, score, lastResult, stats, submitAnswer, skip, resetScore, resetStats }
}
