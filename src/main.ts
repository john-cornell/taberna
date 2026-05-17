import './styles.css';
import {
  copyTabToClipboard,
  downloadTab,
  promptExportSubdivision,
} from './export';
import { importTabFromText, pickTabTextFile } from './import';
import { TabView } from './tabView';

function main(): void {
  const app = document.querySelector<HTMLElement>('#app');
  if (!app) {
    throw new Error('App container #app not found');
  }

  const tabView = new TabView(app);

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

    const exportSub = promptExportSubdivision(state);

    if (action === 'copy') {
      const ok = await copyTabToClipboard(state, exportSub);
      tabView.showToast(ok ? 'Copied to clipboard' : 'Copy failed');
    } else if (action === 'save') {
      downloadTab(state, exportSub);
      tabView.showToast('Tab saved');
    }
  });
}

main();
