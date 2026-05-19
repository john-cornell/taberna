import { describe, expect, it } from 'vitest';
import { buildSchedule } from './playbackEngine';
import type { TabCell, TabState } from './types';
import { EMPTY_CELL } from './types';

function makeState(partial: Partial<TabState>): TabState {
  return {
    strings: [],
    columnCount: 0,
    meter: {
      preset: '4/4',
      beatsPerBar: 4,
      beatUnit: 4,
      includeHalfBeat: false,
      includeQuarterBeat: false,
    },
    instrument: {
      preset: 'guitar-6',
      labels: ['E', 'B', 'G', 'D', 'A', 'E'],
    },
    title: '',
    ...partial,
  };
}

function createRow(length: number): TabCell[] {
  return Array.from({ length }, () => ({ ...EMPTY_CELL }));
}

describe('buildSchedule', () => {
  it('returns empty for empty strings', () => {
    const state = makeState({ strings: [], columnCount: 16 });
    expect(buildSchedule(state, 0, 120)).toEqual([]);
  });

  it('schedules a single note at the correct time', () => {
    const strings = [createRow(4)];
    strings[0]![0] = { fret: 5, technique: null };
    const state = makeState({ strings, columnCount: 4 });
    const notes = buildSchedule(state, 0, 120);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      midi: 69,
      time: 0,
      duration: expect.closeTo(0.5, 3),
      stringIndex: 0,
      fret: 5,
    });
  });

  it('respects start offset', () => {
    const strings = [createRow(8)];
    strings[0]![4] = { fret: 3, technique: null };
    const state = makeState({ strings, columnCount: 8 });
    const notes = buildSchedule(state, 4, 120);
    expect(notes[0]!.time).toBe(0);
    expect(notes[0]!.midi).toBe(67);
  });

  it('extends duration across empty cells', () => {
    const strings = [createRow(8)];
    strings[0]![0] = { fret: 0, technique: null };
    strings[0]![3] = { fret: 1, technique: null };
    const state = makeState({ strings, columnCount: 8 });
    const notes = buildSchedule(state, 0, 120);
    expect(notes).toHaveLength(2);
    expect(notes[0]!.duration).toBeCloseTo(0.375, 3);
    expect(notes[1]!.duration).toBeCloseTo(0.625, 3);
  });

  it('returns no notes when all cells are empty', () => {
    const strings = [createRow(4)];
    const state = makeState({ strings, columnCount: 4 });
    expect(buildSchedule(state, 0, 120)).toEqual([]);
  });
});
