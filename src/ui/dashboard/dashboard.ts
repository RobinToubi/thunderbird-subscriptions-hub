import { AccountService } from '../../services/accountService';
import { LoggerService, LogMessage } from '../../services/loggerService';
import { ScannerService } from '../../services/scannerService';
import { StorageService } from '../../services/storageService';
import { UnsubscribeService } from '../../services/unsubscribeService';
import { FilterState, MailAccountInfo, ScanProgress, Subscription } from '../../types';

class DashboardController {
  private subscriptions: Record<string, Subscription> = {};
  private accounts: MailAccountInfo[] = [];
  private filterState: FilterState = {
    searchQuery: '',
    accountId: 'all',
    status: 'active',
    frequency: 'all',
    sortField: 'lastReceivedAt',
    sortDirection: 'desc'
  };

  private currentActionSubscription: Subscription | null = null;

  private static readonly accountPalette: Array<{ bg: string; border: string; fg: string }> = [
    { bg: '#e0e7ff', border: '#6366f1', fg: '#3730a3' },
    { bg: '#d1fae5', border: '#10b981', fg: '#065f46' },
    { bg: '#fef3c7', border: '#f59e0b', fg: '#92400e' },
    { bg: '#fee2e2', border: '#ef4444', fg: '#991b1b' },
    { bg: '#ede9fe', border: '#8b5cf6', fg: '#5b21b6' },
    { bg: '#cffafe', border: '#06b6d4', fg: '#155e75' },
    { bg: '#fce7f3', border: '#ec4899', fg: '#9d174d' },
    { bg: '#d1fae5', border: '#059669', fg: '#065f46' }
  ];

  async init(): Promise<void> {
    LoggerService.info('Initializing Subscriptions Hub Dashboard...');
    this.setupEventListeners();
    this.setupDebugLogListener();
    await this.loadSettingsAndApplyTheme();
    await this.loadAccounts();
    await this.loadSubscriptions();
    this.listenForBackgroundEvents();
  }

  /**
   * Sets up the interface event listeners
   */
  private setupEventListeners(): void {
    // Scan start button
    const btnScan = document.getElementById('btn-scan');
    btnScan?.addEventListener('click', () => this.handleStartScan());

    const btnEmptyScan = document.getElementById('btn-empty-scan');
    btnEmptyScan?.addEventListener('click', () => this.handleStartScan());

    const btnStopScan = document.getElementById('btn-stop-scan');
    btnStopScan?.addEventListener('click', () => this.handleStopScan());

    // Filters and search
    const searchInput = document.getElementById('filter-search') as HTMLInputElement;
    searchInput?.addEventListener('input', (e) => {
      this.filterState.searchQuery = (e.target as HTMLInputElement).value.toLowerCase();
      this.renderSubscriptionsList();
    });

    const accountSelect = document.getElementById('filter-account') as HTMLSelectElement;
    accountSelect?.addEventListener('change', (e) => {
      this.filterState.accountId = (e.target as HTMLSelectElement).value;
      this.renderSubscriptionsList();
    });

    const statusSelect = document.getElementById('filter-status') as HTMLSelectElement;
    statusSelect?.addEventListener('change', (e) => {
      this.filterState.status = (e.target as HTMLSelectElement).value;
      this.renderSubscriptionsList();
    });

    const freqSelect = document.getElementById('filter-frequency') as HTMLSelectElement;
    freqSelect?.addEventListener('change', (e) => {
      this.filterState.frequency = (e.target as HTMLSelectElement).value;
      this.renderSubscriptionsList();
    });

    const sortSelect = document.getElementById('filter-sort') as HTMLSelectElement;
    sortSelect?.addEventListener('change', (e) => {
      const [field, direction] = (e.target as HTMLSelectElement).value.split('-') as [any, any];
      this.filterState.sortField = field;
      this.filterState.sortDirection = direction;
      this.renderSubscriptionsList();
    });

    // Log console
    const btnToggleLogs = document.getElementById('btn-toggle-logs');
    btnToggleLogs?.addEventListener('click', () => this.toggleDebugPanel());

    const btnCloseLogs = document.getElementById('btn-close-logs');
    btnCloseLogs?.addEventListener('click', () => this.toggleDebugPanel(false));

    const btnClearLogs = document.getElementById('btn-clear-logs');
    btnClearLogs?.addEventListener('click', () => this.clearDebugLogs());

    const btnCopyLogs = document.getElementById('btn-copy-logs');
    btnCopyLogs?.addEventListener('click', () => this.copyDebugLogs());

    // Export
    const btnExport = document.getElementById('btn-export');
    btnExport?.addEventListener('click', () => this.handleExport());

    // Settings
    const btnSettings = document.getElementById('btn-settings');
    btnSettings?.addEventListener('click', () => this.openSettingsModal());

    const btnSaveSettings = document.getElementById('btn-save-settings');
    btnSaveSettings?.addEventListener('click', () => this.saveSettingsFromModal());

    const btnCloseSettings = document.getElementById('btn-modal-settings-close');
    btnCloseSettings?.addEventListener('click', () => this.closeSettingsModal());

    const btnClearData = document.getElementById('btn-clear-data');
    btnClearData?.addEventListener('click', () => this.handleClearData());

    // Unsubscribe modal
    const btnCloseUnsub = document.getElementById('btn-modal-unsub-close');
    btnCloseUnsub?.addEventListener('click', () => this.closeUnsubModal());

    const btnCancelUnsub = document.getElementById('btn-unsub-cancel');
    btnCancelUnsub?.addEventListener('click', () => this.closeUnsubModal());

    const btnConfirmUnsub = document.getElementById('btn-unsub-confirm');
    btnConfirmUnsub?.addEventListener('click', () => this.executeUnsubscribe());

    // Cleanup modal
    const btnCloseClean = document.getElementById('btn-modal-clean-close');
    btnCloseClean?.addEventListener('click', () => this.closeCleanModal());

    const btnCancelClean = document.getElementById('btn-clean-cancel');
    btnCancelClean?.addEventListener('click', () => this.closeCleanModal());

    const btnConfirmClean = document.getElementById('btn-clean-confirm');
    btnConfirmClean?.addEventListener('click', () => this.executeCleanMessages());
  }

