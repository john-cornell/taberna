import {
  beatsPerBarForPreset,
  columnsPerBar,
  columnsPerBeat,
  createMeterFromPreset,
  MAX_BEATS_PER_BAR,
  meterLabel,
  MIN_BEATS_PER_BAR,
  resolveSubdivision,
  type MeterConfig,
  type TimeSignaturePreset,
  withMeterOptions,
} from './meter';
import {
  clampStringCount,
  createInstrumentFromPreset,
  isValidStringCount,
  MAX_STRING_COUNT,
  MIN_STRING_COUNT,
  type InstrumentConfig,
  type InstrumentPreset,
} from './instrument';
import {
  addBars,
  applyInstrument,
  applyMeter,
  clearAll,
  clearCell,
  clearHalfBeatTicks,
  clearQuarterBeatTicks,
  createInitialTab,
  getViewCell,
  isValidFret,
  setCellFret,
  stringLabels,
  toggleCell,
  toggleTechnique,
  viewColumnCount,
} from './tabModel';
import {
  isViewBarBoundary,
  isViewBeatBoundary,
  isViewHalfBeatBoundary,
  ticksPerBar,
} from './tickGrid';
import { TECHNIQUES, techniqueSymbol, type Technique } from './techniques';
import { MAX_FRET, MIN_FRET, type TabState } from './types';

type CellTarget = {
  wrap: HTMLElement;
  input: HTMLInputElement;
  stringIndex: number;
  columnIndex: number;
};

export type TabViewCallbacks = {
  onStateChange?: (state: TabState) => void;
};

export class TabView {
  private state: TabState;
  private selectedFret: number | null = null;
  private selectedClear = false;
  private focusedCell: CellTarget | null = null;

  private readonly root: HTMLElement;
  private readonly gridEl: HTMLElement;
  private readonly paletteEl: HTMLElement;
  private readonly techniquePaletteEl: HTMLElement;
  private readonly instrumentEl: HTMLElement;
  private readonly customStringCountInput: HTMLInputElement;
  private readonly customTuningEl: HTMLElement;
  private readonly meterEl: HTMLElement;
  private readonly customBeatsInput: HTMLInputElement;
  private readonly halfBeatCheckbox: HTMLInputElement;
  private readonly quarterBeatCheckbox: HTMLInputElement;
  private readonly meterSummaryEl: HTMLElement;
  private readonly toastEl: HTMLElement;
  private toastTimeoutId: ReturnType<typeof window.setTimeout> | null = null;

