import { describe, expect, it } from 'vitest';
import {
  BASS_4_LABELS,
  BASS_5_LABELS,
  createInstrumentFromPreset,
  labelsForPreset,
  normalizeInstrumentLabels,
  normalizeStringLabel,
} from './instrument';
import { applyInstrument, createInitialTab, formatTabText } from './tabModel';

describe('instrument', () => {
  it('provides guitar and bass label presets', () => {
    expect(labelsForPreset('guitar-6')).toEqual(['E', 'B', 'G', 'D', 'A', 'E']);
    expect(labelsForPreset('bass-4')).toEqual([...BASS_4_LABELS]);
    expect(labelsForPreset('bass-5')).toEqual([...BASS_5_LABELS]);
  });

  it('creates bass tabs with the correct string count', () => {
    const bass4 = createInitialTab(1, undefined, createInstrumentFromPreset('bass-4'));
    expect(bass4.strings).toHaveLength(4);
    expect(bass4.instrument.labels).toEqual([...BASS_4_LABELS]);

    const bass5 = createInitialTab(1, undefined, createInstrumentFromPreset('bass-5'));
    expect(bass5.strings).toHaveLength(5);
    expect(bass5.instrument.labels[4]).toBe('B');
  });

  it('supports custom string count and tuning', () => {
    const custom = createInstrumentFromPreset('custom', {
      stringCount: 3,
      labels: ['C', 'G', 'C'],
    });
    const tab = createInitialTab(1, undefined, custom);
    expect(tab.instrument.labels).toEqual(['C', 'G', 'C']);
    expect(tab.strings).toHaveLength(3);
  });

  it('preserves overlapping string data when reducing strings', () => {
    let tab = createInitialTab(1);
    tab = applyInstrument(tab, createInstrumentFromPreset('bass-4'));
    expect(tab.strings).toHaveLength(4);
    expect(tab.strings[0]![0]!.fret).toBeNull();
  });

  it('exports with custom labels', () => {
    const tab = createInitialTab(
      1,
      undefined,
      createInstrumentFromPreset('custom', {
        stringCount: 2,
        labels: ['D', 'A'],
      }),
    );
    const text = formatTabText(tab);
    const lines = text.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^D /);
    expect(lines[1]).toMatch(/^A /);
  });

  it('normalizes empty tuning labels', () => {
    expect(normalizeStringLabel('')).toBe('?');
    expect(normalizeStringLabel('  e  ')).toBe('e');
    expect(normalizeInstrumentLabels(['', 'Bb'])).toEqual(['S1', 'Bb']);
  });
});
