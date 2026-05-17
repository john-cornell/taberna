import {
  columnsPerBeat,
  type MeterConfig,
  type Subdivision,
  resolveSubdivision,
} from './meter';
import type { ExportSpacingMode } from './tabFileFormat';
import { techniqueExportSuffix } from './techniques';
import type { Technique } from './techniques';
import {
  barCountFromTicks,
  ensureTickStorage,
  resampleRowForMeter,
  tickCountForBars,
  TICKS_PER_BEAT,
  rowAtExportSubdivision,
  viewColumnCount,
  viewColumnToTickIndex,
  viewColumnsPerBar,
} from './tickGrid';
import { normalizeInstrumentLabels, type InstrumentConfig } from './instrument';
import {
  DEFAULT_INSTRUMENT,
  DEFAULT_METER,
  EMPTY_CELL,
  type TabCell,
  type TabState,
} from './types';

export function stringLabels(state: TabState): string[] {
  return state.instrument.labels;
}

export type { ExportSpacingMode } from './tabFileFormat';
export { TICKS_PER_BEAT, viewColumnCount };

export function createEmptyRow(columnCount: number): TabCell[] {
  return Array.from({ length: columnCount }, () => ({ ...EMPTY_CELL }));
}

export function createInitialTab(
  barCount = 4,
  meter: MeterConfig = DEFAULT_METER,
  instrument: InstrumentConfig = DEFAULT_INSTRUMENT,
): TabState {
  const columnCount = tickCountForBars(barCount, meter);
  const labels = normalizeInstrumentLabels(instrument.labels);
  const resolved: InstrumentConfig = {
    preset: instrument.preset,
    labels,
  };
  return {
    strings: labels.map(() => createEmptyRow(columnCount)),
    columnCount,
    meter,
    instrument: resolved,
    title: '',
  };
}

export function applyInstrument(
  state: TabState,
  instrument: InstrumentConfig,
): TabState {
  const normalized = ensureTickStorage(state);
  const labels = normalizeInstrumentLabels(instrument.labels);
  const nextInstrument: InstrumentConfig = {
    preset: instrument.preset,
    labels,
  };

  const strings = labels.map((_, index) => {
    const existing = normalized.strings[index];
    if (existing && existing.length === normalized.columnCount) {
      return existing.map((cell) => ({ ...cell }));
    }
    return createEmptyRow(normalized.columnCount);
  });

  return {
    ...normalized,
    strings,
    instrument: nextInstrument,
    title: normalized.title,
  };
}

export function applyMeter(state: TabState, meter: MeterConfig): TabState {
  const normalized = ensureTickStorage(state);
  const oldMeter = normalized.meter;
  const bars = barCountFromTicks(normalized.columnCount, oldMeter);

  let strings = normalized.strings;
  if (
    oldMeter.beatsPerBar !== meter.beatsPerBar ||
    oldMeter.preset !== meter.preset
  ) {
    strings = strings.map((row) => resampleRowForMeter(row, oldMeter, meter));
  }

  const columnCount = tickCountForBars(bars, meter);
  strings = strings.map((row) => {
    if (row.length === columnCount) {
      return row;
    }
    if (row.length < columnCount) {
      return [...row, ...createEmptyRow(columnCount - row.length)];
    }
    return row.slice(0, columnCount);
  });

  return {
    ...normalized,
    strings,
    columnCount,
    meter,
    instrument: normalized.instrument,
    title: normalized.title,
  };
}

export function getTickCell(
  state: TabState,
  stringIndex: number,
  tickIndex: number,
): TabCell {
  return state.strings[stringIndex]?.[tickIndex] ?? { ...EMPTY_CELL };
}

export function getViewCell(
  state: TabState,
  stringIndex: number,
  viewColumn: number,
): TabCell {
  const tick = viewColumnToTickIndex(viewColumn, state.meter);
  return getTickCell(state, stringIndex, tick);
}

export function isValidFret(fret: number): boolean {
  return Number.isInteger(fret) && fret >= 0 && fret <= 24;
}

export function setTickCell(
  state: TabState,
  stringIndex: number,
  tickIndex: number,
  value: TabCell,
): TabState {
  if (stringIndex < 0 || stringIndex >= state.strings.length) {
    return state;
  }
  if (tickIndex < 0 || tickIndex >= state.columnCount) {
    return state;
  }
  if (value.fret !== null && !isValidFret(value.fret)) {
    return state;
  }
  if (value.fret === null && value.technique !== null) {
    return state;
  }

  const strings = state.strings.map((row, rowIndex) => {
    if (rowIndex !== stringIndex) {
      return row;
    }
    const next = [...row];
    next[tickIndex] = {
      fret: value.fret,
      technique: value.fret === null ? null : value.technique,
    };
    return next;
  });

  return {
    ...state,
    strings,
    meter: state.meter,
    instrument: state.instrument,
    title: state.title,
  };
}

