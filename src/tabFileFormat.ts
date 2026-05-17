import {
  createMeterFromPreset,
  isValidBeatsPerBar,
  meterLabel,
  type MeterConfig,
  type Subdivision,
} from './meter';
import type { TabState } from './types';

export type ExportSpacingMode = 'normal' | 'technique-beats' | 'all';

export const TABERNA_FORMAT_VERSION = 1;

export type TabFileMeta = {
  title?: string;
  meterLabel?: string;
  grid?: Subdivision;
  spacing?: ExportSpacingMode;
};

const GRID_VALUES: Subdivision[] = ['beat', 'half', 'quarter'];
const SPACING_VALUES: ExportSpacingMode[] = ['normal', 'technique-beats', 'all'];

function isSubdivision(value: string): value is Subdivision {
  return (GRID_VALUES as string[]).includes(value);
}

function isSpacingMode(value: string): value is ExportSpacingMode {
  return (SPACING_VALUES as string[]).includes(value);
}

function parseHeaderLine(line: string, meta: TabFileMeta): void {
  const content = line.slice(1).trim();
  if (
    /^Taberna\s+Version\s*:\s*\d+$/i.test(content) ||
    /^Taberna\s+\d+$/i.test(content)
  ) {
    return;
  }

  const colon = content.indexOf(':');
  if (colon <= 0) {
    return;
  }

  const key = content.slice(0, colon).trim().toLowerCase();
  const value = content.slice(colon + 1).trim();

  switch (key) {
    case 'title':
      meta.title = value;
      break;
    case 'meter':
    case 'time':
      meta.meterLabel = value;
      break;
    case 'grid':
      if (isSubdivision(value)) {
        meta.grid = value;
      }
      break;
    case 'spacing':
      if (isSpacingMode(value)) {
        meta.spacing = value;
      }
      break;
    default:
      break;
  }
}

export function parseTabFile(text: string): { meta: TabFileMeta; body: string } {
  const meta: TabFileMeta = {};
  const bodyLines: string[] = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      parseHeaderLine(trimmed, meta);
      continue;
    }
    bodyLines.push(line);
  }

  return { meta, body: bodyLines.join('\n') };
}

export function meterFromMetaLabel(
  label: string | undefined,
  fallback: MeterConfig,
): MeterConfig {
  if (!label?.trim()) {
    return fallback;
  }

  const trimmed = label.trim();
  if (trimmed === '4/4') {
    return createMeterFromPreset('4/4');
  }
  if (trimmed === '3/4') {
    return createMeterFromPreset('3/4');
  }

  const match = trimmed.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (match) {
    const beats = Number(match[1]);
    if (isValidBeatsPerBar(beats)) {
      return createMeterFromPreset('custom', beats);
    }
  }

  return fallback;
}

export function serializeTabFileVersionLine(): string {
  return `# Taberna Version: ${TABERNA_FORMAT_VERSION}`;
}

export function serializeTabFileHeaders(
  state: TabState,
  exportSub: Subdivision,
  spacing: ExportSpacingMode,
): string {
  const lines: string[] = [];

  const title = state.title.trim();
  if (title) {
    lines.push(`# title: ${title}`);
  }

  lines.push(`# meter: ${meterLabel(state.meter)}`);
  lines.push(`# grid: ${exportSub}`);

  if (spacing !== 'normal') {
    lines.push(`# spacing: ${spacing}`);
  }

  return lines.join('\n');
}

export function composeTabFile(metaHeaders: string, body: string): string {
  const trimmedBody = body.trimEnd();
  const version = serializeTabFileVersionLine();
  if (!metaHeaders.trim()) {
    return `${trimmedBody}\n\n${version}\n`;
  }
  return `${metaHeaders}\n\n${trimmedBody}\n\n${version}\n`;
}

export function slugifyFilename(title: string, maxLength = 80): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!slug) {
    return '';
  }

  return slug.slice(0, maxLength);
}
