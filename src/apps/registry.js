// Single source of truth for which apps exist and which platforms they show
// up on. AppsPane (desktop sidebar) and MobileNav (phone bottom bar) both
// read from this instead of keeping their own lists, so adding an app or
// changing where it's available is a one-line change here rather than
// something to keep in sync across components.
//
// `platforms` doesn't gate rendering in App.jsx (each app's route there is
// unconditional on `selectedApp`) — it only controls which nav shows which
// entries. Nothing about the current apps technically requires desktop (they
// all fall back to the on-screen keyboard), so everything defaults to both;
// tag an entry `['desktop']` only whenever a specific app should be hidden
// from the phone nav.
//
// `enabled: false` hides an app from both navs (and, via App.jsx, from the
// on-screen keyboard) without deleting its code — flip it back to true (or
// just drop the key) to bring it back.
export const APPS = [
  { id: 'identify', title: 'Identification', subtitle: 'Note, key signature, interval, scale & chord ID', platforms: ['desktop', 'mobile'] },
  { id: 'construct', title: 'Construction', subtitle: 'Build notes & intervals on the staff', platforms: ['desktop', 'mobile'] },
  { id: 'eartraining', title: 'Ear Training', subtitle: 'Interval, chord & scale recognition by ear', platforms: ['desktop', 'mobile'] },
  { id: 'chord', title: 'Chord Recognition', subtitle: 'Identify played chords', platforms: ['desktop', 'mobile'] },
  { id: 'play', title: 'Play The Chord', subtitle: 'Play highlighted chords on your keyboard', platforms: ['desktop', 'mobile'] },
  { id: 'scales', title: 'Scales', subtitle: 'Practice scales in order', platforms: ['desktop', 'mobile'] },
  { id: 'keycenter', title: 'Key Center', subtitle: 'Diatonic chords & secondary dominants', platforms: ['desktop', 'mobile'] },
  { id: 'visualizer', title: 'Visualizer', subtitle: 'Key visualizer', platforms: ['desktop', 'mobile'] }
]

export function appsFor(platform) {
  return APPS.filter((a) => a.enabled !== false && a.platforms.includes(platform))
}
