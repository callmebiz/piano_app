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

// A vertical bar chart (Y-axis + gridlines, one tick per bar, value label
// printed above each bar) — same visual language as the trend chart below.
// Used inside an expanded row to show its children (e.g. one root's own
// tracked chord types) as an actual chart instead of another stack of
// nested horizontal-bar rows.
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
// clicking anything. Clicking a row opens (or closes) it — a bucket can
// belong under more than one parent, so e.g. a specific chord shows up as
// a child under both its Root's and its Chord Type's section — and shows a
// bar chart of its children right underneath (e.g. root B's own tracked
// chord types), or its incoming transition timing directly if it's already
// a true leaf ("how fast/accurate is this right after X"). Clicking a bar
// within that chart doesn't close the row — it just becomes the new KPI
// source, and shows its own transitions below the chart if it's a leaf
// too. All driven by lib/practiceStats.js.
export default function StatsModal({ exercise, title, open, onClose = () => {} }) {
  const [sortKey, setSortKey] = useState('accuracy')
  const [sortDir, setSortDir] = useState('asc') // weakest items first by default
  // Which item's own numbers the KPI header reflects — set by clicking
  // either a row or a bar within an expanded row's chart.
  const [selectedKey, setSelectedKey] = useState(null)
  // Which single row is drilled open (showing its children's chart, or its
  // own transitions panel) — kept separate from selectedKey so clicking a
  // bar inside that chart to inspect it doesn't also collapse the row it
  // lives in (they used to be the same piece of state, which meant
  // drilling one level into a chord's actual transitions immediately
  // closed the very section you'd just opened).
  const [expandedKey, setExpandedKey] = useState(null)
  // Keyed by section id ('flat', or a dimension name like 'Chord Type') —
  // each breakdown expands independently since they're all shown at once
  // now, not one-at-a-time behind a tab.
  const [expandedSections, setExpandedSections] = useState({})
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

  // One section per dimension (Chord Type, Root, …), shown together rather
  // than behind a tab switcher — or, when there's no dimension split at
  // all (Identify, Ear Training), a single flat section.
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

  // Clicking a top-level row opens (or closes) its own drill-down and
  // makes it the KPI header's source. Clicking a bar inside that drill-down
  // only changes the KPI source — it leaves expandedKey alone, so the
  // chart you just opened stays open while you inspect one bar of it.
  const toggleRow = (key) => {
    setExpandedKey((k) => (k === key ? null : key))
    setSelectedKey(key)
  }
  const selectBar = (key) => setSelectedKey((k) => (k === key ? null : key))

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
  // when it's the expanded one, whatever nests below it — a bar chart of
  // its children if it has any (e.g. root B's own tracked chord types),
  // else its transitions panel directly (it's already a true leaf).
  const renderRow = (row, indent) => {
    const isExpandedRow = expandedKey === row.key
    const isSelected = selectedKey === row.key
    const children = childrenOf(row.key)
    // Children are labeled with the FULL combined name (e.g. "B Diminished
    // 7th") since that's what makes sense as a row of their own elsewhere —
    // but as chart ticks under a row already named "B", repeating "B" in
    // every one is just noise, so relabel with only the other dimension's
    // own name ("Diminished 7th").
    const childBars = children.map((c) => {
      const other = rowByKey(otherParentKeyOf(c, row.key))
      return { ...c, label: other ? other.label : c.label }
    })
    const selectedChild = children.find((c) => c.key === selectedKey)
    return (
      <React.Fragment key={row.key}>
        <div
          onClick={() => toggleRow(row.key)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', paddingLeft: 8 + indent * 20,
            cursor: 'pointer', borderRadius: 6,
            background: isSelected ? 'rgba(110,231,183,0.10)' : 'transparent'
          }}
        >
          <span style={{ display: 'inline-block', width: 12, opacity: 0.6, fontSize: 11 }}>{isExpandedRow ? '▾' : '▸'}</span>
          <div style={{ width: indent === 0 ? 130 : 110, flexShrink: 0, fontSize: 13, fontWeight: isSelected ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</div>
          <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', minWidth: 40 }}>
            <div style={{ width: `${Math.max(3, row.accuracy)}%`, height: '100%', background: accuracyColor(row.accuracy) }} />
          </div>
          <div style={{ width: 82, fontSize: 12, color: 'var(--muted)', textAlign: 'right', flexShrink: 0 }}>{Math.round(row.accuracy)}% ({row.correct}/{row.attempts})</div>
          <div style={{ width: 60, fontSize: 12, color: 'var(--muted)', textAlign: 'right', flexShrink: 0 }}>{fmtMs(row.avgTimeMs)}</div>
        </div>
        {isExpandedRow && children.length > 0 && (
          <div style={{ paddingLeft: 8 + (indent + 1) * 20, paddingRight: 8, paddingTop: 4, paddingBottom: 8 }}>
            <BarChart bars={sortRows(childBars, sortKey, sortDir)} selectedKey={selectedKey} onBarClick={selectBar} height={100} />
          </div>
        )}
        {isExpandedRow && children.length === 0 && transitionsPanel(row.key)}
        {/* A clicked bar that's itself a true leaf (both dimensions now
            pinned down) gets its own transitions panel right below the
            chart it lives in. */}
        {isExpandedRow && selectedChild && childrenOf(selectedChild.key).length === 0 && transitionsPanel(selectedChild.key)}
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

      {/* Breakdown — every dimension (Chord Type, Root, …) shown as its own
          section at once, instead of switching between them one at a time.
          Clicking a row (e.g. root "B") opens a bar chart of its own
          tracked children (its chord types) right underneath — a chart
          instead of another stack of nested list rows. */}
      {sections.map((sec) => {
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
      })}
    </div>
  )
}

function headerBtnStyle(width) {
  return {
    background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', font: 'inherit',
    padding: 0, textAlign: width ? 'right' : 'left', width: width || undefined
  }
}
