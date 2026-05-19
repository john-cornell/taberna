import { formatTabText } from './tabModel';
import type { ExportSpacingMode } from './tabFileFormat';
import {
  composeTabFile,
  serializeTabFileHeaders,
  slugifyFilename,
} from './tabFileFormat';
import type { Subdivision } from './meter';
import { resolveSubdivision } from './meter';
import type { TabState } from './types';

export type ExportSubdivision = Subdivision | 'stored';

export type ExportOptions = {
  exportSub: ExportSubdivision;
  spacing: ExportSpacingMode;
};

export function resolveExportSubdivision(
  state: TabState,
  choice: ExportSubdivision,
): Subdivision {
  if (choice === 'stored') {
    return resolveSubdivision(state.meter);
  }
  return choice;
}

export function getTabExportText(
  state: TabState,
  options?: Partial<ExportOptions>,
): string {
  const exportSub = resolveExportSubdivision(
    state,
    options?.exportSub ?? 'stored',
  );
  const spacing = options?.spacing ?? 'normal';
  const headers = serializeTabFileHeaders(state, exportSub, spacing);
  const body = formatTabText(state, exportSub, spacing);
  return composeTabFile(headers, body);
}

export function tabExportFilename(state: TabState): string {
  const slug = slugifyFilename(state.title);
  if (slug) {
    return `${slug}.txt`;
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `tab-${timestamp}.txt`;
}

export function downloadText(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function downloadTab(state: TabState, options?: Partial<ExportOptions>): void {
  const text = getTabExportText(state, options);
  downloadText(text, tabExportFilename(state));
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy copy
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();

  let success = false;
  try {
    success = document.execCommand('copy');
  } catch {
    success = false;
  }

  document.body.removeChild(textarea);
  return success;
}

export async function copyTabToClipboard(
  state: TabState,
  options?: Partial<ExportOptions>,
): Promise<boolean> {
  return copyToClipboard(getTabExportText(state, options));
}

export async function saveWithPicker(
  blob: Blob,
  suggestedName: string,
  types?: { description: string; accept: Record<string, string[]> }[],
): Promise<boolean> {
  const defaultTypes = types ?? [
    { description: 'Text file', accept: { 'text/plain': ['.txt'] } },
  ];

  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName,
        types: defaultTypes,
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return false;
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = suggestedName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  return true;
}
