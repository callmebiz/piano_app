import React, { useEffect, useRef, useState } from 'react'

// A speaker icon + progress track + reveal label, matching the reference
// layout for every Ear Training exercise — replaces the old "big Play
// button" with something that (a) shows playback is actually happening via
// the fill animation and (b) can be replayed by clicking the speaker.
// `label` is the small caption above the bar (e.g. "Question Note") — omit
// it for exercises with just one bar (Interval/Scale/Chord). `revealText`
// shows on the right once answered; while unanswered it shows "?".
export default function PlaybackBar({ label, onPlay, durationMs = 900, revealText }) {
  const [filled, setFilled] = useState(false)
  const timerRef = useRef(null)

  const play = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    onPlay()
    setFilled(false)
    // Force a reflow-driven restart of the fill transition even if the bar
    // was already mid-animation from a fast replay click.
    requestAnimationFrame(() => requestAnimationFrame(() => setFilled(true)))
    timerRef.current = setTimeout(() => setFilled(false), durationMs)
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '14px 18px', marginBottom: 12 }}>
      {label && <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>{label}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          onClick={play}
          title="Play"
          style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer', padding: 0, flexShrink: 0 }}
        >
          🔊
        </button>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.15)', position: 'relative' }}>
          <div style={{
            position: 'absolute', left: 0, top: -1, height: 3, background: 'var(--accent)',
            width: filled ? '100%' : '0%', transition: filled ? `width ${durationMs}ms linear` : 'none'
          }} />
        </div>
        <div style={{ minWidth: 24, textAlign: 'center', fontSize: 15, color: 'var(--muted)', flexShrink: 0 }}>{revealText != null ? revealText : '?'}</div>
      </div>
    </div>
  )
}
