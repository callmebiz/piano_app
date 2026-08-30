// Pure diatonic staff-position math — no VexFlow, no DOM. A "step" is a
// letter-only vertical position on the staff (accidentals don't move a note
// vertically, only which glyph decorates it), counted so each adjacent
// step is exactly one line-or-space apart: step(letter, octave) =
// octave*7 + letterIndex. Used by Construction's up/down note-position
// control — moving one step is always exactly one line/space, regardless
// of octave boundaries (verified by round-trip test in the scratchpad
// before use: every step -20..80 round-trips through letter/octave and
// back to the same step).

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']

export function diatonicStep(letter, octave) {
  return octave * 7 + LETTERS.indexOf(letter)
}

export function stepToLetterOctave(step) {
  const octave = Math.floor(step / 7)
  const idx = ((step % 7) + 7) % 7
  return { letter: LETTERS[idx], octave }
}
