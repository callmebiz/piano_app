import React, { useState } from 'react'
import NoteIdentification from './NoteIdentification'
import KeySignatureIdentification from './KeySignatureIdentification'
import IntervalIdentification from './IntervalIdentification'
import ScaleIdentification from './ScaleIdentification'
import ChordIdentification from './ChordIdentification'

// Tab shell for the "Staff Identification" exercise family. Every tab
// reuses the same shell (Staff.jsx + useIdentifyExercise + AnswerGrid +
// staffSettings), each just swapping in its own prompt pool and answer set.
const TABS = [
  { id: 'note', title: 'Note', enabled: true },
  { id: 'keysig', title: 'Key Signature', enabled: true },
  { id: 'interval', title: 'Interval', enabled: true },
  { id: 'scale', title: 'Scale', enabled: true },
  { id: 'chord', title: 'Chord', enabled: true }
]

export default function Identify({ pressedNotes, setKeyboardTargetPCs }) {
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

      {tab === 'note' && <NoteIdentification pressedNotes={pressedNotes} setKeyboardTargetPCs={setKeyboardTargetPCs} />}
      {tab === 'keysig' && <KeySignatureIdentification />}
      {tab === 'interval' && <IntervalIdentification />}
      {tab === 'scale' && <ScaleIdentification />}
      {tab === 'chord' && <ChordIdentification />}
    </div>
  )
}
