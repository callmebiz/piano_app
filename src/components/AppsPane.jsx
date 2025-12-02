import React from 'react'

export default function AppsPane({ active = 'chord', onSelect }) {
  const apps = [
    { id: 'chord', title: 'Chord Recognition', subtitle: 'Identify played chords' },
    // future apps can be added here
  ]

  return (
    <nav className="apps-pane" aria-label="Apps">
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
  )
}
