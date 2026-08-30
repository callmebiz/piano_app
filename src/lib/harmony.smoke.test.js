// Smoke test — confirms the Vitest setup itself works (install, module
// resolution, running against a plain ES module with no DOM/React
// involved). Not meant to be the real coverage; see the discussion in
// conversation history for the fuller test plan (invariant tests for
// generateProgression, golden-output tests for the fixed theory
// functions against creative_chord_choices.txt's worked examples) —
// deliberately not written yet, scoped out of this pass.
import { describe, it, expect } from 'vitest'
import { getSecondaryDominants } from './harmony'

describe('vitest setup', () => {
  it('runs against lib/harmony.js and gets the right answer', () => {
    // From creative_chord_choices.txt's own worked example: the secondary
    // dominants of C major's non-tonic diatonic chords are A7 B7 C7 D7 E7 F#7.
    const names = getSecondaryDominants(0).map((c) => c.root)
    expect(names).toEqual([9, 11, 0, 2, 4, 6]) // A, B, C, D, E, F#
  })
})
