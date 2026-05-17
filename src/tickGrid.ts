import {
  columnsPerBeat,
  resolveSubdivision,
  type MeterConfig,
  type Subdivision,
} from './meter';
import type { TabCell, TabState } from './types';
import { EMPTY_CELL } from './types';

/** Canonical storage resolution: quarter-notes within each beat. */
export const TICKS_PER_BEAT = 4;

export function ticksPerBar(meter: MeterConfig): number {
  return meter.beatsPerBar * TICKS_PER_BEAT;
}

export function viewSubdivision(meter: MeterConfig): Subdivision {
  return resolveSubdivision(meter);
}

export function viewColumnsPerBar(meter: MeterConfig): number {
  return meter.beatsPerBar * columnsPerBeat(viewSubdivision(meter));
}

export function barCountFromTicks(tickCount: number, meter: MeterConfig): number {
  const tpb = ticksPerBar(meter);
  return Math.max(1, Math.ceil(tickCount / tpb));
}

export function tickCountForBars(barCount: number, meter: MeterConfig): number {
  return barCount * ticksPerBar(meter);
}

export function viewColumnCount(state: TabState): number {
  return barCountFromTicks(state.columnCount, state.meter) * viewColumnsPerBar(state.meter);
}

export function viewColumnToTickIndex(viewCol: number, meter: MeterConfig): number {
  const vcpb = viewColumnsPerBar(meter);
  const barIndex = Math.floor(viewCol / vcpb);
  const colInBar = viewCol % vcpb;
  const cpb = columnsPerBeat(viewSubdivision(meter));
  const beatIndex = Math.floor(colInBar / cpb);
  const withinBeat = colInBar % cpb;

  let tickInBeat: number;
  switch (viewSubdivision(meter)) {
    case 'beat':
      tickInBeat = 0;
      break;
    case 'half':
      tickInBeat = withinBeat * 2;
      break;
    case 'quarter':
      tickInBeat = withinBeat;
      break;
  }

  return barIndex * ticksPerBar(meter) + beatIndex * TICKS_PER_BEAT + tickInBeat;
}

export function isViewBarBoundary(viewCol: number, meter: MeterConfig): boolean {
  const vcpb = viewColumnsPerBar(meter);
  return vcpb > 0 && (viewCol + 1) % vcpb === 0;
}

export function isViewBeatBoundary(viewCol: number, meter: MeterConfig): boolean {
  const cpb = columnsPerBeat(viewSubdivision(meter));
  return cpb > 0 && (viewCol + 1) % cpb === 0;
}

export function isViewHalfBeatBoundary(viewCol: number, meter: MeterConfig): boolean {
  if (viewSubdivision(meter) !== 'quarter') {
    return false;
  }
  const cpb = columnsPerBeat('half');
  return (viewCol + 1) % cpb === 0 && !isViewBeatBoundary(viewCol, meter);
}

export function alignTickCount(tickCount: number, meter: MeterConfig): number {
  const tpb = ticksPerBar(meter);
  if (tickCount % tpb === 0) {
    return tickCount;
  }
  return Math.ceil(tickCount / tpb) * tpb;
}

function cloneCell(cell: TabCell): TabCell {
  return { fret: cell.fret, technique: cell.technique };
}

