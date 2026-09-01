// Shared practice-stats engine for every exercise app (Identify's 5
// exercises, Ear Training's 4, Play The Chord, Scales). Four things live
// side by side per exercise:
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
// - A raw fact table (recordFact/crossTab, below) — one row per attempt
//   with every tracked dimension as its own field, plus attemptNumber (the
//   1-indexed count of this exact prompt, read off its permanent lifetime
//   bucket so it stays accurate even once old fact rows themselves age
//   out). Lets a caller cross ANY combination of tracked dimensions, or
//   plot accuracy/speed against attempt number, as a query instead of
//   something that has to be pre-decided at record time the way buckets
//   are.

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

// One-time backfill of `attemptNumber` for any existing fact rows that
// predate it — assigns each prompt's own facts a 1-indexed sequence in
// chronological order, i.e. exactly "inferred by the total count" once,
// so every fact going forward can just read its number off the (already
// incrementing) lifetime bucket instead of re-deriving it by counting.
// Array.sort is stable, so facts sharing an identical timestamp (e.g. the
// synthetic backfilled rows above, all stamped in the same instant) keep
// their original push order — which for that backfill loop already IS the
// correct sequence.
function backfillAttemptNumbersIfNeeded(store) {
  if (store.attemptNumbersBackfilledV1) return store
  try {
    for (const facts of Object.values(store.facts || {})) {
      const byPrompt = {}
      for (const f of facts) {
        if (!f.promptKey) continue
        byPrompt[f.promptKey] = byPrompt[f.promptKey] || []
        byPrompt[f.promptKey].push(f)
      }
      for (const group of Object.values(byPrompt)) {
        group.sort((a, b) => a.ts - b.ts)
        group.forEach((f, i) => { f.attemptNumber = i + 1 })
      }
    }
  } catch (e) {}
  store.attemptNumbersBackfilledV1 = true
  return store
}

let store = migrateLegacyIfNeeded(loadStore())
store = backfillFactsIfNeeded(store)
store = backfillAttemptNumbersIfNeeded(store)
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
// "what was the previous prompt". `sessionId` (optional) is opaque —
// generate one with newSessionId() and pass the same value across calls
// that belong to one continuous practice stretch; see getIdleThresholdMs
// above for detecting when a fresh one is warranted.
//
// `wrongLabels` (optional): every DISTINCT wrong shape a caller recognized
// during this one attempt, in order — e.g. a target C#m fumbled through C
// then Cm before finally landing correctly. `endedCorrect` (optional):
// whether the attempt's FINAL held shape was actually the right one (true
// means "several wrong tries, then got it"; false means the attempt ended
// ON a wrong shape — e.g. the wrong inversion — which is itself the last
// entry of wrongLabels, nothing further to show). Together these let a UI
// show the wrong tries in order and, only when true, the target as how it
// was ultimately resolved. `playedLabel` — a flat legacy display string
// for anything that just wants "what to show/sort/filter by" without
// per-wrong-shape detail — is derived from wrongLabels/endedCorrect when
// given, falling back to whatever the caller passes directly for callers
// that don't track multiple shapes. Only stored (both) when correct is
// false, regardless of what's passed.
export function recordFact({ exercise, correct, timeMs, fields = {}, promptKey, promptLabel, playedLabel, wrongLabels, endedCorrect, sessionId }) {
  if (!exercise) return

  const derivedPlayedLabel = (Array.isArray(wrongLabels) && wrongLabels.length > 0)
    ? wrongLabels.join(', ') + (endedCorrect && promptLabel ? `, ${promptLabel}` : '')
    : (playedLabel || null)

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

  // Which attempt NUMBER this is for this specific prompt (1st time you've
  // ever played this exact chord, 2nd, 3rd, …) — for a future "accuracy/
  // speed vs. attempt number" learning-curve chart. Read straight from the
  // promptKey's own lifetime bucket, which recordAttempt above just
  // incremented and which is never pruned — so this stays a true
  // 1-indexed count forever, even once the raw fact table itself starts
  // aging old rows out (pruneFacts below).
  const promptBucket = promptKey && store.lifetime[exercise] ? store.lifetime[exercise][promptKey] : null
  const attemptNumber = promptBucket ? promptBucket.attempts : null

  store.facts[exercise] = store.facts[exercise] || []
  store.facts[exercise].push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    correct: !!correct,
    timeMs: typeof timeMs === 'number' ? timeMs : null,
    promptKey: promptKey || null,
    promptLabel: promptLabel || null,
    // What was actually played, when it was wrong — the caller's own best
    // guess at naming whatever chord shape(s) were actually held (e.g. via
    // a chord recognizer), not derived here. Null when correct, or when
    // the caller has no reading (nothing recognizable was ever held).
    playedLabel: correct ? null : derivedPlayedLabel,
    wrongLabels: (!correct && Array.isArray(wrongLabels) && wrongLabels.length > 0) ? wrongLabels : null,
    endedCorrect: correct ? null : !!endedCorrect,
    attemptNumber,
    sessionId: sessionId || null,
    fields
  })
  store.facts[exercise] = pruneFacts(store.facts[exercise])
  saveStore(store)
}

export function getFacts(exercise) {
  return (store.facts[exercise] || []).slice()
}

