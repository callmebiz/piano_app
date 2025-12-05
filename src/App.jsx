import React, { useEffect, useState, useCallback } from 'react'
import { initMIDI } from './midi'
import Keyboard from './components/Keyboard'
import AppsPane from './components/AppsPane'
import ChordRecognition from './apps/ChordRecognition/ChordRecognition'
import ErrorBoundary from './components/ErrorBoundary'
import PlayTheChord from './apps/PlayTheChord/PlayTheChord'
import Visualizer from './apps/Visualizer/Visualizer'
import Settings from './components/Settings'

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
  const [showSettings, setShowSettings] = useState(false)
  const [labelMode, setLabelMode] = useState('all')
  const [keyboardCollapsed, setKeyboardCollapsed] = useState(false)
  const [shrinkOn, setShrinkOn] = useState(false)
  const [freezeOn, setFreezeOn] = useState(false)

  // ensure keyboard is always visible while Visualizer is active
  useEffect(() => {
    if (selectedApp === 'visualizer') setKeyboardCollapsed(false)
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
    <div className="app" style={{ ['--piano-height']: keyboardCollapsed ? '0px' : `${keyboardHeightPx}px`, ['--sidebar-width']: '240px' }}>
      <AppsPane active={selectedApp} onSelect={(id) => setSelectedApp(id)} />
      <div className="global-theme-toggle">
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">{theme === 'dark' ? '🌙' : '☀️'}</button>
        <button onClick={() => setShowSettings(true)} title="Settings" style={{marginLeft:8}}>⚙️</button>
      </div>
      <div className="content">
        <div className="content-inner">
          {/* top header removed; site title and MIDI status moved to site footer */}

          <main>
            <div className="app-view">
              <ErrorBoundary>
                {selectedApp === 'chord' && <ChordRecognition pressedNotes={pressed} />}
                {selectedApp === 'play' && <PlayTheChord pressedNotes={pressed} setKeyboardTargetPCs={setKeyboardTargets} />}
                {selectedApp === 'visualizer' && <Visualizer pressedNotes={pressed} shrinkOn={shrinkOn} freezeOn={freezeOn} />}
              </ErrorBoundary>
            </div>

            {!keyboardCollapsed && (
              <Keyboard
                pressedNotes={pressed}
                  onNoteOn={(n) => setPressed(prev => {
                    const s = new Set(prev)
                    s.add(n)
                    return s
                  })}
                  onNoteOff={(n) => setPressed(prev => {
                    const s = new Set(prev)
                    s.delete(n)
                    return s
                  })}
                onHeightChange={(h) => setKeyboardHeightPx(h)}
                targetMidis={keyboardTargetMidis}
                targetPCs={keyboardTargetPCs}
                mode={selectedApp}
                labelMode={labelMode}
                onLabelModeChange={(m) => setLabelMode(m)}
                collapsed={keyboardCollapsed}
                onCollapsedChange={(c) => setKeyboardCollapsed(c)}
              />
            )}
          </main>

          <footer />
        </div>
      </div>

      {/* Site footer placed below the keyboard */}
      <div className="site-footer" role="contentinfo">
        <div className="inner">
          <div className="title">Piano App</div>
          <div className="center">MIDI status: {midiStatus}</div>
            <div className="right">
            {selectedApp !== 'visualizer' && (
              <button className="collapse-btn" onClick={() => setKeyboardCollapsed(k => !k)}>{keyboardCollapsed ? 'Show' : 'Hide'}</button>
            )}
            {selectedApp === 'visualizer' && (
              <>
                <div style={{marginRight:10,fontSize:13,fontWeight:600,opacity:0.9}}>Visualizer Options</div>
                <div className={`toggle ${shrinkOn ? 'active' : ''}`} onClick={() => setShrinkOn(s => !s)} title="Toggle shrink">{`Shrink: ${shrinkOn ? 'ON' : 'OFF'}`}</div>
                <div className={`toggle ${freezeOn ? 'active' : ''}`} onClick={() => setFreezeOn(f => !f)} title="Toggle freeze">{`Freeze: ${freezeOn ? 'ON' : 'OFF'}`}</div>
              </>
            )}
          </div>
        </div>
          <Settings open={showSettings} onClose={() => setShowSettings(false)} app={selectedApp} shrinkOn={shrinkOn} />
      </div>
    </div>
  )
}
