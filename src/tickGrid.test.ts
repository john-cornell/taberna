import { describe, expect, it } from 'vitest';
import { createMeterFromPreset } from './meter';
import {
  applyMeter,
  createInitialTab,
  getViewCell,
  setCellFret,
  viewColumnCount,
} from './tabModel';
import {
  upscaleRowToTicks,
  viewColumnToTickIndex,
  rowAtExportSubdivision,
} from './tickGrid';

describe('tickGrid', () => {
  const meter44 = createMeterFromPreset('4/4');

  it('stores at quarter ticks and shows fewer view columns in beat mode', () => {
    let tab = createInitialTab(1, meter44);
    expect(tab.columnCount).toBe(16);
    expect(viewColumnCount(tab)).toBe(4);

    tab = setCellFret(tab, 0, 0, 1);
    tab = setCellFret(tab, 0, 1, 1);
    tab = setCellFret(tab, 0, 2, 1);
    tab = setCellFret(tab, 0, 3, 1);

    const meterHalf = { ...meter44, includeHalfBeat: true, includeQuarterBeat: false };
    tab = applyMeter(tab, meterHalf);
    expect(viewColumnCount(tab)).toBe(8);

    tab = setCellFret(tab, 0, 1, 2);
    const tick2 = viewColumnToTickIndex(1, meterHalf);
    expect(tab.strings[0]![tick2]!.fret).toBe(2);
  });

  it('remembers quarter detail when switching back from half', () => {
    let tab = createInitialTab(1, meter44);
    tab = setCellFret(tab, 0, 0, 1);

    const meterQuarter = {
      ...meter44,
      includeHalfBeat: false,
      includeQuarterBeat: true,
    };
    tab = applyMeter(tab, meterQuarter);
    tab = setCellFret(tab, 0, 1, 3);
    tab = setCellFret(tab, 0, 2, 2);

    const meterHalf = { ...meter44, includeHalfBeat: true, includeQuarterBeat: false };
    tab = applyMeter(tab, meterHalf);
    expect(getViewCell(tab, 0, 1).fret).toBe(2);

    tab = applyMeter(tab, meterQuarter);
    expect(getViewCell(tab, 0, 1).fret).toBe(3);
    expect(getViewCell(tab, 0, 2).fret).toBe(2);
  });

  it('upscales beat-mode columns into ticks', () => {
    const beatMeter = createMeterFromPreset('4/4');
    const row = [
      { fret: 1, technique: null },
      { fret: 1, technique: null },
      { fret: 1, technique: null },
      { fret: 1, technique: null },
    ];
    const upscaled = upscaleRowToTicks(row, beatMeter);
    expect(upscaled).toHaveLength(16);
    expect(upscaled[0]!.fret).toBe(1);
    expect(upscaled[1]!.fret).toBeNull();
    expect(upscaled[4]!.fret).toBe(1);
  });

  it('exports at chosen subdivision', () => {
    let tab = createInitialTab(1, meter44);
    tab = setCellFret(tab, 0, 0, 1);
    const row = tab.strings[0]!;
    const beatRow = rowAtExportSubdivision(row, meter44, 'beat');
    expect(beatRow).toHaveLength(4);
    expect(beatRow[0]!.fret).toBe(1);
  });
});