/** Upgrade legacy rows stored at the current view resolution into quarter ticks. */
export function upscaleRowToTicks(
  row: TabCell[],
  meter: MeterConfig,
): TabCell[] {
  const sub = viewSubdivision(meter);
  const vcpb = viewColumnsPerBar(meter);
  const tpb = ticksPerBar(meter);

  if (row.length === 0) {
    return [];
  }

  if (sub === 'quarter' && row.length % tpb === 0) {
    return row.map(cloneCell);
  }

  const bars = Math.max(1, Math.ceil(row.length / vcpb));
  const newLen = bars * tpb;
  const next = Array.from({ length: newLen }, () => ({ ...EMPTY_CELL }));

  for (let viewCol = 0; viewCol < row.length; viewCol++) {
    const barIndex = Math.floor(viewCol / vcpb);
    const colInBar = viewCol % vcpb;
    const cpb = columnsPerBeat(sub);
    const beatIndex = Math.floor(colInBar / cpb);
    const withinBeat = colInBar % cpb;

    let tickInBeat: number;
    switch (sub) {
      case 'beat':
        tickInBeat = 0;
        break;
      case 'half':
        tickInBeat = withinBeat * 2;
        break;
      case 'quarter':
        tickInBeat = withinBeat;
        break;
    }

    const tickIndex = barIndex * tpb + beatIndex * TICKS_PER_BEAT + tickInBeat;
    if (tickIndex < newLen && row[viewCol]!.fret !== null) {
      next[tickIndex] = cloneCell(row[viewCol]!);
    }
  }

  return next;
}

export function ensureTickStorage(state: TabState): TabState {
  const tpb = ticksPerBar(state.meter);

  if (state.columnCount % tpb === 0) {
    return state;
  }

  const vcpb = viewColumnsPerBar(state.meter);
  if (state.columnCount % vcpb === 0) {
    const strings = state.strings.map((row) => upscaleRowToTicks(row, state.meter));
    const columnCount = strings[0]?.length ?? tickCountForBars(1, state.meter);
    return { ...state, strings, columnCount };
  }

  const aligned = alignTickCount(state.columnCount, state.meter);
  const strings = state.strings.map((row) => {
    const upscaled = upscaleRowToTicks(row, state.meter);
    if (upscaled.length === aligned) {
      return upscaled;
    }
    const padded = Array.from({ length: aligned }, (_, i) =>
      i < upscaled.length ? cloneCell(upscaled[i]!) : { ...EMPTY_CELL },
    );
    return padded;
  });
  return { ...state, strings, columnCount: aligned };
}

export function resampleRowForMeter(
  row: TabCell[],
  oldMeter: MeterConfig,
  newMeter: MeterConfig,
): TabCell[] {
  const oldTpb = ticksPerBar(oldMeter);
  const newTpb = ticksPerBar(newMeter);
  const oldBars = barCountFromTicks(row.length, oldMeter);
  const newLen = oldBars * newTpb;
  const next = Array.from({ length: newLen }, () => ({ ...EMPTY_CELL }));

  if (oldTpb === newTpb) {
    for (let i = 0; i < Math.min(row.length, newLen); i++) {
      next[i] = cloneCell(row[i]!);
    }
    return next;
  }

  for (let newTick = 0; newTick < newLen; newTick++) {
    const ratio = newLen > 1 ? newTick / (newLen - 1) : 0;
    const oldTick = Math.round(ratio * (oldBars * oldTpb - 1));
    const clamped = Math.max(0, Math.min(row.length - 1, oldTick));
    if (row[clamped]!.fret !== null) {
      next[newTick] = cloneCell(row[clamped]!);
    }
  }

  return next;
}

export function rowAtExportSubdivision(
  row: TabCell[],
  meter: MeterConfig,
  exportSub: Subdivision,
): TabCell[] {
  const bars = barCountFromTicks(row.length, meter);
  const exportMeter: MeterConfig = {
    ...meter,
    includeHalfBeat: exportSub === 'half',
    includeQuarterBeat: exportSub === 'quarter',
  };
  const exportLen = bars * viewColumnsPerBar(exportMeter);
  const result = Array.from({ length: exportLen }, () => ({ ...EMPTY_CELL }));

  for (let viewCol = 0; viewCol < exportLen; viewCol++) {
    const tick = viewColumnToTickIndex(viewCol, exportMeter);
    if (tick < row.length && row[tick]!.fret !== null) {
      result[viewCol] = cloneCell(row[tick]!);
    }
  }

  return result;
}
