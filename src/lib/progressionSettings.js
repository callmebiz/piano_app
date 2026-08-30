// Persisted Key Center "Example Progression" playback preferences — same
// get/set-with-localStorage-persistence shape as lib/staffSettings.js,
// including the change event so an already-open Key Center picks up a
// change made in the Settings modal without needing a remount.

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'keycenter:progression:settings'
const CHANGE_EVENT = 'progressionsettingschange'

export const PROGRESSION_DEFAULTS = {
  velocity: 0.6 // 0..1 — struck softer than the 0.85 used for single-chip previews, so a full progression doesn't hammer every chord at near-max force
}

let settings = { ...PROGRESSION_DEFAULTS }
try {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) settings = { ...PROGRESSION_DEFAULTS, ...JSON.parse(raw) }
} catch (e) {}

export function getProgressionSettings() {
  return { ...settings }
}

export function setProgressionSettings(partial) {
  settings = { ...settings, ...partial }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)) } catch (e) {}
  try { window.dispatchEvent(new CustomEvent(CHANGE_EVENT)) } catch (e) {}
  return getProgressionSettings()
}

export function useProgressionSettings() {
  const [s, setS] = useState(() => getProgressionSettings())
  useEffect(() => {
    const onChange = () => setS(getProgressionSettings())
    window.addEventListener(CHANGE_EVENT, onChange)
    return () => window.removeEventListener(CHANGE_EVENT, onChange)
  }, [])
  return s
}
