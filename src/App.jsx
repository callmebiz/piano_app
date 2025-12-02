import React, { useEffect, useState } from 'react'
import { initMIDI } from './midi'
import Keyboard from './components/Keyboard'
import AppsPane from './components/AppsPane'
import ChordRecognition from './apps/ChordRecognition/ChordRecognition'

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
              {selectedApp === 'chord' && <ChordRecognition pressedNotes={pressed} />}
            </div>

            <Keyboard pressedNotes={pressed} onHeightChange={(h) => setKeyboardHeightPx(h)} />
          </main>

          <footer>
            <p>Connect your MIDI keyboard, then play notes — keys should light up.</p>
          </footer>
        </div>
      </div>
    </div>
  )
}
