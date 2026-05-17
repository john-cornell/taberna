import { describe, expect, it } from 'vitest';
import { createMeterFromPreset } from './meter';
import { createInitialTab } from './tabModel';
import {
  composeTabFile,
  meterFromMetaLabel,
  parseTabFile,
  serializeTabFileHeaders,
  serializeTabFileVersionLine,
  slugifyFilename,
} from './tabFileFormat';

describe('tabFileFormat', () => {
  it('accepts legacy Taberna version header', () => {
    const { meta, body } = parseTabFile('# Taberna 1\n\nE -2');
    expect(body.trim()).toBe('E -2');
    expect(meta.title).toBeUndefined();
  });

  it('parses metadata headers and version footer separately', () => {
    const text = [
      '# title: Smoke',
      '# meter: 4/4',
      '# grid: quarter',
      '# spacing: technique-beats',
      '',
      'E -2-3',
      '',
      '# Taberna Version: 1',
    ].join('\n');

    const { meta, body } = parseTabFile(text);
    expect(meta.title).toBe('Smoke');
    expect(meta.meterLabel).toBe('4/4');
    expect(meta.grid).toBe('quarter');
    expect(meta.spacing).toBe('technique-beats');
    expect(body.trim()).toBe('E -2-3');
  });

  it('serializes headers with title and spacing', () => {
    const state = {
      ...createInitialTab(1),
      title: 'My Song',
    };
    const headers = serializeTabFileHeaders(state, 'quarter', 'all');
    expect(headers).toContain('# title: My Song');
    expect(headers).toContain('# meter: 4/4');
    expect(headers).toContain('# grid: quarter');
    expect(headers).toContain('# spacing: all');
    expect(headers).not.toContain('Taberna Version');
  });

  it('places version line at end of composed file', () => {
    const headers = serializeTabFileHeaders(createInitialTab(1), 'beat', 'normal');
    const file = composeTabFile(headers, 'E -2');
    const lines = file.trimEnd().split('\n');
    expect(lines.at(-1)).toBe(serializeTabFileVersionLine());
    expect(file.startsWith('# meter:')).toBe(true);
  });

  it('omits spacing header when normal', () => {
    const state = createInitialTab(1);
    const headers = serializeTabFileHeaders(state, 'beat', 'normal');
    expect(headers).not.toContain('# spacing:');
  });

  it('parses custom meter labels', () => {
    const fallback = createMeterFromPreset('4/4');
    const meter = meterFromMetaLabel('7/4', fallback);
    expect(meter.beatsPerBar).toBe(7);
    expect(meter.preset).toBe('custom');
  });

  it('ignores invalid meter labels', () => {
    const fallback = createMeterFromPreset('3/4');
    const meter = meterFromMetaLabel('not-a-meter', fallback);
    expect(meter).toBe(fallback);
  });

  it('slugifies filenames', () => {
    expect(slugifyFilename('Smoke on the Water!')).toBe('smoke-on-the-water');
    expect(slugifyFilename('   ')).toBe('');
  });
});
