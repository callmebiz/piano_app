// Shared practice-stats engine for every exercise app (Identify's 5
// exercises, Play The Chord). Three things live side by side per exercise:
//
// - A lifetime aggregate per "bucket" (an opaque caller-defined key, e.g.
//   one per prompt for Identify, or type/root/chord for Play The Chord) —
//   { attempts, correct, totalTimeMs, label, parent }, never pruned, so
//   all-time totals stay exact forever. `parent` (optional) is another
//   bucket key — or an array of them — this one belongs under; a simple
//   one-level tree that powers drill-down (e.g. a "root:2" bucket is the
//   parent of every "chord:*@2" bucket, so clicking D can show every
//   D-rooted chord type). A bucket with two parents (e.g. Play The Chord's
//   "chord:min7@2" under both "root:2" and "type:min7") shows up under
//   each dimension's own breakdown at once instead of only one.
// - A transition table keyed by "fromKey→toKey", tracking how attempts on
//   one specific item go when it's reached right after another specific
//   item (e.g. "time to correctly play C6 having just played G5"). Callers
//   opt in per attempt via `primaryKey` (this attempt's own specific-item
//   key) and `fromKey` (the primaryKey of the attempt before it).
// - A rolling event log (just { ts, correct, timeMs }, no bucket info) used
//   for anything time-based — daily trend, streaks — capped by both age
//   and count so storage never grows unbounded. "Best ever" streak/trend
//   values are therefore really "best within the retained window", not
//   truly all-time; that's a deliberate trade for bounded local storage.

const STORAGE_KEY = 'practicestats:v1'
const RETENTION_DAYS = 90
const MAX_EVENTS_PER_EXERCISE = 3000
const MAX_FACTS_PER_EXERCISE = 4000

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const s = JSON.parse(raw)
      s.transitions = s.transitions || {}
      s.facts = s.facts || {}
      return s
    }
  } catch (e) {}
  return { lifetime: {}, events: {}, transitions: {}, facts: {} }
}

function saveStore(store) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)) } catch (e) {}
}

// --- One-time migration from each app's old, separate localStorage shape ---
function migrateLegacyIfNeeded(store) {
  if (store.migratedV1) return store

  try {
    const identifyKeys = {
      'identify-note': 'identify:note:stats',
      'identify-keysig': 'identify:keysig:stats',
      'identify-interval': 'identify:interval:stats',
      'identify-scale': 'identify:scale:stats',
      'identify-chord': 'identify:chord:stats'
    }
    for (const [exercise, legacyKey] of Object.entries(identifyKeys)) {
      const raw = localStorage.getItem(legacyKey)
      if (!raw) continue
      const old = JSON.parse(raw)
      if (!old || typeof old !== 'object') continue
      store.lifetime[exercise] = store.lifetime[exercise] || {}
      for (const [key, v] of Object.entries(old)) {
        if (!v) continue
        // No label/timing existed before — label falls back to the raw key
        // until the next real attempt on that prompt refreshes it, and
        // totalTimeMs starts at 0 (old attempts weren't timed at all).
        store.lifetime[exercise][key] = { attempts: v.attempts || 0, correct: v.correct || 0, totalTimeMs: 0, label: key }
      }
    }
  } catch (e) {}

  // Shared by both legacy shapes below (Play The Chord's byType/byRoot/
  // byChord and Scales' byType/byRoot/byScale) — same {attempts, correct,
  // totalTimeMs} groups under different names. `dimension` is set here too
  // (not just `parent`) so migrated history renders under the right tab
  // immediately, instead of looking undimensioned/mixed until the next
  // fresh attempt on that bucket happens to refresh it.
  const copyLegacyGroup = (target, group, prefix, dimension, parentFn) => {
    if (!group) return
    for (const [k, v] of Object.entries(group)) {
      if (!v) continue
      target[`${prefix}:${k}`] = { attempts: v.attempts || 0, correct: v.correct || 0, totalTimeMs: v.totalTimeMs || 0, label: k, parent: parentFn ? parentFn(v) : null, dimension: dimension || null }
    }
  }

  try {
    const raw = localStorage.getItem('play:stats')
    if (raw) {
      const old = JSON.parse(raw)
      store.lifetime.play = store.lifetime.play || {}
      copyLegacyGroup(store.lifetime.play, old.byType, 'type', 'Chord Type')
      copyLegacyGroup(store.lifetime.play, old.byRoot, 'root', 'Root')
      // Old byChord entries carried their own root — wire that up as this
      // migrated bucket's parent so drill-down (root -> its chord variants)
      // works on pre-existing history too, not just attempts recorded from
      // now on.
      copyLegacyGroup(store.lifetime.play, old.byChord, 'chord', null, (v) => (typeof v.root === 'number' ? `root:${v.root}` : null))
    }
  } catch (e) {}

  try {
    const raw = localStorage.getItem('scales:stats')
    if (raw) {
      const old = JSON.parse(raw)
      store.lifetime.scales = store.lifetime.scales || {}
      copyLegacyGroup(store.lifetime.scales, old.byType, 'type', 'Scale Type')
      copyLegacyGroup(store.lifetime.scales, old.byRoot, 'root', 'Root')
      copyLegacyGroup(store.lifetime.scales, old.byScale, 'scale', null, (v) => (typeof v.root === 'number' ? `root:${v.root}` : null))
    }
  } catch (e) {}

  store.migratedV1 = true
  return store
}

