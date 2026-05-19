export type WavePreset = {
  id: string;
  label: string;
  wave: OscillatorType;
  sustain: number;
};

export const WAVE_PRESETS: WavePreset[] = [
  { id: 'sawtooth', label: 'Sawtooth', wave: 'sawtooth', sustain: 1 / 3 },
  { id: 'sine', label: 'Sine', wave: 'sine', sustain: 1 / 3 },
  { id: 'square', label: 'Square', wave: 'square', sustain: 1 / 3 },
  { id: 'triangle', label: 'Triangle', wave: 'triangle', sustain: 1 / 3 },
  { id: 'pluck', label: 'Pluck (short)', wave: 'triangle', sustain: 0 },
  { id: 'guitar', label: 'Guitar-ish', wave: 'sawtooth', sustain: 0.2 },
  { id: 'bass', label: 'Bass', wave: 'triangle', sustain: 0.45 },
  { id: 'bright', label: 'Bright', wave: 'square', sustain: 0.25 },
  { id: 'soft', label: 'Soft', wave: 'sine', sustain: 0.5 },
  { id: 'lead', label: 'Synth lead', wave: 'sawtooth', sustain: 0.55 },
  { id: 'pad', label: 'Pad', wave: 'sine', sustain: 0.7 },
];

export function getWavePreset(id: string): WavePreset | undefined {
  return WAVE_PRESETS.find((p) => p.id === id);
}
