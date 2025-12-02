export async function initMIDI(onNoteOn, onNoteOff, onStateChange) {
  if (!navigator.requestMIDIAccess) {
    throw new Error('Web MIDI API not supported in this browser.')
  }

  const access = await navigator.requestMIDIAccess({ sysex: false })

  function handleMessage(e) {
    const [status, note, velocity] = e.data
    const command = status & 0xf0
    if (command === 0x90 && velocity !== 0) {
      onNoteOn && onNoteOn(note)
    } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
      onNoteOff && onNoteOff(note)
    }
  }

  function attachInput(input) {
    try {
      input.onmidimessage = handleMessage
      onStateChange && onStateChange(`Attached: ${input.name || input.id}`)
    } catch (err) {
      console.warn('Failed to attach input', input, err)
    }
  }

  for (const input of access.inputs.values()) {
    attachInput(input)
  }

  access.onstatechange = (ev) => {
    if (ev.port && ev.port.type === 'input') {
      if (ev.port.state === 'connected') attachInput(ev.port)
      onStateChange && onStateChange(`${ev.port.name} ${ev.port.state}`)
    }
  }

  onStateChange && onStateChange('MIDI ready')

  return access
}
