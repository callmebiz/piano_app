import React, { useEffect, useMemo, useRef, useState } from 'react'
import { resetLifetimeStats, getDailyTrend, getStreak, getOverallStats, getAvailableFields, crossTab, getFacts, deleteFact } from '../lib/practiceStats'

const TREND_DAYS = 14
const COLLAPSED_ROWS = 8
const TREND_LABEL_SPACE = 14 // headroom above the plot area for each bar's printed value
const TREND_HEIGHT = 60 + TREND_LABEL_SPACE

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
// Field keys (type, root, hand, interval, …) are lowercase since they're
// also used as-is for sorting/filtering logic — this is purely a display
// wrapper for column headers, not a rename of the key itself.
const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
// Speed has no universal "good" threshold the way accuracy does (85%+ is
// always good; 2s is fast for one chord and slow for another) — so color
// it relative to the fastest/slowest actually observed in the current
// slice, same 3-tier green/yellow/red language as accuracy.
const speedColor = (ms, minMs, maxMs) => {
  if (ms == null) return 'rgba(255,255,255,0.12)'
  if (maxMs === minMs) return 'var(--accent)'
  const t = (ms - minMs) / (maxMs - minMs) // 0 = fastest, 1 = slowest
  return t <= 0.4 ? 'var(--accent)' : t <= 0.7 ? '#ffd24a' : '#ff8a80'
}
// Speed as a 0–100 bar-width "goodness" position (100 = fastest in
// `range`) — for bars that otherwise show accuracy's own 0–100% scale, so
// toggling a breakdown row/section to Speed reuses the same bar geometry.
const speedRangePct = (ms, range) => (ms == null ? 0 : (range.max === range.min ? 50 : 100 - ((ms - range.min) / (range.max - range.min)) * 100))

// Multi-select Accuracy/Speed toggle — both can be active at once, but at
// least one always stays on (nothing to show otherwise). Shared by the
// trend chart and Explore's heatmap so both charts filter the same way.
function MetricToggle({ metrics, onChange }) {
  const toggle = (m) => onChange(metrics.includes(m) ? (metrics.length > 1 ? metrics.filter((x) => x !== m) : metrics) : [...metrics, m])
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <button className={`play-cat-btn ${metrics.includes('accuracy') ? 'active' : ''}`} style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => toggle('accuracy')}>Accuracy</button>
      <button className={`play-cat-btn ${metrics.includes('speed') ? 'active' : ''}`} style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => toggle('speed')}>Speed</button>
    </div>
  )
}

// One tick's worth of bars for whichever metrics are active — a single
// full-width bar when only one metric is selected (unchanged from before),
// or two thinner bars side by side when both are, so a tick with both
// active reads as a small grouped/clustered bar chart instead of picking
// one metric to show. Speed's bar height also means "better" the taller it
// is (fastest = tallest), matching accuracy's convention, even though its
// color comes from a separate relative fast/slow scale.
function MetricBars({ metrics, accuracy, avgTimeMs, minMs, maxMs }) {
  const showAcc = metrics.includes('accuracy')
  const showSpeed = metrics.includes('speed')
  const speedPct = avgTimeMs == null || maxMs === minMs ? 50 : 100 - ((avgTimeMs - minMs) / (maxMs - minMs)) * 100
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: '100%', width: '100%' }}>
      {showAcc && (
        <div style={{ flex: 1, height: `${Math.max(4, accuracy)}%`, background: accuracyColor(accuracy), borderRadius: '2px 2px 0 0' }} />
      )}
      {showSpeed && (
        <div style={{
          flex: 1,
          height: avgTimeMs == null ? '4%' : `${Math.max(4, speedPct)}%`,
          background: avgTimeMs == null ? 'rgba(255,255,255,0.12)' : speedColor(avgTimeMs, minMs, maxMs),
          borderRadius: '2px 2px 0 0'
        }} />
      )}
    </div>
  )
}

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
// The dropdown POPUP list (not the closed select box) is rendered by the
// browser with its own light/white background regardless of the page's
// dark theme — <option> inheriting the select's near-white `color:
// inherit` for that dark theme then meant near-white text on that native
// white popup, unreadable. Every <option> gets this explicit dark color
// instead, so it's always legible regardless of what the select itself
// inherits.
const optionStyle = { color: '#111827', background: '#fff' }