  constructor(
    container: HTMLElement,
    private readonly callbacks: TabViewCallbacks = {},
  ) {
    this.state = createInitialTab();
    this.root = document.createElement('div');
    this.root.className = 'tab-editor';

    const header = document.createElement('header');
    header.className = 'tab-header';
    const title = document.createElement('h1');
    title.textContent = 'Taberna Tab Builder';
    header.appendChild(title);

    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.textContent = 'Copy';
    copyBtn.setAttribute('aria-label', 'Copy tab to clipboard');
    copyBtn.dataset.action = 'copy';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Save';
    saveBtn.setAttribute('aria-label', 'Save tab as text file');
    saveBtn.dataset.action = 'save';
    const importBtn = document.createElement('button');
    importBtn.type = 'button';
    importBtn.textContent = 'Import';
    importBtn.setAttribute('aria-label', 'Import tab from a text file');
    importBtn.dataset.action = 'import';
    const addBarBtn = document.createElement('button');
    addBarBtn.type = 'button';
    addBarBtn.textContent = 'Add bar';
    addBarBtn.setAttribute('aria-label', 'Add one bar to the grid');
    addBarBtn.dataset.action = 'add-bar';
    const clearAllBtn = document.createElement('button');
    clearAllBtn.type = 'button';
    clearAllBtn.textContent = 'Clear all';
    clearAllBtn.dataset.action = 'clear-all';
    const clearHalfBtn = document.createElement('button');
    clearHalfBtn.type = 'button';
    clearHalfBtn.textContent = 'Clear half beats';
    clearHalfBtn.dataset.action = 'clear-half-beats';
    const clearQuarterBtn = document.createElement('button');
    clearQuarterBtn.type = 'button';
    clearQuarterBtn.textContent = 'Clear quarter beats';
    clearQuarterBtn.dataset.action = 'clear-quarter-beats';
    toolbar.append(
      copyBtn,
      saveBtn,
      importBtn,
      addBarBtn,
      clearAllBtn,
      clearHalfBtn,
      clearQuarterBtn,
    );
    header.appendChild(toolbar);

    this.instrumentEl = this.buildInstrumentSection();
    this.customStringCountInput = this.instrumentEl.querySelector(
      '[data-instrument="string-count"]',
    ) as HTMLInputElement;
    this.customTuningEl = this.instrumentEl.querySelector(
      '[data-instrument="tuning"]',
    ) as HTMLElement;

    this.meterEl = this.buildMeterSection();
    this.customBeatsInput = this.meterEl.querySelector(
      '[data-meter="custom-beats"]',
    ) as HTMLInputElement;
    this.halfBeatCheckbox = this.meterEl.querySelector(
      '[data-meter="half-beat"]',
    ) as HTMLInputElement;
    this.quarterBeatCheckbox = this.meterEl.querySelector(
      '[data-meter="quarter-beat"]',
    ) as HTMLInputElement;
    this.meterSummaryEl = this.meterEl.querySelector(
      '[data-meter="summary"]',
    ) as HTMLElement;

    this.gridEl = document.createElement('div');
    this.gridEl.className = 'tab-grid';
    this.gridEl.setAttribute('role', 'grid');
    this.gridEl.setAttribute('aria-label', 'Tab grid');

    const paletteSection = document.createElement('section');
    paletteSection.className = 'palette-section';
    const paletteLabel = document.createElement('p');
    paletteLabel.className = 'palette-label';
    paletteLabel.textContent = 'Fret:';
    this.paletteEl = document.createElement('div');
    this.paletteEl.className = 'fret-palette';
    this.paletteEl.setAttribute('role', 'toolbar');
    this.paletteEl.setAttribute('aria-label', 'Fret palette');

    const techniqueLabel = document.createElement('p');
    techniqueLabel.className = 'palette-label';
    techniqueLabel.textContent = 'Techniques:';
    this.techniquePaletteEl = document.createElement('div');
    this.techniquePaletteEl.className = 'technique-palette';
    this.techniquePaletteEl.setAttribute('role', 'toolbar');
    this.techniquePaletteEl.setAttribute(
      'aria-label',
      'Techniques — focus a cell, then click to toggle on that note',
    );

    const instructions = document.createElement('ul');
    instructions.className = 'palette-instructions';
    for (const text of [
      'Frets: select a number, click a cell to place; click the same cell again to clear.',
      'Clear: select · before 0, then click a cell to empty it.',
      'Type 0–24 in a cell, or scroll over a cell to focus and change frets (up from empty sets 0, down past 0 clears).',
      'Half / quarter / beat views share one timeline — hidden subdivisions are remembered when you switch.',
      'Instrument: guitar (6), bass (4 or 5), or custom string count and tuning labels.',
      'Copy / Save export; Import loads a .txt file saved from Taberna (uses current time signature and grid).',
      'Copy / Save asks which grid resolution to export; all strings pad to the same width with dashes.',
      'Clear all / half beats / quarter beats remove notes from those timeline slots.',
      'Techniques: focus a cell with a fret, then click tap/bend/slide to toggle on or off.',
      'Export suffixes: t tap-on, o tap-off, ^ bend up, v bend down, / slide up, \\ slide down (e.g. -7/).',
    ]) {
      const item = document.createElement('li');
      item.textContent = text;
      instructions.appendChild(item);
    }

    paletteSection.append(
      paletteLabel,
      this.paletteEl,
      techniqueLabel,
      this.techniquePaletteEl,
      instructions,
    );

    this.toastEl = document.createElement('div');
    this.toastEl.className = 'toast';
    this.toastEl.setAttribute('aria-live', 'polite');
    this.toastEl.hidden = true;

    this.root.append(
      header,
      this.instrumentEl,
      this.meterEl,
      this.gridEl,
      paletteSection,
      this.toastEl,
    );
    container.appendChild(this.root);

    this.syncInstrumentControls();
    this.syncMeterControls();
    this.renderPalette();
    this.renderTechniquePalette();
    this.renderGrid();
    this.bindEvents();
  }

  getMeter(): MeterConfig {
    return this.state.meter;
  }

