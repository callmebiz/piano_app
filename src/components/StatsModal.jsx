import React, { useMemo, useState } from 'react'
import { getLifetimeStats, resetLifetimeStats, getDailyTrend, getStreak, getTransitions, getOverallStats } from '../lib/practiceStats'

const TREND_DAYS = 14
const COLLAPSED_ROWS = 8

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

const accuracyColor = (pct) => (pct >= 85 ? 'var(--accent)' : pct >= 60 ? '#ffd24a' : '#ff8a80')
const fmtMs = (ms) => (ms == null ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`)

function Kpi({ label, value, sub }) {
  return (
    <div style={{ minWidth: 100 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.3 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{sub}</div>}
    </div>
  )
}

// Shared stats dashboard for every exercise app (Identify's 5 exercises,
// Play The Chord): headline KPI cards, a daily accuracy trend, and a
// selectable breakdown list. Buckets sharing a `dimension` (e.g. Play The
// Chord's "Root" vs "Chord Type") render as separate tabs instead of one
// mixed list. Clicking any row selects it — the KPI cards above switch to
// that item's own numbers, and the row expands into its children (if it
// has any, e.g. a root's specific chords) or its incoming transition
// timing (if it's a leaf — "how fast/accurate is this right after X").
// All driven by lib/practiceStats.js.
export default function StatsModal({ exercise, title, open, onClose = () => {} }) {
  const [sortKey, setSortKey] = useState('accuracy')
  const [sortDir, setSortDir] = useState('asc') // weakest items first by default
  const [activeDimension, setActiveDimension] = useState(null)
  const [selectedKey, setSelectedKey] = useState(null)
  const [showAll, setShowAll] = useState(false)
  // Bumped on Reset so the memoized reads below re-run against the cleared store.
  const [refreshSeq, setRefreshSeq] = useState(0)

  const allRows = useMemo(() => {
    if (!open) return []
    return Object.values(getLifetimeStats(exercise)).map(withRates)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, exercise, refreshSeq])

  const trend = useMemo(() => (open ? getDailyTrend(exercise, TREND_DAYS) : []), [open, exercise, refreshSeq])
  const streak = useMemo(() => (open ? getStreak(exercise) : null), [open, exercise, refreshSeq])
  const overall = useMemo(() => (open ? getOverallStats(exercise) : null), [open, exercise, refreshSeq])

  if (!open) return null

  const topRows = allRows.filter((r) => !r.parent)
  const dimensions = Array.from(new Set(topRows.map((r) => r.dimension).filter(Boolean)))
  const dimension = dimensions.length > 1 ? (activeDimension && dimensions.includes(activeDimension) ? activeDimension : dimensions[0]) : null
  const listRows = dimension ? topRows.filter((r) => r.dimension === dimension) : topRows
  const childrenOf = (key) => allRows.filter((r) => r.parent === key)
  const rowByKey = (key) => allRows.find((r) => r.key === key) || null

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(key === 'accuracy' || key === 'avgTimeMs' ? 'asc' : 'desc') }
  }

  const handleReset = () => {
    resetLifetimeStats(exercise)
    setSelectedKey(null)
    setRefreshSeq((n) => n + 1)
  }

  const selectRow = (key) => setSelectedKey((k) => (k === key ? null : key))

  const sortIndicator = (key) => (sortKey === key ? <span className="sort-indicator">{sortDir === 'asc' ? '▲' : '▼'}</span> : null)

  const maxAttemptsInTrend = Math.max(1, ...trend.map((t) => t.attempts))

  // KPI cards reflect the current selection, if any — a live dashboard
  // rather than one fixed set of exercise-wide numbers.
  const selected = selectedKey ? rowByKey(selectedKey) : null
  const kpiSource = selected ? { attempts: selected.attempts, correct: selected.correct, accuracy: selected.accuracy, avgTimeMs: selected.avgTimeMs } : overall

  const transitionsPanel = (toKey) => {
    const rows = getTransitions(exercise, { to: toKey }).sort((a, b) => b.attempts - a.attempts)
    if (rows.length === 0) {
      return <div style={{ fontSize: 11, color: 'var(--muted)', opacity: 0.7, padding: '4px 8px 10px' }}>No transition data yet — needs at least one attempt on this item right after another.</div>
    }
    return (
      <div style={{ padding: '4px 8px 12px' }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, opacity: 0.8 }}>Coming from…</div>
        {rows.map((t) => (
          <div key={t.fromKey} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
            <div style={{ width: 90, fontSize: 12 }}>{t.fromLabel}</div>
            <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(3, t.accuracy)}%`, height: '100%', background: accuracyColor(t.accuracy) }} />
            </div>
            <div style={{ width: 60, fontSize: 11, color: 'var(--muted)', textAlign: 'right' }}>{t.attempts}×</div>
            <div style={{ width: 60, fontSize: 11, color: 'var(--muted)', textAlign: 'right' }}>{fmtMs(t.avgTimeMs)}</div>
          </div>
        ))}
      </div>
    )
  }

  // One compact row (label, inline accuracy bar, attempts, speed) plus,
  // when it's the selected one, whatever nests below it — its children if
  // it has any, else its transitions panel.
  const renderRow = (row, indent) => {
    const isSelected = selectedKey === row.key
    const children = childrenOf(row.key)
    return (
      <React.Fragment key={row.key}>
        <div
          onClick={() => selectRow(row.key)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', paddingLeft: 8 + indent * 20,
            cursor: 'pointer', borderRadius: 6,
            background: isSelected ? 'rgba(110,231,183,0.10)' : 'transparent'
          }}
        >
          <span style={{ display: 'inline-block', width: 12, opacity: 0.6, fontSize: 11 }}>{isSelected ? '▾' : '▸'}</span>
          <div style={{ width: indent === 0 ? 130 : 110, flexShrink: 0, fontSize: 13, fontWeight: isSelected ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</div>
          <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', minWidth: 40 }}>
            <div style={{ width: `${Math.max(3, row.accuracy)}%`, height: '100%', background: accuracyColor(row.accuracy) }} />
          </div>
          <div style={{ width: 82, fontSize: 12, color: 'var(--muted)', textAlign: 'right', flexShrink: 0 }}>{Math.round(row.accuracy)}% ({row.correct}/{row.attempts})</div>
          <div style={{ width: 60, fontSize: 12, color: 'var(--muted)', textAlign: 'right', flexShrink: 0 }}>{fmtMs(row.avgTimeMs)}</div>
        </div>
        {isSelected && children.length > 0 && sortRows(children, 'accuracy', 'asc').map((c) => renderRow(c, indent + 1))}
        {isSelected && children.length === 0 && transitionsPanel(row.key)}
      </React.Fragment>
    )
  }

  const sortedList = sortRows(listRows, sortKey, sortDir)
  const visibleList = showAll ? sortedList : sortedList.slice(0, COLLAPSED_ROWS)

  return (
    <div className="stats-modal">
      <h3>{title} — Stats</h3>
      <button className="close-btn" onClick={onClose}>Close</button>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="primary-btn" onClick={handleReset}>Reset Stats</button>
      </div>

      {/* KPI dashboard — reflects the current selection, if any */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{selected ? selected.label : 'All-time'}</div>
        {selected && <button className="play-cat-btn" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => setSelectedKey(null)}>Clear</button>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, marginBottom: 22, paddingBottom: 18, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Kpi label="Attempts" value={kpiSource ? kpiSource.attempts : 0} />
        <Kpi label="Accuracy" value={kpiSource ? `${Math.round(kpiSource.accuracy)}%` : '—'} sub={kpiSource ? `${kpiSource.correct}/${kpiSource.attempts} correct` : null} />
        <Kpi label="Avg Speed" value={kpiSource ? fmtMs(kpiSource.avgTimeMs) : '—'} />
        {streak && <Kpi label="Correct Streak" value={streak.currentCorrectStreak} sub={`best ${streak.bestCorrectStreak} · overall`} />}
        {streak && <Kpi label="Day Streak" value={streak.currentDayStreak} sub={`best ${streak.bestDayStreak} · overall`} />}
      </div>

      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Accuracy — last {TREND_DAYS} days</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 60, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 2 }}>
          {trend.map((t) => (
            <div key={t.date} title={`${t.date}: ${t.attempts} attempt${t.attempts === 1 ? '' : 's'}${t.accuracy != null ? `, ${Math.round(t.accuracy)}%` : ''}`} style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end' }}>
              <div style={{
                width: '100%',
                height: t.attempts === 0 ? '2px' : `${Math.max(6, t.accuracy)}%`,
                background: t.attempts === 0 ? 'rgba(255,255,255,0.12)' : accuracyColor(t.accuracy),
                opacity: t.attempts === 0 ? 1 : Math.max(0.4, t.attempts / maxAttemptsInTrend),
                borderRadius: 2
              }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', opacity: 0.6, marginTop: 3 }}>
          <span>{trend[0]?.date}</span>
          <span>{trend[trend.length - 1]?.date}</span>
        </div>
      </div>

      {dimensions.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          {dimensions.map((d) => (
            <button key={d} className={`play-cat-btn ${dimension === d ? 'active' : ''}`} onClick={() => { setActiveDimension(d); setSelectedKey(null); setShowAll(false) }}>{d}</button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px', marginBottom: 4, fontSize: 11, color: 'var(--muted)' }}>
        <div style={{ width: 12 }} />
        <button className={`sortable-header ${sortKey === 'label' ? 'active' : ''}`} onClick={() => toggleSort('label')} style={headerBtnStyle(dimension ? 130 : 130)}>Item {sortIndicator('label')}</button>
        <button className={`sortable-header ${sortKey === 'accuracy' ? 'active' : ''}`} onClick={() => toggleSort('accuracy')} style={{ ...headerBtnStyle(null), flex: 1 }}>Accuracy {sortIndicator('accuracy')}</button>
        <div style={{ width: 82 }} />
        <button className={`sortable-header ${sortKey === 'avgTimeMs' ? 'active' : ''}`} onClick={() => toggleSort('avgTimeMs')} style={headerBtnStyle(60)}>Speed {sortIndicator('avgTimeMs')}</button>
      </div>

      {listRows.length === 0 ? (
        <div className="muted" style={{ padding: 8 }}>No data yet</div>
      ) : (
        <div>{visibleList.map((r) => renderRow(r, 0))}</div>
      )}

      {sortedList.length > COLLAPSED_ROWS && (
        <button className="play-cat-btn" style={{ marginTop: 8 }} onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show less' : `Show all ${sortedList.length}`}
        </button>
      )}
    </div>
  )
}

function headerBtnStyle(width) {
  return {
    background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', font: 'inherit',
    padding: 0, textAlign: width ? 'right' : 'left', width: width || undefined
  }
}
