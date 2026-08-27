import React from 'react'

// Generic answer-choice grid shared by every Identify sub-type. `rows` is an
// array of rows, each an array of cells — a cell is `{ label, value }` or
// `null` for a blank placeholder that preserves column alignment (e.g. Key
// Signature ID only populates the natural-letter row, but keeps the
// sharp/flat rows' slots reserved so the grid lines up the same way Note
// ID's fully-populated version does).
export default function AnswerGrid({ rows, columns, onSelect, cellState = () => null, disabled = false }) {
  return (
    <div className="identify-grid" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {rows.flatMap((row, ri) =>
        row.map((cell, ci) => {
          if (!cell) return <div key={`${ri}-${ci}`} className="identify-cell empty" aria-hidden="true" />
          const state = cellState(cell.value) // 'correct' | 'wrong' | null
          return (
            <button
              key={`${ri}-${ci}`}
              className={`identify-cell${state ? ` ${state}` : ''}`}
              onClick={() => onSelect(cell.value)}
              disabled={disabled}
            >
              {cell.label}
            </button>
          )
        })
      )}
    </div>
  )
}