  private buildInstrumentSection(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'instrument-section';
    section.setAttribute('aria-label', 'Instrument and tuning');

    const presetLabel = document.createElement('label');
    presetLabel.className = 'instrument-field';
    presetLabel.textContent = 'Instrument ';
    const presetSelect = document.createElement('select');
    presetSelect.dataset.instrument = 'preset';
    presetSelect.setAttribute('aria-label', 'Instrument preset');
    for (const value of [
      'guitar-6',
      'bass-4',
      'bass-5',
      'custom',
    ] as InstrumentPreset[]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent =
        value === 'guitar-6'
          ? 'Guitar (6)'
          : value === 'bass-4'
            ? 'Bass (4)'
            : value === 'bass-5'
              ? 'Bass (5)'
              : 'Custom';
      presetSelect.appendChild(option);
    }
    presetLabel.appendChild(presetSelect);

    const customWrap = document.createElement('div');
    customWrap.className = 'instrument-custom';
    customWrap.dataset.instrument = 'custom-wrap';

    const countLabel = document.createElement('label');
    countLabel.className = 'instrument-field';
    countLabel.textContent = 'Strings ';
    const countInput = document.createElement('input');
    countInput.type = 'number';
    countInput.min = String(MIN_STRING_COUNT);
    countInput.max = String(MAX_STRING_COUNT);
    countInput.value = '6';
    countInput.dataset.instrument = 'string-count';
    countInput.setAttribute('aria-label', 'Number of strings');
    countLabel.appendChild(countInput);

    const tuningHint = document.createElement('span');
    tuningHint.className = 'instrument-hint';
    tuningHint.textContent = 'Tuning (top string first):';

    const tuning = document.createElement('div');
    tuning.className = 'instrument-tuning';
    tuning.dataset.instrument = 'tuning';

    customWrap.append(countLabel, tuningHint, tuning);
    section.append(presetLabel, customWrap);
    return section;
  }

  private syncInstrumentControls(): void {
    const { instrument } = this.state;
    const presetSelect = this.instrumentEl.querySelector<HTMLSelectElement>(
      '[data-instrument="preset"]',
    );
    if (presetSelect) {
      presetSelect.value = instrument.preset;
    }

    const customWrap = this.instrumentEl.querySelector<HTMLElement>(
      '[data-instrument="custom-wrap"]',
    );
    if (customWrap) {
      customWrap.hidden = instrument.preset !== 'custom';
    }

    this.customStringCountInput.value = String(instrument.labels.length);
    this.renderCustomTuningFields();
  }

  private renderCustomTuningFields(): void {
    const existing: string[] = [];
    this.customTuningEl
      .querySelectorAll<HTMLInputElement>('[data-tuning-index]')
      .forEach((input) => {
        const index = Number(input.dataset.tuningIndex);
        if (Number.isInteger(index)) {
          existing[index] = input.value;
        }
      });

    const count = clampStringCount(Number(this.customStringCountInput.value));
    this.customStringCountInput.value = String(count);
    this.customTuningEl.replaceChildren();

    for (let i = 0; i < count; i++) {
      const field = document.createElement('label');
      field.className = 'instrument-tuning-field';
      const indexLabel = document.createElement('span');
      indexLabel.textContent = String(i + 1);
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 4;
      input.dataset.tuningIndex = String(i);
      input.value =
        existing[i] ?? this.state.instrument.labels[i] ?? `S${i + 1}`;
      input.setAttribute(
        'aria-label',
        `String ${i + 1} label (top string is 1)`,
      );
      field.append(indexLabel, input);
      this.customTuningEl.appendChild(field);
    }
  }

  private readInstrumentFromControls(): InstrumentConfig {
    const preset =
      (this.instrumentEl.querySelector<HTMLSelectElement>(
        '[data-instrument="preset"]',
      )?.value as InstrumentPreset) ?? 'guitar-6';

    if (preset !== 'custom') {
      return createInstrumentFromPreset(preset);
    }

    const parsed = Number(this.customStringCountInput.value);
    const stringCount = isValidStringCount(parsed)
      ? parsed
      : this.state.instrument.labels.length;

    const labels: string[] = [];
    for (let i = 0; i < stringCount; i++) {
      const input = this.customTuningEl.querySelector<HTMLInputElement>(
        `[data-tuning-index="${i}"]`,
      );
      labels.push(input?.value ?? this.state.instrument.labels[i] ?? '');
    }

    return createInstrumentFromPreset('custom', { stringCount, labels });
  }

  private updateInstrument(nextInstrument: InstrumentConfig): void {
    this.state = applyInstrument(this.state, nextInstrument);
    this.syncInstrumentControls();
    this.renderGrid();
    this.emitState();
  }

