import React, { useState } from 'react'
import NoteConstruction from './NoteConstruction'
import IntervalConstruction from './IntervalConstruction'

// Tab shell for "Staff Construction" — the inverse of Identification: given
// a name, click where it goes on the staff instead of naming what's shown.
// Same shell pattern as Identify.jsx; Scale/Chord/Key Signature
// Construction are the natural next tabs (same ClickableStaff mechanism,
// extended to multi-note placement) but aren't built yet.
const TABS = [
  { id: 'note', title: 'Note', enabled: true },
  { id: 'interval', title: 'Interval', enabled: true },
  { id: 'scale', title: 'Scale', enabled: false },
  { id: 'chord', title: 'Chord', enabled: false },
  { id: 'keysig', title: 'Key Signature', enabled: false }
]

export default function Construction({ pressedNotes }) {
  const [tab, setTab] = useState('note')

  return (
    <div className="chord-app">
      <h2>Construction</h2>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`play-cat-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => t.enabled && setTab(t.id)}
            disabled={!t.enabled}
            title={t.enabled ? undefined : 'Coming soon'}
            style={!t.enabled ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
          >
            {t.title}{!t.enabled ? ' (soon)' : ''}
          </button>
        ))}
      </div>

      {tab === 'note' && <NoteConstruction />}
      {tab === 'interval' && <IntervalConstruction pressedNotes={pressedNotes} />}
    </div>
  )
}
