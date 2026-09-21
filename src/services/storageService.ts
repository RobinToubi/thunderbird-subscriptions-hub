import { AppSettings, Subscription } from '../types';

const STORAGE_KEYS = {
  SUBSCRIPTIONS: 'subhub_subscriptions',
  ANALYZED_MESSAGE_IDS: 'subhub_analyzed_message_ids',
  SETTINGS: 'subhub_settings',
  SCAN_STATE: 'subhub_scan_state'
};

const DEFAULT_SETTINGS: AppSettings = {
  autoScanOnNewMail: true,
  scanBatchSize: 30,
  scanThrottleDelayMs: 25,
  theme: 'auto',
  ignoredDomains: []
};

export class StorageService {
  /**
   * Checks if the browser.storage.local API is available (extension environment)
   */
  private static isWebExtensionStorageAvailable(): boolean {
    return typeof browser !== 'undefined' && Boolean(browser?.storage?.local);
  }

  /**
   * Retrieves all registered subscriptions
   */
  static async getSubscriptions(): Promise<Record<string, Subscription>> {
    try {
      if (this.isWebExtensionStorageAvailable()) {
        const result = await browser.storage.local.get(STORAGE_KEYS.SUBSCRIPTIONS);
        return result[STORAGE_KEYS.SUBSCRIPTIONS] || {};
      } else {
        const raw = localStorage.getItem(STORAGE_KEYS.SUBSCRIPTIONS);
        return raw ? JSON.parse(raw) : {};
      }
    } catch (e) {
      console.error('Error while reading the subscriptions:', e);
      return {};
    }
  }

  /**
   * Saves all subscriptions
   */
  static async saveSubscriptions(subscriptions: Record<string, Subscription>): Promise<void> {
    try {
      if (this.isWebExtensionStorageAvailable()) {
        await browser.storage.local.set({ [STORAGE_KEYS.SUBSCRIPTIONS]: subscriptions });
      } else {
        localStorage.setItem(STORAGE_KEYS.SUBSCRIPTIONS, JSON.stringify(subscriptions));
      }
    } catch (e) {
      console.error('Error while writing the subscriptions:', e);
    }
  }

  /**
   * Updates or adds an individual subscription
   */
  static async upsertSubscription(sub: Subscription): Promise<void> {
    const all = await this.getSubscriptions();
    all[sub.id] = sub;
    await this.saveSubscriptions(all);
  }

  /**
   * Removes a subscription from the list
   */
  static async removeSubscription(id: string): Promise<void> {
    const all = await this.getSubscriptions();
    if (all[id]) {
      delete all[id];
      await this.saveSubscriptions(all);
    }
  }

  /**
   * Retrieves the IDs of already analyzed messages to avoid repeated analyses
   */
  static async getAnalyzedMessageIds(): Promise<Set<number>> {
    try {
      if (this.isWebExtensionStorageAvailable()) {
        const result = await browser.storage.local.get(STORAGE_KEYS.ANALYZED_MESSAGE_IDS);
        const list = result[STORAGE_KEYS.ANALYZED_MESSAGE_IDS] || [];
        return new Set<number>(list);
      } else {
        const raw = localStorage.getItem(STORAGE_KEYS.ANALYZED_MESSAGE_IDS);
        return new Set<number>(raw ? JSON.parse(raw) : []);
      }
    } catch (e) {
      console.error('Error while reading the analyzed IDs:', e);
      return new Set();
    }
  }

  /**
   * Saves the analyzed message IDs
   */
  static async saveAnalyzedMessageIds(ids: Set<number>): Promise<void> {
    try {
      // Limits the ID history size to avoid exceeding storage quotas (e.g. 50,000 max)
      const list = Array.from(ids).slice(-50000);
      if (this.isWebExtensionStorageAvailable()) {
        await browser.storage.local.set({ [STORAGE_KEYS.ANALYZED_MESSAGE_IDS]: list });
      } else {
        localStorage.setItem(STORAGE_KEYS.ANALYZED_MESSAGE_IDS, JSON.stringify(list));
      }
    } catch (e) {
      console.error('Error while saving the analyzed IDs:', e);
    }
  }

