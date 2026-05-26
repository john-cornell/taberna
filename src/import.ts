import { createInstrumentFromPreset } from './instrument';
import type { MeterConfig } from './meter';
import { columnsPerBeat, resolveSubdivision, type Subdivision } from './meter';
import {
  createEmptyRow,
  exportMeterForSubdivision,
  isValidFret,
} from './tabModel';
import {
  meterFromMetaLabel,
  parseTabFile,
  type ExportSpacingMode,
  type TabFileMeta,
} from './tabFileFormat';
import {
  tickCountForBars,
  viewColumnToTickIndex,
  viewColumnsPerBar,
} from './tickGrid';
import type { Technique } from './techniques';
import { EMPTY_CELL, type TabCell, type TabState } from './types';

export type ImportResult =
  | { ok: true; state: TabState }
  | { ok: false; error: string };

type ParsedRow = {
  label: string;
  cells: TabCell[];
};

const SUFFIX_TO_TECHNIQUE: Record<string, Technique> = {
  t: 'tap-on',
  o: 'tap-off',
  '^': 'bend-up',
  v: 'bend-down',
  '/': 'slide-up',
  '\\': 'slide-down',
};

function parseLegacySlot(body: string, start: number): { cell: TabCell; next: number } {
  if (body[start] !== '-') {
    return { cell: { ...EMPTY_CELL }, next: start + 1 };
  }

  const rest = body.slice(start + 1);
  const match = rest.match(/^(\d+)([to^v/\\])?/);
  if (!match) {
    return { cell: { ...EMPTY_CELL }, next: start + 1 };
  }

  const fret = Number(match[1]);
  const suffix = match[2];
  const next = start + 1 + match[0].length;

  return { cell: cellFromToken(fret, suffix), next };
}

function cellFromToken(
  fret: number,
  suffix: string | undefined,
): TabCell {
  if (!isValidFret(fret)) {
    return { ...EMPTY_CELL };
  }
  const technique = suffix ? (SUFFIX_TO_TECHNIQUE[suffix] ?? null) : null;
  return { fret, technique };
}

function parseWideSlot(
  body: string,
  start: number,
  singleDashEmpty = false,
): { cell: TabCell; next: number } {
  if (body[start] !== '-') {
    return { cell: { ...EMPTY_CELL }, next: start + 1 };
  }

  const rest = body.slice(start);
  const filled = rest.match(/^-(\d+)([to^v/\\])?(-*)/);
  if (filled) {
    const fret = Number(filled[1]);
    const suffix = filled[2];
    let next = start + 1 + filled[1]!.length + (suffix?.length ?? 0);
    while (next < body.length && body[next] === '-') {
      const tail = body.slice(next);
      if (/^-\d/.test(tail)) {
        break;
      }
      next += 1;
    }

    return { cell: cellFromToken(fret, suffix), next };
  }

  const emptyRun = rest.match(/^-+/);
  const runLen = singleDashEmpty ? 1 : (emptyRun?.[0].length ?? 1);
  const next = start + runLen;
  return { cell: { ...EMPTY_CELL }, next };
}

function bodyUsesWideSlots(body: string, spacing: ExportSpacingMode): boolean {
  if (spacing !== 'normal') {
    return true;
  }
  return /--\d/.test(body);
}

function parseSlotChunk(chunk: string): TabCell {
  const match = chunk.match(/-(\d+)([to^v/\\])?/);
  if (match?.[1]) {
    return cellFromToken(Number(match[1]), match[2]);
  }
  return { ...EMPTY_CELL };
}

/** Matches one export column slot (`--`, `-3`, `-1t--`, etc.). */
export function isValidExportSlot(slot: string, minWidth = 1): boolean {
  if (slot.length < minWidth || slot[0] !== '-') {
    return false;
  }
  return /^-(\d+)([to^v/\\])?(-*)$/.test(slot) || /^-+$/.test(slot);
}

