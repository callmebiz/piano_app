import React, { useState } from 'react'
import NoteIdentification from './NoteIdentification'

// Tab shell for the "Staff Identification" exercise family. Only Note is
// wired up so far — Key Signature/Interval/Scale/Chord reuse this same
// shell (Staff.jsx + useIdentifyExercise) when they're built, each just
// swapping in a different prompt pool and answer UI.
const TABS = [
  { id: 'note', title: 'Note', enabled: true },
  { id: 'keysig', title: 'Key Signature', enabled: false },
  { id: 'interval', title: 'Interval', enabled: false },
  { id: 'scale', title: 'Scale', enabled: false },
  { id: 'chord', title: 'Chord', enabled: false }
]

export default function Identify() {
  const [tab, setTab] = useState('note')

  return (
    <div className="chord-app">
      <h2>Identification</h2>
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

      {tab === 'note' && <NoteIdentification />}
    </div>
  )
}
