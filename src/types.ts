import type { InstrumentConfig } from './instrument';
import { DEFAULT_INSTRUMENT } from './instrument';
import type { MeterConfig } from './meter';
import { DEFAULT_METER } from './meter';
import type { Technique } from './techniques';

export type TabCell = {
  fret: number | null;
  technique: Technique | null;
};

export const EMPTY_CELL: TabCell = { fret: null, technique: null };

export type TabState = {
  strings: TabCell[][];
  columnCount: number;
  meter: MeterConfig;
  instrument: InstrumentConfig;
};

export { DEFAULT_INSTRUMENT, DEFAULT_METER };

export const INITIAL_COLUMN_COUNT = 16;
export const COLUMNS_ADD_STEP = 8;
export const MIN_FRET = 0;
export const MAX_FRET = 24;