function inferBeatColumnWidths(
  segments: string[],
  beatsPerBar: number,
  colsPerBeat: number,
  minSlotWidth: number,
): number[] | null {
  const len = segments[0]!.length;
  const memo = new Map<string, number[] | null>();

  function solve(pos: number, beatsLeft: number): number[] | null {
    if (beatsLeft === 0) {
      return pos === len ? [] : null;
    }
    if (pos > len) {
      return null;
    }

    const key = `${pos},${beatsLeft}`;
    const cached = memo.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const minTail = beatsLeft - 1;
    let result: number[] | null = null;

    for (let colW = minSlotWidth; colW <= len - pos - minTail * colsPerBeat; colW++) {
      const beatLen = colW * colsPerBeat;
      if (beatLen > len - pos - minTail * colsPerBeat) {
        continue;
      }

      const ok = segments.every((seg) => {
        const beat = seg.slice(pos, pos + beatLen);
        for (let c = 0; c < colsPerBeat; c++) {
          if (
            !isValidExportSlot(
              beat.slice(c * colW, (c + 1) * colW),
              minSlotWidth,
            )
          ) {
            return false;
          }
        }
        return true;
      });

      if (!ok) {
        continue;
      }

      const rest = solve(pos + beatLen, beatsLeft - 1);
      if (rest) {
        result = [colW, ...rest];
        break;
      }
    }

    memo.set(key, result);
    return result;
  }

  return solve(0, beatsPerBar);
}

/** Infer per-column slot widths from aligned bar segments (same length across strings). */
export function inferSlotWidths(
  segments: string[],
  columnsPerBar: number,
  colsPerBeat = 1,
  minSlotWidth = 1,
): number[] | null {
  if (segments.length === 0 || columnsPerBar <= 0) {
    return null;
  }

  const cpb =
    colsPerBeat > 0 && columnsPerBar % colsPerBeat === 0 ? colsPerBeat : 1;

  const len = segments[0]!.length;
  if (len === 0) {
    return Array.from({ length: columnsPerBar }, () => 1);
  }
  if (!segments.every((s) => s.length === len)) {
    return null;
  }

  if (len % columnsPerBar === 0) {
    const slotWidth = len / columnsPerBar;
    const equalValid = segments.every((seg) =>
      Array.from({ length: columnsPerBar }, (_, col) =>
        isValidExportSlot(
          seg.slice(col * slotWidth, (col + 1) * slotWidth),
          minSlotWidth,
        ),
      ).every(Boolean),
    );
    if (equalValid) {
      return Array.from({ length: columnsPerBar }, () => slotWidth);
    }
  }

  const beatsPerBar = columnsPerBar / cpb;
  const beatColWidths = inferBeatColumnWidths(
    segments,
    beatsPerBar,
    cpb,
    minSlotWidth,
  );
  if (beatColWidths) {
    return beatColWidths.flatMap((w) => Array.from({ length: cpb }, () => w));
  }

  const memo = new Map<string, number[] | null>();

  function solve(pos: number, colsLeft: number): number[] | null {
    if (colsLeft === 0) {
      return pos === len ? [] : null;
    }
    if (pos > len) {
      return null;
    }

    const key = `${pos},${colsLeft}`;
    const cached = memo.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const minTail = colsLeft - 1;
    let result: number[] | null = null;

    for (let w = len - pos - minTail; w >= minSlotWidth; w--) {
      const ok = segments.every((seg) =>
        isValidExportSlot(seg.slice(pos, pos + w), minSlotWidth),
      );
      if (!ok) {
        continue;
      }
      const rest = solve(pos + w, colsLeft - 1);
      if (rest) {
        result = [w, ...rest];
        break;
      }
    }

    memo.set(key, result);
    return result;
  }

  return solve(0, columnsPerBar);
}

function shouldUseInferredWidths(
  segments: string[],
  columnsPerBar: number,
  widths: number[] | null,
  options: { alignedRows?: boolean } = {},
): widths is number[] {
  if (!widths) {
    return false;
  }

  const len = segments[0]?.length ?? 0;

  /*
    If widths were inferred from multiple aligned string rows in the same bar,
    trust them.

    The previous single-note ambiguity guard is still useful for single-row
    parsing, but it is too aggressive for full exported tabs. In an exported
    multi-string bar, the other strings provide the alignment context.

    This fixes imports like born-free.txt where spacing is "all", grid is
    "half", and technique suffixes such as 1t, 0o, and 4/ make individual
    row lengths ambiguous.
  */
  if (options.alignedRows && segments.length > 1) {
    return true;
  }

  if (len > 0 && len % columnsPerBar === 0) {
    return true;
  }

  // Uneven single-row bar length: width inference is ambiguous with one note.
  return segments.every((seg) => (seg.match(/\d/g) ?? []).length !== 1);
}

