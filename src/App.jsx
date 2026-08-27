import React, { useEffect, useState, useCallback, Suspense, lazy } from 'react'
import { initMIDI } from './midi'
import Keyboard from './components/Keyboard'
import AppsPane from './components/AppsPane'
import MobileNav from './components/MobileNav'
import { useViewportClass } from './lib/capabilities'
import ChordRecognition from './apps/ChordRecognition/ChordRecognition'
import ErrorBoundary from './components/ErrorBoundary'
import PlayTheChord from './apps/PlayTheChord/PlayTheChord'
import Visualizer from './apps/Visualizer/Visualizer'
import Scales from './apps/Scales/Scales'
import KeyCenter from './apps/KeyCenter/KeyCenter'
import Settings from './components/Settings'
import { noteOn, noteOff } from './audio/engine'

// VexFlow (pulled in by Identify's Staff renderer) is ~1.1MB on its own —
// lazy-load so apps that don't touch staff notation never pay for it.
const Identify = lazy(() => import('./apps/Identify/Identify'))

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
      (note, velocity) => {
        if (!mounted) return
        setPressed((prev) => {
          const s = new Set(prev)
          s.add(note)
          return s
        })
        noteOn(note, velocity)
      },
      (note) => {
        if (!mounted) return
        setPressed((prev) => {
          const s = new Set(prev)
          s.delete(note)
          return s
        })
        noteOff(note)
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

  // No app is enabled by default right now (see src/apps/registry.js) while
  // the Identification/Construction exercise set is being built — null means
  // "nothing selected", which also keeps the on-screen keyboard hidden below.
  const [selectedApp, setSelectedApp] = useState(null)
  const [keyboardTargetMidis, setKeyboardTargetMidis] = useState(new Set())
  const [keyboardTargetPCs, setKeyboardTargetPCs] = useState(new Set())
  const [showSettings, setShowSettings] = useState(false)
  const [labelMode, setLabelMode] = useState('all')
  const [keyboardCollapsed, setKeyboardCollapsed] = useState(false)
  const [shrinkOn, setShrinkOn] = useState(false)
  const [freezeOn, setFreezeOn] = useState(false)
  const viewportClass = useViewportClass()

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
      {viewportClass === 'mobile'
        ? <MobileNav active={selectedApp} onSelect={(id) => setSelectedApp(id)} />
        : <AppsPane active={selectedApp} onSelect={(id) => setSelectedApp(id)} />}
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
                {selectedApp === 'scales' && <Scales pressedNotes={pressed} setKeyboardTargetPCs={setKeyboardTargets} />}
                {selectedApp === 'keycenter' && <KeyCenter pressedNotes={pressed} setKeyboardTargetPCs={setKeyboardTargets} />}
                {selectedApp === 'visualizer' && <Visualizer pressedNotes={pressed} shrinkOn={shrinkOn} freezeOn={freezeOn} />}
                {selectedApp === 'identify' && (
                  <Suspense fallback={<div className="muted" style={{ padding: '2rem' }}>Loading…</div>}>
                    <Identify pressedNotes={pressed} setKeyboardTargetPCs={setKeyboardTargets} />
                  </Suspense>
                )}
                {!selectedApp && (
                  <div className="app-placeholder" style={{ padding: '2rem', opacity: 0.7 }}>
                    New exercises are being built — check back soon.
                  </div>
                )}
              </ErrorBoundary>
            </div>

            {!keyboardCollapsed && selectedApp && (
              <Keyboard
                pressedNotes={pressed}
                  onNoteOn={(n) => {
                    setPressed(prev => {
                      const s = new Set(prev)
                      s.add(n)
                      return s
                    })
                    noteOn(n, 0.85)
                  }}
                  onNoteOff={(n) => {
                    setPressed(prev => {
                      const s = new Set(prev)
                      s.delete(n)
                      return s
                    })
                    noteOff(n)
                  }}
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