export function setViewCell(
  state: TabState,
  stringIndex: number,
  viewColumn: number,
  value: TabCell,
): TabState {
  const tick = viewColumnToTickIndex(viewColumn, state.meter);
  return setTickCell(state, stringIndex, tick, value);
}

export function setCellFret(
  state: TabState,
  stringIndex: number,
  viewColumn: number,
  fret: number | null,
): TabState {
  const current = getViewCell(state, stringIndex, viewColumn);
  return setViewCell(state, stringIndex, viewColumn, {
    fret,
    technique: fret === null ? null : current.technique,
  });
}

export function toggleTechnique(
  state: TabState,
  stringIndex: number,
  viewColumn: number,
  technique: Technique,
): TabState {
  const current = getViewCell(state, stringIndex, viewColumn);
  if (current.fret === null) {
    return state;
  }
  const nextTechnique = current.technique === technique ? null : technique;
  return setViewCell(state, stringIndex, viewColumn, {
    fret: current.fret,
    technique: nextTechnique,
  });
}

export function toggleCell(
  state: TabState,
  stringIndex: number,
  viewColumn: number,
  selectedFret: number,
): TabState {
  const current = getViewCell(state, stringIndex, viewColumn);
  if (current.fret === selectedFret) {
    return setCellFret(state, stringIndex, viewColumn, null);
  }
  return setCellFret(state, stringIndex, viewColumn, selectedFret);
}

export function clearCell(
  state: TabState,
  stringIndex: number,
  viewColumn: number,
): TabState {
  return setCellFret(state, stringIndex, viewColumn, null);
}

export function addBars(state: TabState, barCount = 1): TabState {
  const addTicks = tickCountForBars(barCount, state.meter);
  const newColumnCount = state.columnCount + addTicks;
  const strings = state.strings.map((row) => [
    ...row,
    ...createEmptyRow(addTicks),
  ]);
  return {
    strings,
    columnCount: newColumnCount,
    meter: state.meter,
    instrument: state.instrument,
    title: state.title,
  };
}

function formatCellToken(cell: TabCell): string {
  if (cell.fret === null) {
    return '';
  }
  return `${cell.fret}${techniqueExportSuffix(cell.technique)}`;
}

export function exportMeterForSubdivision(
  meter: MeterConfig,
  exportSub: Subdivision,
): MeterConfig {
  return {
    ...meter,
    includeHalfBeat: exportSub === 'half',
    includeQuarterBeat: exportSub === 'quarter',
  };
}

function slotForCellWithWidth(cell: TabCell, width: number): string {
  if (cell.fret === null) {
    return '-'.repeat(Math.max(1, width));
  }
  const slot = `-${formatCellToken(cell)}`;
  if (slot.length >= width) {
    return slot;
  }
  return slot + '-'.repeat(width - slot.length);
}

function computeColumnWidths(
  exportRows: TabCell[][],
  exportCols: number,
  exportMeter: MeterConfig,
  spacing: ExportSpacingMode,
): number[] {
  const cpb = columnsPerBeat(resolveSubdivision(exportMeter));
  const widths: number[] = [];

  for (let col = 0; col < exportCols; col++) {
    let maxLen = 1;
    for (const row of exportRows) {
      const cell = row[col] ?? { ...EMPTY_CELL };
      maxLen = Math.max(maxLen, slotForCellWithWidth(cell, 1).length);
    }
    widths.push(maxLen);
  }

  if (spacing === 'normal') {
    return widths;
  }

  for (let beatStart = 0; beatStart < exportCols; beatStart += cpb) {
    const beatEnd = Math.min(beatStart + cpb, exportCols);
    let beatMax = 1;
    let hasTechnique = false;

    for (let col = beatStart; col < beatEnd; col++) {
      beatMax = Math.max(beatMax, widths[col]!);
      if (spacing === 'technique-beats') {
        for (const row of exportRows) {
          const cell = row[col] ?? { ...EMPTY_CELL };
          if (cell.technique !== null) {
            hasTechnique = true;
          }
        }
      }
    }

    const applyWiden =
      spacing === 'all' || (spacing === 'technique-beats' && hasTechnique);
    const beatWidth = applyWiden ? Math.max(2, beatMax) : beatMax;

    for (let col = beatStart; col < beatEnd; col++) {
      widths[col] = beatWidth;
    }
  }

  return widths;
}

function buildExportBodyAligned(
  cells: TabCell[],
  colWidths: number[],
  exportCols: number,
  barCols: number,
): string {
  let body = '';
  for (let i = 0; i < exportCols; i++) {
    const cell = cells[i] ?? { ...EMPTY_CELL };
    body += slotForCellWithWidth(cell, colWidths[i] ?? 1);
    if (barCols > 0 && (i + 1) % barCols === 0 && i + 1 < exportCols) {
      body += '|';
    }
  }
  return body;
}

