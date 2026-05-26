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
import type { ExportOptions, ExportSubdivision } from './export';
import type { ExportSpacingMode } from './tabFileFormat';
import { MAX_FRET, MIN_FRET, type TabState } from './types';
import type { SoundEngine } from './soundEngine';
import { WebAudioEngine } from './webAudioEngine';
import { buildSchedule } from './playbackEngine';
import { viewColumnToTickIndex } from './tickGrid';
import { WAVE_PRESETS, getWavePreset } from './soundPresets';

type CellTarget = {
  wrap: HTMLElement;
  input: HTMLInputElement;
  stringIndex: number;
  columnIndex: number;
};

export type TabViewCallbacks = {
  onStateChange?: (state: TabState) => void;
  version?: string;
};

export class TabView {
  private state: TabState;
  private selectedFret: number | null = null;
  private selectedClear = false;
  /** Set when the user picks a fret or clear on the palette (not when syncing from a cell). */
  private explicitPaletteChoice: 'fret' | 'clear' | null = null;
  /** Palette apply intent captured on mousedown, before focusin syncs the palette. */
  private pendingCellClickApply: { clear: boolean; fret: number | null } | null =
    null;
  private focusedCell: CellTarget | null = null;
  private playheadColumn = 0;
  private isPlaying = false;
  private playTimer: ReturnType<typeof window.setInterval> | null = null;

  private readonly root: HTMLElement;
  private readonly playBtn: HTMLButtonElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly playbackBackBtn: HTMLButtonElement;
  private readonly playbackBpmInput: HTMLInputElement;
  private readonly soundToggleBtn: HTMLButtonElement;
  private readonly volumeInput: HTMLInputElement;
  private readonly toneSelect: HTMLSelectElement;
  private readonly sustainInput: HTMLInputElement;
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
  private readonly songTitleInput: HTMLInputElement;
  private readonly toastEl: HTMLElement;
  private toastTimeoutId: ReturnType<typeof window.setTimeout> | null = null;
  private soundEnabled = false;
  private soundEngine: SoundEngine;

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

    const songTitleLabel = document.createElement('label');
    songTitleLabel.className = 'song-title-field';
    songTitleLabel.textContent = 'Song ';
    this.songTitleInput = document.createElement('input');
    this.songTitleInput.type = 'text';
    this.songTitleInput.className = 'song-title-input';
    this.songTitleInput.placeholder = 'Title (optional)';
    this.songTitleInput.setAttribute('aria-label', 'Song title');
    this.songTitleInput.maxLength = 120;
    songTitleLabel.appendChild(this.songTitleInput);
    header.appendChild(songTitleLabel);

