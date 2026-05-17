/** Highest-pitch string first (top row of tab). */
export const GUITAR_6_LABELS = ['E', 'B', 'G', 'D', 'A', 'E'] as const;
/** Standard 4-string bass (G–E). */
export const BASS_4_LABELS = ['G', 'D', 'A', 'E'] as const;
/** 5-string bass with low B. */
export const BASS_5_LABELS = ['G', 'D', 'A', 'E', 'B'] as const;

export type InstrumentPreset = 'guitar-6' | 'bass-4' | 'bass-5' | 'custom';

export type InstrumentConfig = {
  preset: InstrumentPreset;
  labels: string[];
};

export const DEFAULT_INSTRUMENT: InstrumentConfig = {
  preset: 'guitar-6',
  labels: [...GUITAR_6_LABELS],
};

export const MIN_STRING_COUNT = 1;
export const MAX_STRING_COUNT = 12;
export const MAX_LABEL_LENGTH = 4;

export function labelsForPreset(preset: InstrumentPreset): string[] {
  switch (preset) {
    case 'guitar-6':
      return [...GUITAR_6_LABELS];
    case 'bass-4':
      return [...BASS_4_LABELS];
    case 'bass-5':
      return [...BASS_5_LABELS];
    case 'custom':
      return [...GUITAR_6_LABELS];
  }
}

export function instrumentPresetLabel(preset: InstrumentPreset): string {
  switch (preset) {
    case 'guitar-6':
      return 'Guitar (6)';
    case 'bass-4':
      return 'Bass (4)';
    case 'bass-5':
      return 'Bass (5)';
    case 'custom':
      return 'Custom';
  }
}

export function normalizeStringLabel(raw: string, fallback = '?'): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed.slice(0, MAX_LABEL_LENGTH);
}

export function normalizeInstrumentLabels(labels: string[]): string[] {
  if (labels.length < MIN_STRING_COUNT) {
    return labelsForPreset('guitar-6');
  }
  if (labels.length > MAX_STRING_COUNT) {
    return labels
      .slice(0, MAX_STRING_COUNT)
      .map((label, index) => normalizeStringLabel(label, `S${index + 1}`));
  }
  return labels.map((label, index) =>
    normalizeStringLabel(label, `S${index + 1}`),
  );
}

export function createInstrumentFromPreset(
  preset: InstrumentPreset,
  options?: { labels?: string[]; stringCount?: number },
): InstrumentConfig {
  if (preset !== 'custom') {
    return { preset, labels: labelsForPreset(preset) };
  }

  const count = clampStringCount(
    options?.stringCount ?? options?.labels?.length ?? GUITAR_6_LABELS.length,
  );
  const source = options?.labels ?? [];
  const labels = Array.from({ length: count }, (_, index) =>
    normalizeStringLabel(source[index] ?? '', `S${index + 1}`),
  );
  return { preset: 'custom', labels };
}

export function clampStringCount(value: number): number {
  if (!Number.isInteger(value)) {
    return GUITAR_6_LABELS.length;
  }
  return Math.min(MAX_STRING_COUNT, Math.max(MIN_STRING_COUNT, value));
}

export function isValidStringCount(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_STRING_COUNT && value <= MAX_STRING_COUNT;
}
