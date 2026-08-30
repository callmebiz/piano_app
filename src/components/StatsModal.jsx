import React, { useMemo, useState } from 'react'
import { getLifetimeStats, resetLifetimeStats, getDailyTrend, getStreak, getTransitions } from '../lib/practiceStats'

const TREND_DAYS = 14

function withRates(r) {
  return { ...r, accuracy: r.attempts > 0 ? (r.correct / r.attempts) * 100 : 0, avgTimeMs: r.correct > 0 ? r.totalTimeMs / r.correct : null }
}

function sortRows(rows, sortKey, sortDir) {
  return [...rows].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    switch (sortKey) {
      case 'label': return a.label.localeCompare(b.label) * dir
      case 'accuracy': return (a.accuracy - b.accuracy) * dir
      case 'attempts': return (a.attempts - b.attempts) * dir
      case 'correct': return (a.correct - b.correct) * dir
      case 'avgTimeMs': {
        // untimed rows (null) always sort to the end regardless of direction
        if (a.avgTimeMs == null && b.avgTimeMs == null) return 0
        if (a.avgTimeMs == null) return 1
        if (b.avgTimeMs == null) return -1
        return (a.avgTimeMs - b.avgTimeMs) * dir
      }
      default: return 0
    }
  })
}

// Shared stats view for every exercise app (Identify's 5 exercises, Play
// The Chord) — sortable per-item table (defaults to weakest-first, i.e.
// lowest accuracy), a daily accuracy trend for the last two weeks, streak
// counters, and per-row drill-down: clicking a row with children (e.g. a
// chord root, whose specific chord-type buckets point at it as `parent`)
// expands into those children; clicking a leaf row (no children) expands
// into "coming from" transition timing instead — how fast/accurate this
// item goes when reached right after each other specific item. All driven
// by lib/practiceStats.js.
export default function StatsModal({ exercise, title, open, onClose = () => {} }) {
  const [sortKey, setSortKey] = useState('accuracy')
  const [sortDir, setSortDir] = useState('asc') // weakest items first by default
  const [expandedKey, setExpandedKey] = useState(null)
  // Bumped on Reset so the memoized reads below re-run against the cleared store.
  const [refreshSeq, setRefreshSeq] = useState(0)

  const allRows = useMemo(() => {
    if (!open) return []
    return Object.values(getLifetimeStats(exercise)).map(withRates)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, exercise, refreshSeq])

  const trend = useMemo(() => (open ? getDailyTrend(exercise, TREND_DAYS) : []), [open, exercise, refreshSeq])
  const streak = useMemo(() => (open ? getStreak(exercise) : null), [open, exercise, refreshSeq])

  if (!open) return null

  const topRows = allRows.filter((r) => !r.parent)
  const childrenOf = (key) => allRows.filter((r) => r.parent === key)

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(key === 'accuracy' || key === 'avgTimeMs' ? 'asc' : 'desc') }
  }

  const handleReset = () => {
    resetLifetimeStats(exercise)
    setExpandedKey(null)
    setRefreshSeq((n) => n + 1)
  }

  const sortIndicator = (key) => (sortKey === key ? <span className="sort-indicator">{sortDir === 'asc' ? '▲' : '▼'}</span> : null)

  const maxAttemptsInTrend = Math.max(1, ...trend.map((t) => t.attempts))

  const transitionsPanel = (toKey) => {
    const rows = getTransitions(exercise, { to: toKey }).sort((a, b) => b.attempts - a.attempts)
    if (rows.length === 0) {
      return <div style={{ fontSize: 11, color: 'var(--muted)', opacity: 0.7 }}>No transition data yet — needs at least one attempt on this item right after another.</div>
    }
    return (
      <div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, opacity: 0.8 }}>Coming from…</div>
        <table style={{ width: '100%', fontSize: 12 }}>
          <tbody>
            {rows.map((t) => (
              <tr key={t.fromKey}>
                <td style={{ padding: '3px 6px', textAlign: 'left' }}>{t.fromLabel}</td>
                <td style={{ padding: '3px 6px', textAlign: 'center' }}>{Math.round(t.accuracy)}% ({t.correct}/{t.attempts})</td>
                <td style={{ padding: '3px 6px', textAlign: 'center' }}>{t.avgTimeMs != null ? `${Math.round(t.avgTimeMs)}ms avg` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // Renders one row plus, if it's the expanded one, whatever belongs below
  // it — its children (if it has any) or its transitions panel (if it's a
  // leaf). Recurses so a child that's itself expanded nests correctly too,
  // though in practice today's bucket trees only ever go one level deep.
  const renderRow = (row, indent) => {
    const isExpanded = expandedKey === row.key
    const children = childrenOf(row.key)
    return (
      <React.Fragment key={row.key}>
        <tr onClick={() => setExpandedKey((k) => (k === row.key ? null : row.key))} style={{ cursor: 'pointer' }}>
          <td style={{ paddingLeft: 8 + indent * 20, textAlign: 'left' }}>
            <span style={{ display: 'inline-block', width: 14, opacity: 0.6 }}>{isExpanded ? '▾' : '▸'}</span>
            {row.label}
          </td>
          <td>{`${Math.round(row.accuracy)}% (${row.correct}/${row.attempts})`}</td>
          <td>{row.attempts}</td>
          <td>{row.correct}</td>
          <td>{row.avgTimeMs != null ? `${Math.round(row.avgTimeMs)}ms` : '—'}</td>
        </tr>
        {isExpanded && children.length > 0 && sortRows(children, 'accuracy', 'asc').map((c) => renderRow(c, indent + 1))}
        {isExpanded && children.length === 0 && (
          <tr>
            <td colSpan={5} style={{ padding: '4px 8px 10px', paddingLeft: 8 + (indent + 1) * 20, borderTop: 'none' }}>
              {transitionsPanel(row.key)}
            </td>
          </tr>
        )}
      </React.Fragment>
    )
  }

  return (
    <div className="stats-modal">
      <h3>{title} — Stats</h3>
      <button className="close-btn" onClick={onClose}>Close</button>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="primary-btn" onClick={handleReset}>Reset Stats</button>
      </div>

      {streak && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Correct streak</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{streak.currentCorrectStreak} <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)' }}>(best {streak.bestCorrectStreak})</span></div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Practice-day streak</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{streak.currentDayStreak} <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)' }}>(best {streak.bestDayStreak})</span></div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Accuracy — last {TREND_DAYS} days</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 60 }}>
          {trend.map((t) => (
            <div key={t.date} title={`${t.date}: ${t.attempts} attempt${t.attempts === 1 ? '' : 's'}${t.accuracy != null ? `, ${Math.round(t.accuracy)}%` : ''}`} style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end' }}>
              <div style={{
                width: '100%',
                height: t.attempts === 0 ? '3%' : `${Math.max(4, t.accuracy)}%`,
                background: t.attempts === 0 ? 'rgba(255,255,255,0.08)' : 'var(--accent)',
                opacity: t.attempts === 0 ? 1 : Math.max(0.35, t.attempts / maxAttemptsInTrend),
                borderRadius: 2
              }} />
            </div>
          ))}
        </div>
      </div>

      <table className="stats-table practice-table">
        <thead>
          <tr>
            <th className="sortable" onClick={() => toggleSort('label')} style={{ textAlign: 'left' }}>Item {sortIndicator('label')}</th>
            <th className="sortable" onClick={() => toggleSort('accuracy')}>Accuracy {sortIndicator('accuracy')}</th>
            <th className="sortable" onClick={() => toggleSort('attempts')}>Attempts {sortIndicator('attempts')}</th>
            <th className="sortable" onClick={() => toggleSort('correct')}>Correct {sortIndicator('correct')}</th>
            <th className="sortable" onClick={() => toggleSort('avgTimeMs')}>Avg Speed {sortIndicator('avgTimeMs')}</th>
          </tr>
        </thead>
        <tbody>
          {topRows.length === 0
            ? <tr><td colSpan={5} className="muted">No data yet</td></tr>
            : sortRows(topRows, sortKey, sortDir).map((r) => renderRow(r, 0))}
        </tbody>
      </table>
    </div>
  )
}