// One-time backfill of the fact table from existing lifetime buckets, so
// Explore (and any other crossTab query) has real data immediately instead
// of staying empty until the next few attempts happen to get recorded
// through recordFact. Only multi-dimension LEAF buckets qualify — a bucket
// with an array `parent` of 2+ entries (e.g. Play The Chord's
// "chord:min7@2", parent ["type:min7","root:2"]) — since those are the
// only existing buckets that actually carry more than one dimension's
// worth of information.
//
// A leaf's aggregate (attempts/correct/totalTimeMs) can't tell us the
// individual timing of each past attempt, so this synthesizes `attempts`
// separate fact rows for it — `correct` of them marked correct (evenly
// splitting the aggregate totalTimeMs across just those, matching how
// only correct attempts carry timing in the first place) and the rest
// marked incorrect — so crossTab summing them back up reproduces the
// exact same attempts/correct/totalTimeMs the existing lifetime bucket
// already shows, not an approximation.
function backfillFactsIfNeeded(store) {
  if (store.factsBackfilledV1) return store
  try {
    for (const [exercise, buckets] of Object.entries(store.lifetime || {})) {
      const leaves = Object.entries(buckets).filter(([, b]) => Array.isArray(b.parent) && b.parent.length >= 2 && b.attempts > 0)
      if (leaves.length === 0) continue
      store.facts[exercise] = store.facts[exercise] || []
      for (const [key, b] of leaves) {
        const fields = {}
        for (const parentKey of b.parent) {
          const i = parentKey.indexOf(':')
          if (i === -1) continue
          const fieldKey = parentKey.slice(0, i)
          const value = parentKey.slice(i + 1)
          const parentBucket = buckets[parentKey]
          fields[fieldKey] = { value, label: (parentBucket && parentBucket.label) || value, dimension: (parentBucket && parentBucket.dimension) || fieldKey }
        }
        if (Object.keys(fields).length < 2) continue
        const perCorrectMs = b.correct > 0 ? b.totalTimeMs / b.correct : null
        for (let i = 0; i < b.attempts; i++) {
          const correct = i < b.correct
          store.facts[exercise].push({
            id: `backfill-${key}-${i}`,
            ts: Date.now(),
            correct,
            timeMs: correct ? perCorrectMs : null,
            promptKey: key,
            promptLabel: b.label || key,
            fields
          })
        }
      }
    }
  } catch (e) {}
  store.factsBackfilledV1 = true
  return store
}

let store = migrateLegacyIfNeeded(loadStore())
store = backfillFactsIfNeeded(store)
saveStore(store)

function pruneEvents(list) {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
  let pruned = list.filter((e) => e.ts >= cutoff)
  if (pruned.length > MAX_EVENTS_PER_EXERCISE) pruned = pruned.slice(pruned.length - MAX_EVENTS_PER_EXERCISE)
  return pruned
}

function pruneFacts(list) {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
  let pruned = list.filter((f) => f.ts >= cutoff)
  if (pruned.length > MAX_FACTS_PER_EXERCISE) pruned = pruned.slice(pruned.length - MAX_FACTS_PER_EXERCISE)
  return pruned
}

// Which specific prompt (promptKey) an exercise's most recent recordFact()
// call was — lives here instead of in each app's own ref, so a caller no
// longer has to track "what came before this" itself just to get
// transition timing.
const lastPromptKeyByExercise = {}