    const versionSpan = document.createElement('span');
    versionSpan.className = 'app-version';
    versionSpan.textContent = this.callbacks.version ? `v${this.callbacks.version}` : '';
    header.appendChild(versionSpan);

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
    const midiBtn = document.createElement('button');
    midiBtn.type = 'button';
    midiBtn.textContent = 'MIDI';
    midiBtn.setAttribute('aria-label', 'Export tab as MIDI file');
    midiBtn.dataset.action = 'export-midi';
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
      midiBtn,
      addBarBtn,
      clearAllBtn,
      clearHalfBtn,
      clearQuarterBtn,
    );
    header.appendChild(toolbar);

    const playbackSection = document.createElement('section');
    playbackSection.className = 'playback-section';
    playbackSection.setAttribute('aria-label', 'Tab playback');

    this.playBtn = document.createElement('button');
    this.playBtn.type = 'button';
    this.playBtn.textContent = 'Play';
    this.playBtn.dataset.action = 'play';
    this.playBtn.setAttribute('aria-label', 'Play tab from playhead');

    this.pauseBtn = document.createElement('button');
    this.pauseBtn.type = 'button';
    this.pauseBtn.textContent = 'Pause';
    this.pauseBtn.dataset.action = 'pause';
    this.pauseBtn.setAttribute('aria-label', 'Pause playback');
    this.pauseBtn.disabled = true;

    this.playbackBackBtn = document.createElement('button');
    this.playbackBackBtn.type = 'button';
    this.playbackBackBtn.textContent = 'Stop';
    this.playbackBackBtn.dataset.action = 'playback-back';
    this.playbackBackBtn.setAttribute(
      'aria-label',
      'Stop playback and return playhead to start',
    );

    this.soundToggleBtn = document.createElement('button');
    this.soundToggleBtn.type = 'button';
    this.soundToggleBtn.textContent = 'Sound: Off';
    this.soundToggleBtn.dataset.action = 'toggle-sound';
    this.soundToggleBtn.setAttribute('aria-label', 'Toggle audio playback');
    this.soundToggleBtn.classList.add('sound-toggle');

    const volumeLabel = document.createElement('label');
    volumeLabel.className = 'playback-volume-field';
    volumeLabel.textContent = 'Vol ';
    this.volumeInput = document.createElement('input');
    this.volumeInput.type = 'range';
    this.volumeInput.min = '0';
    this.volumeInput.max = '100';
    this.volumeInput.value = '30';
    this.volumeInput.dataset.playback = 'volume';
    this.volumeInput.setAttribute('aria-label', 'Playback volume');
    volumeLabel.append(this.volumeInput);

    const toneLabel = document.createElement('label');
    toneLabel.className = 'playback-tone-field';
    toneLabel.textContent = 'Sound ';
    this.toneSelect = document.createElement('select');
    this.toneSelect.setAttribute('aria-label', 'Sound preset');
    for (const preset of WAVE_PRESETS) {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.label;
      this.toneSelect.appendChild(option);
    }
    this.toneSelect.value = 'sawtooth';
    toneLabel.append(this.toneSelect);

    const speedLabel = document.createElement('label');
    speedLabel.className = 'playback-speed-field';
    speedLabel.textContent = 'Speed ';
    this.playbackBpmInput = document.createElement('input');
    this.playbackBpmInput.type = 'number';
    this.playbackBpmInput.min = '20';
    this.playbackBpmInput.max = '320';
    this.playbackBpmInput.step = '1';
    this.playbackBpmInput.value = '96';
    this.playbackBpmInput.dataset.playback = 'bpm';
    this.playbackBpmInput.setAttribute('aria-label', 'Playback tempo in BPM');
    const speedUnit = document.createElement('span');
    speedUnit.textContent = 'BPM';
    speedUnit.setAttribute('aria-hidden', 'true');
    speedLabel.append(this.playbackBpmInput, speedUnit);

    const sustainLabel = document.createElement('label');
    sustainLabel.className = 'playback-sustain-field';
    sustainLabel.textContent = 'Sustain ';
    this.sustainInput = document.createElement('input');
    this.sustainInput.type = 'range';
    this.sustainInput.min = '0';
    this.sustainInput.max = '100';
    this.sustainInput.value = '33';
    this.sustainInput.dataset.playback = 'sustain';
    this.sustainInput.setAttribute('aria-label', 'Playback sustain');
    sustainLabel.append(this.sustainInput);

    playbackSection.append(
      this.playBtn,
      this.pauseBtn,
      this.playbackBackBtn,
      this.soundToggleBtn,
      volumeLabel,
      toneLabel,
      sustainLabel,
      speedLabel,
    );

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
      'Copy / Save export with optional song title; saved files include meter and grid headers for import.',
      'Import uses file headers when present (meter, grid); otherwise uses current settings.',
      'Copy / Save opens export options: grid resolution and bar alignment for techniques.',
      'Clear all / half beats / quarter beats remove notes from those timeline slots.',
      'Techniques: focus a cell with a fret, then click tap/bend/slide to toggle on or off.',
      'Playback: Spacebar toggles Play/Pause. Click a beat number on the top ruler to set the playhead. Speed is BPM.',
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
      playbackSection,
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
    this.soundEngine = new WebAudioEngine();
    this.soundEngine.setSustain(1 / 3);
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
    return {
      ...this.state,
      title: this.songTitleInput.value,
    };
  }

  setState(state: TabState): void {
    this.pausePlayback();
    this.state = state;
    this.songTitleInput.value = state.title;
    const viewCols = viewColumnCount(this.state);
    if (this.playheadColumn >= viewCols) {
      this.playheadColumn = Math.max(0, viewCols - 1);
    }
    this.syncInstrumentControls();
    this.syncMeterControls();
    this.renderGrid();
  }

  promptExportOptions(state: TabState): Promise<ExportOptions | null> {
    return new Promise((resolve) => {
      const currentSub = resolveSubdivision(state.meter);

      const backdrop = document.createElement('div');
      backdrop.className = 'export-dialog-backdrop';

      const dialog = document.createElement('div');
      dialog.className = 'export-dialog';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-labelledby', 'export-dialog-title');

      const heading = document.createElement('h2');
      heading.id = 'export-dialog-title';
      heading.textContent = 'Export options';
      dialog.appendChild(heading);

      const gridFieldset = document.createElement('fieldset');
      gridFieldset.className = 'export-dialog-fieldset';
      const gridLegend = document.createElement('legend');
      gridLegend.textContent = 'Grid resolution';
      gridFieldset.appendChild(gridLegend);

      const gridOptions: { value: ExportSubdivision; label: string }[] = [
        { value: 'stored', label: `Current view (${currentSub})` },
        { value: 'beat', label: 'Beat (one column per beat)' },
        { value: 'half', label: 'Half beat' },
        { value: 'quarter', label: 'Quarter beat (full detail)' },
      ];

      const gridName = `export-grid-${Date.now()}`;
      for (const opt of gridOptions) {
        const label = document.createElement('label');
        label.className = 'export-dialog-option';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = gridName;
        input.value = opt.value;
        input.checked = opt.value === 'stored';
        label.append(input, document.createTextNode(` ${opt.label}`));
        gridFieldset.appendChild(label);
      }
      dialog.appendChild(gridFieldset);

      const layoutFieldset = document.createElement('fieldset');
      layoutFieldset.className = 'export-dialog-fieldset';
      const layoutLegend = document.createElement('legend');
      layoutLegend.textContent = 'Layout';
      layoutFieldset.appendChild(layoutLegend);

      const barsLabel = document.createElement('label');
      barsLabel.className = 'export-dialog-option';
      barsLabel.style.display = 'flex';
      barsLabel.style.alignItems = 'center';
      barsLabel.style.gap = '0.5rem';
      const barsInput = document.createElement('input');
      barsInput.type = 'number';
      barsInput.min = '1';
      barsInput.max = '64';
      barsInput.value = '8';
      barsInput.style.width = '4rem';
      barsLabel.append(barsInput, document.createTextNode('Bars per line'));
      layoutFieldset.appendChild(barsLabel);
      dialog.appendChild(layoutFieldset);

      const spacingFieldset = document.createElement('fieldset');
      spacingFieldset.className = 'export-dialog-fieldset';
      const spacingLegend = document.createElement('legend');
      spacingLegend.textContent = 'Bar alignment';
      spacingFieldset.appendChild(spacingLegend);

      const spacingOptions: { value: ExportSpacingMode; label: string }[] = [
        { value: 'normal', label: 'Normal' },
        {
          value: 'technique-beats',
          label: 'Widen beats with techniques',
        },
        { value: 'all', label: 'Widen all beats' },
      ];

      const spacingName = `export-spacing-${Date.now()}`;
      for (const opt of spacingOptions) {
        const label = document.createElement('label');
        label.className = 'export-dialog-option';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = spacingName;
        input.value = opt.value;
        input.checked = opt.value === 'all';
        label.append(input, document.createTextNode(` ${opt.label}`));
        spacingFieldset.appendChild(label);
      }
      dialog.appendChild(spacingFieldset);

      const actions = document.createElement('div');
      actions.className = 'export-dialog-actions';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Cancel';

      const confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.textContent = 'Export';
      confirmBtn.className = 'export-dialog-confirm';

      actions.append(cancelBtn, confirmBtn);
      dialog.appendChild(actions);
      backdrop.appendChild(dialog);

      const close = (result: ExportOptions | null) => {
        backdrop.remove();
        document.removeEventListener('keydown', onKeyDown);
        resolve(result);
      };

      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          close(null);
        }
      };

      cancelBtn.addEventListener('click', () => close(null));
      backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) {
          close(null);
        }
      });

      confirmBtn.addEventListener('click', () => {
        const gridInput = gridFieldset.querySelector<HTMLInputElement>(
          'input[type="radio"]:checked',
        );
        const spacingInput = spacingFieldset.querySelector<HTMLInputElement>(
          'input[type="radio"]:checked',
        );
        
        let parsedBars = parseInt(barsInput.value, 10);
        if (isNaN(parsedBars) || parsedBars < 1) {
          parsedBars = 8;
        }

        close({
          exportSub: (gridInput?.value ?? 'stored') as ExportSubdivision,
          spacing: (spacingInput?.value ?? 'all') as ExportSpacingMode,
          barsPerLine: parsedBars,
        });
      });

      document.addEventListener('keydown', onKeyDown);
      document.body.appendChild(backdrop);
      confirmBtn.focus();
    });
  }

  getSelectedFret(): number | null {
    return this.selectedFret;
  }

  getPlayheadColumn(): number {
    return this.playheadColumn;
  }

  selectFret(fret: number, fromPalette = true): void {
    if (!isValidFret(fret)) {
      return;
    }
    this.selectedClear = false;
    this.selectedFret = fret;
    this.explicitPaletteChoice = fromPalette ? 'fret' : null;
    this.renderPalette();
  }

  selectClear(fromPalette = true): void {
    this.selectedClear = true;
    this.selectedFret = null;
    this.explicitPaletteChoice = fromPalette ? 'clear' : null;
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
    this.explicitPaletteChoice = null;
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
    this.pausePlayback();
    this.state = next;
    const viewCols = viewColumnCount(this.state);
    if (this.playheadColumn >= viewCols) {
      this.playheadColumn = Math.max(0, viewCols - 1);
    }
    if (options?.rerender !== false) {
      const scrollLeft = this.gridEl.scrollLeft;
      const focusedTarget = this.getFocusedCellTarget();
      
      this.renderGrid();
      
      this.gridEl.scrollLeft = scrollLeft;
      if (focusedTarget) {
        this.focusCell(focusedTarget.stringIndex, focusedTarget.columnIndex);
      }
    }
    this.emitState();
  }

  private readPlaybackBpm(): number {
    const parsed = Number(this.playbackBpmInput.value);
    if (!Number.isFinite(parsed)) {
      return 96;
    }
    return Math.min(320, Math.max(20, Math.round(parsed)));
  }

  private beatStepMs(): number {
    const bpm = this.readPlaybackBpm();
    return Math.round(60_000 / bpm);
  }

  private syncPlaybackControls(): void {
    this.playBtn.disabled = this.isPlaying;
    this.pauseBtn.disabled = !this.isPlaying;
  }

  private clearPlayheadHighlight(): void {
    for (const el of this.gridEl.querySelectorAll('.playhead')) {
      el.classList.remove('playhead');
    }
  }

  private applyPlayheadHighlight(): void {
    this.clearPlayheadHighlight();
    const col = this.playheadColumn;
    for (const el of this.gridEl.querySelectorAll(
      `.tab-column[data-column-index="${col}"]`,
    )) {
      el.classList.add('playhead');
    }
    const marker = this.gridEl.querySelector(
      `.beat-column[data-column-index="${col}"]`,
    );
    marker?.classList.add('playhead');
    const scrollTarget = this.gridEl.querySelector(
      `.tab-cell-wrap[data-column-index="${col}"]`,
    );
    scrollTarget?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }

  private setPlayheadColumn(column: number): void {
    const viewCols = viewColumnCount(this.state);
    this.playheadColumn =
      viewCols > 0 ? Math.min(Math.max(0, column), viewCols - 1) : 0;
    this.applyPlayheadHighlight();
  }

  private restartPlayTimer(): void {
    if (this.playTimer !== null) {
      window.clearInterval(this.playTimer);
    }
    this.playTimer = window.setInterval(() => {
      this.advancePlayback();
    }, this.beatStepMs());
  }

  private advancePlayback(): void {
    const viewCols = viewColumnCount(this.state);
    if (viewCols === 0) {
      this.pausePlayback();
      return;
    }

    const cpb = columnsPerBeat(resolveSubdivision(this.state.meter));
    const next = this.playheadColumn + cpb;
    if (next >= viewCols) {
      this.setPlayheadColumn(viewCols - 1);
      this.pausePlayback();
      this.showToast('End of tab');
      return;
    }

    this.setPlayheadColumn(next);
  }

  startPlayback(): void {
    const viewCols = viewColumnCount(this.state);
    if (viewCols === 0) {
      return;
    }

    if (this.playheadColumn >= viewCols - 1) {
      this.playheadColumn = 0;
    }

    this.isPlaying = true;
    this.syncPlaybackControls();
    this.applyPlayheadHighlight();
    if (this.soundEnabled) {
      const startTick = viewColumnToTickIndex(this.playheadColumn, this.state.meter);
      const schedule = buildSchedule(this.state, startTick, this.readPlaybackBpm());
      this.soundEngine.start(schedule);
    }
    this.restartPlayTimer();
  }

  pausePlayback(): void {
    if (this.playTimer !== null) {
      window.clearInterval(this.playTimer);
      this.playTimer = null;
    }
    this.soundEngine.stop();
    this.isPlaying = false;
    this.syncPlaybackControls();
  }

  backToPlaybackStart(): void {
    this.pausePlayback();
    this.setPlayheadColumn(0);
  }

  private commitPlaybackBpm(): void {
    const raw = this.playbackBpmInput.value.trim();
    if (raw === '') {
      this.playbackBpmInput.value = '96';
    } else {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        this.playbackBpmInput.value = '96';
      } else {
        const clamped = Math.min(320, Math.max(20, Math.round(parsed)));
        this.playbackBpmInput.value = String(clamped);
      }
    }
    if (this.isPlaying) {
      this.restartPlayTimer();
    }
  }

  private handlePlaybackBpmInput(): void {
    if (this.isPlaying) {
      this.restartPlayTimer();
    }
  }

  private applyWavePreset(presetId: string): void {
    const preset = getWavePreset(presetId);
    if (!preset) {
      return;
    }
    this.soundEngine.setTone(preset.wave);
    this.soundEngine.setSustain(preset.sustain);
    this.sustainInput.value = String(Math.round(preset.sustain * 100));
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
        this.selectFret(MIN_FRET, false);
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
      this.selectClear(false);
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
    this.selectFret(nextFret, false);
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

    this.applyPlayheadHighlight();
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
      slot.dataset.columnIndex = String(columnIndex);
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
    this.songTitleInput.addEventListener('input', () => {
      this.state = { ...this.state, title: this.songTitleInput.value };
    });

    this.gridEl.addEventListener('mousedown', (event) => {
      const target = this.findCellTarget(event.target);
      if (!target) {
        this.pendingCellClickApply = null;
        return;
      }
      this.pendingCellClickApply = {
        clear: this.selectedClear && this.explicitPaletteChoice === 'clear',
        fret:
          this.explicitPaletteChoice === 'fret' ? this.selectedFret : null,
      };
    });

    this.gridEl.addEventListener('click', (event) => {
      const el = event.target as HTMLElement;
      const beatCol = el.closest('.beat-column') as HTMLElement;
      if (beatCol) {
        const colIndex = parseInt(beatCol.dataset.columnIndex || '', 10);
        if (!isNaN(colIndex)) {
          this.setPlayheadColumn(colIndex);
        }
        return;
      }

      const target = this.findCellTarget(event.target);
      if (!target) {
        return;
      }

      const pending = this.pendingCellClickApply;
      this.pendingCellClickApply = null;
      const applyClear = pending?.clear ?? false;
      const applyFret = pending?.fret ?? null;
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
      } else if (action === 'play') {
        this.startPlayback();
      } else if (action === 'pause') {
        this.pausePlayback();
      } else if (action === 'playback-back') {
        this.backToPlaybackStart();
      } else if (action === 'toggle-sound') {
        this.soundEnabled = !this.soundEnabled;
        this.soundToggleBtn.textContent = this.soundEnabled ? 'Sound: On' : 'Sound: Off';
        this.soundToggleBtn.classList.toggle('sound-on', this.soundEnabled);
        if (!this.soundEnabled && this.isPlaying) {
          this.soundEngine.stop();
        }
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.code === 'Space') {
        const target = event.target as HTMLElement | null;
        if (target && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) {
          return; // Let native inputs/buttons handle spacebar
        }
        event.preventDefault();
        if (this.isPlaying) {
          this.pausePlayback();
        } else {
          this.startPlayback();
        }
      }
    });

    this.playbackBpmInput.addEventListener('focus', () => {
      this.playbackBpmInput.select();
    });
    this.playbackBpmInput.addEventListener('change', () => {
      this.commitPlaybackBpm();
    });
    this.playbackBpmInput.addEventListener('blur', () => {
      this.commitPlaybackBpm();
    });
    this.playbackBpmInput.addEventListener('input', () => {
      this.handlePlaybackBpmInput();
    });

    this.volumeInput.addEventListener('input', () => {
      const gain = Number(this.volumeInput.value) / 100;
      this.soundEngine.setVolume(gain);
    });

    this.toneSelect.addEventListener('change', () => {
      this.applyWavePreset(this.toneSelect.value);
    });

    this.sustainInput.addEventListener('input', () => {
      this.soundEngine.setSustain(Number(this.sustainInput.value) / 100);
    });
  }
}
