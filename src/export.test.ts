import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  copyToClipboard,
  downloadText,
  getTabExportText,
} from './export';
import { createInitialTab, setCellFret } from './tabModel';

describe('export', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('formats tab export text', () => {
    let tab = createInitialTab(4);
    tab = setCellFret(tab, 0, 0, 2);
    tab = setCellFret(tab, 0, 1, 3);
    tab = setCellFret(tab, 0, 2, 4);
    tab = setCellFret(tab, 0, 3, 5);
    tab = setCellFret(tab, 2, 2, 5);
    const text = getTabExportText(tab);
    expect(text).toContain('E -2-3-4-5');
    expect(text).toContain('G ---5');
    expect(text).toContain('B -');
  });

  it('downloads text via temporary anchor', () => {
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    const click = vi.fn();
    const anchor = {
      href: '',
      download: '',
      style: { display: '' },
      click,
    } as unknown as HTMLAnchorElement;

    vi.spyOn(document, 'createElement').mockReturnValue(anchor);
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => anchor);
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => anchor);

    downloadText('E -2\nB -', 'tab-test.txt');

    expect(createObjectURL).toHaveBeenCalled();
    expect(anchor.download).toBe('tab-test.txt');
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('copies via clipboard API', async () => {
    const ok = await copyToClipboard('E -\nB -');
    expect(ok).toBe(true);
    expect(navigator.clipboard?.writeText).toHaveBeenCalledWith('E -\nB -');
  });

  it('falls back to execCommand when clipboard API fails', async () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
      },
    });

    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;

    const ok = await copyToClipboard('test');
    expect(ok).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('falls back to execCommand when clipboard is unavailable', async () => {
    vi.stubGlobal('navigator', {});

    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;

    const ok = await copyToClipboard('test');
    expect(ok).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });
});