// buckets: [{ key, label, parent?, dimension? }] — every bucket this one
// attempt counts toward. correct: boolean. timeMs: number|null (null if
// untimed). `dimension` (optional) groups top-level (no-parent) buckets
// into independent breakdowns for display — e.g. Play The Chord tags one
// bucket per attempt "Root" and another "Chord Type", so a UI can show
// them as separate, non-conflated lists instead of one mixed one. Buckets
// with no dimension (e.g. Identify's single per-prompt bucket) form one
// implicit group. primaryKey (optional): which of those bucket keys is
// "the specific item" — used as this attempt's transition target. fromKey
// (optional): the primaryKey of whatever attempt immediately preceded this
// one; when both are given, a fromKey→primaryKey transition bucket is
// recorded too.
export function recordAttempt({ exercise, buckets, correct, timeMs, primaryKey, fromKey }) {
  if (!exercise || !Array.isArray(buckets) || buckets.length === 0) return

  store.lifetime[exercise] = store.lifetime[exercise] || {}
  for (const { key, label, parent, dimension } of buckets) {
    if (!key) continue
    const bucket = store.lifetime[exercise][key] || { attempts: 0, correct: 0, totalTimeMs: 0, label: label || key, parent: parent || null, dimension: dimension || null }
    bucket.attempts += 1
    if (correct) bucket.correct += 1
    if (correct && typeof timeMs === 'number' && timeMs >= 0) bucket.totalTimeMs += timeMs
    if (label) bucket.label = label
    if (parent) bucket.parent = parent
    if (dimension) bucket.dimension = dimension
    store.lifetime[exercise][key] = bucket
  }

  if (primaryKey && fromKey) {
    const primary = buckets.find((b) => b.key === primaryKey)
    store.transitions[exercise] = store.transitions[exercise] || {}
    const pairKey = `${fromKey}→${primaryKey}`
    const t = store.transitions[exercise][pairKey] || { attempts: 0, correct: 0, totalTimeMs: 0, fromKey, toKey: primaryKey, toLabel: (primary && primary.label) || primaryKey }
    t.attempts += 1
    if (correct) t.correct += 1
    if (correct && typeof timeMs === 'number' && timeMs >= 0) t.totalTimeMs += timeMs
    if (primary && primary.label) t.toLabel = primary.label
    store.transitions[exercise][pairKey] = t
  }

  store.events[exercise] = store.events[exercise] || []
  store.events[exercise].push({ ts: Date.now(), correct: !!correct, timeMs: typeof timeMs === 'number' ? timeMs : null })
  store.events[exercise] = pruneEvents(store.events[exercise])

  saveStore(store)
}

// -> { [key]: { key, label, attempts, correct, totalTimeMs, parent } }
export function getLifetimeStats(exercise) {
  const group = store.lifetime[exercise] || {}
  const out = {}
  for (const [key, v] of Object.entries(group)) out[key] = { key, ...v }
  return out
}

// Buckets whose `parent` points at parentKey (directly, or as one entry of
// a multi-parent array) — the one-level drill-down.
export function getChildren(exercise, parentKey) {
  const all = getLifetimeStats(exercise)
  return Object.values(all).filter((b) => (Array.isArray(b.parent) ? b.parent.includes(parentKey) : b.parent === parentKey))
}

// Transitions landing on / leaving a specific item's primaryKey. Pass
// `to` for "what came before this item" (the C6-after-G5 case), `from`
// for "where did this item lead". Each row's `fromLabel` is looked up from
// that exercise's own lifetime buckets (transitions only stores toLabel
// directly since that's the side the caller already has at record time).
export function getTransitions(exercise, { to, from } = {}) {
  const table = store.transitions[exercise] || {}
  const lifetime = store.lifetime[exercise] || {}
  const rows = Object.values(table).filter((t) => (to ? t.toKey === to : true) && (from ? t.fromKey === from : true))
  return rows.map((t) => ({
    ...t,
    fromLabel: (lifetime[t.fromKey] && lifetime[t.fromKey].label) || t.fromKey,
    accuracy: t.attempts > 0 ? (t.correct / t.attempts) * 100 : 0,
    avgTimeMs: t.correct > 0 ? t.totalTimeMs / t.correct : null
  }))
}

export function resetLifetimeStats(exercise) {
  delete store.lifetime[exercise]
  delete store.events[exercise]
  delete store.transitions[exercise]
  delete store.facts[exercise]
  delete lastPromptKeyByExercise[exercise]
  saveStore(store)
}