function parseBarSegmentWithWidths(segment: string, widths: number[]): TabCell[] {
  let pos = 0;
  return widths.map((w) => {
    const cell = parseSlotChunk(segment.slice(pos, pos + w));
    pos += w;
    return cell;
  });
}

function parseBarSegmentFixedWidth(
  segment: string,
  columnsPerBar: number,
): TabCell[] | null {
  const trimmed = segment.trim();
  if (!trimmed || trimmed.length % columnsPerBar !== 0) {
    return null;
  }

  const slotWidth = trimmed.length / columnsPerBar;
  return Array.from({ length: columnsPerBar }, (_, col) =>
    parseSlotChunk(trimmed.slice(col * slotWidth, (col + 1) * slotWidth)),
  );
}

function placeLoneNoteInBar(
  segment: string,
  columnsPerBar: number,
): TabCell[] | null {
  const match = segment.match(/(\d+)([to^v/\\])?/);
  if (!match?.[1] || segment.match(/\d/g)!.length > 1) {
    return null;
  }

  const cells = Array.from({ length: columnsPerBar }, () => ({ ...EMPTY_CELL }));
  const cell = cellFromToken(Number(match[1]), match[2]);
  const beatIndex =
    segment.length <= columnsPerBar + 1 ? columnsPerBar - 1 : 0;
  cells[beatIndex] = cell;
  return cells;
}

function parseBarSegment(
  segment: string,
  columnsPerBar: number,
  spacing: ExportSpacingMode,
): TabCell[] {
  const trimmed = segment.trim();
  if (!trimmed) {
    return Array.from({ length: columnsPerBar }, () => ({ ...EMPTY_CELL }));
  }

  const wide = bodyUsesWideSlots(trimmed, spacing);

  if (wide) {
    const minSlot = spacing !== 'normal' ? 2 : 1;
    const inferred = inferSlotWidths([trimmed], columnsPerBar, 1, minSlot);
    if (shouldUseInferredWidths([trimmed], columnsPerBar, inferred)) {
      return parseBarSegmentWithWidths(trimmed, inferred);
    }
    const fixed = parseBarSegmentFixedWidth(trimmed, columnsPerBar);
    if (fixed) {
      return fixed;
    }
  }

  const loneNote = placeLoneNoteInBar(trimmed, columnsPerBar);
  if (loneNote) {
    return loneNote;
  }

  const cells: TabCell[] = [];
  let i = 0;

  while (cells.length < columnsPerBar && i < trimmed.length) {
    if (trimmed[i] === ' ') {
      i += 1;
      continue;
    }

    if (/\d/.test(trimmed[i]!)) {
      const digitMatch = trimmed.slice(i).match(/^(\d+)([to^v/\\])?/);
      if (digitMatch) {
        const cell = cellFromToken(Number(digitMatch[1]), digitMatch[2]);
        if (cells.length < columnsPerBar) {
          cells.push(cell);
        } else {
          cells[columnsPerBar - 1] = cell;
        }
        i += digitMatch[0].length;
        continue;
      }
    }

    if (trimmed[i] !== '-') {
      i += 1;
      continue;
    }

    const parsed = wide
      ? parseWideSlot(trimmed, i, true)
      : parseLegacySlot(trimmed, i);
    cells.push(parsed.cell);
    i = parsed.next;
  }

  while (cells.length < columnsPerBar) {
    cells.push({ ...EMPTY_CELL });
  }

  return cells.slice(0, columnsPerBar);
}

function parseExportBodyByBars(
  body: string,
  columnsPerBar: number,
  spacing: ExportSpacingMode,
  maxColumns?: number,
): TabCell[] {
  const segments = body.split('|');
  const cells: TabCell[] = [];

  for (const segment of segments) {
    cells.push(...parseBarSegment(segment, columnsPerBar, spacing));
    if (maxColumns !== undefined && cells.length >= maxColumns) {
      return cells.slice(0, maxColumns);
    }
  }

  if (maxColumns !== undefined) {
    return cells.slice(0, maxColumns);
  }

  return cells;
}

function wideBarSpacing(spacing: ExportSpacingMode): boolean {
  return spacing !== 'normal';
}

