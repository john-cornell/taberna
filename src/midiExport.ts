export type ScheduledNote = {
  midi: number;
  time: number;
  duration: number;
  stringIndex: number;
  fret: number;
  technique?: string | null;
};

function writeString(str: string): number[] {
  return Array.from(str).map((c) => c.charCodeAt(0));
}

function writeUint16BE(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function writeUint32BE(value: number): number[] {
  return [
    (value >> 24) & 0xff,
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff,
  ];
}

function writeVariableLength(value: number): number[] {
  if (value === 0) return [0];
  const bytes: number[] = [];
  let v = value;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  bytes[bytes.length - 1]! &= 0x7f;
  return bytes;
}

function midiEvent(deltaTime: number, eventBytes: number[]): number[] {
  return [...writeVariableLength(deltaTime), ...eventBytes];
}

function noteOn(channel: number, note: number, velocity: number): number[] {
  return [0x90 | (channel & 0x0f), note & 0x7f, velocity & 0x7f];
}

function noteOff(channel: number, note: number, velocity: number): number[] {
  return [0x80 | (channel & 0x0f), note & 0x7f, velocity & 0x7f];
}

function tempoEvent(bpm: number): number[] {
  const usPerQuarter = Math.round(60_000_000 / bpm);
  return [
    0xff,
    0x51,
    0x03,
    (usPerQuarter >> 16) & 0xff,
    (usPerQuarter >> 8) & 0xff,
    usPerQuarter & 0xff,
  ];
}

function timeSignatureEvent(numerator: number, denominator: number): number[] {
  const denomPower = Math.log2(denominator);
  return [0xff, 0x58, 0x04, numerator & 0xff, denomPower & 0xff, 0x18, 0x08];
}

function endOfTrackEvent(): number[] {
  return [0xff, 0x2f, 0x00];
}

export function generateMidiFile(
  notes: ScheduledNote[],
  bpm: number,
  meterNumerator: number,
  meterDenominator: number,
): Uint8Array {
  const sorted = [...notes].sort((a, b) => a.time - b.time);
  const trackEvents: number[] = [];
  trackEvents.push(...midiEvent(0, timeSignatureEvent(meterNumerator, meterDenominator)));
  trackEvents.push(...midiEvent(0, tempoEvent(bpm)));

  const TPQN = 480;
  const timeToTicks = (timeSec: number) => Math.round(timeSec * bpm * TPQN / 60);

  const events: { ticks: number; bytes: number[] }[] = [];
  for (const note of sorted) {
    const onTicks = timeToTicks(note.time);
    const offTicks = timeToTicks(note.time + note.duration);
    events.push({ ticks: onTicks, bytes: noteOn(0, note.midi, 100) });
    events.push({ ticks: offTicks, bytes: noteOff(0, note.midi, 0) });
  }

  events.sort((a, b) => a.ticks - b.ticks);

  let lastTick = 0;
  for (const event of events) {
    const delta = event.ticks - lastTick;
    trackEvents.push(...midiEvent(Math.max(0, delta), event.bytes));
    lastTick = event.ticks;
  }

  trackEvents.push(...midiEvent(0, endOfTrackEvent()));

  const headerChunk = [
    ...writeString('MThd'),
    ...writeUint32BE(6),
    ...writeUint16BE(0),
    ...writeUint16BE(1),
    ...writeUint16BE(TPQN),
  ];

  const trackChunk = [
    ...writeString('MTrk'),
    ...writeUint32BE(trackEvents.length),
    ...trackEvents,
  ];

  return new Uint8Array([...headerChunk, ...trackChunk]);
}
