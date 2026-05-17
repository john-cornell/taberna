import { formatTabText } from './tabModel';
import type { Subdivision } from './meter';
import { resolveSubdivision } from './meter';
import type { TabState } from './types';

export type ExportSubdivision = Subdivision | 'stored';

export function promptExportSubdivision(state: TabState): ExportSubdivision {
  const current = resolveSubdivision(state.meter);
  const labels: Record<ExportSubdivision, string> = {
    beat: 'Beat (one column per beat)',
    half: 'Half beat',
    quarter: 'Quarter beat (full detail)',
    stored: `Current view (${current})`,
  };

  const options: ExportSubdivision[] = ['stored', 'beat', 'half', 'quarter'];
  const message = [
    'Export grid resolution — notes are always stored at quarter-beat detail.',
  ]
    .concat(options.map((o, i) => `${i + 1}. ${labels[o]}`))
    .join('\n');

  const choice = window.prompt(message, '1');
  if (choice === null) {
    return 'stored';
  }

  const index = Number(choice);
  if (Number.isInteger(index) && index >= 1 && index <= options.length) {
    return options[index - 1]!;
  }

  const lower = choice.toLowerCase();
  if (lower === 'beat' || lower === '1') {
    return 'beat';
  }
  if (lower === 'half' || lower === '2') {
    return 'half';
  }
  if (lower === 'quarter' || lower === '3') {
    return 'quarter';
  }
  return 'stored';
}

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
  exportSubdivision?: ExportSubdivision,
): string {
  const sub =
    exportSubdivision === undefined
      ? resolveSubdivision(state.meter)
      : resolveExportSubdivision(state, exportSubdivision);
  return formatTabText(state, sub);
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

export function downloadTab(
  state: TabState,
  exportSubdivision?: ExportSubdivision,
): void {
  const text = getTabExportText(state, exportSubdivision);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  downloadText(text, `tab-${timestamp}.txt`);
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
  exportSubdivision?: ExportSubdivision,
): Promise<boolean> {
  return copyToClipboard(getTabExportText(state, exportSubdivision));
}