function parseBodiesWithAlignedBars(
  bodies: string[],
  columnsPerBar: number,
  spacing: ExportSpacingMode,
  colsPerBeat: number,
  maxColumns?: number,
): TabCell[][] {
  const barSegmentsByRow = bodies.map((body) => body.split('|'));
  const barCount = Math.max(0, ...barSegmentsByRow.map((bars) => bars.length));
  const cellsPerRow: TabCell[][] = bodies.map(() => []);

  for (let bar = 0; bar < barCount; bar++) {
    const segments = barSegmentsByRow.map((bars) => bars[bar] ?? '');
    const inferred = wideBarSpacing(spacing)
      ? inferSlotWidths(segments, columnsPerBar, colsPerBeat, 2)
      : null;

    const widths = shouldUseInferredWidths(
      segments,
      columnsPerBar,
      inferred,
      { alignedRows: true },
    )
      ? inferred
      : null;

    for (let row = 0; row < bodies.length; row++) {
      const segment = segments[row] ?? '';
      if (widths) {
        cellsPerRow[row]!.push(...parseBarSegmentWithWidths(segment, widths));
      } else {
        cellsPerRow[row]!.push(
          ...parseBarSegment(segment, columnsPerBar, spacing),
        );
      }
    }

    if (maxColumns !== undefined && cellsPerRow[0]!.length >= maxColumns) {
      break;
    }
  }

  if (maxColumns !== undefined) {
    return cellsPerRow.map((cells) => cells.slice(0, maxColumns));
  }

  return cellsPerRow;
}

export function parseExportBody(
  body: string,
  spacing: ExportSpacingMode = 'normal',
  maxColumns?: number,
  columnsPerBar = 4,
): TabCell[] {
  if (body.includes('|')) {
    return parseExportBodyByBars(body, columnsPerBar, spacing, maxColumns);
  }

  const cells: TabCell[] = [];
  let i = 0;
  const wide = bodyUsesWideSlots(body, spacing);

  while (i < body.length) {
    if (maxColumns !== undefined && cells.length >= maxColumns) {
      break;
    }

    if (body[i] === ' ' || body[i] === '|') {
      i += 1;
      continue;
    }

    if (/\d/.test(body[i]!)) {
      const digitMatch = body.slice(i).match(/^(\d+)([to^v/\\])?/);
      if (digitMatch) {
        cells.push(
          cellFromToken(Number(digitMatch[1]), digitMatch[2]),
        );
        i += digitMatch[0].length;
        continue;
      }
    }

    if (body[i] !== '-') {
      i += 1;
      continue;
    }

    const parsed = wide
      ? parseWideSlot(body, i)
      : parseLegacySlot(body, i);
    cells.push(parsed.cell);
    i = parsed.next;
  }

  return cells;
}

export function parseTabExportLine(
  line: string,
  spacing: ExportSpacingMode = 'normal',
  maxColumns?: number,
  columnsPerBar = 4,
): ParsedRow | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const space = trimmed.indexOf(' ');
  if (space <= 0) {
    return null;
  }

  const label = trimmed.slice(0, space).trim();
  const body = trimmed.slice(space + 1).trimEnd();
  if (!label) {
    return null;
  }

  return {
    label,
    cells: parseExportBody(body, spacing, maxColumns, columnsPerBar),
  };
}

export function expectedColumnsFromBody(
  body: string,
  meter: MeterConfig,
  exportSub: Subdivision,
): number | undefined {
  const exportMeter = exportMeterForSubdivision(meter, exportSub);
  const vcpb = viewColumnsPerBar(exportMeter);
  if (vcpb <= 0) {
    return undefined;
  }
  const barCount = Math.max(1, (body.match(/\|/g) ?? []).length + 1);
  return barCount * vcpb;
}

