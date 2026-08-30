import React, { useMemo, useState } from 'react'
import { getLifetimeStats, resetLifetimeStats, getDailyTrend, getStreak, getTransitions, getOverallStats } from '../lib/practiceStats'

const TREND_DAYS = 14
const COLLAPSED_ROWS = 8
const TREND_LABEL_SPACE = 14 // headroom above the plot area for each bar's printed value
const TREND_HEIGHT = 60 + TREND_LABEL_SPACE

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

const selectStyle = {
  background: 'rgba(255,255,255,0.04)', color: 'inherit', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 6, padding: '5px 8px', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer'
}

// A vertical bar chart (Y-axis + gridlines, one tick per bar, value label
// printed above each bar) — same visual language as the trend chart below,
// used for the dropdown-filtered Chord-Type/Root breakdowns so picking e.g.
// one root shows its chord types as an actual chart instead of another
// stack of horizontal progress-bar rows.
function BarChart({ bars, selectedKey, onBarClick, height = 120 }) {
  if (bars.length === 0) return <div className="muted" style={{ padding: 8 }}>No data yet</div>
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 28, height, flexShrink: 0, fontSize: 9, color: 'var(--muted)', opacity: 0.6, textAlign: 'right' }}>
        <span>100%</span>
        <span>50%</span>
        <span>0%</span>
      </div>
      <div style={{ flex: 1, overflowX: 'auto', paddingBottom: 2 }}>
        <div style={{ position: 'relative', height, minWidth: bars.length * 46 }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' }}>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />
            <div style={{ borderTop: '1px dashed rgba(255,255,255,0.08)' }} />
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: '100%', position: 'relative' }}>
            {bars.map((b) => (
              <div
                key={b.key}
                onClick={() => onBarClick(b.key)}
                title={`${b.label}: ${Math.round(b.accuracy)}% (${b.correct}/${b.attempts})`}
                style={{ flex: '0 0 40px', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', cursor: 'pointer' }}
              >
                <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 2, whiteSpace: 'nowrap' }}>{Math.round(b.accuracy)}%</div>
                <div style={{
                  width: 22,
                  height: `${Math.max(2, b.accuracy)}%`,
                  background: accuracyColor(b.accuracy),
                  borderRadius: '3px 3px 0 0',
                  outline: selectedKey === b.key ? '2px solid var(--accent)' : 'none',
                  outlineOffset: 1
                }} />
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, minWidth: bars.length * 46, marginTop: 4 }}>
          {bars.map((b) => (
            <div key={b.key} style={{ flex: '0 0 40px', display: 'flex', justifyContent: 'center' }}>
              <span style={{
                fontSize: 9, color: 'var(--muted)', opacity: 0.75, whiteSpace: 'nowrap',
                display: 'inline-block', transform: 'rotate(-38deg)', transformOrigin: 'top right', maxWidth: 70,
                overflow: 'hidden', textOverflow: 'ellipsis'
              }}>{b.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Shared stats dashboard for every exercise app (Identify's 5 exercises,
// Ear Training's 4, Play The Chord, Scales): headline KPI cards, a daily
// accuracy trend, and a breakdown list. Buckets sharing a `dimension` (e.g.
// Play The Chord's "Root" vs "Chord Type") render as their own section, all
// shown at once — not one dimension at a time behind a tab, so e.g. a
// chord's type and root breakdowns are both visible together without
// clicking anything. Clicking any row selects it — the KPI cards above
// switch to that item's own numbers, and the row expands into its children
// (if it has any — a bucket can belong under more than one parent, so e.g.
// a specific chord shows up as a child under both its Root's and its Chord
// Type's section) or its incoming transition timing (if it's a true leaf —
// "how fast/accurate is this right after X"). All driven by lib/practiceStats.js.
export default function StatsModal({ exercise, title, open, onClose = () => {} }) {
  const [sortKey, setSortKey] = useState('accuracy')
  const [sortDir, setSortDir] = useState('asc') // weakest items first by default
  const [selectedKey, setSelectedKey] = useState(null)
  // Keyed by section id ('flat', or a dimension name like 'Chord Type') —
  // each breakdown expands independently since they're all shown at once
  // now, not one-at-a-time behind a tab.
  const [expandedSections, setExpandedSections] = useState({})
  // Keyed by dimension name — 'ALL' (the default) or a specific top-level
  // row's key from that dimension (e.g. 'root:2'). Drives the two-dimension
  // dropdown+chart breakdown: picking a specific Root narrows the Chord
  // Type chart down to just that root's chords, and vice versa.
  const [filters, setFilters] = useState({})
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
  // A bucket can belong under more than one parent (e.g. Play The Chord's
  // "chord:min7@2" sits under both "root:2" and "type:min7"), so a leaf
  // shows up correctly under every dimension's own breakdown at once,
  // instead of only whichever one happened to "win" a single-parent slot.
  const childrenOf = (key) => allRows.filter((r) => (Array.isArray(r.parent) ? r.parent.includes(key) : r.parent === key))
  const rowByKey = (key) => allRows.find((r) => r.key === key) || null
  // Given a leaf that belongs under `excludeKey` (one of its parents), find
  // its OTHER parent — e.g. a chord's root parent, given its type parent —
  // without needing to know either dimension's key format. Used to label a
  // chart bar with just the other dimension's own name (e.g. "Diminished
  // 7th") instead of the leaf's full combined label (e.g. "C Diminished
  // 7th"), which would needlessly repeat whatever the chart is already
  // filtered to.
  const otherParentKeyOf = (leaf, excludeKey) => (Array.isArray(leaf.parent) ? leaf.parent.find((p) => p !== excludeKey) : null) || null

  // Exactly two dimensions (Play The Chord's Chord Type/Root, Scales' Scale
  // Type/Root) get the dropdown + bar-chart breakdown below; anything else
  // (no dimension split at all — Identify, Ear Training) keeps the plain
  // flat list.
  const useChartBreakdown = dimensions.length === 2

  const filterFor = (dim) => filters[dim] || 'ALL'
  const setFilterFor = (dim, key) => { setFilters((f) => ({ ...f, [dim]: key })); setSelectedKey(null) }

  // Bars for `dim`'s chart: the OTHER dimension's own top-level rows when
  // `dim` is unfiltered ("ALL"), or — once a specific value of `dim` is
  // picked — that value's real children, each relabeled with just its
  // other-dimension identity so the chart doesn't repeat the filter in
  // every tick.
  const chartBarsFor = (dim, otherDim) => {
    const f = filterFor(dim)
    if (f === 'ALL') return topRows.filter((r) => r.dimension === otherDim)
    return childrenOf(f).map((leaf) => {
      const other = rowByKey(otherParentKeyOf(leaf, f))
      return { ...leaf, label: other ? other.label : leaf.label }
    })
  }

  // One section per dimension (Chord Type, Root, …), shown together rather
  // than behind a tab switcher — used only for the flat (no chart) case.
  const sections = dimensions.length > 0
    ? dimensions.map((d) => ({ id: d, title: d, rows: topRows.filter((r) => r.dimension === d) }))
    : [{ id: 'flat', title: null, rows: topRows }]
  const isExpanded = (id) => !!expandedSections[id]
  const toggleExpanded = (id) => setExpandedSections((s) => ({ ...s, [id]: !s[id] }))

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
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Y-axis — without it, a chart of mostly-empty days (no attempts
              that day) reads as ambiguous: is a tall bar 100% or just "some"? */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 28, height: TREND_HEIGHT, paddingTop: TREND_LABEL_SPACE, flexShrink: 0, fontSize: 9, color: 'var(--muted)', opacity: 0.6, textAlign: 'right' }}>
            <span>100%</span>
            <span>50%</span>
            <span>0%</span>
          </div>
          <div style={{ flex: 1, position: 'relative', height: TREND_HEIGHT }}>
            <div style={{ position: 'absolute', top: TREND_LABEL_SPACE, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' }}>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />
              <div style={{ borderTop: '1px dashed rgba(255,255,255,0.08)' }} />
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: '100%', position: 'relative' }}>
              {trend.map((t) => (
                <div key={t.date} title={`${t.date}: ${t.attempts} attempt${t.attempts === 1 ? '' : 's'}${t.accuracy != null ? `, ${Math.round(t.accuracy)}%` : ''}`} style={{ flex: 1, height: `calc(100% - ${TREND_LABEL_SPACE}px)`, display: 'flex', alignItems: 'flex-end', position: 'relative' }}>
                  {t.attempts > 0 && (
                    <div style={{ position: 'absolute', bottom: `calc(${Math.max(6, t.accuracy)}% + 2px)`, left: '50%', transform: 'translateX(-50%)', fontSize: 8, color: 'var(--muted)', opacity: 0.8, whiteSpace: 'nowrap' }}>
                      {Math.round(t.accuracy)}%
                    </div>
                  )}
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
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', opacity: 0.6, marginTop: 3, paddingLeft: 36 }}>
          <span>{trend[0]?.date}</span>
          <span>{trend[trend.length - 1]?.date}</span>
        </div>
      </div>

      {/* Breakdown — for a two-dimension exercise (Play The Chord, Scales),
          one dropdown + bar chart per dimension: pick a specific Root and
          the Chord Type chart narrows to just that root's chords (relabeled
          by type alone), and vice versa — instead of a tab, and instead of
          drilling a row into another stack of horizontal bars. Anything
          else (Identify, Ear Training — no dimension split) keeps the
          plain flat list. */}
      {useChartBreakdown ? (
        dimensions.map((dim, i) => {
          const otherDim = dimensions[1 - i]
          const f = filterFor(dim)
          const bars = sortRows(chartBarsFor(dim, otherDim), sortKey, sortDir)
          const chartSelected = bars.some((b) => b.key === selectedKey) ? selectedKey : null
          return (
            <div key={dim} style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{otherDim} <span style={{ fontWeight: 400, color: 'var(--muted)', opacity: 0.7 }}>by {dim.toLowerCase()}</span></div>
                <select value={f} onChange={(e) => setFilterFor(dim, e.target.value)} style={selectStyle}>
                  <option value="ALL">All {dim}</option>
                  {sortRows(topRows.filter((r) => r.dimension === dim), 'label', 'asc').map((r) => (
                    <option key={r.key} value={r.key}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 6, fontSize: 11, color: 'var(--muted)' }}>
                <span>Sort:</span>
                <button className={`sortable-header ${sortKey === 'label' ? 'active' : ''}`} onClick={() => toggleSort('label')} style={headerBtnStyle(null)}>Name {sortIndicator('label')}</button>
                <button className={`sortable-header ${sortKey === 'accuracy' ? 'active' : ''}`} onClick={() => toggleSort('accuracy')} style={headerBtnStyle(null)}>Accuracy {sortIndicator('accuracy')}</button>
                <button className={`sortable-header ${sortKey === 'avgTimeMs' ? 'active' : ''}`} onClick={() => toggleSort('avgTimeMs')} style={headerBtnStyle(null)}>Speed {sortIndicator('avgTimeMs')}</button>
              </div>
              <BarChart bars={bars} selectedKey={chartSelected} onBarClick={selectRow} />
              {chartSelected && childrenOf(chartSelected).length === 0 && transitionsPanel(chartSelected)}
            </div>
          )
        })
      ) : (
        sections.map((sec) => {
          const sorted = sortRows(sec.rows, sortKey, sortDir)
          const expanded = isExpanded(sec.id)
          const visible = expanded ? sorted : sorted.slice(0, COLLAPSED_ROWS)
          return (
            <div key={sec.id} style={{ marginBottom: 24 }}>
              {sec.title && <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{sec.title}</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px', marginBottom: 4, fontSize: 11, color: 'var(--muted)' }}>
                <div style={{ width: 12 }} />
                <button className={`sortable-header ${sortKey === 'label' ? 'active' : ''}`} onClick={() => toggleSort('label')} style={headerBtnStyle(130)}>Item {sortIndicator('label')}</button>
                <button className={`sortable-header ${sortKey === 'accuracy' ? 'active' : ''}`} onClick={() => toggleSort('accuracy')} style={{ ...headerBtnStyle(null), flex: 1 }}>Accuracy {sortIndicator('accuracy')}</button>
                <div style={{ width: 82 }} />
                <button className={`sortable-header ${sortKey === 'avgTimeMs' ? 'active' : ''}`} onClick={() => toggleSort('avgTimeMs')} style={headerBtnStyle(60)}>Speed {sortIndicator('avgTimeMs')}</button>
              </div>

              {sorted.length === 0 ? (
                <div className="muted" style={{ padding: 8 }}>No data yet</div>
              ) : (
                <div>{visible.map((r) => renderRow(r, 0))}</div>
              )}

              {sorted.length > COLLAPSED_ROWS && (
                <button className="play-cat-btn" style={{ marginTop: 8 }} onClick={() => toggleExpanded(sec.id)}>
                  {expanded ? 'Show less' : `Show all ${sorted.length}`}
                </button>
              )}
            </div>
          )
        })
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
