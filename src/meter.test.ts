import { describe, expect, it } from 'vitest';
import {
  alignColumnCount,
  columnsPerBar,
  columnsPerBeat,
  createMeterFromPreset,
  isBarBoundary,
  isBeatBoundary,
  isHalfBeatBoundary,
  resolveSubdivision,
  withMeterOptions,
} from './meter';

describe('meter', () => {
  it('resolves subdivision from checkboxes', () => {
    const base = createMeterFromPreset('4/4');
    expect(resolveSubdivision(base)).toBe('beat');
    expect(
      resolveSubdivision(withMeterOptions(base, { includeHalfBeat: true })),
    ).toBe('half');
    expect(
      resolveSubdivision(
        withMeterOptions(base, { includeHalfBeat: true, includeQuarterBeat: true }),
      ),
    ).toBe('quarter');
  });

  it('computes columns per bar for 4/4', () => {
    const m44 = createMeterFromPreset('4/4');
    expect(columnsPerBar(m44)).toBe(4);
    expect(columnsPerBar(withMeterOptions(m44, { includeHalfBeat: true }))).toBe(8);
    expect(
      columnsPerBar(withMeterOptions(m44, { includeQuarterBeat: true })),
    ).toBe(16);
  });

  it('computes columns per bar for 3/4', () => {
    const m34 = createMeterFromPreset('3/4');
    expect(columnsPerBar(m34)).toBe(3);
    expect(columnsPerBar(withMeterOptions(m34, { includeHalfBeat: true }))).toBe(6);
  });

  it('detects bar and beat boundaries', () => {
    const meter = withMeterOptions(createMeterFromPreset('4/4'), {
      includeHalfBeat: true,
    });
    expect(isBeatBoundary(1, meter)).toBe(true);
    expect(isBeatBoundary(2, meter)).toBe(false);
    expect(isBarBoundary(7, meter)).toBe(true);
    expect(isBarBoundary(3, meter)).toBe(false);
  });

  it('detects half-beat boundaries in quarter mode', () => {
    const meter = withMeterOptions(createMeterFromPreset('4/4'), {
      includeQuarterBeat: true,
    });
    expect(isHalfBeatBoundary(1, meter)).toBe(true);
    expect(isHalfBeatBoundary(3, meter)).toBe(false);
    expect(isBeatBoundary(3, meter)).toBe(true);
  });

  it('aligns column count to full bars', () => {
    const meter = createMeterFromPreset('4/4');
    expect(alignColumnCount(17, meter)).toBe(20);
    expect(alignColumnCount(16, meter)).toBe(16);
  });

  it('columnsPerBeat matches subdivision', () => {
    expect(columnsPerBeat('beat')).toBe(1);
    expect(columnsPerBeat('half')).toBe(2);
    expect(columnsPerBeat('quarter')).toBe(4);
  });
});