export function parseTabExportText(
  text: string,
  spacing: ExportSpacingMode = 'normal',
  meter?: MeterConfig,
  exportSub?: Subdivision,
): ParsedRow[] {
  const exportSubResolved =
    exportSub ?? (meter ? resolveSubdivision(meter) : 'beat');
  const columnsPerBar = meter
    ? viewColumnsPerBar(exportMeterForSubdivision(meter, exportSubResolved))
    : 4;

  const lineInfos: { label: string; body: string }[] = [];
  let stringIndex = 0;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      stringIndex = 0;
      continue;
    }
    const space = trimmed.indexOf(' ');
    if (space <= 0) {
      continue;
    }
    const label = trimmed.slice(0, space).trim();
    if (!label) {
      continue;
    }
    const bodyPart = trimmed.slice(space + 1).trimEnd();
    if (lineInfos[stringIndex]) {
      lineInfos[stringIndex]!.body += bodyPart;
    } else {
      lineInfos.push({
        label,
        body: bodyPart,
      });
    }
    stringIndex++;
  }

  if (lineInfos.length === 0) {
    return [];
  }

  const referenceBody = lineInfos[0]!.body;
  const maxColumns =
    meter && exportSub
      ? expectedColumnsFromBody(referenceBody, meter, exportSub)
      : undefined;

  const useAlignedBars =
    wideBarSpacing(spacing) && referenceBody.includes('|');

  if (useAlignedBars) {
    const cellsPerRow = parseBodiesWithAlignedBars(
      lineInfos.map((info) => info.body),
      columnsPerBar,
      spacing,
      columnsPerBeat(exportSubResolved),
      maxColumns,
    );
    return lineInfos.map((info, index) => ({
      label: info.label,
      cells: cellsPerRow[index] ?? [],
    }));
  }

  return lineInfos.map((info) => ({
    label: info.label,
    cells: parseExportBody(info.body, spacing, maxColumns, columnsPerBar),
  }));
}

function barCountFromImportedColumns(columnCount: number, meter: MeterConfig): number {
  const vcpb = viewColumnsPerBar(meter);
  return Math.max(1, Math.ceil(columnCount / vcpb));
}

export function resolveImportSubdivision(
  meta: TabFileMeta,
  baseState: TabState,
): Subdivision {
  if (meta.grid) {
    return meta.grid;
  }
  return resolveSubdivision(baseState.meter);
}

function meterWithViewGrid(meter: MeterConfig, exportSub: Subdivision): MeterConfig {
  return {
    ...meter,
    includeHalfBeat: exportSub === 'half',
    includeQuarterBeat: exportSub === 'quarter',
  };
}

export function buildStateFromParsedRows(
  rows: ParsedRow[],
  meter: MeterConfig,
  exportSub: Subdivision,
  title = '',
): TabState {
  const viewMeter = meterWithViewGrid(meter, exportSub);
  const exportMeter = exportMeterForSubdivision(meter, exportSub);
  const maxCols = Math.max(0, ...rows.map((row) => row.cells.length));
  const bars = barCountFromImportedColumns(maxCols, exportMeter);
  const columnCount = tickCountForBars(bars, viewMeter);
  const labels = rows.map((row) => row.label);

  const instrument = createInstrumentFromPreset('custom', {
    stringCount: labels.length,
    labels,
  });

  const strings = rows.map((row) => {
    const tickRow = createEmptyRow(columnCount);
    for (let viewCol = 0; viewCol < row.cells.length; viewCol++) {
      const tick = viewColumnToTickIndex(viewCol, exportMeter);
      const cell = row.cells[viewCol]!;
      if (cell.fret !== null && tick < columnCount) {
        tickRow[tick] = { fret: cell.fret, technique: cell.technique };
      }
    }
    return tickRow;
  });

  return { strings, columnCount, meter: viewMeter, instrument, title };
}

export function importTabFromText(text: string, baseState: TabState): ImportResult {
  const { meta, body } = parseTabFile(text);
  const meter = meterFromMetaLabel(meta.meterLabel, baseState.meter);
  const exportSub = resolveImportSubdivision(meta, baseState);
  const spacing = meta.spacing ?? 'normal';
  const rows = parseTabExportText(body, spacing, meter, exportSub);
  if (rows.length === 0) {
    return { ok: false, error: 'No tab lines found in file.' };
  }
  const title =
    meta.title !== undefined ? meta.title.trim() : baseState.title;

  const state = buildStateFromParsedRows(rows, meter, exportSub, title);
  return { ok: true, state };
}

export function pickTabTextFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,text/plain';
    input.style.display = 'none';

    const finish = (value: string | null) => {
      input.remove();
      resolve(value);
    };

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        finish(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        finish(typeof reader.result === 'string' ? reader.result : null);
      };
      reader.onerror = () => finish(null);
      reader.readAsText(file);
    });

    document.body.appendChild(input);
    input.click();
  });
} 