  private buildMeterSection(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'meter-section';
    section.setAttribute('aria-label', 'Time signature and beat grid');

    const presetLabel = document.createElement('label');
    presetLabel.className = 'meter-field';
    presetLabel.textContent = 'Time ';
    const presetSelect = document.createElement('select');
    presetSelect.dataset.meter = 'preset';
    presetSelect.setAttribute('aria-label', 'Time signature preset');
    for (const value of ['4/4', '3/4', 'custom'] as TimeSignaturePreset[]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      presetSelect.appendChild(option);
    }
    presetLabel.appendChild(presetSelect);

    const customLabel = document.createElement('label');
    customLabel.className = 'meter-field meter-custom-beats';
    customLabel.dataset.meter = 'custom-wrap';
    customLabel.textContent = 'Beats/bar ';
    const customInput = document.createElement('input');
    customInput.type = 'number';
    customInput.min = String(MIN_BEATS_PER_BAR);
    customInput.max = String(MAX_BEATS_PER_BAR);
    customInput.value = '4';
    customInput.dataset.meter = 'custom-beats';
    customInput.setAttribute('aria-label', 'Custom beats per bar');
    customLabel.appendChild(customInput);

    const halfLabel = document.createElement('label');
    halfLabel.className = 'meter-field meter-check';
    const halfInput = document.createElement('input');
    halfInput.type = 'checkbox';
    halfInput.dataset.meter = 'half-beat';
    halfInput.setAttribute('aria-label', 'Include half beat subdivisions');
    halfLabel.append(halfInput, document.createTextNode(' Half beat'));

    const quarterLabel = document.createElement('label');
    quarterLabel.className = 'meter-field meter-check';
    const quarterInput = document.createElement('input');
    quarterInput.type = 'checkbox';
    quarterInput.dataset.meter = 'quarter-beat';
    quarterInput.setAttribute('aria-label', 'Include quarter beat subdivisions');
    quarterLabel.append(quarterInput, document.createTextNode(' Quarter beat'));

    const summary = document.createElement('span');
    summary.className = 'meter-summary';
    summary.dataset.meter = 'summary';

    section.append(presetLabel, customLabel, halfLabel, quarterLabel, summary);
    return section;
  }

  private syncMeterControls(): void {
    const meter = this.state.meter;
    const presetSelect = this.meterEl.querySelector<HTMLSelectElement>(
      '[data-meter="preset"]',
    );
    if (presetSelect) {
      presetSelect.value = meter.preset;
    }

    this.customBeatsInput.value = String(meter.beatsPerBar);
    const customWrap = this.meterEl.querySelector<HTMLElement>(
      '[data-meter="custom-wrap"]',
    );
    if (customWrap) {
      customWrap.hidden = meter.preset !== 'custom';
    }

    this.halfBeatCheckbox.checked = meter.includeHalfBeat;
    this.quarterBeatCheckbox.checked = meter.includeQuarterBeat;

    const vcpb = columnsPerBar(meter);
    const tpb = ticksPerBar(meter);
    this.meterSummaryEl.textContent = `${meterLabel(meter)} · ${vcpb} cols/bar (${tpb} ticks stored)`;
  }

  private updateMeter(nextMeter: MeterConfig): void {
    this.state = applyMeter(this.state, nextMeter);
    this.syncMeterControls();
    this.renderGrid();
    this.emitState();
  }

  private readMeterFromControls(): MeterConfig {
    const preset =
      (this.meterEl.querySelector<HTMLSelectElement>('[data-meter="preset"]')
        ?.value as TimeSignaturePreset) ?? '4/4';

    let beatsPerBar = beatsPerBarForPreset(preset);
    if (preset === 'custom') {
      const parsed = Number(this.customBeatsInput.value);
      if (
        Number.isInteger(parsed) &&
        parsed >= MIN_BEATS_PER_BAR &&
        parsed <= MAX_BEATS_PER_BAR
      ) {
        beatsPerBar = parsed;
      }
    }

    const base = createMeterFromPreset(preset, beatsPerBar);
    return withMeterOptions(base, {
      beatsPerBar,
      includeHalfBeat: this.halfBeatCheckbox.checked,
      includeQuarterBeat: this.quarterBeatCheckbox.checked,
    });
  }

  getState(): TabState {
    return this.state;
  }

  setState(state: TabState): void {
    this.state = state;
    this.syncInstrumentControls();
    this.syncMeterControls();
    this.renderGrid();
  }

  getSelectedFret(): number | null {
    return this.selectedFret;
  }

  selectFret(fret: number): void {
    if (!isValidFret(fret)) {
      return;
    }
    this.selectedClear = false;
    this.selectedFret = fret;
    this.renderPalette();
  }

  selectClear(): void {
    this.selectedClear = true;
    this.selectedFret = null;
    this.renderPalette();
    this.renderTechniquePalette();
  }

  showToast(message: string, durationMs = 2000): void {
    if (this.toastTimeoutId !== null) {
      window.clearTimeout(this.toastTimeoutId);
    }
    this.toastEl.textContent = message;
    this.toastEl.hidden = false;
    this.toastTimeoutId = window.setTimeout(() => {
      this.toastEl.hidden = true;
      this.toastTimeoutId = null;
    }, durationMs);
  }

  private emitState(): void {
    this.callbacks.onStateChange?.(this.state);
  }

  private focusCell(stringIndex: number, columnIndex: number): void {
    const input = this.gridEl.querySelector<HTMLInputElement>(
      `[data-string-index="${stringIndex}"][data-column-index="${columnIndex}"]`,
    );
    if (!input) {
      return;
    }
    const target = this.findCellTarget(input);
    if (target) {
      this.focusCellForInteraction(target);
    }
  }

