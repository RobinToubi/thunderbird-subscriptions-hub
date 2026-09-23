import { AccountService } from '../../services/accountService';
import { StorageService } from '../../services/storageService';
import { AppSettings, MailAccountInfo, MailFolderInfo } from '../../types';
import { applyStoredTheme, applyTheme } from '../shared/theme';

/**
 * Thunderbird embeds this page inside the Add-ons Manager, where there is no
 * obvious moment to press "Save" — the panel can be closed at any time. So every
 * control writes as soon as it changes, and the status line acknowledges it.
 */
class OptionsController {
  private statusTimer: number | undefined;
  private accounts: MailAccountInfo[] = [];
  private excludedFolders: string[] = [];

  private readonly el = {
    autoScan: document.getElementById('setting-auto-scan') as HTMLInputElement,
    ignoredDomains: document.getElementById('setting-ignored-domains') as HTMLTextAreaElement,
    folderList: document.getElementById('folder-list') as HTMLElement,
    theme: document.getElementById('setting-theme') as HTMLSelectElement,
    batchSize: document.getElementById('setting-batch-size') as HTMLInputElement,
    throttle: document.getElementById('setting-throttle') as HTMLInputElement,
    status: document.getElementById('options-status') as HTMLElement,
    dataSummary: document.getElementById('data-summary') as HTMLElement,
    btnReset: document.getElementById('btn-reset-data') as HTMLButtonElement,
    resetConfirm: document.getElementById('reset-confirm') as HTMLElement,
    btnResetConfirm: document.getElementById('btn-reset-confirm') as HTMLButtonElement,
    btnResetCancel: document.getElementById('btn-reset-cancel') as HTMLButtonElement
  };

  async init(): Promise<void> {
    const settings = await applyStoredTheme();
    this.populate(settings);
    this.setupEventListeners();
    await this.refreshDataSummary();
    // Last: walking every account's folder tree is the slow part of this page,
    // and the rest of the settings must not wait on it.
    await this.loadFolders();
  }

  private populate(settings: AppSettings): void {
    this.el.autoScan.checked = settings.autoScanOnNewMail;
    this.el.ignoredDomains.value = (settings.ignoredDomains || []).join('\n');
    this.el.theme.value = settings.theme;
    this.el.batchSize.value = String(settings.scanBatchSize);
    this.el.throttle.value = String(settings.scanThrottleDelayMs);
    this.excludedFolders = settings.excludedFolders || [];
  }

  private async loadFolders(): Promise<void> {
    try {
      this.accounts = await AccountService.listAccounts();
    } catch {
      this.accounts = [];
    }
    this.renderFolders();
  }

  /**
   * Rebuilt from scratch on every change: whether a folder is disabled depends
   * on its ancestors, so a single checkbox can flip the state of a whole subtree.
   */
  private renderFolders(focusKey?: string): void {
    const host = this.el.folderList;
    host.textContent = '';
    host.removeAttribute('aria-busy');

    const accounts = this.accounts.filter(account => account.folders.length > 0);
    if (accounts.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'option-description';
      empty.textContent = 'No mail folder found. Open these settings from Thunderbird to pick the folders to analyze.';
      host.append(empty);
      return;
    }

    for (const account of accounts) {
      const group = document.createElement('div');
      group.className = 'folder-account';

      const name = document.createElement('p');
      name.className = 'folder-account-name';
      name.textContent = account.name;
      group.append(name);

      for (const folder of account.folders) {
        group.append(this.buildFolderRow(folder));
      }
      host.append(group);
    }

    if (focusKey) {
      const restored = host.querySelector(`input[data-folder-key="${CSS.escape(focusKey)}"]`);
      (restored as HTMLInputElement | null)?.focus();
    }
  }

  private buildFolderRow(folder: MailFolderInfo): HTMLElement {
    const key = AccountService.folderKey(folder);
    const systemIgnored = AccountService.isSystemIgnoredFolder(folder);
    const excluded = this.excludedFolders.includes(key);
    // Excluded because an ancestor is, rather than in its own right: the
    // checkbox then has nothing to say, so it is shown off and disabled.
    const inherited = !excluded && AccountService.isFolderExcluded(folder, this.excludedFolders);

    const row = document.createElement('label');
    row.className = 'folder-row';
    row.style.setProperty('--folder-depth', String(this.folderDepth(folder)));

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.folderKey = key;
    checkbox.checked = !systemIgnored && !excluded && !inherited;
    checkbox.disabled = systemIgnored || inherited;
    checkbox.addEventListener('change', () => this.toggleFolder(key, checkbox.checked));
    row.append(checkbox);

    const name = document.createElement('span');
    name.className = 'folder-name';
    name.textContent = folder.name;
    row.append(name);

    const hint = systemIgnored
      ? 'always ignored'
      : inherited ? 'inside an excluded folder' : '';
    if (hint) {
      const note = document.createElement('span');
      note.className = 'folder-hint';
      note.textContent = hint;
      row.append(note);
    }

    if (systemIgnored || inherited) {
      row.classList.add('is-disabled');
    }

    return row;
  }

