export type Technique =
  | 'tap-on'
  | 'tap-off'
  | 'bend-up'
  | 'bend-down'
  | 'slide-up'
  | 'slide-down';

export type TechniqueDef = {
  id: Technique;
  label: string;
  symbol: string;
  exportSuffix: string;
  description: string;
};

export const TECHNIQUES: TechniqueDef[] = [
  {
    id: 'tap-on',
    label: 'Tap on',
    symbol: 'T',
    exportSuffix: 't',
    description: 'Right-hand tap onto the string',
  },
  {
    id: 'tap-off',
    label: 'Tap off',
    symbol: '⊘',
    exportSuffix: 'o',
    description: 'Pull off from a tapped note',
  },
  {
    id: 'bend-up',
    label: 'Bend up',
    symbol: '↑',
    exportSuffix: '^',
    description: 'Bend the note upward',
  },
  {
    id: 'bend-down',
    label: 'Bend down',
    symbol: '↓',
    exportSuffix: 'v',
    description: 'Release or bend the note downward',
  },
  {
    id: 'slide-up',
    label: 'Slide up',
    symbol: '/',
    exportSuffix: '/',
    description: 'Slide up the string to a higher fret',
  },
  {
    id: 'slide-down',
    label: 'Slide down',
    symbol: '\\',
    exportSuffix: '\\',
    description: 'Slide down the string to a lower fret',
  },
];

export const TECHNIQUE_BY_ID = Object.fromEntries(
  TECHNIQUES.map((t) => [t.id, t]),
) as Record<Technique, TechniqueDef>;

export function techniqueExportSuffix(technique: Technique | null): string {
  if (!technique) {
    return '';
  }
  return TECHNIQUE_BY_ID[technique].exportSuffix;
}

export function techniqueSymbol(technique: Technique | null): string {
  if (!technique) {
    return '';
  }
  return TECHNIQUE_BY_ID[technique].symbol;
}

export function isTechnique(value: string): value is Technique {
  return value in TECHNIQUE_BY_ID;
}