  /** Focus a cell and sync palette + display to match stored state. */
  private focusCellForInteraction(
    target: CellTarget,
    options?: { syncPalette?: boolean },
  ): void {
    this.focusedCell = target;
    this.syncCellDisplay(target);

    if (document.activeElement !== target.input) {
      target.input.focus({ preventScroll: true });
    }
    target.input.classList.add('cell-focused');

    if (options?.syncPalette !== false) {
      this.syncPaletteToCell(target);
    }
    this.renderTechniquePalette();
  }

  private syncPaletteToCell(target: CellTarget): void {
    const cell = getViewCell(this.state, target.stringIndex, target.columnIndex);
    if (cell.fret !== null) {
      this.selectedClear = false;
      this.selectedFret = cell.fret;
    } else {
      this.selectedFret = null;
      this.selectedClear = false;
    }
    this.renderPalette();
  }

  private cellTargetFromPointer(event: WheelEvent | MouseEvent): CellTarget | null {
    const direct = this.findCellTarget(event.target);
    if (direct) {
      return direct;
    }
    const underPointer = document.elementFromPoint(event.clientX, event.clientY);
    return this.findCellTarget(underPointer);
  }

  private updateState(next: TabState, options?: { rerender?: boolean }): void {
    this.state = next;
    if (options?.rerender !== false) {
      this.renderGrid();
    }
    this.emitState();
  }

  private syncCellClasses(cell: HTMLInputElement, fret: number | null): void {
    cell.classList.toggle('cell-filled', fret !== null);
    cell.classList.toggle('cell-empty', fret === null);
  }

  private findCellTarget(target: EventTarget | null): CellTarget | null {
    const el = target as HTMLElement | null;
    if (!el) {
      return null;
    }

    const wrap = el.closest<HTMLElement>('.tab-cell-wrap');
    const input =
      wrap?.querySelector<HTMLInputElement>('.tab-cell') ??
      el.closest<HTMLInputElement>('.tab-cell');
    if (!input) {
      return null;
    }
    const wrapEl = input.closest<HTMLElement>('.tab-cell-wrap');
    if (!wrapEl) {
      return null;
    }
    const stringIndex = Number(input.dataset.stringIndex);
    const columnIndex = Number(input.dataset.columnIndex);
    if (Number.isNaN(stringIndex) || Number.isNaN(columnIndex)) {
      return null;
    }
    return { wrap: wrapEl, input, stringIndex, columnIndex };
  }

  private syncCellDisplay(target: CellTarget): void {
    const cell = getViewCell(this.state, target.stringIndex, target.columnIndex);
    target.input.value = cell.fret !== null ? String(cell.fret) : '';
    this.syncCellClasses(target.input, cell.fret);

    const badge = target.wrap.querySelector<HTMLElement>('.cell-technique');
    if (badge) {
      if (cell.technique) {
        badge.textContent = techniqueSymbol(cell.technique);
        badge.hidden = false;
        badge.dataset.technique = cell.technique;
        target.wrap.classList.add('has-technique');
      } else {
        badge.textContent = '';
        badge.hidden = true;
        badge.removeAttribute('data-technique');
        target.wrap.classList.remove('has-technique');
      }
    }

    const techLabel = cell.technique ? `, ${cell.technique}` : '';
    const fretLabel = cell.fret !== null ? String(cell.fret) : 'empty';
    target.input.setAttribute(
      'aria-label',
      `${stringLabels(this.state)[target.stringIndex] ?? '?'} string, column ${target.columnIndex + 1}, ${fretLabel}${techLabel}`,
    );
  }

  private getFocusedCellTarget(): CellTarget | null {
    const active = document.activeElement;
    if (active) {
      const fromActive = this.findCellTarget(active);
      if (fromActive) {
        return fromActive;
      }
    }
    return this.focusedCell;
  }

  private applyTechniqueToFocused(technique: Technique): void {
    const target = this.getFocusedCellTarget();
    if (!target) {
      this.showToast('Focus a cell first, then click a technique.');
      return;
    }
    this.applyTechniqueToCell(target, technique);
    this.renderTechniquePalette();
  }

  private applyTechniqueToCell(target: CellTarget, technique: Technique): void {
    const current = getViewCell(this.state, target.stringIndex, target.columnIndex);
    if (current.fret === null) {
      this.showToast('Add a fret number before applying a technique.');
      return;
    }
    const next = toggleTechnique(
      this.state,
      target.stringIndex,
      target.columnIndex,
      technique,
    );
    this.state = next;
    this.syncCellDisplay(target);
    this.emitState();
  }