  /**
   * Retrieves the application settings
   */
  static async getSettings(): Promise<AppSettings> {
    try {
      if (this.isWebExtensionStorageAvailable()) {
        const result = await browser.storage.local.get(STORAGE_KEYS.SETTINGS);
        return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] || {}) };
      } else {
        const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
        return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
      }
    } catch (e) {
      console.error('Error while reading the settings:', e);
      return DEFAULT_SETTINGS;
    }
  }

  /**
   * Saves the application settings
   */
  static async saveSettings(settings: Partial<AppSettings>): Promise<void> {
    try {
      const current = await this.getSettings();
      const updated = { ...current, ...settings };
      if (this.isWebExtensionStorageAvailable()) {
        await browser.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updated });
      } else {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
      }
    } catch (e) {
      console.error('Error while writing the settings:', e);
    }
  }

  /**
   * Subscribes to `browser.storage.local` changes for one key.
   *
   * The options page and the dashboard are two separate documents, so this is
   * the only channel through which one learns that the other wrote something.
   * Outside Thunderbird there is no equivalent event, and the callback simply
   * never fires.
   */
  private static onKeyChanged(key: string, callback: (newValue: any) => void): void {
    if (typeof browser === 'undefined' || !browser?.storage?.onChanged) return;
    browser.storage.onChanged.addListener((changes: Record<string, any>, areaName: string) => {
      if (areaName !== 'local') return;
      const change = changes[key];
      if (change) callback(change.newValue);
    });
  }

  static onSettingsChanged(callback: (settings: AppSettings) => void): void {
    this.onKeyChanged(STORAGE_KEYS.SETTINGS, (newValue) => {
      callback({ ...DEFAULT_SETTINGS, ...(newValue || {}) });
    });
  }

  static onSubscriptionsChanged(callback: (subscriptions: Record<string, Subscription>) => void): void {
    this.onKeyChanged(STORAGE_KEYS.SUBSCRIPTIONS, (newValue) => callback(newValue || {}));
  }

  /**
   * Resets all data
   */
  static async clearAllData(): Promise<void> {
    if (this.isWebExtensionStorageAvailable()) {
      await browser.storage.local.remove([
        STORAGE_KEYS.SUBSCRIPTIONS,
        STORAGE_KEYS.ANALYZED_MESSAGE_IDS,
        STORAGE_KEYS.SCAN_STATE
      ]);
    } else {
      localStorage.removeItem(STORAGE_KEYS.SUBSCRIPTIONS);
      localStorage.removeItem(STORAGE_KEYS.ANALYZED_MESSAGE_IDS);
      localStorage.removeItem(STORAGE_KEYS.SCAN_STATE);
    }
  }

  /**
   * Exports the subscriptions in CSV format
   */
  static exportToCSV(subscriptions: Subscription[]): string {
    const headers = [
      'Sender Name',
      'Sender Email',
      'Domain',
      'Thunderbird Account',
      'Total Emails Received',
      'Unread Emails',
      'Estimated Frequency',
      'First Email',
      'Last Email',
      'Status',
      'Unsubscribe Method',
      'Unsubscribe Target'
    ];

    const escapeCSV = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    const rows = subscriptions.map(sub => [
      sub.senderName,
      sub.senderEmail,
      sub.senderDomain,
      sub.accountEmail || sub.accountName,
      sub.totalMessages,
      sub.unreadMessages,
      sub.frequencyEstimate,
      new Date(sub.firstReceivedAt).toISOString().split('T')[0],
      new Date(sub.lastReceivedAt).toISOString().split('T')[0],
      sub.status,
      sub.primaryUnsubscribeMethod?.type || 'none',
      sub.primaryUnsubscribeMethod?.target || ''
    ].map(escapeCSV).join(','));

    return [headers.map(escapeCSV).join(','), ...rows].join('\n');
  }

  /**
   * Exports all data in JSON format
   */
  static exportToJSON(subscriptions: Record<string, Subscription>): string {
    return JSON.stringify(subscriptions, null, 2);
  }
}
