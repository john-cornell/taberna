import type { ScheduledNote } from './playbackEngine';

export interface SoundEngine {
  start(schedule: ScheduledNote[]): void;
  stop(): void;
  setVolume(gain: number): void;
  setTone(type: OscillatorType): void;
  setSustain(level: number): void;
  resume(): Promise<boolean>;
}