  private finalizeCellInput(target: CellTarget): void {
    const digits = target.input.value.replace(/\D/g, '');
    target.input.value = digits;

    if (digits === '') {
      const next = clearCell(
        this.state,
        target.stringIndex,
        target.columnIndex,
      );
      this.state = next;
      this.syncCellDisplay(target);
      this.emitState();
      return;
    }

    const fret = Number(digits);
    if (!isValidFret(fret)) {
      this.revertCellInput(target);
      return;
    }

    const next = setCellFret(
      this.state,
      target.stringIndex,
      target.columnIndex,
      fret,
    );
    this.state = next;
    this.syncCellDisplay(target);
    this.emitState();
  }

  private revertCellInput(target: CellTarget): void {
    this.syncCellDisplay(target);
  }

  private clearCellAt(target: CellTarget): void {
    const next = clearCell(this.state, target.stringIndex, target.columnIndex);
    this.state = next;
    this.syncCellDisplay(target);
    this.emitState();
  }

  private nudgeCellFretValue(target: CellTarget, direction: 1 | -1): void {
    const current = getViewCell(this.state, target.stringIndex, target.columnIndex);

    if (current.fret === null) {
      if (direction > 0) {
        const next = setCellFret(
          this.state,
          target.stringIndex,
          target.columnIndex,
          MIN_FRET,
        );
        this.state = next;
        this.syncCellDisplay(target);
        this.selectFret(MIN_FRET);
        this.emitState();
      }
      return;
    }

    if (current.fret === MIN_FRET && direction < 0) {
      const next = clearCell(
        this.state,
        target.stringIndex,
        target.columnIndex,
      );
      this.state = next;
      this.syncCellDisplay(target);
      this.selectClear();
      this.emitState();
      return;
    }

    const nextFret = current.fret + direction;
    if (!isValidFret(nextFret)) {
      return;
    }

    const next = setCellFret(
      this.state,
      target.stringIndex,
      target.columnIndex,
      nextFret,
    );
    this.state = next;
    this.syncCellDisplay(target);
    this.selectFret(nextFret);
    this.emitState();
  }

  private renderPalette(): void {
    this.paletteEl.replaceChildren();

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'palette-fret palette-clear';
    clearBtn.textContent = '·';
    clearBtn.setAttribute('aria-label', 'Clear cell');
    clearBtn.setAttribute('aria-pressed', String(this.selectedClear));
    if (this.selectedClear) {
      clearBtn.classList.add('selected-palette');
    }
    clearBtn.addEventListener('click', () => {
      this.selectClear();
    });
    this.paletteEl.appendChild(clearBtn);

    for (let fret = MIN_FRET; fret <= MAX_FRET; fret++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'palette-fret';
      btn.textContent = String(fret);
      btn.setAttribute('aria-label', `Fret ${fret}`);
      btn.dataset.fret = String(fret);

      if (this.selectedFret === fret) {
        btn.classList.add('selected-palette');
        btn.setAttribute('aria-pressed', 'true');
      } else {
        btn.setAttribute('aria-pressed', 'false');
      }

      btn.addEventListener('click', () => {
        this.selectFret(fret);
      });

      this.paletteEl.appendChild(btn);
    }
  }

  private renderTechniquePalette(): void {
    this.techniquePaletteEl.replaceChildren();
    const focused = this.getFocusedCellTarget();
    const focusedCell = focused
      ? getViewCell(this.state, focused.stringIndex, focused.columnIndex)
      : null;

    for (const tech of TECHNIQUES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'palette-technique';
      btn.title = `${tech.label} — export: ${tech.exportSuffix}`;
      btn.setAttribute('aria-label', tech.label);
      btn.dataset.technique = tech.id;

      const symbol = document.createElement('span');
      symbol.className = 'palette-technique-symbol';
      symbol.textContent = tech.symbol;
      const name = document.createElement('span');
      name.className = 'palette-technique-name';
      name.textContent = tech.label;
      btn.append(symbol, name);

      const activeOnFocused = focusedCell?.technique === tech.id;
      if (activeOnFocused) {
        btn.classList.add('selected-palette');
        btn.setAttribute('aria-pressed', 'true');
      } else {
        btn.setAttribute('aria-pressed', 'false');
      }

      btn.addEventListener('mousedown', (event) => {
        event.preventDefault();
      });
      btn.addEventListener('click', () => {
        this.applyTechniqueToFocused(tech.id);
      });

      this.techniquePaletteEl.appendChild(btn);
    }
  }

