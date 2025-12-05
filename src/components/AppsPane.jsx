import React, { useEffect, useState } from 'react'

export default function AppsPane({ active = 'chord', onSelect }) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try { document.documentElement.classList.toggle('apps-closed', collapsed) } catch (e) {}
  }, [collapsed])
  const apps = [
    { id: 'chord', title: 'Chord Recognition', subtitle: 'Identify played chords' },
    { id: 'play', title: 'Play The Chord', subtitle: 'Play highlighted chords on your keyboard' },
    { id: 'visualizer', title: 'Visualizer', subtitle: 'Key visualizer' },
    // future apps can be added here
  ]

  return (
    <>
      <nav className={`apps-pane ${collapsed ? 'collapsed' : ''}`} aria-label="Apps">
      <div className="apps-header">Apps</div>
      <div className="apps-list">
        {apps.map(a => (
          <button
            key={a.id}
            className={`app-item ${a.id === active ? 'active' : ''}`}
            onClick={() => onSelect && onSelect(a.id)}
            aria-current={a.id === active ? 'true' : 'false'}
          >
            <div className="app-title">{a.title}</div>
            <div className="app-sub">{a.subtitle}</div>
          </button>
        ))}
      </div>
      <div className="apps-footer">Select an app to begin</div>
      </nav>
      <button
        className="apps-tab"
        aria-label={collapsed ? 'Open apps pane' : 'Close apps pane'}
        onClick={() => setCollapsed(c => !c)}
        title={collapsed ? 'Open apps' : 'Close apps'}
      >
        {collapsed ? '›' : '‹'}
      </button>
    </>
  )
}
