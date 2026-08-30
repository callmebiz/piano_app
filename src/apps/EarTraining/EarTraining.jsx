import React, { useState } from 'react'
import IntervalEarTraining from './IntervalEarTraining'
import ChordEarTraining from './ChordEarTraining'
import ScaleEarTraining from './ScaleEarTraining'

// Tab shell for Ear Training — audio-only prompts (no notation shown),
// reusing each Identify sub-type's own pool/answer-grid, just swapping the
// Staff visual for a Play button. Note ID has no ear-training counterpart
// here on purpose: naming an isolated pitch by ear alone is absolute-pitch
// recognition (needs perfect pitch, a rare skill), not the relative-pitch
// skill interval/chord/scale ear training actually builds. Key Signature
// has no audio at all to train against, so it's skipped too.
const TABS = [
  { id: 'interval', title: 'Interval', enabled: true },
  { id: 'chord', title: 'Chord', enabled: true },
  { id: 'scale', title: 'Scale', enabled: true }
]

export default function EarTraining() {
  const [tab, setTab] = useState('interval')

  return (
    <div className="chord-app">
      <h2>Ear Training</h2>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`play-cat-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => t.enabled && setTab(t.id)}
            disabled={!t.enabled}
          >
            {t.title}
          </button>
        ))}
      </div>

      {tab === 'interval' && <IntervalEarTraining />}
      {tab === 'chord' && <ChordEarTraining />}
      {tab === 'scale' && <ScaleEarTraining />}
    </div>
  )
}