  private renderGrid(): void {
    const viewCols = viewColumnCount(this.state);
    this.gridEl.style.setProperty('--view-cols', String(viewCols));
    this.gridEl.replaceChildren();
    this.gridEl.appendChild(this.buildBeatRuler());

    const labels = stringLabels(this.state);
    labels.forEach((label, stringIndex) => {
      const row = document.createElement('div');
      row.className = 'tab-row';
      row.setAttribute('role', 'row');

      const labelEl = document.createElement('span');
      labelEl.className = 'string-label';
      labelEl.textContent = label;
      labelEl.setAttribute('aria-hidden', 'true');
      row.appendChild(labelEl);

      for (let columnIndex = 0; columnIndex < viewCols; columnIndex++) {
        const tabCell = getViewCell(this.state, stringIndex, columnIndex);
        const wrap = document.createElement('div');
        wrap.className = 'tab-cell-wrap tab-column';
        wrap.dataset.stringIndex = String(stringIndex);
        wrap.dataset.columnIndex = String(columnIndex);

        const cell = document.createElement('input');
        cell.type = 'text';
        cell.inputMode = 'numeric';
        cell.maxLength = 2;
        cell.autocomplete = 'off';
        cell.spellcheck = false;
        cell.className = 'tab-cell';
        cell.setAttribute('role', 'gridcell');
        cell.dataset.stringIndex = String(stringIndex);
        cell.dataset.columnIndex = String(columnIndex);

        const badge = document.createElement('span');
        badge.className = 'cell-technique';
        badge.setAttribute('aria-hidden', 'true');
        badge.hidden = true;

        wrap.append(cell, badge);

        if (tabCell.fret !== null) {
          cell.value = String(tabCell.fret);
          cell.classList.add('cell-filled');
        } else {
          cell.value = '';
          cell.placeholder = '·';
          cell.classList.add('cell-empty');
        }
        if (tabCell.technique) {
          badge.textContent = techniqueSymbol(tabCell.technique);
          badge.hidden = false;
          wrap.classList.add('has-technique');
        }
        const techLabel = tabCell.technique ? `, ${tabCell.technique}` : '';
        const fretLabel = tabCell.fret !== null ? String(tabCell.fret) : 'empty';
        cell.setAttribute(
          'aria-label',
          `${label} string, column ${columnIndex + 1}, ${fretLabel}${techLabel}`,
        );

        if (isViewBarBoundary(columnIndex, this.state.meter)) {
          wrap.classList.add('bar-end');
        } else if (isViewBeatBoundary(columnIndex, this.state.meter)) {
          wrap.classList.add('beat-end');
        } else if (isViewHalfBeatBoundary(columnIndex, this.state.meter)) {
          wrap.classList.add('half-beat-end');
        }

        row.appendChild(wrap);
      }

      this.gridEl.appendChild(row);
    });
  }

  private buildBeatRuler(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'tab-row beat-ruler';
    row.setAttribute('role', 'row');
    row.setAttribute('aria-label', 'Beat ruler');

    const labelEl = document.createElement('span');
    labelEl.className = 'string-label';
    labelEl.textContent = '♩';
    labelEl.setAttribute('aria-hidden', 'true');
    row.appendChild(labelEl);

    const meter = this.state.meter;
    const colsPerBar = columnsPerBar(meter);
    const colsPerBeat = columnsPerBeat(resolveSubdivision(meter));
    const viewCols = viewColumnCount(this.state);

    for (let columnIndex = 0; columnIndex < viewCols; columnIndex++) {
      const slot = document.createElement('div');
      slot.className = 'tab-column beat-column';
      const marker = document.createElement('span');
      marker.className = 'beat-marker';
      const posInBar = columnIndex % colsPerBar;

      if (posInBar % colsPerBeat === 0) {
        marker.textContent = String(Math.floor(posInBar / colsPerBeat) + 1);
        marker.classList.add('beat-marker-label');
      } else {
        marker.textContent = '·';
      }

      if (isViewBarBoundary(columnIndex, meter)) {
        slot.classList.add('bar-end');
      } else if (isViewBeatBoundary(columnIndex, meter)) {
        slot.classList.add('beat-end');
      } else if (isViewHalfBeatBoundary(columnIndex, meter)) {
        slot.classList.add('half-beat-end');
      }

      slot.appendChild(marker);
      row.appendChild(slot);
    }

    return row;
  }

