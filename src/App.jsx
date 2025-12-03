import React, { useEffect, useState, useCallback } from 'react'
import { initMIDI } from './midi'
import Keyboard from './components/Keyboard'
import AppsPane from './components/AppsPane'
import ChordRecognition from './apps/ChordRecognition/ChordRecognition'
import ErrorBoundary from './components/ErrorBoundary'
import PlayTheChord from './apps/PlayTheChord/PlayTheChord'
import Visualizer from './apps/Visualizer/Visualizer'

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
  const [debugChord, setDebugChord] = useState(false)
  const [debugPlay, setDebugPlay] = useState(false)
  const [keyboardLayout, setKeyboardLayout] = useState(null)
  const [labelMode, setLabelMode] = useState('all')
  const [keyboardCollapsed, setKeyboardCollapsed] = useState(false)

  useEffect(() => {
    // for visualizer we prevent page scroll to keep alignment; don't toggle a global class
    try {
      document.body.style.overflow = selectedApp === 'visualizer' ? 'hidden' : ''
    } catch (e) {}
  }, [selectedApp])

  // Handler used by apps to set keyboard targets. Accepts either a Set (treated as MIDI set)
  // or an object { mids: Set, pcs: Set } so apps can hide visual mids while still providing pcs
  const setKeyboardTargets = useCallback((val) => {
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
  }, [setKeyboardTargetMidis, setKeyboardTargetPCs])

  return (
    <div className="app" style={{ ['--piano-height']: `${keyboardHeightPx}px`, ['--sidebar-width']: '240px' }}>
      <AppsPane active={selectedApp} onSelect={(id) => setSelectedApp(id)} />
      <div className="global-theme-toggle">
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">{theme === 'dark' ? '🌙' : '☀️'}</button>
        {selectedApp === 'chord' ? (
          <button onClick={() => setDebugChord(d => !d)} aria-pressed={debugChord} title="Toggle Debug for ChordRecognition" style={{marginLeft:8}}>{debugChord ? '⚙️' : '⚙️'}</button>
        ) : null}
        {selectedApp === 'play' ? (
          <button onClick={() => setDebugPlay(d => !d)} aria-pressed={debugPlay} title="Toggle Debug for PlayTheChord" style={{marginLeft:8}}>{debugPlay ? '⚙️' : '⚙️'}</button>
        ) : null}
      </div>
      <div className="content">
        <div className="content-inner">
          {/* top header intentionally removed; app title and MIDI status are shown in the footer under the keyboard */}

          <main>
            <div className="app-view">
              <ErrorBoundary>
                {selectedApp === 'chord' && <ChordRecognition pressedNotes={pressed} debug={debugChord} />}
                {selectedApp === 'play' && <PlayTheChord pressedNotes={pressed} setKeyboardTargetPCs={setKeyboardTargets} externalDebug={debugPlay} setExternalDebug={setDebugPlay} />}
                {selectedApp === 'visualizer' && <Visualizer pressedNotes={pressed} keyboardHeight={keyboardHeightPx} footerHeight={40} keyboardLayout={keyboardLayout} />}
              </ErrorBoundary>
            </div>
          </main>

          {selectedApp !== 'visualizer' ? (
            <footer>
              <p>Connect your MIDI keyboard, then play notes — keys should light up.</p>
            </footer>
          ) : null}
        </div>
      </div>

      <div className="app-footer" aria-hidden="false">
        <div style={{padding:8,display:'flex',alignItems:'center',justifyContent:'space-between',maxWidth:1100,margin:'0 auto'}}>
          <div style={{display:'flex',gap:12,alignItems:'center',flex:1,minWidth:0}}></div>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{color:'var(--muted)'}}>MIDI status: {midiStatus}</div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div className="show-keys-label">Show Keys:</div>
              <div className={`toggle ${labelMode === 'all' ? 'active' : ''}`} onClick={() => setLabelMode('all')}>All</div>
              <div className={`toggle ${labelMode === 'c-only' ? 'active' : ''}`} onClick={() => setLabelMode('c-only')}>C Only</div>
              <div className={`toggle ${labelMode === 'none' ? 'active' : ''}`} onClick={() => setLabelMode('none')}>None</div>
            </div>
            <button className="collapse-btn" onClick={() => setKeyboardCollapsed(k => !k)} disabled={selectedApp === 'visualizer'} style={selectedApp === 'visualizer' ? {opacity:0.5,cursor:'not-allowed'} : {}}>{keyboardCollapsed ? 'Show' : 'Hide'}</button>
          </div>
        </div>
      </div>
      <Keyboard
        pressedNotes={pressed}
        onHeightChange={(h) => setKeyboardHeightPx(h)}
        onLayoutChange={(layout) => setKeyboardLayout(layout)}
        targetMidis={keyboardTargetMidis}
        targetPCs={keyboardTargetPCs}
        mode={selectedApp}
        labelMode={labelMode}
        onLabelModeChange={(m) => setLabelMode(m)}
        collapsed={keyboardCollapsed}
        onCollapsedChange={(c) => setKeyboardCollapsed(c)}
        disableResize={selectedApp === 'visualizer'}
      />
    </div>
  )
}
