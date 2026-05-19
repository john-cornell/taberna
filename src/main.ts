import './styles.css';
import { copyTabToClipboard, saveWithPicker, getTabExportText, tabExportFilename } from './export';
import { importTabFromText, pickTabTextFile } from './import';
import { TabView } from './tabView';
import { version } from '../package.json';
import { buildSchedule } from './playbackEngine';
import { generateMidiFile } from './midiExport';

function main(): void {
  const app = document.querySelector<HTMLElement>('#app');
  if (!app) {
    throw new Error('App container #app not found');
  }

  const tabView = new TabView(app, { version });

  app.addEventListener('click', async (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-action]',
    );
    if (!target) {
      return;
    }

    const action = target.dataset.action;
    const state = tabView.getState();

    if (action === 'import') {
      const text = await pickTabTextFile();
      if (text === null) {
        return;
      }
      const result = importTabFromText(text, state);
      if (!result.ok) {
        tabView.showToast(result.error);
        return;
      }
      tabView.setState(result.state);
      tabView.showToast('Tab imported');
      return;
    }

    if (action === 'copy' || action === 'save') {
      const options = await tabView.promptExportOptions(state);
      if (options === null) {
        return;
      }

      if (action === 'copy') {
        const ok = await copyTabToClipboard(state, options);
        tabView.showToast(ok ? 'Copied to clipboard' : 'Copy failed');
      } else {
        const text = getTabExportText(state, options);
        const filename = tabExportFilename(state);
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const ok = await saveWithPicker(blob, filename);
        tabView.showToast(ok ? 'Tab saved' : 'Save cancelled');
      }
    }

    if (action === 'export-midi') {
      const bpm = Number((app.querySelector('[data-playback="bpm"]') as HTMLInputElement)?.value) || 96;
      const schedule = buildSchedule(state, 0, bpm);
      if (schedule.length === 0) {
        tabView.showToast('No notes to export');
        return;
      }
      const bytes = generateMidiFile(schedule, bpm, state.meter.beatsPerBar, state.meter.beatUnit);
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/midi' });
      const ok = await saveWithPicker(blob, `${state.title.trim() || 'tab'}.mid`, [
        { description: 'MIDI file', accept: { 'audio/midi': ['.mid'] } },
      ]);
      tabView.showToast(ok ? 'MIDI exported' : 'Export cancelled');
    }
  });
}

main();
