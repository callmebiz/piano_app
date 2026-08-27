// Persisted staff-rendering preferences (size/scale/alignment) — same
// get/set-with-localStorage-persistence shape as audio/engine.js's synth
// params, so Settings.jsx handles both the same way. Also dispatches a
// window event on change so open Identify exercises re-render live when
// tweaked from the Settings modal, not just on next mount.

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'staff:settings'
const CHANGE_EVENT = 'staffsettingschange'

export const STAFF_DEFAULTS = {
  width: 260, // px — the staff box's width (controls note-to-staff-space ratio)
  scale: 1, // 0.7–1.6 — visual size of the clef/staff/notehead only
  align: 'center', // 'left' | 'center' | 'right'
  uiScale: 1 // 0.7–2 — zooms the whole Identify card (header, staff, answer grid) as one unit
}

let settings = { ...STAFF_DEFAULTS }
try {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) settings = { ...STAFF_DEFAULTS, ...JSON.parse(raw) }
} catch (e) {}

export function getStaffSettings() {
  return { ...settings }
}

export function setStaffSettings(partial) {
  settings = { ...settings, ...partial }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)) } catch (e) {}
  try { window.dispatchEvent(new CustomEvent(CHANGE_EVENT)) } catch (e) {}
  return getStaffSettings()
}

// Live-updating read for consumers that render based on these settings
// (Settings.jsx itself just seeds local state once and calls setStaffSettings
// directly, same as it does for audio params).
export function useStaffSettings() {
  const [s, setS] = useState(() => getStaffSettings())
  useEffect(() => {
    const onChange = () => setS(getStaffSettings())
    window.addEventListener(CHANGE_EVENT, onChange)
    return () => window.removeEventListener(CHANGE_EVENT, onChange)
  }, [])
  return s
}