// --- Fact table: one raw row per attempt, every dimension as a field ---
// The bucket/dimension/parent shape above is a set of pre-decided rollups —
// great for permanent all-time totals, but every NEW way of slicing the
// data (e.g. "chord type crossed with root, simultaneously") needs new
// bucket-building code wherever it's called. recordFact takes the opposite
// approach: the caller reports raw facts (what happened, and which
// dimension values applied), and ANY combination of those dimensions can
// be crossed later via crossTab() — a query, not a feature to build.
//
// `fields`: { [fieldKey]: { value, label, dimension } } — value is the
// caller's own opaque grouping key (e.g. a chord type slug or a root pitch
// class number), label is how it's displayed, dimension is the
// human-readable axis name (e.g. "Chord Type"). Sparse: an exercise only
// populates whichever fields actually apply to it.
//
// recordFact still drives the existing, already-reliable lifetime/events/
// transitions rollups underneath (via recordAttempt) — it just builds that
// bucket list FOR you from `fields`, instead of requiring the caller to
// hand-construct dimension buckets and a parent-linked leaf bucket the way
// Play The Chord and Scales used to. It also tracks fromKey internally
// (lastPromptKeyByExercise) so callers no longer need their own ref for
// "what was the previous prompt".
export function recordFact({ exercise, correct, timeMs, fields = {}, promptKey, promptLabel }) {
  if (!exercise) return

  const fieldEntries = Object.entries(fields).filter(([, v]) => v && v.value != null)

  const buckets = fieldEntries.map(([fieldKey, v]) => ({
    key: `${fieldKey}:${v.value}`,
    label: v.label != null ? v.label : String(v.value),
    dimension: v.dimension || null
  }))
  if (promptKey) {
    buckets.push({
      key: promptKey,
      label: promptLabel || promptKey,
      parent: fieldEntries.map(([fieldKey, v]) => `${fieldKey}:${v.value}`)
    })
  }
  if (buckets.length > 0) {
    recordAttempt({
      exercise,
      buckets,
      correct,
      timeMs,
      primaryKey: promptKey || null,
      fromKey: promptKey ? lastPromptKeyByExercise[exercise] || null : null
    })
  }
  if (promptKey) lastPromptKeyByExercise[exercise] = promptKey

  store.facts[exercise] = store.facts[exercise] || []
  store.facts[exercise].push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    correct: !!correct,
    timeMs: typeof timeMs === 'number' ? timeMs : null,
    promptKey: promptKey || null,
    promptLabel: promptLabel || null,
    fields
  })
  store.facts[exercise] = pruneFacts(store.facts[exercise])
  saveStore(store)
}

export function getFacts(exercise) {
  return (store.facts[exercise] || []).slice()
}

// -> { [fieldKey]: dimensionLabel } — every field that's actually present
// on at least one recorded fact for this exercise, so a UI can offer "pick
// a dimension" without hardcoding which ones an exercise happens to have.
export function getAvailableFields(exercise) {
  const facts = store.facts[exercise] || []
  const out = {}
  for (const f of facts) {
    for (const [k, v] of Object.entries(f.fields || {})) {
      if (v && v.dimension && !out[k]) out[k] = v.dimension
    }
  }
  return out
}

// Generic N-dimensional group-by over the raw fact table — cross ANY 1+
// fields together (fieldKeys), not just whichever pairs an app happened to
// pre-build buckets for. Facts missing any of the requested fields are
// skipped (they don't apply to that slice). Returns one row per combo of
// values actually observed, each carrying both the combined label and the
// per-field label/value (so a 2D UI can build row/column axes without
// re-deriving anything).
export function crossTab(exercise, fieldKeys) {
  if (!Array.isArray(fieldKeys) || fieldKeys.length === 0) return []
  const facts = store.facts[exercise] || []
  const groups = {}
  for (const f of facts) {
    const vals = fieldKeys.map((k) => f.fields && f.fields[k])
    if (vals.some((v) => !v || v.value == null)) continue
    const comboKey = fieldKeys.map((k, i) => `${k}=${vals[i].value}`).join('|')
    if (!groups[comboKey]) {
      groups[comboKey] = {
        key: comboKey,
        label: vals.map((v) => v.label).join(' · '),
        dims: Object.fromEntries(fieldKeys.map((k, i) => [k, vals[i].value])),
        fieldLabels: Object.fromEntries(fieldKeys.map((k, i) => [k, vals[i].label])),
        attempts: 0, correct: 0, totalTimeMs: 0
      }
    }
    const g = groups[comboKey]
    g.attempts += 1
    if (f.correct) g.correct += 1
    if (f.correct && typeof f.timeMs === 'number') g.totalTimeMs += f.timeMs
  }
  return Object.values(groups).map((g) => ({
    ...g,
    accuracy: g.attempts > 0 ? (g.correct / g.attempts) * 100 : 0,
    avgTimeMs: g.correct > 0 ? g.totalTimeMs / g.correct : null
  }))
}