  /** `/INBOX` sits at depth 0, `/INBOX/Lists` at depth 1 — used only for the indent. */
  private folderDepth(folder: MailFolderInfo): number {
    const segments = (folder.path || '').split('/').filter(Boolean);
    return Math.max(0, segments.length - 1);
  }

  private async toggleFolder(key: string, analyze: boolean): Promise<void> {
    this.excludedFolders = analyze
      ? this.excludedFolders.filter(excluded => excluded !== key)
      : Array.from(new Set([...this.excludedFolders, key]));
    await this.save({ excludedFolders: this.excludedFolders });
    this.renderFolders(key);
  }

  private setupEventListeners(): void {
    this.el.autoScan.addEventListener('change', () => {
      this.save({ autoScanOnNewMail: this.el.autoScan.checked });
    });

    this.el.theme.addEventListener('change', () => {
      const theme = this.el.theme.value as AppSettings['theme'];
      applyTheme(theme);
      this.save({ theme });
    });

    // `change` rather than `input`: number fields would otherwise write a
    // half-typed value, and the clamping below would fight the user mid-keystroke.
    this.el.batchSize.addEventListener('change', () => {
      const value = this.clamp(this.el.batchSize, 30, 10, 200);
      this.save({ scanBatchSize: value });
    });

    this.el.throttle.addEventListener('change', () => {
      const value = this.clamp(this.el.throttle, 25, 0, 500);
      this.save({ scanThrottleDelayMs: value });
    });

    this.el.ignoredDomains.addEventListener('change', () => {
      const domains = this.el.ignoredDomains.value
        .split('\n')
        .map(line => line.trim().toLowerCase().replace(/^@/, ''))
        .filter(Boolean);
      const unique = Array.from(new Set(domains));
      this.el.ignoredDomains.value = unique.join('\n');
      this.save({ ignoredDomains: unique });
    });

    this.el.btnReset.addEventListener('click', () => this.toggleResetConfirm(true));
    this.el.btnResetCancel.addEventListener('click', () => this.toggleResetConfirm(false));
    this.el.btnResetConfirm.addEventListener('click', () => this.resetData());
  }

  /** Keeps the field and the stored value in agreement when input is out of range. */
  private clamp(input: HTMLInputElement, fallback: number, min: number, max: number): number {
    const parsed = Number(input.value);
    const value = Number.isFinite(parsed) && parsed >= 0 ? Math.min(Math.max(parsed, min), max) : fallback;
    input.value = String(value);
    return value;
  }

  private async save(partial: Partial<AppSettings>): Promise<void> {
    await StorageService.saveSettings(partial);
    this.showStatus('Saved.');
  }

  private toggleResetConfirm(visible: boolean): void {
    this.el.resetConfirm.classList.toggle('hidden', !visible);
    this.el.btnReset.classList.toggle('hidden', visible);
  }

  private async resetData(): Promise<void> {
    await StorageService.clearAllData();
    this.toggleResetConfirm(false);
    await this.refreshDataSummary();
    this.showStatus('Local data cleared.');
  }

  private async refreshDataSummary(): Promise<void> {
    const [subscriptions, analyzedIds] = await Promise.all([
      StorageService.getSubscriptions(),
      StorageService.getAnalyzedMessageIds()
    ]);

    const subCount = Object.keys(subscriptions).length;
    if (subCount === 0) {
      this.el.dataSummary.textContent = 'Nothing analyzed yet.';
      return;
    }

    const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;
    this.el.dataSummary.textContent =
      `${plural(subCount, 'subscription')} stored, ` +
      `${plural(analyzedIds.size, 'message')} already analyzed.`;
  }

  private showStatus(message: string): void {
    this.el.status.textContent = message;
    window.clearTimeout(this.statusTimer);
    this.statusTimer = window.setTimeout(() => {
      this.el.status.textContent = '';
    }, 2500);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new OptionsController().init();
});