  /**
   * Configures the display of diagnostic logs
   */
  private setupDebugLogListener(): void {
    LoggerService.subscribe((entry) => {
      this.appendLogLine(entry);
    });

    if (typeof browser !== 'undefined' && browser?.runtime?.onMessage) {
      browser.runtime.onMessage.addListener((msg: any) => {
        if (msg.action === 'DEBUG_LOG' && msg.payload) {
          this.appendLogLine(msg.payload);
        }
      });
    }
  }

  private toggleDebugPanel(forceState?: boolean): void {
    const panel = document.getElementById('debug-panel');
    if (!panel) return;
    if (forceState !== undefined) {
      panel.classList.toggle('hidden', !forceState);
    } else {
      panel.classList.toggle('hidden');
    }
  }

  private appendLogLine(log: LogMessage): void {
    const container = document.getElementById('debug-logs-container');
    if (!container) return;

    const line = document.createElement('div');
    line.className = `debug-log-line log-${log.level}`;
    line.textContent = `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`;

    container.insertBefore(line, container.firstChild);

    // Limit the DOM to 100 lines
    if (container.children.length > 100) {
      container.removeChild(container.lastChild!);
    }
  }

  private clearDebugLogs(): void {
    const container = document.getElementById('debug-logs-container');
    if (container) container.innerHTML = '';
    LoggerService.clearLogs();
  }

  private copyDebugLogs(): void {
    const logs = LoggerService.getLogs().map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(logs).then(() => {
      this.showToast('Diagnostic logs copied to the clipboard.', 'success');
    });
  }

  /**
   * Loads the configured accounts into the selector
   */
  private async loadAccounts(): Promise<void> {
    this.accounts = await AccountService.listAccounts();
    const accountSelect = document.getElementById('filter-account') as HTMLSelectElement;
    if (!accountSelect) return;

    accountSelect.innerHTML = '<option value="all">All accounts</option>';
    for (const acc of this.accounts) {
      const option = document.createElement('option');
      option.value = acc.id;
      const email = acc.identities[0]?.email;
      option.textContent = email ? `${acc.name} (${email})` : acc.name;
      accountSelect.appendChild(option);
    }
  }

  /**
   * Loads subscriptions from storage
   */
  private async loadSubscriptions(): Promise<void> {
    this.subscriptions = await StorageService.getSubscriptions();
    this.updateStatsCards();
    this.renderSubscriptionsList();
  }

