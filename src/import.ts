import { createInstrumentFromPreset } from './instrument';
import type { MeterConfig } from './meter';
import { createEmptyRow, isValidFret } from './tabModel';
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

export function parseExportBody(body: string): TabCell[] {
  const cells: TabCell[] = [];
  let i = 0;

  while (i < body.length) {
    if (body[i] === '|') {
      i += 1;
      continue;
    }
    if (body[i] !== '-') {
      i += 1;
      continue;
    }
    i += 1;

    if (i >= body.length || body[i] === '-' || body[i] === '|') {
      cells.push({ ...EMPTY_CELL });
      continue;
    }

    const rest = body.slice(i);
    const match = rest.match(/^(\d+)([to^v/\\])?/);
    if (!match) {
      cells.push({ ...EMPTY_CELL });
      continue;
    }

    const fret = Number(match[1]);
    const suffix = match[2];
    i += match[0].length;

    if (!isValidFret(fret)) {
      cells.push({ ...EMPTY_CELL });
      continue;
    }

    const technique = suffix ? (SUFFIX_TO_TECHNIQUE[suffix] ?? null) : null;
    cells.push({ fret, technique });
  }

  return cells;
}

export function parseTabExportLine(line: string): ParsedRow | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const space = trimmed.indexOf(' ');
  if (space <= 0) {
    return null;
  }

  const label = trimmed.slice(0, space).trim();
  const body = trimmed.slice(space + 1);
  if (!label) {
    return null;
  }

  return { label, cells: parseExportBody(body) };
}

export function parseTabExportText(text: string): ParsedRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => parseTabExportLine(line))
    .filter((row): row is ParsedRow => row !== null);
}

function barCountFromImportedColumns(columnCount: number, meter: MeterConfig): number {
  const vcpb = viewColumnsPerBar(meter);
  return Math.max(1, Math.ceil(columnCount / vcpb));
}

export function buildStateFromParsedRows(
  rows: ParsedRow[],
  meter: MeterConfig,
): TabState {
  const maxCols = Math.max(0, ...rows.map((row) => row.cells.length));
  const bars = barCountFromImportedColumns(maxCols, meter);
  const columnCount = tickCountForBars(bars, meter);
  const labels = rows.map((row) => row.label);

  const instrument = createInstrumentFromPreset('custom', {
    stringCount: labels.length,
    labels,
  });

  const strings = rows.map((row) => {
    const tickRow = createEmptyRow(columnCount);
    for (let viewCol = 0; viewCol < row.cells.length; viewCol++) {
      const tick = viewColumnToTickIndex(viewCol, meter);
      const cell = row.cells[viewCol]!;
      if (cell.fret !== null && tick < columnCount) {
        tickRow[tick] = { fret: cell.fret, technique: cell.technique };
      }
    }
    return tickRow;
  });

  return { strings, columnCount, meter, instrument };
}

export function importTabFromText(text: string, baseState: TabState): ImportResult {
  const rows = parseTabExportText(text);
  if (rows.length === 0) {
    return { ok: false, error: 'No tab lines found in file.' };
  }

  const state = buildStateFromParsedRows(rows, baseState.meter);
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