export function exportColumnCount(
  state: TabState,
  exportSub: Subdivision,
): number {
  const bars = barCountFromTicks(state.columnCount, state.meter);
  return bars * viewColumnsPerBar(exportMeterForSubdivision(state.meter, exportSub));
}

export function formatStringLine(
  label: string,
  cells: TabCell[],
  meter?: MeterConfig,
  exportSubdivision?: Subdivision,
  spacing: ExportSpacingMode = 'normal',
): string {
  const m = meter ?? DEFAULT_METER;
  const sub = exportSubdivision ?? resolveSubdivision(m);
  const exportMeter = exportMeterForSubdivision(m, sub);
  const exportCols = Math.max(cells.length, 1);
  const colWidths = computeColumnWidths([cells], exportCols, exportMeter, spacing);
  const barCols = viewColumnsPerBar(exportMeter);
  const body = buildExportBodyAligned(cells, colWidths, exportCols, barCols);
  return `${label} ${body.length > 0 ? body : '-'}`;
}

export function formatTabText(
  state: TabState,
  exportSubdivision?: Subdivision,
  spacing: ExportSpacingMode = 'normal',
): string {
  const sub = exportSubdivision ?? resolveSubdivision(state.meter);
  const exportCols = exportColumnCount(state, sub);
  const exportMeter = exportMeterForSubdivision(state.meter, sub);
  const barCols = viewColumnsPerBar(exportMeter);

  const labels = stringLabels(state);
  const exportRows = labels.map((_, index) => {
    const row = state.strings[index] ?? [];
    return rowAtExportSubdivision(row, state.meter, sub);
  });

  const colWidths = computeColumnWidths(exportRows, exportCols, exportMeter, spacing);

  const lines = labels.map((label, index) => {
    const body = buildExportBodyAligned(
      exportRows[index] ?? [],
      colWidths,
      exportCols,
      barCols,
    );
    return { label, body: body.length > 0 ? body : '-' };
  });

  const maxBodyLen = Math.max(1, ...lines.map((line) => line.body.length));

  return lines
    .map(({ label, body }) => `${label} ${body.padEnd(maxBodyLen, ' ')}`)
    .join('\n');
}

/** @internal Exported for tests — builds slot strings for one row. */
export function exportSlotsForRow(
  state: TabState,
  stringIndex: number,
  spacing: ExportSpacingMode = 'normal',
  exportSubdivision?: Subdivision,
): { colWidths: number[]; slots: string[] } {
  const sub = exportSubdivision ?? resolveSubdivision(state.meter);
  const exportCols = exportColumnCount(state, sub);
  const exportMeter = exportMeterForSubdivision(state.meter, sub);
  const labels = stringLabels(state);
  const exportRows = labels.map((_, index) => {
    const row = state.strings[index] ?? [];
    return rowAtExportSubdivision(row, state.meter, sub);
  });
  const colWidths = computeColumnWidths(exportRows, exportCols, exportMeter, spacing);
  const row = exportRows[stringIndex] ?? [];
  const slots = Array.from({ length: exportCols }, (_, i) =>
    slotForCellWithWidth(row[i] ?? { ...EMPTY_CELL }, colWidths[i] ?? 1),
  );
  return { colWidths, slots };
}

/** Returns 1-based character indices of bar lines in an export body (for tests). */
export function barPositionsInBody(body: string): number[] {
  const positions: number[] = [];
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '|') {
      positions.push(i + 1);
    }
  }
  return positions;
}

export function tickInBeat(tickIndex: number): number {
  return tickIndex % TICKS_PER_BEAT;
}

function clearTicksWhere(
  state: TabState,
  predicate: (tickIndex: number) => boolean,
): TabState {
  const strings = state.strings.map((row) =>
    row.map((cell, tickIndex) =>
      predicate(tickIndex) ? { ...EMPTY_CELL } : cell,
    ),
  );
  return {
    ...state,
    strings,
    meter: state.meter,
    instrument: state.instrument,
    title: state.title,
  };
}

export function clearAll(state: TabState): TabState {
  return {
    ...state,
    strings: state.strings.map(() => createEmptyRow(state.columnCount)),
    meter: state.meter,
    instrument: state.instrument,
    title: state.title,
  };
}

/** Clears odd quarter slots (1 and 3) within each beat. */
export function clearHalfBeatTicks(state: TabState): TabState {
  return clearTicksWhere(state, (tick) => {
    const tib = tickInBeat(tick);
    return tib === 1 || tib === 3;
  });
}

/** Clears subdivision slots except the downbeat (ticks 1–3 within each beat). */
export function clearQuarterBeatTicks(state: TabState): TabState {
  return clearTicksWhere(state, (tick) => tickInBeat(tick) !== 0);
}