  /**
   * Updates the 4 statistics cards
   */
  private updateStatsCards(): void {
    const list = Object.values(this.subscriptions);
    const total = list.length;
    const active = list.filter(s => s.status === 'active').length;
    const unsubscribed = list.filter(s => s.status === 'unsubscribed').length;
    const totalEmails = list.reduce((sum, s) => sum + s.totalMessages, 0);

    const elTotal = document.getElementById('stat-total-subs');
    const elActive = document.getElementById('stat-active-subs');
    const elUnsub = document.getElementById('stat-unsubscribed');
    const elEmails = document.getElementById('stat-total-emails');

    if (elTotal) elTotal.textContent = String(total);
    if (elActive) elActive.textContent = String(active);
    if (elUnsub) elUnsub.textContent = String(unsubscribed);
    if (elEmails) elEmails.textContent = String(totalEmails);
  }

  /**
   * Filters and sorts the subscriptions list
   */
  private getFilteredSubscriptions(): Subscription[] {
    let list = Object.values(this.subscriptions);

    // 1. Filter by text search
    if (this.filterState.searchQuery) {
      const q = this.filterState.searchQuery;
      list = list.filter(s =>
        s.senderName.toLowerCase().includes(q) ||
        s.senderEmail.toLowerCase().includes(q) ||
        s.senderDomain.toLowerCase().includes(q) ||
        s.recentSubjects.some(sub => sub.toLowerCase().includes(q))
      );
    }

    // 2. Filter by email account
    if (this.filterState.accountId !== 'all') {
      list = list.filter(s => s.accountId === this.filterState.accountId);
    }

    // 3. Filter by status
    if (this.filterState.status !== 'all') {
      list = list.filter(s => s.status === this.filterState.status);
    }

    // 4. Filter by frequency
    if (this.filterState.frequency !== 'all') {
      list = list.filter(s => s.frequencyEstimate === this.filterState.frequency);
    }

    // 5. Sort
    list.sort((a, b) => {
      let aVal = a[this.filterState.sortField] as any;
      let bVal = b[this.filterState.sortField] as any;

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal || '').toLowerCase();
      }

      if (aVal < bVal) return this.filterState.sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return this.filterState.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }

