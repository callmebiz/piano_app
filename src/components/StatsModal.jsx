import React, { useEffect, useMemo, useState } from 'react'
import { getLifetimeStats, resetLifetimeStats, getDailyTrend, getStreak, getTransitions, getOverallStats, getAvailableFields, crossTab, getFacts } from '../lib/practiceStats'

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

const selectStyle = {
  background: 'rgba(255,255,255,0.04)', color: 'inherit', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 6, padding: '5px 8px', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer'
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
              <th key={b.value} style={{ padding: '4px 6px', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{b.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {aVals.map((a) => (
            <tr key={a.value}>
              <td style={{ padding: '4px 8px', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{a.label}</td>
              {bVals.map((b) => {
                const c = cellFor(a.value, b.value)
                const tooltip = c ? `${a.label} · ${b.label}: ${Math.round(c.accuracy)}% (${c.correct}/${c.attempts}), ${fmtMs(c.avgTimeMs)} avg` : null
                return (
                  <td key={b.value} style={{ padding: 2 }}>
                    {!c ? (
                      <div style={{ width: 44, height: 28, borderRadius: 4, background: 'rgba(255,255,255,0.02)' }} />
                    ) : dual ? (
                      <div
                        onClick={() => onSelect(c.key)}
                        title={tooltip}
                        style={{
                          width: 44, height: 28, padding: 2, borderRadius: 4, cursor: 'pointer',
                          background: 'rgba(255,255,255,0.03)', opacity: Math.max(0.35, c.attempts / maxAttempts),
                          outline: selectedKey === c.key ? '2px solid var(--accent)' : 'none', outlineOffset: 1
                        }}
                      >
                        <MetricBars metrics={metrics} accuracy={c.accuracy} avgTimeMs={c.avgTimeMs} minMs={minMs} maxMs={maxMs} />
                      </div>
                    ) : (
                      <div
                        onClick={() => onSelect(c.key)}
                        title={tooltip}
                        style={{
                          width: 44, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: singleMetric === 'speed' ? speedColor(c.avgTimeMs, minMs, maxMs) : accuracyColor(c.accuracy),
                          opacity: Math.max(0.35, c.attempts / maxAttempts),
                          color: '#071025', fontWeight: 700, fontSize: singleMetric === 'speed' ? 10 : 11, borderRadius: 4, cursor: 'pointer',
                          outline: selectedKey === c.key ? '2px solid var(--accent)' : 'none', outlineOffset: 1
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
        <select value={fieldA} onChange={changeField(setFieldA)} style={selectStyle}>
          {fieldKeys.map((k) => <option key={k} value={k}>{fields[k]}</option>)}
        </select>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>×</span>
        <select value={fieldB} onChange={changeField(setFieldB)} style={selectStyle}>
          {fieldKeys.map((k) => <option key={k} value={k}>{fields[k]}</option>)}
        </select>
        <MetricToggle metrics={metrics} onChange={setMetrics} />
      </div>

      {sliceOptions.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Slice by:</span>
          <select value={activeFieldC} onChange={(e) => { setFieldC(e.target.value); setSliceIndex(0); setSelectedKey(null) }} style={selectStyle}>
            <option value="">None</option>
            {sliceOptions.map((k) => <option key={k} value={k}>{fields[k]}</option>)}
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

const thStyle = { padding: '4px 8px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.06)' }
const tdStyle = { padding: '4px 8px', whiteSpace: 'nowrap' }
const DETAILS_SESSIONS_PAGE = 3

// The raw underlying record, session by session — collapsed behind a
// toggle since most viewers just want the summarized breakdowns above,
// but there whenever someone wants to check that a specific attempt
// actually got captured (and, for auto-tracking, whether it was excluded
// from speed as a detected idle gap — that shows up here as a ✓ result
// with a "—" Speed, rather than being invisible). A "session" is just a
// maximal run of consecutive facts (once sorted newest-first) sharing the
// same sessionId — real session boundaries only ever happen at a detected
// idle gap, so contiguous-in-time already means contiguous-in-session.
function Details({ exercise }) {
  const [open, setOpen] = useState(false)
  const [visibleSessions, setVisibleSessions] = useState(DETAILS_SESSIONS_PAGE)

  if (!open) {
    return <div style={{ marginBottom: 24 }}><button className="play-cat-btn" onClick={() => setOpen(true)}>Show Details</button></div>
  }

  const facts = getFacts(exercise).sort((a, b) => b.ts - a.ts)
  const fieldKeysSeen = Array.from(new Set(facts.flatMap((f) => Object.keys(f.fields || {}))))

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

  const fmtTime = (ts) => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  const fmtTimeShort = (ts) => new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

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
          {shown.map((s) => (
            <div key={s.sessionId || s.start} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
                {fmtTime(s.start)}{s.end !== s.start ? ` – ${fmtTimeShort(s.end)}` : ''} · {s.attempts} attempt{s.attempts === 1 ? '' : 's'} · {Math.round(s.accuracy)}% accuracy
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Time</th>
                      <th style={thStyle}>Prompt</th>
                      <th style={thStyle}>Result</th>
                      <th style={thStyle}>Speed</th>
                      <th style={thStyle}>#</th>
                      {fieldKeysSeen.map((k) => <th key={k} style={thStyle}>{k}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {s.facts.map((f) => (
                      <tr key={f.id}>
                        <td style={tdStyle}>{fmtTime(f.ts)}</td>
                        <td style={tdStyle}>{f.promptLabel || f.promptKey || '—'}</td>
                        <td style={{ ...tdStyle, color: f.correct ? 'var(--accent)' : '#ff8a80' }}>{f.correct ? '✓' : '✗'}</td>
                        <td style={tdStyle}>{fmtMs(f.timeMs)}</td>
                        <td style={tdStyle}>{f.attemptNumber ?? '—'}</td>
                        {fieldKeysSeen.map((k) => <td key={k} style={tdStyle}>{f.fields && f.fields[k] ? f.fields[k].label : '—'}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
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
  // Trend chart's own Accuracy/Speed selection — separate from Explore's,
  // since they're different charts a viewer may want set differently.
  const [trendMetrics, setTrendMetrics] = useState(['accuracy'])

  const allRows = useMemo(() => {
    if (!open) return []
    return Object.values(getLifetimeStats(exercise)).map(withRates)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, exercise, refreshSeq])

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

  const topRows = allRows.filter((r) => !r.parent)
  const dimensions = Array.from(new Set(topRows.map((r) => r.dimension).filter(Boolean)))
  // A bucket can belong under more than one parent (e.g. Play The Chord's
  // "chord:min7@2" sits under both "root:2" and "type:min7"), so a leaf
  // shows up correctly under every dimension's own breakdown at once,
  // instead of only whichever one happened to "win" a single-parent slot.
  const childrenOf = (key) => allRows.filter((r) => (Array.isArray(r.parent) ? r.parent.includes(key) : r.parent === key))
  const rowByKey = (key) => allRows.find((r) => r.key === key) || null
  // Given a leaf that belongs under `excludeKey` (one of its parents),
  // label it by its OTHER parent(s) — e.g. a chord's type (and hand, if
  // tracked), given its root parent — without needing to know any
  // dimension's key format. A leaf can have more than 2 parents now (type,
  // root, AND hand), so this joins whichever aren't excludeKey rather than
  // assuming there's exactly one "other" — used to label a chart bar with
  // just the other dimension(s)' own name(s) (e.g. "Diminished 7th · Left
  // Hand") instead of the leaf's full combined label (e.g. "C Diminished
  // 7th"), which would needlessly repeat whatever the chart is already
  // filtered to.
  const otherParentLabelOf = (leaf, excludeKey) => {
    if (!Array.isArray(leaf.parent)) return null
    const others = leaf.parent.filter((p) => p !== excludeKey).map((p) => rowByKey(p)).filter(Boolean)
    return others.length > 0 ? others.map((r) => r.label).join(' · ') : null
  }

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
    if (!window.confirm(`Reset all ${title} stats? This clears every recorded attempt, streak, and trend — it can't be undone.`)) return
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
      const otherLabel = otherParentLabelOf(c, row.key)
      return { ...c, label: otherLabel || c.label }
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

      <Details exercise={exercise} key={exercise} />
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