// Deletes one fact and reverses everything it contributed — not just the
// raw row. Returns true if a matching fact was found and removed.
//   - Lifetime buckets it touched (every dimension field, plus its own
//     promptKey leaf) get decremented; a bucket that reaches 0 attempts is
//     removed entirely rather than left behind as an empty "0/0" row.
//   - Its matching event in the rolling trend/streak log is removed too
//     (matched by ts/correct/timeMs — events don't carry a fact id since
//     they never needed one before).
//   - The ONE transition pair it contributed to as the target (toKey) side
//     is decremented — reconstructed from whichever fact immediately
//     precedes it in the fact table (facts are always appended in order,
//     so that's just the previous array entry), since a fact doesn't store
//     its own fromKey. Best-effort: silently skipped if that preceding
//     fact isn't there to look up (already pruned, or this was the very
//     first fact ever) — nothing more can be reconstructed at that point.
//   - Every later fact on the same prompt gets its attemptNumber shifted
//     down by one, so the sequence stays a contiguous 1..N instead of
//     leaving a hole where the deleted attempt used to be.
export function deleteFact(exercise, factId) {
  const facts = store.facts[exercise]
  if (!facts) return false
  const idx = facts.findIndex((f) => f.id === factId)
  if (idx === -1) return false
  const removed = facts[idx]
  const prev = idx > 0 ? facts[idx - 1] : null
  facts.splice(idx, 1)

  const lifetime = store.lifetime[exercise]
  if (lifetime) {
    const fieldEntries = Object.entries(removed.fields || {}).filter(([, v]) => v && v.value != null)
    const bucketKeys = fieldEntries.map(([k, v]) => `${k}:${v.value}`)
    if (removed.promptKey) bucketKeys.push(removed.promptKey)
    for (const key of bucketKeys) {
      const b = lifetime[key]
      if (!b) continue
      b.attempts -= 1
      if (removed.correct) b.correct -= 1
      if (removed.correct && typeof removed.timeMs === 'number') b.totalTimeMs -= removed.timeMs
      if (b.attempts <= 0) delete lifetime[key]
    }
  }

  const events = store.events[exercise]
  if (events) {
    const i = events.findIndex((e) => e.ts === removed.ts && e.correct === removed.correct && e.timeMs === removed.timeMs)
    if (i !== -1) events.splice(i, 1)
  }

  if (removed.promptKey && prev && prev.promptKey && store.transitions[exercise]) {
    const pairKey = `${prev.promptKey}→${removed.promptKey}`
    const t = store.transitions[exercise][pairKey]
    if (t) {
      t.attempts -= 1
      if (removed.correct) t.correct -= 1
      if (removed.correct && typeof removed.timeMs === 'number') t.totalTimeMs -= removed.timeMs
      if (t.attempts <= 0) delete store.transitions[exercise][pairKey]
    }
  }

  if (removed.promptKey && removed.attemptNumber != null) {
    for (const f of facts) {
      if (f.promptKey === removed.promptKey && f.attemptNumber > removed.attemptNumber) f.attemptNumber -= 1
    }
  }

  saveStore(store)
  return true
}

// -> [{ attemptNumber, correct, timeMs, ts }] for one specific prompt,
// oldest first — the raw series a "accuracy/speed vs. attempt number"
// learning-curve chart would plot. Only draws from the (pruned) raw fact
// table, so very old attempts on a prompt you haven't touched in 90+ days
// may be missing from the front of the series even though attemptNumber
// itself keeps counting from the permanent lifetime total.
export function getAttemptSeries(exercise, promptKey) {
  const facts = store.facts[exercise] || []
  return facts
    .filter((f) => f.promptKey === promptKey && f.attemptNumber != null)
    .map((f) => ({ attemptNumber: f.attemptNumber, correct: f.correct, timeMs: f.timeMs, ts: f.ts }))
    .sort((a, b) => a.attemptNumber - b.attemptNumber)
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

// --- Auto-tracking support: idle detection + sessions ---
// For an app that tracks continuously (no manual Start/Stop), the elapsed
// time since a prompt was shown can include a genuine gap — stepped away,
// came back — not real response time. There's no fixed "too long" that
// works for everyone: a naturally slow player's normal thinking pauses
// shouldn't get mistaken for a break, and a fast player's should still get
// caught reasonably soon. So the threshold is relative to that exercise's
// own overall average correct-response time, clamped to a sane range.
const IDLE_MULTIPLIER = 8
const IDLE_MIN_MS = 12000
const IDLE_MAX_MS = 90000
const IDLE_DEFAULT_MS = 15000 // used until there's any history to base a multiplier on

export function getIdleThresholdMs(exercise) {
  const avg = getOverallStats(exercise).avgTimeMs
  if (avg == null) return IDLE_DEFAULT_MS
  return Math.min(IDLE_MAX_MS, Math.max(IDLE_MIN_MS, avg * IDLE_MULTIPLIER))
}

// A session groups facts recorded without a real gap between them —
// opaque to callers, just a fresh ID each time. Generate one on mount and
// again whenever an idle gap (per getIdleThresholdMs) is detected, so
// facts naturally fall into "continuous practice stretch" groups without
// the caller needing to define session boundaries itself. Not yet
// surfaced anywhere as its own stats view — recorded now so that can be
// built later without needing to touch every recording call site again.
export function newSessionId() {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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

  // Counting strictly backward from TODAY breaks the streak the instant
  // you check stats before practicing today, even with an unbroken run
  // through yesterday — the day isn't over yet, so that shouldn't read as
  // "streak: 0". If today has no practice yet, start the backward count
  // from yesterday instead; today only actually breaks the streak once a
  // full day passes with nothing recorded.
  let currentDayStreak = 0
  if (practiceDays.length > 0) {
    const daySet = new Set(practiceDays)
    const cursor = new Date()
    if (!daySet.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1)
    while (daySet.has(dayKey(cursor.getTime()))) {
      currentDayStreak += 1
      cursor.setDate(cursor.getDate() - 1)
    }
  }

  return { currentCorrectStreak, bestCorrectStreak, currentDayStreak, bestDayStreak }
}
