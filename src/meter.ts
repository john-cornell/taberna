export type TimeSignaturePreset = '4/4' | '3/4' | 'custom';

export type Subdivision = 'beat' | 'half' | 'quarter';

export type MeterConfig = {
  preset: TimeSignaturePreset;
  beatsPerBar: number;
  beatUnit: number;
  includeHalfBeat: boolean;
  includeQuarterBeat: boolean;
};

export const DEFAULT_METER: MeterConfig = {
  preset: '4/4',
  beatsPerBar: 4,
  beatUnit: 4,
  includeHalfBeat: false,
  includeQuarterBeat: false,
};

export const MIN_BEATS_PER_BAR = 1;
export const MAX_BEATS_PER_BAR = 16;

export function resolveSubdivision(meter: MeterConfig): Subdivision {
  if (meter.includeQuarterBeat) {
    return 'quarter';
  }
  if (meter.includeHalfBeat) {
    return 'half';
  }
  return 'beat';
}

export function columnsPerBeat(subdivision: Subdivision): number {
  switch (subdivision) {
    case 'beat':
      return 1;
    case 'half':
      return 2;
    case 'quarter':
      return 4;
  }
}

export function columnsPerBar(meter: MeterConfig): number {
  return meter.beatsPerBar * columnsPerBeat(resolveSubdivision(meter));
}

export function meterLabel(meter: MeterConfig): string {
  if (meter.preset !== 'custom') {
    return meter.preset;
  }
  return `${meter.beatsPerBar}/${meter.beatUnit}`;
}

export function beatsPerBarForPreset(preset: TimeSignaturePreset): number {
  switch (preset) {
    case '4/4':
      return 4;
    case '3/4':
      return 3;
    case 'custom':
      return DEFAULT_METER.beatsPerBar;
  }
}

export function isValidBeatsPerBar(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= MIN_BEATS_PER_BAR &&
    value <= MAX_BEATS_PER_BAR
  );
}

export function createMeterFromPreset(
  preset: TimeSignaturePreset,
  beatsPerBar?: number,
): MeterConfig {
  if (preset === 'custom') {
    const beats = beatsPerBar ?? DEFAULT_METER.beatsPerBar;
    return {
      preset: 'custom',
      beatsPerBar: isValidBeatsPerBar(beats) ? beats : DEFAULT_METER.beatsPerBar,
      beatUnit: 4,
      includeHalfBeat: false,
      includeQuarterBeat: false,
    };
  }
  return {
    preset,
    beatsPerBar: beatsPerBarForPreset(preset),
    beatUnit: 4,
    includeHalfBeat: false,
    includeQuarterBeat: false,
  };
}

export function withMeterOptions(
  meter: MeterConfig,
  options: Partial<
    Pick<MeterConfig, 'includeHalfBeat' | 'includeQuarterBeat' | 'beatsPerBar'>
  >,
): MeterConfig {
  const includeHalfBeat = options.includeHalfBeat ?? meter.includeHalfBeat;
  const includeQuarterBeat =
    options.includeQuarterBeat ?? meter.includeQuarterBeat;

  let beatsPerBar = meter.beatsPerBar;
  if (options.beatsPerBar !== undefined && isValidBeatsPerBar(options.beatsPerBar)) {
    beatsPerBar = options.beatsPerBar;
  }

  return {
    ...meter,
    beatsPerBar,
    includeHalfBeat,
    includeQuarterBeat,
  };
}

export function isBarBoundary(columnIndex: number, meter: MeterConfig): boolean {
  const cpb = columnsPerBar(meter);
  return cpb > 0 && (columnIndex + 1) % cpb === 0;
}

export function isBeatBoundary(columnIndex: number, meter: MeterConfig): boolean {
  const colsPerBeat = columnsPerBeat(resolveSubdivision(meter));
  return colsPerBeat > 0 && (columnIndex + 1) % colsPerBeat === 0;
}

export function isHalfBeatBoundary(columnIndex: number, meter: MeterConfig): boolean {
  const subdivision = resolveSubdivision(meter);
  if (subdivision !== 'quarter') {
    return false;
  }
  return (columnIndex + 1) % 2 === 0 && !isBeatBoundary(columnIndex, meter);
}

export function alignColumnCount(columnCount: number, meter: MeterConfig): number {
  const cpb = columnsPerBar(meter);
  if (cpb <= 0) {
    return columnCount;
  }
  if (columnCount % cpb === 0) {
    return columnCount;
  }
  return Math.ceil(columnCount / cpb) * cpb;
}
