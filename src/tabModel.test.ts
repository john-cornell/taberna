import { describe, expect, it } from 'vitest';
import { createMeterFromPreset, withMeterOptions } from './meter';
import {
  applyMeter,
  barPositionsInBody,
  clearCell,
  clearHalfBeatTicks,
  clearQuarterBeatTicks,
  createInitialTab,
  formatStringLine,
  formatTabText,
  setCellFret,
  toggleCell,
  toggleTechnique,
  exportSlotsForRow,
  viewColumnCount,
} from './tabModel';
import { viewColumnToTickIndex } from './tickGrid';
import { EMPTY_CELL } from './types';

describe('tabModel', () => {
  it('creates empty tab with quarter tick storage', () => {
    const tab = createInitialTab(1, createMeterFromPreset('4/4'));
    expect(tab.strings).toHaveLength(6);
    expect(tab.columnCount).toBe(16);
    expect(viewColumnCount(tab)).toBe(4);
    tab.strings.forEach((row) => {
      expect(row).toHaveLength(16);
      expect(row.every((c) => c.fret === null && c.technique === null)).toBe(
        true,
      );
    });
  });

  it('formats empty string line', () => {
    expect(formatStringLine('E', [{ ...EMPTY_CELL }, { ...EMPTY_CELL }])).toBe(
      'E --',
    );
  });

  it('formats string with frets', () => {
    const cells = [
      { fret: 2, technique: null },
      { fret: 3, technique: null },
      { fret: 4, technique: null },
      { fret: 5, technique: null },
    ];
    expect(formatStringLine('E', cells)).toBe('E -2-3-4-5');
  });

  it('formats techniques in export', () => {
    const cells = [
      { fret: 7, technique: 'bend-up' as const },
      { fret: 5, technique: 'tap-on' as const },
    ];
    expect(formatStringLine('E', cells)).toBe('E -7^-5t');
  });

  it('formats slide techniques in export', () => {
    const cells = [
      { fret: 5, technique: 'slide-up' as const },
      { fret: 3, technique: 'slide-down' as const },
    ];
    expect(formatStringLine('E', cells)).toBe('E -5/-3\\');
  });

  it('formats full empty tab with equal-width strings', () => {
    const tab = createInitialTab(1);
    const text = formatTabText(tab);
    const lines = text.split('\n');
    expect(lines).toHaveLength(6);
    const bodyLengths = lines.map((line) => line.slice(2).length);
    expect(new Set(bodyLengths).size).toBe(1);
    expect(bodyLengths[0]).toBeGreaterThan(1);
  });

  it('pads sparse strings to match the longest line on export', () => {
    let tab = createInitialTab(1);
    tab = setCellFret(tab, 1, 0, 1);
    tab = setCellFret(tab, 3, 2, 2);
    tab = setCellFret(tab, 4, 1, 3);
    const lines = formatTabText(tab).split('\n');
    const widths = lines.map((l) => l.slice(2).length);
    expect(widths[0]).toBe(widths[1]);
    expect(widths[1]).toBe(widths[3]);
    expect(lines[1]).toMatch(/^B -+1/);
    expect(lines[0]).toMatch(/^E -+\s*$/);
  });

  it('preserves column order with sparse cells at beat view', () => {
    let tab = createInitialTab(1);
    tab = setCellFret(tab, 0, 0, 2);
    tab = setCellFret(tab, 0, 2, 4);
    tab = setCellFret(tab, 0, 1, 5);
    expect(formatTabText(tab)).toContain('E -2');
    expect(formatTabText(tab)).toContain('4');
  });

  it('sets and clears cells', () => {
    let tab = createInitialTab(1);
    tab = setCellFret(tab, 1, 1, 7);
    const tick = viewColumnToTickIndex(1, tab.meter);
    expect(tab.strings[1]![tick]!.fret).toBe(7);
    tab = clearCell(tab, 1, 1);
    expect(tab.strings[1]![tick]!.fret).toBeNull();
  });

  it('toggles cell when same fret clicked', () => {
    let tab = createInitialTab(1);
    tab = toggleCell(tab, 0, 0, 3);
    expect(tab.strings[0]![0]!.fret).toBe(3);
    tab = toggleCell(tab, 0, 0, 3);
    expect(tab.strings[0]![0]!.fret).toBeNull();
  });

  it('toggles technique on a note', () => {
    let tab = createInitialTab(1);
    tab = setCellFret(tab, 0, 0, 12);
    tab = toggleTechnique(tab, 0, 0, 'bend-up');
    expect(tab.strings[0]![0]!.technique).toBe('bend-up');
    tab = toggleTechnique(tab, 0, 0, 'bend-up');
    expect(tab.strings[0]![0]!.technique).toBeNull();
  });

  it('rejects invalid fret values', () => {
    const tab = createInitialTab(1);
    const next = setCellFret(tab, 0, 0, 99);
    expect(next).toBe(tab);
  });

  it('keeps a leading dash before frets when column 0 is wider', () => {
    let tab = createInitialTab(1);
    tab = setCellFret(tab, 0, 0, 3);
    tab = toggleTechnique(tab, 0, 0, 'bend-up');
    tab = setCellFret(tab, 1, 1, 5);
    const { slots } = exportSlotsForRow(tab, 1);
    const bBody = formatTabText(tab).split('\n')[1]!.slice(2).trimEnd();
    expect(bBody).toBe(slots.join(''));
    expect(slots[1]).toBe('-5');
  });

  it('aligns bar lines across strings when techniques widen beats', () => {
    const meter = withMeterOptions(createMeterFromPreset('4/4'), {
      includeQuarterBeat: true,
    });
    let tab = createInitialTab(2, meter);
    tab = setCellFret(tab, 1, 0, 0);
    tab = setCellFret(tab, 1, 1, 1);
    tab = toggleTechnique(tab, 1, 1, 'tap-on');
    tab = setCellFret(tab, 1, 2, 0);
    tab = toggleTechnique(tab, 1, 2, 'tap-off');
    tab = setCellFret(tab, 2, 4, 0);

    const text = formatTabText(tab, 'quarter', 'technique-beats');
    const barPositions = text.split('\n').map((line) => barPositionsInBody(line.slice(2)));
    const reference = barPositions[0]!;
    expect(reference.length).toBeGreaterThan(0);
    for (const positions of barPositions) {
      expect(positions).toEqual(reference);
    }
  });

  it('inserts bar lines in export when meter is set', () => {
    const meter = createMeterFromPreset('4/4');
    let tab = createInitialTab(2, meter);
    tab = setCellFret(tab, 0, 0, 2);
    tab = setCellFret(tab, 0, 1, 3);
    tab = setCellFret(tab, 0, 4, 5);
    tab = setCellFret(tab, 0, 5, 7);
    expect(formatTabText(tab)).toContain('E -2-3');
    expect(formatTabText(tab)).toContain('|');
  });

  it('clears half and quarter beat tick slots', () => {
    let tab = createInitialTab(1);
    const meterQuarter = {
      ...createMeterFromPreset('4/4'),
      includeHalfBeat: false,
      includeQuarterBeat: true,
    };
    tab = applyMeter(tab, meterQuarter);
    tab = setCellFret(tab, 0, 0, 1);
    tab = setCellFret(tab, 0, 1, 2);
    tab = setCellFret(tab, 0, 2, 3);
    tab = clearHalfBeatTicks(tab);
    expect(tab.strings[0]![1]!.fret).toBeNull();
    expect(tab.strings[0]![2]!.fret).toBe(3);
    tab = clearQuarterBeatTicks(tab);
    expect(tab.strings[0]![0]!.fret).toBe(1);
    expect(tab.strings[0]![1]!.fret).toBeNull();
    expect(tab.strings[0]![2]!.fret).toBeNull();
  });

  it('aligns tick storage when meter changes beats per bar', () => {
    const tab = createInitialTab(1, createMeterFromPreset('4/4'));
    const meter34 = withMeterOptions(createMeterFromPreset('3/4'), {});
    const next = applyMeter(tab, meter34);
    expect(next.columnCount % (3 * 4)).toBe(0);
    expect(next.meter.preset).toBe('3/4');
  });
});
