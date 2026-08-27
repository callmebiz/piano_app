import React from 'react'
import { appsFor } from '../apps/registry'

// Replaces AppsPane on narrow viewports — a slim top tab strip instead of a
// left sidebar (which CSS hides outright below the mobile breakpoint). Takes
// the same active/onSelect contract AppsPane does so App.jsx can swap
// between them without any other wiring changes.
export default function MobileNav({ active = 'chord', onSelect }) {
  const apps = appsFor('mobile')

  return (
    <nav className="mobile-nav" aria-label="Apps">
      {apps.map((a) => (
        <button
          key={a.id}
          className={`mobile-nav-item ${a.id === active ? 'active' : ''}`}
          onClick={() => onSelect && onSelect(a.id)}
          aria-current={a.id === active ? 'true' : 'false'}
        >
          {a.title}
        </button>
      ))}
    </nav>
  )
}
