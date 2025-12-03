import React, { useEffect, useState } from 'react'
import { initMIDI } from './midi'
import Keyboard from './components/Keyboard'
import AppsPane from './components/AppsPane'
import ChordRecognition from './apps/ChordRecognition/ChordRecognition'
import ErrorBoundary from './components/ErrorBoundary'
import PlayTheChord from './apps/PlayTheChord/PlayTheChord'

export default function App() {
  const [keyboardHeightPx, setKeyboardHeightPx] = useState(220)
  const [pressed, setPressed] = useState(new Set())
  const [midiStatus, setMidiStatus] = useState('Not initialized')
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('piano:theme') || 'dark'
    } catch (e) {
      return 'dark'
    }
  })

  useEffect(() => {
    let mounted = true
    initMIDI(
      (note) => {
        if (!mounted) return
        setPressed((prev) => {
          const s = new Set(prev)
          s.add(note)
          return s
        })
      },
      (note) => {
        if (!mounted) return
        setPressed((prev) => {
          const s = new Set(prev)
          s.delete(note)
          return s
        })
      },
      (status) => {
        if (!mounted) return
        setMidiStatus(status)
      }
    ).catch((err) => {
      console.error('MIDI init error', err)
      setMidiStatus('MIDI init failed: ' + String(err))
    })

    return () => { mounted = false }
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
    try { localStorage.setItem('piano:theme', theme) } catch (e) {}
  }, [theme])

  const [selectedApp, setSelectedApp] = useState('chord')
  const [keyboardTargetMidis, setKeyboardTargetMidis] = useState(new Set())
  const [keyboardTargetPCs, setKeyboardTargetPCs] = useState(new Set())

  // Handler used by apps to set keyboard targets. Accepts either a Set (treated as MIDI set)
  // or an object { mids: Set, pcs: Set } so apps can hide visual mids while still providing pcs
  const setKeyboardTargets = (val) => {
    try {
      if (!val) { setKeyboardTargetMidis(new Set()); setKeyboardTargetPCs(new Set()); return }
      if (val instanceof Set) {
        setKeyboardTargetMidis(val)
        const pcs = new Set(Array.from(val).map(m => ((m % 12) + 12) % 12))
        setKeyboardTargetPCs(pcs)
        return
      }
      if (typeof val === 'object') {
        const mids = val.mids instanceof Set ? val.mids : (Array.isArray(val.mids) ? new Set(val.mids) : new Set())
        const pcs = val.pcs instanceof Set ? val.pcs : (Array.isArray(val.pcs) ? new Set(val.pcs) : new Set(Array.from(mids).map(m => ((m % 12) + 12) % 12)))
        setKeyboardTargetMidis(mids)
        setKeyboardTargetPCs(pcs)
        return
      }
      setKeyboardTargetMidis(new Set()); setKeyboardTargetPCs(new Set())
    } catch (e) {
      setKeyboardTargetMidis(new Set()); setKeyboardTargetPCs(new Set())
    }
  }

  return (
    <div className="app" style={{ ['--piano-height']: `${keyboardHeightPx}px`, ['--sidebar-width']: '240px' }}>
      <AppsPane active={selectedApp} onSelect={(id) => setSelectedApp(id)} />
      <div className="global-theme-toggle">
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">{theme === 'dark' ? '🌙' : '☀️'}</button>
      </div>
      <div className="content">
        <div className="content-inner">
          <header>
            <h1>Piano App — MIDI Demo</h1>
            <p><strong>MIDI status:</strong> {midiStatus}</p>
            <div style={{marginTop:6}} />
          </header>

          <main>
            <div className="app-view">
              <ErrorBoundary>
                {selectedApp === 'chord' && <ChordRecognition pressedNotes={pressed} />}
                {selectedApp === 'play' && <PlayTheChord pressedNotes={pressed} setKeyboardTargetPCs={setKeyboardTargets} />}
              </ErrorBoundary>
            </div>

            <Keyboard pressedNotes={pressed} onHeightChange={(h) => setKeyboardHeightPx(h)} targetMidis={keyboardTargetMidis} targetPCs={keyboardTargetPCs} mode={selectedApp} />
          </main>

          <footer>
            <p>Connect your MIDI keyboard, then play notes — keys should light up.</p>
          </footer>
        </div>
      </div>
    </div>
  )
}
