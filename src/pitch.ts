import type { InstrumentConfig } from './instrument';

const STANDARD_TUNINGS: Record<string, number[]> = {
  'guitar-6': [64, 59, 55, 50, 45, 40],
  'bass-4': [43, 38, 33, 28],
  'bass-5': [43, 38, 33, 28, 23],
};

const DEFAULT_OCTAVES: Record<number, number[]> = {
  1: [4],
  2: [4, 3],
  3: [4, 3, 3],
  4: [2, 2, 1, 1],
  5: [2, 2, 1, 1, 0],
  6: [4, 3, 3, 3, 2, 2],
  7: [4, 3, 3, 3, 2, 2, 1],
  8: [4, 3, 3, 3, 2, 2, 1, 0],
};

function inferOctave(stringIndex: number, stringCount: number): number {
  const explicit = DEFAULT_OCTAVES[stringCount]?.[stringIndex];
  if (explicit !== undefined) {
    return explicit;
  }
  // Extrapolate guitar-like pattern for counts > 8
  if (stringIndex === 0) return 4;
  if (stringIndex <= 3) return 3;
  const remaining = stringIndex - 3;
  return Math.max(0, 2 - Math.floor((remaining - 1) / 2));
}

const PITCH_CLASS_MAP: Record<string, number> = {
  c: 0,
  d: 2,
  e: 4,
  f: 5,
  g: 7,
  a: 9,
  b: 11,
};

const ACCIDENTAL_OFFSET: Record<string, number> = {
  '#': 1,
  b: -1,
  '♭': -1,
};

export function parseNoteLabel(
  label: string,
): { pitchClass: number; octave?: number } | null {
  const normalized = label.trim().toLowerCase().replace(/\s+/g, '');
  const match = normalized.match(/^([a-g])(#|b|♭)?(\d+)?$/);
  if (!match) {
    return null;
  }

  const letter = match[1];
  const accidental = match[2];
  const octaveStr = match[3];

  let pitchClass = PITCH_CLASS_MAP[letter];
  if (accidental) {
    pitchClass += ACCIDENTAL_OFFSET[accidental] ?? 0;
  }
  pitchClass = ((pitchClass % 12) + 12) % 12;

  const octave = octaveStr ? Number(octaveStr) : undefined;
  if (octave !== undefined && (octave < 0 || octave > 9)) {
    return null;
  }

  return { pitchClass, octave };
}

export function labelToMidi(
  label: string,
  stringIndex: number,
  stringCount: number,
): number | null {
  const parsed = parseNoteLabel(label);
  if (!parsed) {
    return null;
  }
  const octave = parsed.octave ?? inferOctave(stringIndex, stringCount);
  return octave * 12 + parsed.pitchClass + 12;
}

export function fretToMidi(
  instrument: InstrumentConfig,
  stringIndex: number,
  fret: number,
): number | null {
  if (stringIndex < 0 || stringIndex >= instrument.labels.length) {
    return null;
  }
  if (fret < 0) {
    return null;
  }

  const standard = STANDARD_TUNINGS[instrument.preset];
  if (standard && standard[stringIndex] !== undefined) {
    const midi = standard[stringIndex] + fret;
    if (midi < 0 || midi > 127) {
      return null;
    }
    return midi;
  }

  const label = instrument.labels[stringIndex];
  if (!label) {
    return null;
  }

  const base = labelToMidi(label, stringIndex, instrument.labels.length);
  if (base === null) {
    return null;
  }

  const midi = base + fret;
  if (midi < 0 || midi > 127) {
    return null;
  }
  return midi;
}
