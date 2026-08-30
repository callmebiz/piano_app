import React, { useState } from 'react'
import KeyboardEarTraining from './KeyboardEarTraining'
import NoteEarTraining from './NoteEarTraining'
import IntervalEarTraining from './IntervalEarTraining'
import ChordEarTraining from './ChordEarTraining'
import ScaleEarTraining from './ScaleEarTraining'

// Tab shell for Ear Training — audio-only prompts, answered either via a
// button grid (Note/Interval/Chord/Scale) or the app's own keyboard
// (Keyboard). Note/Keyboard Ear Training both play a fixed Reference Note
// (middle C) alongside the question — what makes naming an isolated pitch
// learnable at all is hearing it relative to a known anchor, not blind
// absolute-pitch recognition.
const TABS = [
  { id: 'keyboard', title: 'Keyboard', enabled: true },
  { id: 'note', title: 'Note', enabled: true },
  { id: 'interval', title: 'Interval', enabled: true },
  { id: 'chord', title: 'Chord', enabled: true },
  { id: 'scale', title: 'Scale', enabled: true }
]

export default function EarTraining({ pressedNotes }) {
  const [tab, setTab] = useState('keyboard')

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

      {tab === 'keyboard' && <KeyboardEarTraining pressedNotes={pressedNotes} />}
      {tab === 'note' && <NoteEarTraining />}
      {tab === 'interval' && <IntervalEarTraining />}
      {tab === 'chord' && <ChordEarTraining />}
      {tab === 'scale' && <ScaleEarTraining />}
    </div>
  )
}