  private bindEvents(): void {
    this.gridEl.addEventListener('click', (event) => {
      const target = this.findCellTarget(event.target);
      if (!target) {
        return;
      }

      const applyClear = this.selectedClear;
      const applyFret = this.selectedFret;
      const placingFromPalette = applyClear || applyFret !== null;

      this.focusCellForInteraction(target, {
        syncPalette: !placingFromPalette,
      });

      if (applyClear) {
        this.clearCellAt(target);
        this.syncPaletteToCell(target);
        return;
      }

      if (applyFret !== null) {
        const next = toggleCell(
          this.state,
          target.stringIndex,
          target.columnIndex,
          applyFret,
        );
        this.state = next;
        this.syncCellDisplay(target);
        this.syncPaletteToCell(target);
        this.emitState();
        target.input.select();
      }
    });

    this.gridEl.addEventListener('focusin', (event) => {
      const target = this.findCellTarget(event.target);
      if (!target) {
        return;
      }
      this.focusCellForInteraction(target);
    });

    this.gridEl.addEventListener('focusout', (event) => {
      const target = this.findCellTarget(event.target);
      if (!target) {
        return;
      }
      target.input.classList.remove('cell-focused');
      this.finalizeCellInput(target);
      const related = event.relatedTarget;
      if (
        related instanceof Node &&
        (this.techniquePaletteEl.contains(related) ||
          this.paletteEl.contains(related))
      ) {
        return;
      }
      window.setTimeout(() => {
        const active = document.activeElement;
        if (
          active instanceof Node &&
          (this.techniquePaletteEl.contains(active) ||
            this.paletteEl.contains(active))
        ) {
          return;
        }
        if (this.getFocusedCellTarget() !== target) {
          this.focusedCell = null;
          this.renderTechniquePalette();
        }
      }, 0);
    });

    this.gridEl.addEventListener(
      'wheel',
      (event) => {
        const target = this.cellTargetFromPointer(event);
        if (!target) {
          return;
        }

        event.preventDefault();
        this.focusCellForInteraction(target);
        const direction = event.deltaY < 0 ? 1 : -1;
        this.nudgeCellFretValue(target, direction);
      },
      { passive: false },
    );

    this.gridEl.addEventListener('input', (event) => {
      const cell = event.target as HTMLInputElement;
      if (!cell.classList.contains('tab-cell')) {
        return;
      }
      const digits = cell.value.replace(/\D/g, '');
      if (cell.value !== digits) {
        cell.value = digits;
      }
    });

    this.gridEl.addEventListener('keydown', (event) => {
      const target = this.findCellTarget(event.target);
      if (!target) {
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        this.finalizeCellInput(target);
        this.focusCell(
          target.stringIndex,
          Math.min(target.columnIndex + 1, viewColumnCount(this.state) - 1),
        );
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        this.revertCellInput(target);
        target.input.blur();
        return;
      }

      let nextString = target.stringIndex;
      let nextColumn = target.columnIndex;

      switch (event.key) {
        case 'ArrowLeft':
          nextColumn = Math.max(0, target.columnIndex - 1);
          break;
        case 'ArrowRight':
          nextColumn = Math.min(
            viewColumnCount(this.state) - 1,
            target.columnIndex + 1,
          );
          break;
        case 'ArrowUp':
          nextString = Math.max(0, target.stringIndex - 1);
          break;
        case 'ArrowDown':
          nextString = Math.min(
            this.state.strings.length - 1,
            target.stringIndex + 1,
          );
          break;
        default:
          return;
      }

      event.preventDefault();
      this.finalizeCellInput(target);
      this.focusCell(nextString, nextColumn);
    });

    this.instrumentEl.addEventListener('change', (event) => {
      const target = event.target as HTMLElement;
      if (target.dataset.instrument === 'string-count') {
        this.renderCustomTuningFields();
      }
      this.updateInstrument(this.readInstrumentFromControls());
    });
    this.instrumentEl.addEventListener('input', (event) => {
      const target = event.target as HTMLElement;
      if (target.dataset.instrument === 'string-count') {
        this.renderCustomTuningFields();
      }
      this.updateInstrument(this.readInstrumentFromControls());
    });

    this.meterEl.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement;
      if (target === this.halfBeatCheckbox && target.checked) {
        this.quarterBeatCheckbox.checked = false;
      } else if (target === this.quarterBeatCheckbox && target.checked) {
        this.halfBeatCheckbox.checked = false;
      }
      this.updateMeter(this.readMeterFromControls());
    });
    this.meterEl.addEventListener('input', () => {
      this.updateMeter(this.readMeterFromControls());
    });

    this.root.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const action = target.dataset.action;
      if (action === 'add-bar') {
        this.updateState(addBars(this.state));
      } else if (action === 'clear-all') {
        this.updateState(clearAll(this.state));
        this.showToast('Cleared all strings');
      } else if (action === 'clear-half-beats') {
        this.updateState(clearHalfBeatTicks(this.state));
        this.showToast('Cleared half-beat slots');
      } else if (action === 'clear-quarter-beats') {
        this.updateState(clearQuarterBeatTicks(this.state));
        this.showToast('Cleared quarter-beat slots');
      }
    });
  }
}