// A small custom dropdown — not a native <select> — used only where an
// option needs two visually distinct pieces of text (a normal label plus a
// smaller, fainter attempt count): a native <option>'s text is always one
// uniform style, so there's no way to size/color part of it differently.
// Closes on an outside click or Escape; the closed button matches
// selectStyle so it sits naturally next to the real <select>s elsewhere in
// this modal. `options`: [{ value, label, count }]; value '' is treated as
// the placeholder/"Any" choice.
function FacetedDropdown({ value, placeholder, options, onChange, title }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selected = options.find((o) => o.value === value)
  const closedLabel = selected ? selected.label : placeholder
  const closedCount = selected ? selected.count : null

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={title || closedLabel}
        style={{ ...selectStyle, display: 'inline-flex', alignItems: 'center', gap: 6, textAlign: 'left', color: 'inherit' }}
      >
        <span style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{closedLabel}</span>
        {closedCount != null && <span style={{ fontSize: 10, color: 'var(--muted)', opacity: 0.55, flexShrink: 0 }}>{closedCount}</span>}
        <span style={{ fontSize: 9, opacity: 0.6, flexShrink: 0 }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 20, minWidth: '100%',
          background: '#0f172a', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 6,
          boxShadow: '0 8px 24px rgba(0,0,0,0.45)', maxHeight: 260, overflowY: 'auto', padding: 4
        }}>
          {options.map((o) => (
            <div
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false) }}
              onMouseEnter={(e) => { if (o.value !== value) e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
              onMouseLeave={(e) => { if (o.value !== value) e.currentTarget.style.background = 'transparent' }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
                padding: '5px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap',
                background: o.value === value ? 'rgba(110,231,183,0.14)' : 'transparent'
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.label}</span>
              <span style={{ fontSize: 10, color: 'var(--muted)', opacity: 0.55, flexShrink: 0 }}>{o.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Cross any two tracked dimensions as a color-coded matrix — rows = one
// field's values, columns = the other's. `metrics` (from the shared
// MetricToggle) picks what each cell shows: a single colored square with
// its number when only one of Accuracy/Speed is on (accuracy colored
// absolutely — 85%+ is always good; speed colored relative to the
// fastest/slowest observed in THIS slice, no universal "good" response
// time), or a small grouped pair of mini bars (via MetricBars, same as the
// trend chart) when both are on — a cell that size can't fit two printed
// numbers legibly, so the full detail lives in the tooltip instead.
// Attempts drive opacity either way, so thin-sample cells read as less
// certain. `combos` is a crossTab() result including at least [fieldA,
// fieldB] (it may carry more dims too, when a 3rd slice field is active —
// only fieldA/fieldB are used for the axes here).
function Heatmap({ combos, fieldA, fieldB, labelA, labelB, metrics, selectedKey, onSelect }) {
  // Hovering a row/column HEADER highlights every cell in that row/column;
  // hovering an individual CELL highlights just that one cell — two
  // separate pieces of state so a cell hover never also lights up its
  // whole row/col, and a header hover never narrows to a single cell.
  const [hoverAxis, setHoverAxis] = useState(null) // { type: 'row' | 'col', value }
  const [hoverCell, setHoverCell] = useState(null) // { a, b }
  const isCellHighlighted = (av, bv) =>
    (hoverCell != null && hoverCell.a === av && hoverCell.b === bv) ||
    (hoverAxis != null && hoverAxis.type === 'row' && hoverAxis.value === av) ||
    (hoverAxis != null && hoverAxis.type === 'col' && hoverAxis.value === bv)
  const isHeaderHighlighted = (type, value) => hoverAxis != null && hoverAxis.type === type && hoverAxis.value === value

  const aMap = new Map()
  const bMap = new Map()
  for (const c of combos) {
    if (!aMap.has(c.dims[fieldA])) aMap.set(c.dims[fieldA], c.fieldLabels[fieldA])
    if (!bMap.has(c.dims[fieldB])) bMap.set(c.dims[fieldB], c.fieldLabels[fieldB])
  }
  const aVals = Array.from(aMap, ([value, label]) => ({ value, label })).sort((x, y) => String(x.label).localeCompare(String(y.label)))
  const bVals = Array.from(bMap, ([value, label]) => ({ value, label })).sort((x, y) => String(x.label).localeCompare(String(y.label)))
  if (aVals.length === 0 || bVals.length === 0) return <div className="muted" style={{ padding: 8 }}>No data yet for this combination</div>
  const cellFor = (av, bv) => combos.find((c) => c.dims[fieldA] === av && c.dims[fieldB] === bv)
  const maxAttempts = Math.max(1, ...combos.map((c) => c.attempts))
  const timedMs = combos.map((c) => c.avgTimeMs).filter((ms) => ms != null)
  const minMs = timedMs.length > 0 ? Math.min(...timedMs) : 0
  const maxMs = timedMs.length > 0 ? Math.max(...timedMs) : 0
  const dual = metrics.length > 1
  const singleMetric = metrics[0]

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600 }}>{labelA} \ {labelB}</th>
            {bVals.map((b) => (
              <th
                key={b.value}
                onMouseEnter={() => setHoverAxis({ type: 'col', value: b.value })}
                onMouseLeave={() => setHoverAxis(null)}
                style={{
                  padding: '4px 6px', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap', borderRadius: 4,
                  background: isHeaderHighlighted('col', b.value) ? 'rgba(110,231,183,0.12)' : 'transparent'
                }}
              >{b.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {aVals.map((a) => (
            <tr key={a.value}>
              <td
                onMouseEnter={() => setHoverAxis({ type: 'row', value: a.value })}
                onMouseLeave={() => setHoverAxis(null)}
                style={{
                  padding: '4px 8px', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap', borderRadius: 4,
                  background: isHeaderHighlighted('row', a.value) ? 'rgba(110,231,183,0.12)' : 'transparent'
                }}
              >{a.label}</td>
              {bVals.map((b) => {
                const c = cellFor(a.value, b.value)
                const tooltip = c ? `${a.label} · ${b.label}: ${Math.round(c.accuracy)}% (${c.correct}/${c.attempts}), ${fmtMs(c.avgTimeMs)} avg` : null
                const highlighted = c && isCellHighlighted(a.value, b.value)
                const cellHoverHandlers = c ? {
                  onMouseEnter: () => setHoverCell({ a: a.value, b: b.value }),
                  onMouseLeave: () => setHoverCell(null)
                } : {}
                return (
                  <td key={b.value} style={{ padding: 2 }}>
                    {!c ? (
                      <div style={{ width: 44, height: 28, borderRadius: 4, background: 'rgba(255,255,255,0.02)' }} />
                    ) : dual ? (
                      <div
                        onClick={() => onSelect(c.key)}
                        title={tooltip}
                        {...cellHoverHandlers}
                        style={{
                          width: 44, height: 28, padding: 2, borderRadius: 4, cursor: 'pointer',
                          background: 'rgba(255,255,255,0.03)', opacity: Math.max(0.35, c.attempts / maxAttempts),
                          outline: selectedKey === c.key ? '2px solid var(--accent)' : highlighted ? '2px solid rgba(255,255,255,0.5)' : 'none', outlineOffset: 1
                        }}
                      >
                        <MetricBars metrics={metrics} accuracy={c.accuracy} avgTimeMs={c.avgTimeMs} minMs={minMs} maxMs={maxMs} />
                      </div>
                    ) : (
                      <div
                        onClick={() => onSelect(c.key)}
                        title={tooltip}
                        {...cellHoverHandlers}
                        style={{
                          width: 44, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: singleMetric === 'speed' ? speedColor(c.avgTimeMs, minMs, maxMs) : accuracyColor(c.accuracy),
                          opacity: Math.max(0.35, c.attempts / maxAttempts),
                          color: '#071025', fontWeight: 700, fontSize: singleMetric === 'speed' ? 10 : 11, borderRadius: 4, cursor: 'pointer',
                          outline: selectedKey === c.key ? '2px solid var(--accent)' : highlighted ? '2px solid rgba(255,255,255,0.5)' : 'none', outlineOffset: 1
                        }}
                      >
                        {singleMetric === 'speed' ? (c.avgTimeMs == null ? '—' : fmtMs(c.avgTimeMs)) : Math.round(c.accuracy)}
                      </div>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Pick any two tracked dimensions and cross them, instead of only ever
// seeing whichever pairs an app happened to hand-build buckets for. Fully
// self-contained (its own field-pair + selected-cell state) — a crossTab
// combo isn't a bucket in the lifetime tree, so it doesn't try to drive
// the shared KPI header or transitions panel above; it shows its own
// numbers for the selected cell right here instead.
function Explore({ exercise }) {
  const fields = useMemo(() => getAvailableFields(exercise), [exercise])
  const fieldKeys = Object.keys(fields)
  const [fieldA, setFieldA] = useState(fieldKeys[0] || '')
  const [fieldB, setFieldB] = useState(fieldKeys[1] || fieldKeys[0] || '')
  // Optional 3rd dimension to slice through — the heatmap always shows
  // fieldA × fieldB, but when a slice field is picked it's pinned to one
  // value at a time (stepped via the slider), like pulling one layer out
  // of a 3D cube instead of only ever seeing it collapsed onto 2 axes.
  const [fieldC, setFieldC] = useState('')
  const [sliceIndex, setSliceIndex] = useState(0)
  const [metrics, setMetrics] = useState(['accuracy'])
  const [selectedKey, setSelectedKey] = useState(null)

  if (fieldKeys.length < 2) return null // nothing to cross yet

  const sliceOptions = fieldKeys.filter((k) => k !== fieldA && k !== fieldB)
  const activeFieldC = fieldC && sliceOptions.includes(fieldC) ? fieldC : ''

  const crossFields = activeFieldC ? [fieldA, fieldB, activeFieldC] : [fieldA, fieldB]
  const allCombos = crossTab(exercise, crossFields)

  const sliceValues = activeFieldC
    ? Array.from(new Map(allCombos.map((c) => [c.dims[activeFieldC], c.fieldLabels[activeFieldC]])), ([value, label]) => ({ value, label }))
      .sort((x, y) => String(x.label).localeCompare(String(y.label)))
    : []
  const clampedIndex = Math.min(sliceIndex, Math.max(0, sliceValues.length - 1))
  const activeSlice = sliceValues[clampedIndex] || null

  const combos = activeFieldC && activeSlice ? allCombos.filter((c) => c.dims[activeFieldC] === activeSlice.value) : allCombos
  const selected = combos.find((c) => c.key === selectedKey) || null

  const changeField = (setter) => (e) => { setter(e.target.value); setSelectedKey(null) }

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Explore</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', opacity: 0.8, marginBottom: 10 }}>Cross any two tracked dimensions — not just the breakdowns below.</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <select value={fieldA} onChange={changeField(setFieldA)} title={fields[fieldA]} style={selectStyle}>
          {fieldKeys.map((k) => <option key={k} value={k} style={optionStyle}>{fields[k]}</option>)}
        </select>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>×</span>
        <select value={fieldB} onChange={changeField(setFieldB)} title={fields[fieldB]} style={selectStyle}>
          {fieldKeys.map((k) => <option key={k} value={k} style={optionStyle}>{fields[k]}</option>)}
        </select>
        <MetricToggle metrics={metrics} onChange={setMetrics} />
      </div>

      {sliceOptions.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Slice by:</span>
          <select value={activeFieldC} onChange={(e) => { setFieldC(e.target.value); setSliceIndex(0); setSelectedKey(null) }} title={activeFieldC ? fields[activeFieldC] : 'None'} style={selectStyle}>
            <option value="" style={optionStyle}>None</option>
            {sliceOptions.map((k) => <option key={k} value={k} style={optionStyle}>{fields[k]}</option>)}
          </select>
          {activeFieldC && sliceValues.length > 0 && (
            <>
              <button className="play-cat-btn" style={{ padding: '2px 8px', fontSize: 12 }} disabled={clampedIndex === 0} onClick={() => setSliceIndex((i) => Math.max(0, i - 1))}>‹</button>
              <input
                type="range" min={0} max={Math.max(0, sliceValues.length - 1)} value={clampedIndex}
                onChange={(e) => { setSliceIndex(Number(e.target.value)); setSelectedKey(null) }}
                style={{ width: 100, accentColor: 'var(--accent)' }}
              />
              <button className="play-cat-btn" style={{ padding: '2px 8px', fontSize: 12 }} disabled={clampedIndex === sliceValues.length - 1} onClick={() => setSliceIndex((i) => Math.min(sliceValues.length - 1, i + 1))}>›</button>
              <strong style={{ fontSize: 12, minWidth: 90 }}>{activeSlice ? activeSlice.label : '—'}</strong>
            </>
          )}
        </div>
      )}

      {fieldA === fieldB ? (
        <div className="muted" style={{ padding: 8 }}>Pick two different dimensions to cross.</div>
      ) : (
        <>
          <Heatmap combos={combos} fieldA={fieldA} fieldB={fieldB} labelA={fields[fieldA]} labelB={fields[fieldB]} metrics={metrics} selectedKey={selectedKey} onSelect={(k) => setSelectedKey((s) => (s === k ? null : k))} />
          {selected && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
              <strong style={{ color: 'inherit', fontWeight: 700 }}>{selected.label}</strong>
              <span>{Math.round(selected.accuracy)}% ({selected.correct}/{selected.attempts})</span>
              <span>{fmtMs(selected.avgTimeMs)} avg</span>
              <button className="play-cat-btn" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => setSelectedKey(null)}>Clear</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const PROGRESS_DEFAULT_WINDOW = 10

const CHART_TICK_COUNT = 5
const CHART_MAX_SESSION_TICKS = 10

// A handful of evenly-spaced point indices to label along the x-axis —
// used for 'attempt'/'date' mode. Always includes the first and last point.
function evenTickIndices(n, count) {
  if (n <= 1) return [0]
  const out = []
  for (let i = 0; i < count; i++) {
    const idx = Math.round((i / (count - 1)) * (n - 1))
    if (out[out.length - 1] !== idx) out.push(idx)
  }
  return out
}

// A rolling line chart — accuracy and/or speed plotted as a connected line.
// In 'attempt' mode each point is one raw attempt (its own 0%/100% and its
// own solve time, unaveraged — the most granular view). In 'date'/'session'
// mode each point is already an aggregate (one calendar day or one
// session's pooled attempts, see rollingBucketSeries), so the line reads as
// a trend without needing per-point smoothing on top. Built as raw SVG (no
// charting library available) using a 0–100 viewBox on both axes with
// vectorEffect="non-scaling-stroke" so line width stays consistent even
// though the element is far wider than it is tall.
//
// No markers are drawn except on hover — an invisible full-width overlay
// tracks the cursor and finds the nearest point, rather than every point
// having its own always-visible circle (which is what made the chart
// noisy). Hover markers are plain CSS divs (fixed px width/height,
// border-radius 50%) absolutely positioned over the chart by percentage —
// NOT SVG <circle> elements, because the viewBox's non-uniform x/y scaling
// (the chart is far wider than tall) stretches a circle's own radius into
// an ellipse; a CSS div's box isn't subject to that scaling. The tooltip is
// likewise absolutely positioned over the chart at the cursor's location,
// not laid out as a flex sibling — so it never resizes or shifts the chart
// itself, just floats on top of it (flipping to the left of the cursor
// near the right edge so it can't run off-screen).
function LineChart({ points, metrics, xMode, height = 130 }) {
  const containerRef = useRef(null)
  const [hover, setHover] = useState(null) // { idx, xPct } | null

  if (points.length === 0) return <div className="muted" style={{ padding: 8 }}>No data yet</div>
  const n = points.length
  const xAt = (i) => (n <= 1 ? 50 : (i / (n - 1)) * 100)

  const showAcc = metrics.includes('accuracy')
  const showSpd = metrics.includes('speed')
  const dual = showAcc && showSpd

  const timed = points.filter((p) => p.avgTimeMs != null)
  const minMs = timed.length > 0 ? Math.min(...timed.map((p) => p.avgTimeMs)) : 0
  const maxMs = timed.length > 0 ? Math.max(...timed.map((p) => p.avgTimeMs)) : 0
  // Speed as a 0–100 "goodness" position (100 = fastest in this series) —
  // only for PLOTTING the line on the shared 0–100 viewBox; the axis label
  // shown for it is real milliseconds (fmtMs), not this percentage.
  const speedPct = (ms) => (ms == null ? null : (maxMs === minMs ? 50 : 100 - ((ms - minMs) / (maxMs - minMs)) * 100))

  // Accuracy is plotted the same way — normalized to the range actually
  // present in this series (not a fixed 0–100% scale) — so a tight cluster
  // of values (e.g. 80–95%) uses the chart's full vertical space instead of
  // sitting flat near the top. The axis label shows the real min/max
  // percentages, matching how speed's axis shows real min/max ms.
  const accVals = points.map((p) => p.accuracy)
  const minAcc = accVals.length > 0 ? Math.min(...accVals) : 0
  const maxAcc = accVals.length > 0 ? Math.max(...accVals) : 100
  const accPct = (acc) => (acc == null ? null : (maxAcc === minAcc ? 50 : ((acc - minAcc) / (maxAcc - minAcc)) * 100))

  const pathFor = (getY) => {
    let d = ''
    let started = false
    points.forEach((p, i) => {
      const y = getY(p)
      if (y == null) { started = false; return }
      d += `${started ? 'L' : 'M'} ${xAt(i)} ${100 - y} `
      started = true
    })
    return d.trim()
  }
  const accPath = showAcc ? pathFor((p) => accPct(p.accuracy)) : ''
  const spdPath = showSpd ? pathFor((p) => speedPct(p.avgTimeMs)) : ''

  const handleMove = (e) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const frac = rect.width > 0 ? Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) : 0
    const idx = n <= 1 ? 0 : Math.round(frac * (n - 1))
    setHover({ idx, xPct: frac * 100 })
  }

  const hp = hover ? points[hover.idx] : null

  // Attempt mode can have a lot of points, so ticks stay sparse (evenly
  // spaced, capped at CHART_TICK_COUNT). Date/session points are already
  // aggregated down to one-per-day or one-per-session, so there are far
  // fewer of them and each is individually meaningful — label as many as
  // fit, up to CHART_MAX_SESSION_TICKS.
  const ticks = xMode === 'attempt'
    ? evenTickIndices(n, CHART_TICK_COUNT).map((i) => ({ i, label: `#${points[i].attemptIndex}` }))
    : evenTickIndices(n, Math.min(n, CHART_MAX_SESSION_TICKS)).map((i) => ({ i, label: fmtDayLabel(points[i].ts) }))

  // Left axis: accuracy's real min/max range whenever accuracy is shown at
  // all (alone, or alongside speed) — matching the normalized line above,
  // not a fixed 0–100% scale; speed's own real-time scale only takes over
  // the left axis when it's the ONLY metric selected. When both are shown,
  // speed gets its own axis on the right instead.
  const leftAxis = (!showAcc && showSpd)
    ? ['Fastest', '', 'Slowest']
    : [`${Math.round(maxAcc)}%`, minAcc === maxAcc ? '' : `${Math.round((minAcc + maxAcc) / 2)}%`, `${Math.round(minAcc)}%`]

  return (
    <div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 34, height, flexShrink: 0, fontSize: 9, color: 'var(--muted)', opacity: 0.6, textAlign: 'right' }}>
          {leftAxis.map((l, i) => <span key={i}>{l}</span>)}
        </div>
        <div ref={containerRef} onMouseMove={handleMove} onMouseLeave={() => setHover(null)} style={{ flex: 1, position: 'relative', height, cursor: 'crosshair' }}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}>
            <line x1="0" y1="0" x2="100" y2="0" stroke="rgba(255,255,255,0.06)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
            <line x1="0" y1="100" x2="100" y2="100" stroke="rgba(255,255,255,0.15)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            {accPath && <path d={accPath} fill="none" stroke="var(--accent)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />}
            {spdPath && <path d={spdPath} fill="none" stroke="#ffd24a" strokeWidth="1.6" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />}
            {hp && <line x1={xAt(hover.idx)} y1="0" x2={xAt(hover.idx)} y2="100" stroke="rgba(255,255,255,0.25)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
          </svg>
          {/* A single-point series has no line segment to stroke (the path
              is just one "moveto", nothing to draw) — so with only one
              point, show it as a permanent dot rather than something only
              visible on hover, or it'd look like an empty chart despite
              genuinely having data. */}
          {n === 1 && showAcc && (
            <div style={{
              position: 'absolute', left: `${xAt(0)}%`, top: `${100 - accPct(points[0].accuracy)}%`, transform: 'translate(-50%, -50%)',
              width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 0 2px rgba(2,6,23,0.7)', pointerEvents: 'none'
            }} />
          )}
          {n === 1 && showSpd && points[0].avgTimeMs != null && (
            <div style={{
              position: 'absolute', left: `${xAt(0)}%`, top: `${100 - speedPct(points[0].avgTimeMs)}%`, transform: 'translate(-50%, -50%)',
              width: 7, height: 7, borderRadius: '50%', background: '#ffd24a', boxShadow: '0 0 0 2px rgba(2,6,23,0.7)', pointerEvents: 'none'
            }} />
          )}
          {/* Hover markers: plain circular divs, not SVG <circle> — see LineChart comment above. */}
          {hp && showAcc && (
            <div style={{
              position: 'absolute', left: `${xAt(hover.idx)}%`, top: `${100 - accPct(hp.accuracy)}%`, transform: 'translate(-50%, -50%)',
              width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 0 2px rgba(2,6,23,0.7)', pointerEvents: 'none'
            }} />
          )}
          {hp && showSpd && hp.avgTimeMs != null && (
            <div style={{
              position: 'absolute', left: `${xAt(hover.idx)}%`, top: `${100 - speedPct(hp.avgTimeMs)}%`, transform: 'translate(-50%, -50%)',
              width: 7, height: 7, borderRadius: '50%', background: '#ffd24a', boxShadow: '0 0 0 2px rgba(2,6,23,0.7)', pointerEvents: 'none'
            }} />
          )}
          {hp && (
            <div style={{
              position: 'absolute', top: 4, [hover.xPct > 65 ? 'right' : 'left']: `calc(${hover.xPct > 65 ? 100 - hover.xPct : hover.xPct}% + 8px)`,
              background: 'rgba(2,6,23,0.92)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '5px 8px',
              fontSize: 10, color: 'var(--muted)', lineHeight: 1.5, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 1
            }}>
              <div style={{ fontWeight: 700, color: 'inherit' }}>
                {xMode === 'attempt' ? `Attempt #${hp.attemptIndex}` : xMode === 'session' ? `Session · ${fmtDetailsTime(hp.ts)}` : fmtDayFull(hp.ts)}
              </div>
              {showAcc && (
                xMode === 'attempt'
                  ? <div style={{ color: hp.accuracy >= 100 ? 'var(--accent)' : '#f87171' }}>{hp.accuracy >= 100 ? '✓ Correct' : '✗ Miss'}</div>
                  : <div style={{ color: 'var(--accent)' }}>{Math.round(hp.accuracy)}% acc <span style={{ color: 'var(--muted)', opacity: 0.7 }}>({hp.windowAttempts} attempt{hp.windowAttempts === 1 ? '' : 's'})</span></div>
              )}
              {showSpd && (
                hp.avgTimeMs != null
                  ? <div style={{ color: '#ffd24a' }}>{xMode === 'attempt' ? fmtMs(hp.avgTimeMs) : `${fmtMs(hp.avgTimeMs)} avg`}</div>
                  : xMode === 'attempt' && <div style={{ color: 'var(--muted)', opacity: 0.7 }}>untimed</div>
              )}
            </div>
          )}
        </div>
        {dual && (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 34, height, flexShrink: 0, fontSize: 9, color: '#ffd24a', opacity: 0.8, textAlign: 'left' }}>
            <span>{fmtMs(minMs)}</span>
            <span />
            <span>{fmtMs(maxMs)}</span>
          </div>
        )}
      </div>
      <div style={{ position: 'relative', height: 12, marginTop: 3, marginLeft: 42, marginRight: dual ? 42 : 0 }}>
        {ticks.map((t) => (
          <span key={t.i} style={{ position: 'absolute', left: `${xAt(t.i)}%`, transform: 'translateX(-50%)', fontSize: 9, color: 'var(--muted)', opacity: 0.6, whiteSpace: 'nowrap' }}>{t.label}</span>
        ))}
      </div>
    </div>
  )
}

const dayKey = (ts) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// Compact date-only labels for chart axis ticks / tooltip titles in
// date/session mode — fmtDetailsTimeShort is time-of-day only, which reads
// as meaningless once each point represents a whole day or session rather
// than a single momentary attempt.
const fmtDayLabel = (ts) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const fmtDayFull = (ts) => new Date(ts).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

// Groups chronologically-sorted facts into buckets by a key function — one
// bucket per contiguous run of the same key. Days and sessions are both
// already contiguous once facts are sorted, so this is exact groupby, not
// an approximation.
function bucketFacts(facts, keyFn) {
  const buckets = []
  for (const f of facts) {
    const key = keyFn(f)
    const last = buckets[buckets.length - 1]
    if (last && last.key === key) last.facts.push(f)
    else buckets.push({ key, facts: [f] })
  }
  return buckets
}

// One point per BUCKET (an attempt, a day, or a session — whatever
// `buckets` represents), each averaged over a trailing window of
// `windowSize` buckets — not individual attempts within them, so "Window:
// 3" in Date mode means a rolling 3-day average, and in Session mode a
// rolling 3-session average. windowSize=1 is just that bucket's own raw
// stats, no smoothing across buckets. `buckets` must already be
// chronologically ordered.
function rollingBucketSeries(buckets, windowSize) {
  return buckets.map((b, i) => {
    const windowBuckets = buckets.slice(Math.max(0, i - windowSize + 1), i + 1)
    const windowFacts = windowBuckets.flatMap((wb) => wb.facts)
    const correct = windowFacts.filter((x) => x.correct).length
    const timedCorrect = windowFacts.filter((x) => x.correct && x.timeMs != null)
    const lastFact = b.facts[b.facts.length - 1]
    return {
      ts: lastFact.ts,
      bucketKey: b.key,
      bucketAttempts: b.facts.length,
      attemptIndex: i + 1,
      accuracy: windowFacts.length > 0 ? (correct / windowFacts.length) * 100 : 0,
      avgTimeMs: timedCorrect.length > 0 ? timedCorrect.reduce((s, x) => s + x.timeMs, 0) / timedCorrect.length : null,
      windowAttempts: windowFacts.length,
      windowBucketCount: windowBuckets.length
    }
  })
}

// One point per individual attempt, entirely raw — no window/averaging.
// This is the most granular view: each point is that one attempt's own
// 0%/100% and its own solve time (null if untimed). Trend-smoothing lives
// in Date/Session mode instead, where each point already pools many
// attempts (see rollingBucketSeries) — 'attempt' mode intentionally does
// not duplicate that smoothing over raw attempts.
function rawAttemptSeries(facts) {
  return facts.map((f, i) => ({
    ts: f.ts,
    bucketKey: f.id,
    bucketAttempts: 1,
    attemptIndex: i + 1,
    accuracy: f.correct ? 100 : 0,
    avgTimeMs: f.correct && f.timeMs != null ? f.timeMs : null,
    windowAttempts: 1,
    windowBucketCount: 1
  }))
}

// Plot accuracy/speed as a line — by individual attempt (raw), or rolled
// up and averaged by day/session — for the whole exercise or narrowed to
// ANY COMBINATION of tracked dimensions at once (chord type AND hand AND
// enabled-chords profile AND …, not just one at a time) — one dropdown per
// tracked field, same "Any X" pattern as the Details table's own filter
// row, so e.g. "accuracy by session, only Major 7th" or "speed by day,
// only when a specific chord-types profile was active" are both just
// picking values in the fields that matter and leaving the rest on "Any".
// Self-contained, like Explore.
function Progress({ exercise, filters, onFiltersChange }) {
  const fields = useMemo(() => getAvailableFields(exercise), [exercise])
  const fieldKeys = Object.keys(fields)
  const [xMode, setXMode] = useState('session') // 'attempt' | 'date' | 'session'
  const [metrics, setMetrics] = useState(['accuracy'])
  const [windowSize, setWindowSize] = useState(PROGRESS_DEFAULT_WINDOW)

  const allFacts = getFacts(exercise).sort((a, b) => a.ts - b.ts)
  if (allFacts.length === 0) return null

  const valuesFor = (fieldKey) => Array.from(new Set(allFacts.filter((f) => f.fields && f.fields[fieldKey]).map((f) => f.fields[fieldKey].label))).sort((a, b) => String(a).localeCompare(String(b)))
  const setFilter = (fieldKey, value) => onFiltersChange({ ...filters, [fieldKey]: value })

  // Every field with a chosen value ANDs together — a fact has to match
  // ALL of them, not just one, so combining e.g. Chord Type + Hand really
  // narrows to their intersection.
  const activeFilters = Object.entries(filters).filter(([, v]) => v)
  const filtered = activeFilters.length > 0
    ? allFacts.filter((f) => activeFilters.every(([k, v]) => f.fields && f.fields[k] && f.fields[k].label === v))
    : allFacts
  const filterSummary = activeFilters.map(([k, v]) => `${fields[k]}: ${v}`).join(' · ')

  // Attempt counts for one field's dropdown, given every OTHER active
  // filter (not this field's own) — a live, faceted count next to each
  // option showing exactly how many attempts that specific choice would
  // leave once combined with whatever else is already picked, same idea
  // as a shopping filter's per-option counts. Excludes this field's own
  // current selection from the base so every one of its options (including
  // "Any") reflects what picking it would actually change to.
  const countsFor = (fieldKey) => {
    const others = activeFilters.filter(([k]) => k !== fieldKey)
    const base = others.length > 0 ? allFacts.filter((f) => others.every(([k, v]) => f.fields && f.fields[k] && f.fields[k].label === v)) : allFacts
    const counts = {}
    for (const f of base) {
      const v = f.fields && f.fields[fieldKey] && f.fields[fieldKey].label
      if (v == null) continue
      counts[v] = (counts[v] || 0) + 1
    }
    return { counts, total: base.length }
  }

  // 'date'/'session' genuinely aggregate the filtered facts into one bucket
  // per calendar day / per practice session; 'attempt' skips bucketing
  // entirely and stays one point per raw fact.
  const buckets = xMode === 'date' ? bucketFacts(filtered, (f) => dayKey(f.ts))
    : xMode === 'session' ? bucketFacts(filtered, (f) => f.sessionId || '—')
    : null
  const series = xMode === 'attempt' ? rawAttemptSeries(filtered) : rollingBucketSeries(buckets, Math.max(1, windowSize))
  const bucketUnit = xMode === 'date' ? 'day' : 'session'

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Progress</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', opacity: 0.8, marginBottom: 10 }}>Accuracy/speed over attempts or time — raw per attempt, or rolled up and averaged per day/session — for everything, or narrowed to any combination of tracked dimensions at once.</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        {fieldKeys.map((k) => {
          const { counts, total } = countsFor(k)
          const options = [
            { value: '', label: `Any ${fields[k]}`, count: total },
            ...valuesFor(k).map((v) => ({ value: v, label: v, count: counts[v] || 0 }))
          ]
          return (
            <FacetedDropdown
              key={k}
              value={filters[k] || ''}
              placeholder={`Any ${fields[k]}`}
              options={options}
              onChange={(v) => setFilter(k, v)}
              title={filters[k] || `Any ${fields[k]}`}
            />
          )
        })}
        {activeFilters.length > 0 && (
          <button className="play-cat-btn" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => onFiltersChange({})}>Clear filters</button>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <select value={xMode} onChange={(e) => setXMode(e.target.value)} title={xMode === 'attempt' ? 'By Attempt' : xMode === 'date' ? 'By Date' : 'By Session'} style={selectStyle}>
          <option value="attempt" style={optionStyle}>By Attempt</option>
          <option value="date" style={optionStyle}>By Date</option>
          <option value="session" style={optionStyle}>By Session</option>
        </select>
        <MetricToggle metrics={metrics} onChange={setMetrics} />
        {xMode !== 'attempt' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)' }}>
            Window
            <input type="number" min={1} max={Math.max(1, buckets.length)} value={windowSize} onChange={(e) => setWindowSize(Number(e.target.value) || 1)} style={{ ...numberInputStyle, width: 40 }} />
            {bucketUnit}s
          </label>
        )}
      </div>
      <LineChart points={series} metrics={metrics} xMode={xMode} />
      <div style={{ fontSize: 10, color: 'var(--muted)', opacity: 0.6, marginTop: 4 }}>
        {xMode === 'attempt'
          ? <>{filtered.length} attempt{filtered.length === 1 ? '' : 's'}{filterSummary ? ` · ${filterSummary}` : ''} · each point is one raw attempt</>
          : <>{buckets.length} {bucketUnit}{buckets.length === 1 ? '' : 's'}{filterSummary ? ` · ${filterSummary}` : ''} · each point is the trailing {windowSize}-{bucketUnit} average ({filtered.length} attempt{filtered.length === 1 ? '' : 's'} total)</>}
      </div>
    </div>
  )
}

const thStyle = { padding: '4px 8px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.06)' }
const tdStyle = { padding: '4px 8px', whiteSpace: 'nowrap' }
const DETAILS_SESSIONS_PAGE = 3
const DETAILS_ROWS_PAGE = 25

const fmtDetailsTime = (ts) => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const fmtDetailsTimeShort = (ts) => new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

// Sortable value for one fact + column — used by SessionTable below. Null/
// missing values (untimed speed, no attempt number, a field this fact
// doesn't carry) always sort to the end regardless of direction, same
// convention as the breakdown lists' own avgTimeMs sort.
function detailsSortValue(f, sortKey) {
  switch (sortKey) {
    case 'ts': return f.ts
    case 'prompt': return f.promptLabel || f.promptKey || ''
    case 'result': return f.correct ? (f.promptLabel || '') : (f.playedLabel || 'Wrong')
    case 'timeMs': return f.timeMs
    case 'attemptNumber': return f.attemptNumber
    default: return f.fields && f.fields[sortKey] ? f.fields[sortKey].label : null
  }
}

function sortDetailsFacts(facts, sortKey, sortDir) {
  const dir = sortDir === 'asc' ? 1 : -1
  return [...facts].sort((a, b) => {
    const av = detailsSortValue(a, sortKey)
    const bv = detailsSortValue(b, sortKey)
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    if (typeof av === 'string') return av.localeCompare(bv) * dir
    return (av - bv) * dir
  })
}

// Display string for one fact + column — what's actually shown in the
// cell, and (for every column except Speed, which gets its own min/max
// range instead) exactly the value its dropdown filter matches against.
function detailsDisplayValue(f, key) {
  switch (key) {
    case 'ts': return fmtDetailsTime(f.ts)
    case 'prompt': return f.promptLabel || f.promptKey || '—'
    case 'result': return f.correct ? (f.promptLabel || '—') : (f.playedLabel || 'Wrong')
    case 'attemptNumber': return f.attemptNumber ?? '—'
    default: return f.fields && f.fields[key] ? f.fields[key].label : '—'
  }
}

const numberInputStyle = { width: 46, fontSize: 9, padding: '2px 3px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'inherit', textAlign: 'center' }

// Result cell: a correct attempt just shows the target chord in green. An
// incorrect one shows every DISTINCT wrong shape actually held during that
// round, in order, each in red — and, when the round's FINAL held shape
// was actually the right one (a fumble that got there eventually, not a
// wrong inversion that itself is what ended the round), the target chord
// appended in green too — so "C, Cm, C#m" reads as the whole attempt
// instead of only its first mistake. Facts recorded before multi-shape
// tracking existed only carry the old flat `playedLabel` string — shown as
// a single red segment, same as before.
function ResultCell({ f }) {
  if (f.correct) return <span style={{ color: 'var(--accent)' }}>{f.promptLabel || '—'}</span>
  const wrongs = (f.wrongLabels && f.wrongLabels.length > 0) ? f.wrongLabels : [f.playedLabel || 'Wrong']
  return (
    <>
      {wrongs.map((w, i) => (
        <span key={i} style={{ color: '#ff8a80' }}>{i > 0 ? ', ' : ''}{w}</span>
      ))}
      {f.endedCorrect && f.promptLabel && <span style={{ color: 'var(--accent)' }}>, {f.promptLabel}</span>}
    </>
  )
}

// One session's own table (its date range/attempts/accuracy header is
// rendered by Details, which also owns whether this is showing at all) —
// sorting AND filtering are both scoped to just this session (its own
// local state), not shared across the whole Details view, so touching one
// session's controls never reorders or hides rows in another.
function SessionTable({ session, fieldKeysSeen, fieldLabels, onDelete }) {
  const [sortKey, setSortKey] = useState('ts')
  const [sortDir, setSortDir] = useState('desc')
  // { [columnKey]: selectedDisplayValue } — every column except Speed,
  // which is sort-only (its real values are continuous milliseconds, not a
  // short list of repeatable options an "All"-dropdown would suit).
  const [filters, setFilters] = useState({})
  const [visibleRows, setVisibleRows] = useState(DETAILS_ROWS_PAGE)

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(key === 'ts' || key === 'timeMs' ? 'desc' : 'asc') }
  }
  const indicator = (key) => (sortKey === key ? <span className="sort-indicator">{sortDir === 'asc' ? '▲' : '▼'}</span> : null)
  const sortableTh = (key, label) => (
    <button className={`sortable-header ${sortKey === key ? 'active' : ''}`} onClick={() => toggleSort(key)} style={headerBtnStyle(null)}>{label} {indicator(key)}</button>
  )

  const dropdownColumns = ['ts', 'prompt', 'result', 'attemptNumber', ...fieldKeysSeen]
  const distinctValuesFor = (key) => Array.from(new Set(session.facts.map((f) => detailsDisplayValue(f, key)))).sort((a, b) => String(a).localeCompare(String(b)))

  const filtered = session.facts.filter((f) => dropdownColumns.every((col) => !filters[col] || detailsDisplayValue(f, col) === filters[col]))
  const sorted = sortDetailsFacts(filtered, sortKey, sortDir)
  const anyFilterActive = Object.values(filters).some(Boolean)
  const clearFilters = () => setFilters({})
  const visible = sorted.slice(0, visibleRows)
  const remainingRows = sorted.length - visible.length

  return (
    <div>
      {anyFilterActive && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>showing {sorted.length} of {session.attempts}</div>
          <button className="play-cat-btn" style={{ padding: '2px 8px', fontSize: 10 }} onClick={clearFilters}>Clear filters</button>
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
          <thead>
            <tr>
              <th style={thStyle}>{sortableTh('ts', 'Time')}</th>
              <th style={thStyle}>{sortableTh('prompt', 'Prompt')}</th>
              <th style={thStyle}>{sortableTh('result', 'Result')}</th>
              <th style={thStyle}>{sortableTh('timeMs', 'Speed')}</th>
              <th style={thStyle}>{sortableTh('attemptNumber', '#')}</th>
              {fieldKeysSeen.map((k) => <th key={k} style={thStyle}>{sortableTh(k, fieldLabels[k] || capitalize(k))}</th>)}
              <th style={thStyle} />
            </tr>
            {/* Filter row — a plain "All"-or-one-value dropdown per column,
                except Speed, which has no filter here (sort the Speed
                header instead — its real values are continuous
                milliseconds, not a short list of repeats an "All" dropdown
                would suit). */}
            <tr>
              {['ts', 'prompt', 'result'].map((col) => (
                <th key={col} style={{ ...thStyle, borderBottom: 'none', paddingTop: 2, paddingBottom: 4 }}>
                  <select value={filters[col] || ''} onChange={(e) => setFilters((f) => ({ ...f, [col]: e.target.value || undefined }))} title={filters[col] || 'All'} style={{ ...selectStyle, fontSize: 10, padding: '2px 4px', width: '100%' }}>
                    <option value="" style={optionStyle}>All</option>
                    {distinctValuesFor(col).map((v) => <option key={v} value={v} style={optionStyle}>{v}</option>)}
                  </select>
                </th>
              ))}
              <th style={{ ...thStyle, borderBottom: 'none' }} />
              <th style={{ ...thStyle, borderBottom: 'none', paddingTop: 2, paddingBottom: 4 }}>
                <select value={filters.attemptNumber || ''} onChange={(e) => setFilters((f) => ({ ...f, attemptNumber: e.target.value || undefined }))} title={filters.attemptNumber || 'All'} style={{ ...selectStyle, fontSize: 10, padding: '2px 4px', width: '100%' }}>
                  <option value="" style={optionStyle}>All</option>
                  {distinctValuesFor('attemptNumber').map((v) => <option key={v} value={v} style={optionStyle}>{v}</option>)}
                </select>
              </th>
              {fieldKeysSeen.map((k) => (
                <th key={k} style={{ ...thStyle, borderBottom: 'none', paddingTop: 2, paddingBottom: 4 }}>
                  <select value={filters[k] || ''} onChange={(e) => setFilters((f) => ({ ...f, [k]: e.target.value || undefined }))} title={filters[k] || 'All'} style={{ ...selectStyle, fontSize: 10, padding: '2px 4px', width: '100%' }}>
                    <option value="" style={optionStyle}>All</option>
                    {distinctValuesFor(k).map((v) => <option key={v} value={v} style={optionStyle}>{v}</option>)}
                  </select>
                </th>
              ))}
              <th style={{ ...thStyle, borderBottom: 'none' }} />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan={6 + fieldKeysSeen.length} style={{ ...tdStyle, textAlign: 'center', color: 'var(--muted)', opacity: 0.7 }}>No attempts match these filters</td></tr>
            ) : visible.map((f, i) => (
              <tr key={f.id} style={{ background: i % 2 === 1 ? 'rgba(255,255,255,0.03)' : 'transparent' }}>
                <td style={tdStyle}>{fmtDetailsTime(f.ts)}</td>
                <td style={tdStyle}>{f.promptLabel || f.promptKey || '—'}</td>
                <td style={{ ...tdStyle, fontWeight: 700 }}><ResultCell f={f} /></td>
                <td style={tdStyle}>{fmtMs(f.timeMs)}</td>
                <td style={tdStyle}>{f.attemptNumber ?? '—'}</td>
                {fieldKeysSeen.map((k) => <td key={k} style={tdStyle}>{f.fields && f.fields[k] ? f.fields[k].label : '—'}</td>)}
                <td style={tdStyle}>
                  <button
                    onClick={() => onDelete(f)}
                    title="Delete this attempt from all tracking"
                    style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13, padding: '2px 6px', lineHeight: 1 }}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {remainingRows > 0 && (
        <button className="play-cat-btn" style={{ marginTop: 6, fontSize: 11 }} onClick={() => setVisibleRows((n) => n + DETAILS_ROWS_PAGE)}>
          Load {Math.min(DETAILS_ROWS_PAGE, remainingRows)} more
        </button>
      )}
    </div>
  )
}

// The raw underlying record, session by session — shown by default (still
// behind a toggle to hide it, for anyone who'd rather just see the
// summarized breakdowns above), so it's there right away for checking that
// a specific attempt actually got captured (and, for auto-tracking,
// whether it was excluded
// from speed as a detected idle gap — that shows up here as a correct
// Result with a "—" Speed, rather than being invisible). Result shows the
// same chord-name styling as Prompt: the target's own name in green when
// correct, or whatever was actually played in red when not — not just a
// ✓/✗. Each row can be deleted, reversing its contribution everywhere
// (lifetime buckets, the trend/streak event log, the one transition it
// counted toward, and renumbering later attempts on the same prompt) via
// practiceStats' deleteFact — not just removed from this list. A
// "session" is just a maximal run of consecutive facts (once sorted
// newest-first) sharing the same sessionId — real session boundaries only
// ever happen at a detected idle gap, so contiguous-in-time already means
// contiguous-in-session.
function Details({ exercise, onChange = () => {} }) {
  const [open, setOpen] = useState(true)
  const [visibleSessions, setVisibleSessions] = useState(DETAILS_SESSIONS_PAGE)
  // Which sessions have been explicitly clicked away from their default
  // state — the most recent session (index 0) defaults open, every other
  // one defaults collapsed, so this only needs to track deviations from
  // that rather than every session's state individually.
  const [toggledSessions, setToggledSessions] = useState(new Set())

  if (!open) {
    return <div style={{ marginBottom: 24 }}><button className="play-cat-btn" onClick={() => setOpen(true)}>Show Details</button></div>
  }

  const isSessionOpen = (key, idx) => {
    const defaultOpen = idx === 0
    return toggledSessions.has(key) ? !defaultOpen : defaultOpen
  }
  const toggleSession = (key) => {
    setToggledSessions((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const handleDelete = (f) => {
    const label = f.correct ? f.promptLabel : (f.playedLabel || f.promptLabel || 'this attempt')
    if (!window.confirm(`Delete this attempt (${label})? This removes it from every stat it counted toward — can't be undone.`)) return
    deleteFact(exercise, f.id)
    onChange()
  }

  // Deletes every attempt in a session, one at a time via deleteFact — same
  // reversal (lifetime buckets, events, transitions, attemptNumber
  // resequencing) as a single-attempt delete, just applied to the whole
  // batch. Facts are looked up by id inside deleteFact, so deleting them
  // one by one is safe even though each call shifts the underlying array.
  const handleDeleteSession = (s) => {
    if (!window.confirm(`Delete this entire session (${s.attempts} attempt${s.attempts === 1 ? '' : 's'})? This removes every attempt in it from all tracking — can't be undone.`)) return
    for (const f of s.facts) deleteFact(exercise, f.id)
    onChange()
  }

  const facts = getFacts(exercise).sort((a, b) => b.ts - a.ts)
  const fieldKeysSeen = Array.from(new Set(facts.flatMap((f) => Object.keys(f.fields || {}))))
  // Column headers show each field's own human dimension name (e.g. "Chord
  // Types Enabled"), not the raw storage key (e.g. "chordTypesProfile") —
  // read off whichever fact happens to carry that field, since the
  // dimension is only stored per-value, not declared anywhere globally.
  const fieldLabels = Object.fromEntries(fieldKeysSeen.map((k) => {
    const withField = facts.find((f) => f.fields && f.fields[k])
    return [k, (withField && withField.fields[k].dimension) || capitalize(k)]
  }))

  const sessions = []
  for (const f of facts) {
    const last = sessions[sessions.length - 1]
    if (last && last.sessionId === f.sessionId) last.facts.push(f)
    else sessions.push({ sessionId: f.sessionId, facts: [f] })
  }
  for (const s of sessions) {
    s.correct = s.facts.filter((f) => f.correct).length
    s.attempts = s.facts.length
    s.accuracy = s.attempts > 0 ? (s.correct / s.attempts) * 100 : 0
    s.start = s.facts[s.facts.length - 1].ts
    s.end = s.facts[0].ts
  }
  const shown = sessions.slice(0, visibleSessions)
  const remaining = sessions.length - shown.length

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          Details <span style={{ fontWeight: 400, color: 'var(--muted)', opacity: 0.7 }}>({facts.length} recorded {facts.length === 1 ? 'attempt' : 'attempts'} across {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'})</span>
        </div>
        <button className="play-cat-btn" onClick={() => setOpen(false)}>Hide Details</button>
      </div>

      {facts.length === 0 ? (
        <div className="muted" style={{ padding: 8 }}>No data yet</div>
      ) : (
        <>
          {shown.map((s, idx) => {
            const key = s.sessionId || s.start
            const isOpen = isSessionOpen(key, idx)
            return (
              <div key={key} style={{ marginBottom: 16, padding: 8, borderRadius: 6, background: idx % 2 === 1 ? 'rgba(255,255,255,0.03)' : 'transparent' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: isOpen ? 4 : 0 }}>
                  <div
                    onClick={() => toggleSession(key)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1, minWidth: 0 }}
                  >
                    <span style={{ display: 'inline-block', width: 12, opacity: 0.6, fontSize: 11 }}>{isOpen ? '▾' : '▸'}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {fmtDetailsTime(s.start)}{s.end !== s.start ? ` – ${fmtDetailsTimeShort(s.end)}` : ''} · {s.attempts} attempt{s.attempts === 1 ? '' : 's'} · {Math.round(s.accuracy)}% accuracy
                    </span>
                  </div>
                  <button
                    onClick={() => handleDeleteSession(s)}
                    title="Delete this entire session from all tracking"
                    style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13, padding: '2px 6px', lineHeight: 1, flexShrink: 0 }}
                  >
                    ✕
                  </button>
                </div>
                {isOpen && <SessionTable session={s} fieldKeysSeen={fieldKeysSeen} fieldLabels={fieldLabels} onDelete={handleDelete} />}
              </div>
            )
          })}
          {remaining > 0 && (
            <button className="play-cat-btn" onClick={() => setVisibleSessions((n) => n + DETAILS_SESSIONS_PAGE)}>
              Show {Math.min(DETAILS_SESSIONS_PAGE, remaining)} more session{Math.min(DETAILS_SESSIONS_PAGE, remaining) === 1 ? '' : 's'}
            </button>
          )}
        </>
      )}
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
  // Which metric each Breakdown section's rows are sorted/displayed by —
  // keyed per section id so switching one section (e.g. Hand) to Speed
  // doesn't affect any other (Root stays on whatever it had). Defaults to
  // weakest-accuracy-first, matching the original single global default.
  const DEFAULT_SECTION_SORT = { key: 'accuracy', dir: 'asc' }
  const [sectionSort, setSectionSort] = useState({})
  const sortForSection = (id) => sectionSort[id] || DEFAULT_SECTION_SORT
  const toggleSectionSort = (id, key) => {
    setSectionSort((prev) => {
      const cur = prev[id] || DEFAULT_SECTION_SORT
      if (cur.key === key) return { ...prev, [id]: { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } }
      return { ...prev, [id]: { key, dir: key === 'accuracy' || key === 'avgTimeMs' ? 'asc' : 'desc' } }
    })
  }
  const sectionSortIndicator = (id, key) => {
    const s = sortForSection(id)
    return s.key === key ? <span className="sort-indicator">{s.dir === 'asc' ? '▲' : '▼'}</span> : null
  }
  // Which item's own numbers the KPI header reflects — set by clicking a
  // Breakdown row.
  const [selectedKey, setSelectedKey] = useState(null)
  // Keyed by section id (a dimension name like 'Chord Type') — each
  // breakdown section's "show all" independently, since they're all shown
  // at once, not one-at-a-time behind a tab.
  const [expandedSections, setExpandedSections] = useState({})
  // Bumped on Reset so the memoized reads below re-run against the cleared store.
  const [refreshSeq, setRefreshSeq] = useState(0)
  // Trend chart's own Accuracy/Speed selection — separate from Explore's,
  // since they're different charts a viewer may want set differently.
  const [trendMetrics, setTrendMetrics] = useState(['accuracy'])
  // Progress's own filter selections, lifted up here so Breakdown can react
  // to them too — { [fieldKey]: selectedLabel }. Progress remains the only
  // thing that WRITES to this; Breakdown just reads it.
  const [progressFilters, setProgressFilters] = useState({})

  const trend = useMemo(() => (open ? getDailyTrend(exercise, TREND_DAYS) : []), [open, exercise, refreshSeq])
  const streak = useMemo(() => (open ? getStreak(exercise) : null), [open, exercise, refreshSeq])
  const overall = useMemo(() => (open ? getOverallStats(exercise) : null), [open, exercise, refreshSeq])

  // Escape closes the modal, same as the Close button or clicking the
  // backdrop outside it.
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  // Breakdown — one section per tracked dimension, live-computed from
  // whichever attempts match Progress's current filters (all of them,
  // ANDed — the exact same subset Progress itself is charting), grouped by
  // that dimension's own value. No filter of its own here: picking Root=C
  // in Progress already means every fact reaching this point has Root=C,
  // so the Root section naturally collapses to that one row instead of
  // needing a separate toggle to hide the other 11 — "reactive" rather
  // than a second, independent filtering UI to keep in sync.
  const breakdownFields = getAvailableFields(exercise)
  const activeProgressFilters = Object.entries(progressFilters).filter(([, v]) => v)
  const breakdownFacts = activeProgressFilters.length > 0
    ? getFacts(exercise).filter((f) => activeProgressFilters.every(([k, v]) => f.fields && f.fields[k] && f.fields[k].label === v))
    : getFacts(exercise)
  const breakdownSections = Object.entries(breakdownFields).map(([fieldKey, dimensionLabel]) => {
    const groups = {}
    for (const f of breakdownFacts) {
      const v = f.fields && f.fields[fieldKey]
      if (!v || v.value == null) continue
      if (!groups[v.value]) groups[v.value] = { key: `${fieldKey}:${v.value}`, label: v.label, attempts: 0, correct: 0, totalTimeMs: 0 }
      const g = groups[v.value]
      g.attempts += 1
      if (f.correct) g.correct += 1
      if (f.correct && typeof f.timeMs === 'number') g.totalTimeMs += f.timeMs
    }
    const rows = Object.values(groups).map((g) => ({
      ...g,
      accuracy: g.attempts > 0 ? (g.correct / g.attempts) * 100 : 0,
      avgTimeMs: g.correct > 0 ? g.totalTimeMs / g.correct : null
    }))
    return { id: dimensionLabel, title: dimensionLabel, rows }
  }).filter((sec) => sec.rows.length > 0)
  const allBreakdownRows = breakdownSections.flatMap((s) => s.rows)
  const rowByKey = (key) => allBreakdownRows.find((r) => r.key === key) || null
  const breakdownFilterSummary = activeProgressFilters.map(([k, v]) => `${breakdownFields[k]}: ${v}`).join(' · ')

  const isExpanded = (id) => !!expandedSections[id]
  const toggleExpanded = (id) => setExpandedSections((s) => ({ ...s, [id]: !s[id] }))

  const handleReset = () => {
    if (!window.confirm(`Reset all ${title} stats? This clears every recorded attempt, streak, and trend — it can't be undone.`)) return
    resetLifetimeStats(exercise)
    setSelectedKey(null)
    setRefreshSeq((n) => n + 1)
  }

  const maxAttemptsInTrend = Math.max(1, ...trend.map((t) => t.attempts))
  // Speed's relative fast/slow scale for the trend window — only days with
  // any timed (correct) attempts count toward it.
  const trendTimedMs = trend.map((t) => t.avgTimeMs).filter((ms) => ms != null)
  const trendMinMs = trendTimedMs.length > 0 ? Math.min(...trendTimedMs) : 0
  const trendMaxMs = trendTimedMs.length > 0 ? Math.max(...trendTimedMs) : 0
  // One value-label line per day, precomputed so the JSX below doesn't
  // have to inline a metric-dependent formula — only shown when exactly
  // one metric is active (with both, the bars themselves carry the detail
  // and a per-day label for each would be too cramped to read).
  const trendLabel = (t) => {
    if (trendMetrics.length !== 1 || t.attempts === 0) return null
    if (trendMetrics[0] === 'speed') return t.avgTimeMs == null ? null : fmtMs(t.avgTimeMs)
    return `${Math.round(t.accuracy)}%`
  }
  const trendLabelPct = (t) => {
    if (trendMetrics[0] === 'speed') {
      if (t.avgTimeMs == null) return 0
      return trendMaxMs === trendMinMs ? 50 : 100 - ((t.avgTimeMs - trendMinMs) / (trendMaxMs - trendMinMs)) * 100
    }
    return t.accuracy || 0
  }

  // KPI cards reflect the current selection, if any — a live dashboard
  // rather than one fixed set of exercise-wide numbers.
  const selected = selectedKey ? rowByKey(selectedKey) : null
  const kpiSource = selected ? { attempts: selected.attempts, correct: selected.correct, accuracy: selected.accuracy, avgTimeMs: selected.avgTimeMs } : overall

  // One compact row (label, inline bar, attempts, speed) — click toggles
  // it as the KPI header's source. Which metric the bar/primary-stat show
  // is driven by this row's own section's sort choice (secId) — Accuracy
  // and Speed are a toggle, not independent: whichever one you last
  // clicked (in THIS section only) is both the sort basis and what the
  // bars mean, so switching to Speed re-orders weakest/slowest-first the
  // same way Accuracy already did.
  const renderRow = (row, secId, speedRange) => {
    const isSelected = selectedKey === row.key
    const metric = sortForSection(secId).key === 'avgTimeMs' ? 'speed' : 'accuracy'
    const barPct = metric === 'speed' ? speedRangePct(row.avgTimeMs, speedRange) : Math.max(3, row.accuracy)
    const barColor = metric === 'speed' ? speedColor(row.avgTimeMs, speedRange.min, speedRange.max) : accuracyColor(row.accuracy)
    return (
      <div
        key={row.key}
        onClick={() => setSelectedKey((k) => (k === row.key ? null : row.key))}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px',
          cursor: 'pointer', borderRadius: 6,
          background: isSelected ? 'rgba(110,231,183,0.10)' : 'transparent'
        }}
      >
        <div style={{ width: 130, flexShrink: 0, fontSize: 13, fontWeight: isSelected ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.label}>{row.label}</div>
        <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', minWidth: 40 }}>
          <div style={{ width: `${Math.max(3, barPct)}%`, height: '100%', background: barColor }} />
        </div>
        {metric === 'speed' ? (
          <>
            <div style={{ width: 82, fontSize: 12, color: 'var(--muted)', textAlign: 'right', flexShrink: 0 }}>{fmtMs(row.avgTimeMs)} ({row.correct}/{row.attempts})</div>
            <div style={{ width: 60, fontSize: 12, color: 'var(--muted)', textAlign: 'right', flexShrink: 0 }}>{Math.round(row.accuracy)}%</div>
          </>
        ) : (
          <>
            <div style={{ width: 82, fontSize: 12, color: 'var(--muted)', textAlign: 'right', flexShrink: 0 }}>{Math.round(row.accuracy)}% ({row.correct}/{row.attempts})</div>
            <div style={{ width: 60, fontSize: 12, color: 'var(--muted)', textAlign: 'right', flexShrink: 0 }}>{fmtMs(row.avgTimeMs)}</div>
          </>
        )}
      </div>
    )
  }

  return (
    <>
      {/* A separate sibling, not a wrapper — the modal box sits above it
          (higher z-index) and only covers its own centered area, so a
          click anywhere outside that box hits this backdrop underneath
          and closes the modal, while a click inside the box never reaches
          it at all (it's the topmost element there), no stopPropagation
          needed. */}
      <div className="stats-modal-backdrop" onClick={onClose} />
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{trendMetrics.includes('accuracy') && trendMetrics.includes('speed') ? 'Accuracy & Speed' : trendMetrics.includes('speed') ? 'Speed' : 'Accuracy'} — last {TREND_DAYS} days</div>
          <MetricToggle metrics={trendMetrics} onChange={setTrendMetrics} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Y-axis — without it, a chart of mostly-empty days (no attempts
              that day) reads as ambiguous: is a tall bar 100% or just "some"?
              Reads "taller = better" for both metrics when both are shown —
              speed's own scale is relative to the fastest/slowest day in
              this window, not an absolute time, so a shared 0–100% axis
              still applies to both. */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 28, height: TREND_HEIGHT, paddingTop: TREND_LABEL_SPACE, flexShrink: 0, fontSize: 9, color: 'var(--muted)', opacity: 0.6, textAlign: 'right' }}>
            {trendMetrics.length === 1 && trendMetrics[0] === 'speed' ? (
              <>
                <span>Fastest</span>
                <span />
                <span>Slowest</span>
              </>
            ) : (
              <>
                <span>100%</span>
                <span>50%</span>
                <span>0%</span>
              </>
            )}
          </div>
          <div style={{ flex: 1, position: 'relative', height: TREND_HEIGHT }}>
            <div style={{ position: 'absolute', top: TREND_LABEL_SPACE, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' }}>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />
              <div style={{ borderTop: '1px dashed rgba(255,255,255,0.08)' }} />
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: '100%', position: 'relative' }}>
              {trend.map((t) => (
                <div
                  key={t.date}
                  title={`${t.date}: ${t.attempts} attempt${t.attempts === 1 ? '' : 's'}${t.accuracy != null ? `, ${Math.round(t.accuracy)}%` : ''}${t.avgTimeMs != null ? `, ${fmtMs(t.avgTimeMs)} avg` : ''}`}
                  style={{ flex: 1, height: `calc(100% - ${TREND_LABEL_SPACE}px)`, display: 'flex', alignItems: 'flex-end', position: 'relative' }}
                >
                  {trendLabel(t) != null && (
                    <div style={{ position: 'absolute', bottom: `calc(${Math.max(6, trendLabelPct(t))}% + 2px)`, left: '50%', transform: 'translateX(-50%)', fontSize: 8, color: 'var(--muted)', opacity: 0.8, whiteSpace: 'nowrap' }}>
                      {trendLabel(t)}
                    </div>
                  )}
                  {t.attempts === 0 ? (
                    <div style={{ width: '100%', height: '2px', background: 'rgba(255,255,255,0.12)', borderRadius: 2 }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', opacity: Math.max(0.4, t.attempts / maxAttemptsInTrend) }}>
                      <MetricBars metrics={trendMetrics} accuracy={t.accuracy || 0} avgTimeMs={t.avgTimeMs} minMs={trendMinMs} maxMs={trendMaxMs} />
                    </div>
                  )}
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

      <Explore exercise={exercise} key={exercise} />

      <Progress exercise={exercise} key={`progress-${exercise}`} filters={progressFilters} onFiltersChange={setProgressFilters} />

      {/* Breakdown — one section per dimension (Chord Type, Root, …), live-
          computed from whichever attempts match Progress's filters above
          (all of them, at once) — so picking a specific root up there
          naturally leaves the Root section showing just that one row, Hand
          showing just the two hands' split WITHIN that root, and so on, no
          separate toggle needed here to narrow it further. Laid out as a
          fixed 2-column grid (never 3+ across, however many sections have
          data) — e.g. Chord Type + Root fill the first row, Hand + Interval
          the next. */}
      {breakdownSections.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Breakdown</div>
          {breakdownFilterSummary && <div style={{ fontSize: 11, color: 'var(--muted)', opacity: 0.8, marginTop: 2 }}>Filtered to {breakdownFilterSummary} (from Progress above)</div>}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: breakdownSections.length > 1 ? 'repeat(2, minmax(0, 1fr))' : '1fr', gap: 24, marginBottom: 24 }}>
        {breakdownSections.map((sec) => {
          const { key: secSortKey, dir: secSortDir } = sortForSection(sec.id)
          const sorted = sortRows(sec.rows, secSortKey, secSortDir)
          const expanded = isExpanded(sec.id)
          const visible = expanded ? sorted : sorted.slice(0, COLLAPSED_ROWS)
          // Accuracy/Speed here are a toggle, not independent sorts —
          // clicking one switches both what the bars mean and how rows
          // are ordered for THIS section only (see renderRow). Relative
          // speed range is likewise scoped to this section's own rows,
          // same as accuracy's own natural 0–100% scale.
          const secTimedMs = sec.rows.map((r) => r.avgTimeMs).filter((ms) => ms != null)
          const speedRange = { min: secTimedMs.length > 0 ? Math.min(...secTimedMs) : 0, max: secTimedMs.length > 0 ? Math.max(...secTimedMs) : 0 }
          return (
            <div key={sec.id}>
              {sec.title && <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{sec.title}</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px', marginBottom: 4, fontSize: 11, color: 'var(--muted)' }}>
                <button className={`sortable-header ${secSortKey === 'label' ? 'active' : ''}`} onClick={() => toggleSectionSort(sec.id, 'label')} style={headerBtnStyle(130)}>Item {sectionSortIndicator(sec.id, 'label')}</button>
                <div style={{ flex: 1 }} />
                {/* Accuracy/Speed are a toggle, not independent sorts — whichever's
                    active controls both the bars' meaning and the sort order for
                    this section only (see renderRow above). */}
                <button className={`sortable-header ${secSortKey === 'accuracy' ? 'active' : ''}`} onClick={() => toggleSectionSort(sec.id, 'accuracy')} style={headerBtnStyle(70)}>Accuracy {sectionSortIndicator(sec.id, 'accuracy')}</button>
                <button className={`sortable-header ${secSortKey === 'avgTimeMs' ? 'active' : ''}`} onClick={() => toggleSectionSort(sec.id, 'avgTimeMs')} style={headerBtnStyle(60)}>Speed {sectionSortIndicator(sec.id, 'avgTimeMs')}</button>
              </div>

              {sorted.length === 0 ? (
                <div className="muted" style={{ padding: 8 }}>No data yet</div>
              ) : (
                <div>{visible.map((r) => renderRow(r, sec.id, speedRange))}</div>
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

      <Details exercise={exercise} key={exercise} onChange={() => setRefreshSeq((n) => n + 1)} />
      </div>
    </>
  )
}

function headerBtnStyle(width) {
  return {
    background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', font: 'inherit',
    padding: 0, textAlign: width ? 'right' : 'left', width: width || undefined
  }
}