export function getEvents(exercise) {
  return (store.events[exercise] || []).slice()
}

// Exercise-wide totals from the retained event log (not the never-pruned
// lifetime buckets) — the same "how many/how accurate/how fast, overall"
// numbers a dashboard's headline KPIs want, bounded by the same retention
// window as trend/streaks so all three stay consistent with each other.
export function getOverallStats(exercise) {
  const events = getEvents(exercise)
  const correct = events.filter((e) => e.correct)
  const timed = correct.filter((e) => typeof e.timeMs === 'number')
  return {
    attempts: events.length,
    correct: correct.length,
    accuracy: events.length > 0 ? (correct.length / events.length) * 100 : 0,
    avgTimeMs: timed.length > 0 ? timed.reduce((sum, e) => sum + e.timeMs, 0) / timed.length : null
  }
}

const dayKey = (ts) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// -> [{ date, attempts, correct, accuracy, avgTimeMs }] oldest -> newest,
// zero-filled for days with no activity so a chart has no gaps.
export function getDailyTrend(exercise, days = 30) {
  const events = getEvents(exercise)
  const byDay = {}
  for (const e of events) {
    const k = dayKey(e.ts)
    if (!byDay[k]) byDay[k] = { attempts: 0, correct: 0, totalTimeMs: 0, timedCorrect: 0 }
    byDay[k].attempts += 1
    if (e.correct) byDay[k].correct += 1
    if (e.correct && typeof e.timeMs === 'number') { byDay[k].totalTimeMs += e.timeMs; byDay[k].timedCorrect += 1 }
  }

  const out = []
  const now = Date.now()
  for (let i = days - 1; i >= 0; i--) {
    const ts = now - i * 24 * 60 * 60 * 1000
    const k = dayKey(ts)
    const d = byDay[k]
    out.push({
      date: k,
      attempts: d ? d.attempts : 0,
      correct: d ? d.correct : 0,
      accuracy: d && d.attempts > 0 ? (d.correct / d.attempts) * 100 : null,
      avgTimeMs: d && d.timedCorrect > 0 ? d.totalTimeMs / d.timedCorrect : null
    })
  }
  return out
}

// -> { currentCorrectStreak, bestCorrectStreak, currentDayStreak, bestDayStreak }
// "Best" is bounded by the retained event window (RETENTION_DAYS / MAX_EVENTS_PER_EXERCISE).
export function getStreak(exercise) {
  const events = getEvents(exercise).sort((a, b) => a.ts - b.ts)

  let bestCorrectStreak = 0
  let run = 0
  for (const e of events) {
    run = e.correct ? run + 1 : 0
    if (run > bestCorrectStreak) bestCorrectStreak = run
  }
  let currentCorrectStreak = 0
  for (let i = events.length - 1; i >= 0; i--) {
    if (!events[i].correct) break
    currentCorrectStreak += 1
  }

  const practiceDays = Array.from(new Set(events.map((e) => dayKey(e.ts)))).sort()

  // Calendar-day arithmetic via the local-time Date constructor + setDate,
  // not raw millisecond math (a fixed 24h isn't always one calendar day
  // across a DST transition) and not `new Date(dateOnlyString)` (that
  // parses as UTC midnight, which lands on the wrong local calendar day
  // whenever the local timezone isn't UTC — dayKey() below is local-time).
  const nextDayKey = (dk) => {
    const [y, m, d] = dk.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    dt.setDate(dt.getDate() + 1)
    return dayKey(dt.getTime())
  }

  let bestDayStreak = 0
  let dayRun = 0
  let prevKey = null
  for (const dk of practiceDays) {
    dayRun = (prevKey !== null && nextDayKey(prevKey) === dk) ? dayRun + 1 : 1
    if (dayRun > bestDayStreak) bestDayStreak = dayRun
    prevKey = dk
  }

  let currentDayStreak = 0
  if (practiceDays.length > 0) {
    const daySet = new Set(practiceDays)
    const cursor = new Date()
    while (daySet.has(dayKey(cursor.getTime()))) {
      currentDayStreak += 1
      cursor.setDate(cursor.getDate() - 1)
    }
  }

  return { currentCorrectStreak, bestCorrectStreak, currentDayStreak, bestDayStreak }
}
