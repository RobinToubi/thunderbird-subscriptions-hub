import { StorageService } from '../../services/storageService';
import { AppSettings } from '../../types';
import { applyStoredTheme, applyTheme } from '../shared/theme';

/**
 * Thunderbird embeds this page inside the Add-ons Manager, where there is no
 * obvious moment to press "Save" — the panel can be closed at any time. So every
 * control writes as soon as it changes, and the status line acknowledges it.
 */
class OptionsController {
  private statusTimer: number | undefined;

  private readonly el = {
    autoScan: document.getElementById('setting-auto-scan') as HTMLInputElement,
    ignoredDomains: document.getElementById('setting-ignored-domains') as HTMLTextAreaElement,
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
  }

  private populate(settings: AppSettings): void {
    this.el.autoScan.checked = settings.autoScanOnNewMail;
    this.el.ignoredDomains.value = (settings.ignoredDomains || []).join('\n');
    this.el.theme.value = settings.theme;
    this.el.batchSize.value = String(settings.scanBatchSize);
    this.el.throttle.value = String(settings.scanThrottleDelayMs);
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
