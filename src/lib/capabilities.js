// Runtime capability/environment detection — kept separate from any one app
// so navigation, layout, and individual apps can all make the same calls.

import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'

export function hasWebMIDI() {
  return typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess
}

// True when running inside the wrapped native Android shell (Capacitor),
// false in a regular desktop or mobile browser tab.
export function isNativeShell() {
  try { return Capacitor.isNativePlatform() } catch (e) { return false }
}

// Matches the breakpoints already used throughout styles.css (600/900px)
// rather than introducing a second set of numbers to keep in sync.
const BREAKPOINTS = { mobile: 600, tablet: 900 }

function computeViewportClass() {
  if (typeof window === 'undefined') return 'desktop'
  const w = window.innerWidth
  if (w <= BREAKPOINTS.mobile) return 'mobile'
  if (w <= BREAKPOINTS.tablet) return 'tablet'
  return 'desktop'
}

// 'mobile' | 'tablet' | 'desktop', updates live on resize/orientation change.
export function useViewportClass() {
  const [cls, setCls] = useState(computeViewportClass)
  useEffect(() => {
    const onResize = () => setCls(computeViewportClass())
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])
  return cls
}