  /**
   * Visual rendering of the subscriptions grid
   */
  private renderSubscriptionsList(): void {
    const container = document.getElementById('subscriptions-list-container');
    const emptyState = document.getElementById('empty-state');
    if (!container || !emptyState) return;

    const filtered = this.getFilteredSubscriptions();

    if (filtered.length === 0) {
      container.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    container.innerHTML = '';

    for (const sub of filtered) {
      const card = this.createSubscriptionCard(sub);
      container.appendChild(card);
    }
  }

  /**
   * Creates the HTML element of a subscription card
   */
  private createSubscriptionCard(sub: Subscription): HTMLElement {
    const card = document.createElement('div');
    card.className = 'sub-card';
    card.id = `card-${sub.id}`;

    const isUnsub = sub.status === 'unsubscribed';
    const hasOneClick = sub.primaryUnsubscribeMethod?.type === 'http-post';

    const freqLabels: Record<string, string> = {
      daily: 'Daily',
      weekly: 'Weekly',
      monthly: 'Monthly',
      occasional: 'Occasional'
    };

    const lastDateStr = new Date(sub.lastReceivedAt).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

    const subjectsHtml = sub.recentSubjects.slice(0, 2).map(s =>
      `<div class="sub-subject-item" title="${this.escapeHtml(s)}">${this.escapeHtml(s)}</div>`
    ).join('') || '<div class="sub-subject-item">No recent subject</div>';

    const accColor = this.getAccountColor(sub.accountId);

    card.innerHTML = `
      <div class="sub-card-header">
        <div class="sub-sender-info">
          <div class="sub-sender-name">
            ${this.escapeHtml(sub.senderName)}
          </div>
          <div class="sub-sender-email">${this.escapeHtml(sub.senderEmail)}</div>
          <div class="sub-account-tag" style="background-color:${accColor.bg};border-color:${accColor.border};color:${accColor.fg};">
            ${this.escapeHtml(sub.accountName || sub.accountEmail)}
          </div>
        </div>

        <div class="badges-group">
          ${isUnsub
            ? `<span class="badge badge-unsubscribed">Unsubscribed</span>`
            : `<span class="badge badge-${sub.frequencyEstimate}">${freqLabels[sub.frequencyEstimate] || 'Occasional'}</span>`
          }
          ${hasOneClick ? `<span class="badge badge-rfc8058" title="Supports RFC 8058 1-Click unsubscribe">⚡ 1-Click</span>` : ''}
        </div>
      </div>

      <div class="sub-metrics-row">
        <div>
          <div class="sub-metric-val">${sub.totalMessages}</div>
          <div class="sub-metric-lbl">Emails received</div>
        </div>
        <div>
          <div class="sub-metric-val">${sub.unreadMessages}</div>
          <div class="sub-metric-lbl">Unread</div>
        </div>
        <div>
          <div class="sub-metric-val">${lastDateStr}</div>
          <div class="sub-metric-lbl">Last email</div>
        </div>
      </div>

      <div class="sub-subjects">
        <div class="sub-subject-title">Latest received subjects:</div>
        ${subjectsHtml}
      </div>

      <div class="sub-card-actions">
        ${isUnsub ? `
          <button class="btn btn-sm btn-secondary" disabled>
            <span>✓ Unsubscribed</span>
          </button>
        ` : `
          <button class="btn btn-sm btn-danger btn-unsub" data-action="unsub" data-id="${sub.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
            </svg>
            <span>Unsubscribe</span>
          </button>
        `}

        <button class="btn btn-sm btn-secondary" data-action="clean" data-id="${sub.id}" title="Clean up the emails received from this sender">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          <span>Clean up</span>
        </button>
      </div>
    `;

    // Attach action handlers
    const btnUnsub = card.querySelector('[data-action="unsub"]');
    btnUnsub?.addEventListener('click', () => this.openUnsubModal(sub));

    const btnClean = card.querySelector('[data-action="clean"]');
    btnClean?.addEventListener('click', () => this.openCleanModal(sub));

    return card;
  }

  /**
   * Starts a folder analysis
   */
  private async handleStartScan(): Promise<void> {
    const banner = document.getElementById('scan-progress-banner');
    const btnScan = document.getElementById('btn-scan') as HTMLButtonElement;
    if (banner) banner.classList.remove('hidden');
    if (btnScan) btnScan.disabled = true;

    // Automatically opens the log console if closed
    this.toggleDebugPanel(true);

    try {
      if (typeof browser !== 'undefined' && browser?.runtime?.sendMessage) {
        LoggerService.info('Sending START_SCAN command to the background service...');
        const res = await browser.runtime.sendMessage({
          action: 'START_SCAN',
          payload: { options: {} }
        });

        if (res && !res.success) {
          LoggerService.error(`Scan failure response: ${res.error}`);
          this.showToast(res.error || 'Error during scan', 'error');
        } else {
          await this.loadSubscriptions();
          this.showToast('Analysis completed successfully!', 'success');
        }
      } else {
        // Direct execution (standalone demo environment)
        await ScannerService.startScan({}, (progress) => {
          this.updateScanProgressUI(progress);
        });
        await this.loadSubscriptions();
        this.showToast('Analysis completed successfully!', 'success');
      }
    } catch (e: any) {
      LoggerService.error(`Exception during scan: ${e?.message}`);
      this.showToast(`Scan failed: ${e.message}`, 'error');
    } finally {
      if (banner) banner.classList.add('hidden');
      if (btnScan) btnScan.disabled = false;
    }
  }

  /**
   * Stops the current scan
   */
  private handleStopScan(): void {
    if (typeof browser !== 'undefined' && browser?.runtime?.sendMessage) {
      browser.runtime.sendMessage({ action: 'STOP_SCAN' });
    } else {
      ScannerService.stopScan();
    }
    const banner = document.getElementById('scan-progress-banner');
    if (banner) banner.classList.add('hidden');
    this.showToast('Analysis interrupted by the user.', 'default');
  }

  /**
   * Updates the progress bar and texts
   */
  private updateScanProgressUI(progress: ScanProgress): void {
    const banner = document.getElementById('scan-progress-banner');
    const bar = document.getElementById('scan-progress-bar');
    const badge = document.getElementById('scan-percent-badge');
    const detail = document.getElementById('scan-detail-text');

    if (!banner) return;

    if (progress.state === 'running') {
      banner.classList.remove('hidden');
      if (bar) bar.style.width = `${progress.percent}%`;
      if (badge) badge.textContent = `${progress.percent}%`;
      if (detail) {
        detail.textContent = `Folder: ${progress.currentFolderName || '...'} | ${progress.processedMessages} messages processed | ${progress.subscriptionsFound} subscriptions detected`;
      }
    } else if (progress.state === 'completed') {
      banner.classList.add('hidden');
    }
  }

  /**
   * Listens to events sent by the background script
   */
  private listenForBackgroundEvents(): void {
    if (typeof browser !== 'undefined' && browser?.runtime?.onMessage) {
      browser.runtime.onMessage.addListener((msg: any) => {
        if (msg.action === 'SCAN_PROGRESS') {
          this.updateScanProgressUI(msg.payload);
          if (msg.payload.state === 'completed') {
            this.loadSubscriptions();
          }
        }
      });
    }
  }

  /**
   * Opens the unsubscribe confirmation modal
   */
  private openUnsubModal(sub: Subscription): void {
    this.currentActionSubscription = sub;
    const modal = document.getElementById('modal-unsubscribe');
    const body = document.getElementById('modal-unsub-content');
    if (!modal || !body) return;

    const method = sub.primaryUnsubscribeMethod;
    let methodDesc = '';

    if (method?.type === 'http-post') {
      methodDesc = `
        <div style="background: var(--success-light); padding: 12px; border-radius: var(--radius-sm); color: var(--success-color); font-weight: 600;">
          ⚡ Direct one-click unsubscribe (RFC 8058)
        </div>
        <p>A secure request will be sent directly to <code>${this.escapeHtml(sub.senderDomain)}</code> without requiring manual confirmation.</p>
      `;
    } else if (method?.type === 'mailto') {
      methodDesc = `
        <div style="background: var(--info-light); padding: 12px; border-radius: var(--radius-sm); color: var(--info-color); font-weight: 600;">
          ✉️ Unsubscribe by email (mailto)
        </div>
        <p>A pre-filled unsubscribe message will be prepared for <code>${this.escapeHtml(method.target)}</code>.</p>
      `;
    } else {
      methodDesc = `
        <div style="background: var(--warning-light); padding: 12px; border-radius: var(--radius-sm); color: var(--warning-color); font-weight: 600;">
          🌐 Unsubscribe via web page
        </div>
        <p>The official unsubscribe page (<code>${this.escapeHtml(method?.target || 'Detected link')}</code>) will open in a new tab.</p>
      `;
    }

    body.innerHTML = `
      <p>You are about to unsubscribe from:</p>
      <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary);">
        ${this.escapeHtml(sub.senderName)} &lt;${this.escapeHtml(sub.senderEmail)}&gt;
      </div>
      <div style="font-size: 0.85rem; color: var(--text-muted);">
        Linked account: ${this.escapeHtml(sub.accountEmail || sub.accountName)}
      </div>
      <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 8px 0;" />
      ${methodDesc}
    `;

    modal.classList.remove('hidden');
  }

  private closeUnsubModal(): void {
    const modal = document.getElementById('modal-unsubscribe');
    if (modal) modal.classList.add('hidden');
    this.currentActionSubscription = null;
  }

  /**
   * Executes the unsubscribe action
   */
  private async executeUnsubscribe(): Promise<void> {
    if (!this.currentActionSubscription) return;
    const sub = this.currentActionSubscription;
    this.closeUnsubModal();

    this.showToast(`Unsubscribing from ${sub.senderName}...`, 'default');

    const result = await UnsubscribeService.unsubscribe(sub);

    if (result.success) {
      await this.loadSubscriptions();
      this.showToast(result.message, 'success');
    } else {
      this.showToast(result.message, 'error');
    }
  }

  /**
   * Opens the message cleanup modal
   */
  private openCleanModal(sub: Subscription): void {
    this.currentActionSubscription = sub;
    const modal = document.getElementById('modal-clean');
    const body = document.getElementById('modal-clean-content');
    if (!modal || !body) return;

    body.innerHTML = `
      <p>Do you want to move all emails received from <strong>${this.escapeHtml(sub.senderName)}</strong> to the trash?</p>
      <div style="background: var(--bg-surface-secondary); padding: 12px; border-radius: var(--radius-sm);">
        <div><strong>Total volume:</strong> ${sub.totalMessages} emails</div>
        <div><strong>Address:</strong> <code>${this.escapeHtml(sub.senderEmail)}</code></div>
        <div><strong>Account:</strong> ${this.escapeHtml(sub.accountName)}</div>
      </div>
      <p style="font-size: 0.8rem; color: var(--danger-color);">⚠️ This action will move ${sub.totalMessages} message(s) to your mailbox trash.</p>
    `;

    modal.classList.remove('hidden');
  }

  private closeCleanModal(): void {
    const modal = document.getElementById('modal-clean');
    if (modal) modal.classList.add('hidden');
    this.currentActionSubscription = null;
  }

  /**
   * Executes the deletion / move to trash
   */
  private async executeCleanMessages(): Promise<void> {
    if (!this.currentActionSubscription) return;
    const sub = this.currentActionSubscription;
    this.closeCleanModal();

    this.showToast(`Deleting messages from ${sub.senderName}...`, 'default');

    const res = await UnsubscribeService.deleteMessages(sub.recentMessageIds);
    if (res.error) {
      this.showToast(`Error: ${res.error}`, 'error');
    } else {
      this.showToast(`${res.deletedCount} message(s) moved to trash.`, 'success');
      sub.totalMessages = Math.max(0, sub.totalMessages - res.deletedCount);
      sub.unreadMessages = 0;
      await StorageService.upsertSubscription(sub);
      this.renderSubscriptionsList();
      this.updateStatsCards();
    }
  }

  /**
   * Handles CSV / JSON export
   */
  private handleExport(): void {
    const subsArray = Object.values(this.subscriptions);
    if (subsArray.length === 0) {
      this.showToast('No data to export.', 'default');
      return;
    }

    const csvContent = StorageService.exportToCSV(subsArray);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `thunderbird-subscriptions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    this.showToast('CSV export generated successfully.', 'success');
  }

  /**
   * Settings modal
   */
  private async openSettingsModal(): Promise<void> {
    const modal = document.getElementById('modal-settings');
    const settings = await StorageService.getSettings();

    const autoScan = document.getElementById('setting-auto-scan') as HTMLInputElement;
    const themeSelect = document.getElementById('setting-theme') as HTMLSelectElement;
    const batchInput = document.getElementById('setting-batch-size') as HTMLInputElement;

    if (autoScan) autoScan.checked = settings.autoScanOnNewMail;
    if (themeSelect) themeSelect.value = settings.theme;
    if (batchInput) batchInput.value = String(settings.scanBatchSize || 30);

    if (modal) modal.classList.remove('hidden');
  }

  private closeSettingsModal(): void {
    const modal = document.getElementById('modal-settings');
    if (modal) modal.classList.add('hidden');
  }

  private async saveSettingsFromModal(): Promise<void> {
    const autoScan = document.getElementById('setting-auto-scan') as HTMLInputElement;
    const themeSelect = document.getElementById('setting-theme') as HTMLSelectElement;
    const batchInput = document.getElementById('setting-batch-size') as HTMLInputElement;

    await StorageService.saveSettings({
      autoScanOnNewMail: autoScan?.checked ?? true,
      theme: (themeSelect?.value as any) || 'auto',
      scanBatchSize: Number(batchInput?.value) || 30
    });

    await this.loadSettingsAndApplyTheme();
    this.closeSettingsModal();
    this.showToast('Settings saved.', 'success');
  }

  private async loadSettingsAndApplyTheme(): Promise<void> {
    const settings = await StorageService.getSettings();
    if (settings.theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else if (settings.theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  private async handleClearData(): Promise<void> {
    if (confirm('Are you sure you want to reset the subscriptions history?')) {
      await StorageService.clearAllData();
      await this.loadSubscriptions();
      this.closeSettingsModal();
      this.showToast('Local database reset.', 'success');
    }
  }

  /**
   * Displays an informational toast
   */
  private showToast(message: string, type: 'default' | 'success' | 'error' = 'default'): void {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type === 'success' ? 'toast-success' : type === 'error' ? 'toast-error' : ''}`;
    toast.textContent = message;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  /**
   * Assigns a deterministic and stable color to each account
   */
  private getAccountColor(accountId: string): { bg: string; border: string; fg: string } {
    let hash = 0;
    const key = accountId || 'default';
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash) + key.charCodeAt(i);
      hash |= 0;
    }
    const index = Math.abs(hash) % DashboardController.accountPalette.length;
    return DashboardController.accountPalette[index];
  }
}
// Initialization on DOM load
document.addEventListener('DOMContentLoaded', () => {
  const app = new DashboardController();
  app.init();
});
