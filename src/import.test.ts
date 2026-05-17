import { describe, expect, it } from 'vitest';
import { createMeterFromPreset } from './meter';
import {
  importTabFromText,
  parseExportBody,
  parseTabExportLine,
} from './import';
import {
  createInitialTab,
  formatTabText,
  getViewCell,
  setCellFret,
  toggleTechnique,
} from './tabModel';

describe('import', () => {
  it('parses empty and filled export body slots', () => {
    expect(parseExportBody('---')).toHaveLength(3);
    expect(parseExportBody('-2-3-4')[0]!.fret).toBe(2);
    expect(parseExportBody('-2-3|-4-5')).toHaveLength(4);
    expect(parseExportBody('-2-3|-4-5')[2]!.fret).toBe(4);
  });

  it('parses technique suffixes on tokens', () => {
    const cells = parseExportBody('-7^-5t');
    expect(cells[0]).toEqual({ fret: 7, technique: 'bend-up' });
    expect(cells[1]).toEqual({ fret: 5, technique: 'tap-on' });
  });

  it('parses a string line with label', () => {
    const row = parseTabExportLine('E -2-3-4-5');
    expect(row?.label).toBe('E');
    expect(row?.cells[0]!.fret).toBe(2);
  });

  it('imports a saved tab into state', () => {
    const base = createInitialTab(2, createMeterFromPreset('4/4'));
    const text = 'E -2-3-4-5\nB -\nG -7\nD -\nA -\nE -';
    const result = importTabFromText(text, base);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.state.strings).toHaveLength(6);
    expect(result.state.strings[0]![0]!.fret).toBe(2);
    expect(result.state.strings[2]![0]!.fret).toBe(7);
    expect(result.state.instrument.labels[0]).toBe('E');
  });

  it('round-trips export and import', () => {
    let tab = createInitialTab(1, createMeterFromPreset('4/4'));
    tab = setCellFret(tab, 0, 0, 3);
    tab = setCellFret(tab, 1, 1, 5);
    tab = toggleTechnique(tab, 0, 0, 'bend-up');
    const exported = formatTabText(tab);
    const imported = importTabFromText(exported, tab);
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    expect(getViewCell(imported.state, 0, 0).fret).toBe(3);
    expect(getViewCell(imported.state, 0, 0).technique).toBe('bend-up');
    expect(getViewCell(imported.state, 1, 1).fret).toBe(5);
  });

  it('rejects empty files', () => {
    const result = importTabFromText('\n\n', createInitialTab(1));
    expect(result.ok).toBe(false);
  });
});
