import { describe, expect, it } from 'vitest';
import { getTabExportText, type ExportOptions } from './export';
import { createMeterFromPreset, withMeterOptions } from './meter';
import {
  importTabFromText,
  inferSlotWidths,
  parseExportBody,
  parseTabExportLine,
} from './import';
import {
  createInitialTab,
  getTickCell,
  getViewCell,
  setCellFret,
  toggleTechnique,
} from './tabModel';

describe('import', () => {
  it('parses empty and filled export body slots', () => {
    expect(parseExportBody('---')).toHaveLength(3);
    expect(parseExportBody('-2-3-4')[0]!.fret).toBe(2);
    expect(parseExportBody('-2-3|-4-5')).toHaveLength(8);
    expect(parseExportBody('-2-3|-4-5')[0]!.fret).toBe(2);
    expect(parseExportBody('-2-3|-4-5')[4]!.fret).toBe(4);
  });

  it('parses padded double-width slots', () => {
    const cells = parseExportBody('-0--1t-0o', 'technique-beats');
    expect(cells[0]!.fret).toBe(0);
    expect(cells[1]!.fret).toBe(1);
    expect(cells[1]!.technique).toBe('tap-on');
    expect(cells[2]!.fret).toBe(0);
    expect(cells[2]!.technique).toBe('tap-off');
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

  it('imports title from header without error when meter missing', () => {
    const base = createInitialTab(1);
    const text = ['# title: My Song', '', 'E -2'].join('\n');
    const result = importTabFromText(text, base);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.state.title).toBe('My Song');
    expect(result.state.strings[0]![0]!.fret).toBe(2);
  });

  it('ignores invalid grid header and imports best effort', () => {
    const base = createInitialTab(1);
    const text = ['# grid: invalid', '', 'E -2-3'].join('\n');
    const result = importTabFromText(text, base);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(getViewCell(result.state, 0, 0).fret).toBe(2);
    expect(getViewCell(result.state, 0, 1).fret).toBe(3);
  });

  it('round-trips export and import', () => {
    let tab = createInitialTab(1, createMeterFromPreset('4/4'));
    tab = setCellFret(tab, 0, 0, 3);
    tab = setCellFret(tab, 1, 1, 5);
    tab = toggleTechnique(tab, 0, 0, 'bend-up');
    const exported = getTabExportText(tab, {
      exportSub: 'beat',
      spacing: 'normal',
    } satisfies ExportOptions);
    const imported = importTabFromText(exported, tab);
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    expect(getViewCell(imported.state, 0, 0).fret).toBe(3);
    expect(getViewCell(imported.state, 0, 0).technique).toBe('bend-up');
    expect(getViewCell(imported.state, 1, 1).fret).toBe(5);
  });

  it('round-trips quarter grid with techniques using file headers', () => {
    const beatBase = createInitialTab(2, createMeterFromPreset('4/4'));
    const quarterMeter = withMeterOptions(createMeterFromPreset('4/4'), {
      includeQuarterBeat: true,
    });
    let tab = createInitialTab(2, quarterMeter);
    tab = setCellFret(tab, 1, 0, 0);
    tab = setCellFret(tab, 1, 1, 1);
    tab = toggleTechnique(tab, 1, 1, 'tap-on');
    tab = setCellFret(tab, 1, 2, 0);
    tab = toggleTechnique(tab, 1, 2, 'tap-off');

    const exported = getTabExportText(tab, {
      exportSub: 'quarter',
      spacing: 'technique-beats',
    });
    const imported = importTabFromText(exported, beatBase);
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }

    expect(getTickCell(imported.state, 1, 0).fret).toBe(0);
    expect(getTickCell(imported.state, 1, 1).fret).toBe(1);
    expect(getTickCell(imported.state, 1, 1).technique).toBe('tap-on');
    expect(getTickCell(imported.state, 1, 2).fret).toBe(0);
    expect(getTickCell(imported.state, 1, 2).technique).toBe('tap-off');
  });

  it('imports technique-beats export with bar lines', () => {
    const text = [
      '# title: My SOng',
      '# meter: 4/4',
      '# grid: beat',
      '# spacing: technique-beats',
      '',
      'E -2-----|-1-----|----|-----',
      'B ---3---|-------|----|-----',
      'G -----4-|----2v-|----|-----',
      'D -------|-------|----|-----',
      'A -------|-------|----|-----',
      'E -------|-------|----|----4',
      '',
      '# Taberna Version: 1',
    ].join('\n');

    const result = importTabFromText(text, createInitialTab(1));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const s = result.state;
    expect(s.title).toBe('My SOng');
    expect(s.meter.includeQuarterBeat).toBe(false);
    expect(getViewCell(s, 0, 0).fret).toBe(2);
    expect(getViewCell(s, 0, 4).fret).toBe(1);
    expect(getViewCell(s, 1, 0).fret).toBe(3);
    expect(getViewCell(s, 2, 0).fret).toBe(4);
    expect(getViewCell(s, 2, 4).fret).toBe(2);
    expect(getViewCell(s, 2, 4).technique).toBe('bend-down');
    expect(getViewCell(s, 5, 15).fret).toBe(4);
  });

  it('imports technique-beats arpeggio within a bar', () => {
    const text = [
      '# title: My SOng',
      '# meter: 4/4',
      '# grid: beat',
      '# spacing: technique-beats',
      '',
      'E -0------|-------0|----|----',
      'B ---1----|-----1--|----|----',
      'G -----2--|---2----|----|----',
      'D -------3|-3------|----|----',
      'A --------|--------|----|----',
      'E --------|--------|----|----',
      '',
      '# Taberna Version: 1',
    ].join('\n');

    const result = importTabFromText(text, createInitialTab(1));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const s = result.state;
    expect(getViewCell(s, 0, 0).fret).toBe(0);
    expect(getViewCell(s, 1, 1).fret).toBe(1);
    expect(getViewCell(s, 2, 2).fret).toBe(2);
    expect(getViewCell(s, 3, 3).fret).toBe(3);
    expect(getViewCell(s, 0, 7).fret).toBe(0);
    expect(getViewCell(s, 1, 6).fret).toBe(1);
    expect(getViewCell(s, 2, 5).fret).toBe(2);
    expect(getViewCell(s, 3, 4).fret).toBe(3);
  });

  it('imports half grid spacing all with variable-width bars', () => {
    const bornFree = [
      '# title: Born Free',
      '# meter: 4/4',
      '# grid: half',
      '# spacing: all',
      '',
      'E ----------------|--------------------|----------------|--------------------|----------------|------------------|-----1--0-----------|------------------',
      'B ---------1------|---------0--1t-0o---|---------1------|---------1----------|----------------|------------------|-----1--3t-1t----1--|------------------',
      'G -------------0--|------------------0-|-------------0--|-------0---2--0o----|----------------|---------------0--|--------------------|-4/---------------',
      'D -----2----------|-----2--------------|-----2----------|-0--2t-----------3--|----------------|---------0--2t----|--------------------|------------------',
      'A -3--------------|-2------------------|-0--------------|--------------------|---------0---3--|-----3------------|--------------------|------------------',
      'E ----------------|--------------------|----------------|--------------------|-1---3----------|------------------|-1------------------|------------------',
      '',
      '# Taberna Version: 1',
    ].join('\n');

    const result = importTabFromText(bornFree, createInitialTab(1));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const s = result.state;
    expect(s.title).toBe('Born Free');
    expect(s.meter.includeHalfBeat).toBe(true);
    expect(s.meter.includeQuarterBeat).toBe(false);

    expect(getViewCell(s, 4, 0).fret).toBe(3);
    expect(getViewCell(s, 3, 2).fret).toBe(2);
    expect(getViewCell(s, 1, 4).fret).toBe(1);
    expect(getViewCell(s, 2, 6).fret).toBe(0);

    expect(getViewCell(s, 4, 8).fret).toBe(2);
    expect(getViewCell(s, 3, 8).fret).toBe(2);
    expect(getViewCell(s, 2, 8).fret).toBe(0);

    expect(getViewCell(s, 4, 8).fret).toBe(2);
    expect(getViewCell(s, 3, 8).fret).toBe(2);
    expect(getViewCell(s, 2, 8).fret).toBe(0);

    expect(getViewCell(s, 4, 16).fret).toBe(0);
    expect(getViewCell(s, 3, 18).fret).toBe(2);
    expect(getViewCell(s, 1, 20).fret).toBe(1);

    expect(getViewCell(s, 5, 32).fret).toBe(1);
  });

  it('infers export slot widths for technique bar', () => {
    const seg = ['--', '--', '-0-', '-0t', '-0o', '---', '--', '--'].join('');
    expect(inferSlotWidths([seg], 8, 2, 2)).toEqual([2, 2, 3, 3, 3, 3, 2, 2]);
  });

  it('round-trips half grid with spacing all', () => {
    const halfMeter = withMeterOptions(createMeterFromPreset('4/4'), {
      includeHalfBeat: true,
    });
    let tab = createInitialTab(4, halfMeter);
    tab = setCellFret(tab, 4, 0, 3);
    tab = setCellFret(tab, 3, 2, 2);
    tab = setCellFret(tab, 1, 4, 1);
    tab = setCellFret(tab, 2, 6, 0);
    tab = setCellFret(tab, 1, 10, 0);
    tab = setCellFret(tab, 1, 11, 0);
    tab = toggleTechnique(tab, 1, 11, 'tap-on');
    tab = setCellFret(tab, 1, 12, 0);
    tab = toggleTechnique(tab, 1, 12, 'tap-off');

    const exported = getTabExportText(tab, {
      exportSub: 'half',
      spacing: 'all',
    });
    const imported = importTabFromText(exported, createInitialTab(1));
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }

    const s = imported.state;
    expect(getViewCell(s, 4, 0).fret).toBe(3);
    expect(getViewCell(s, 3, 2).fret).toBe(2);
    expect(getViewCell(s, 1, 4).fret).toBe(1);
    expect(getViewCell(s, 2, 6).fret).toBe(0);
    expect(getViewCell(s, 1, 10).fret).toBe(0);
    expect(getViewCell(s, 1, 11).technique).toBe('tap-on');
    expect(getViewCell(s, 1, 12).fret).toBe(0);
    expect(getViewCell(s, 1, 12).technique).toBe('tap-off');
  });

  it('rejects empty files', () => {
    const result = importTabFromText('\n\n', createInitialTab(1));
    expect(result.ok).toBe(false);
  });
});
