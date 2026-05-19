import { TICKS_PER_BEAT } from './tickGrid';
import { fretToMidi } from './pitch';
import type { TabState } from './types';

export type ScheduledNote = {
  midi: number;
  time: number;
  duration: number;
  stringIndex: number;
  fret: number;
  technique?: string | null;
};

export function buildSchedule(
  state: TabState,
  startTick: number,
  bpm: number,
): ScheduledNote[] {
  const notes: ScheduledNote[] = [];
  const beatDuration = 60 / bpm; // seconds per beat
  const tickDuration = beatDuration / TICKS_PER_BEAT; // seconds per quarter-tick

  const { strings, instrument } = state;

  for (let tick = startTick; tick < state.columnCount; tick++) {
    for (let stringIndex = 0; stringIndex < strings.length; stringIndex++) {
      const cell = strings[stringIndex]?.[tick];
      if (!cell || cell.fret === null) {
        continue;
      }

      const midi = fretToMidi(instrument, stringIndex, cell.fret);
      if (midi === null) {
        continue;
      }

      const time = (tick - startTick) * tickDuration;

      // Find how long this note sustains until the next note on this string
      let endTick = tick + 1;
      while (endTick < state.columnCount) {
        const nextCell = strings[stringIndex]?.[endTick];
        if (nextCell && nextCell.fret !== null) {
          break;
        }
        endTick++;
      }

      const gapDuration = (endTick - tick) * tickDuration;
      // Cap so empty cells ahead do not ring until end of tab
      const duration = Math.min(gapDuration, beatDuration);

      notes.push({
        midi,
        time,
        duration,
        stringIndex,
        fret: cell.fret,
        technique: cell.technique,
      });
    }
  }

  return notes;
}
