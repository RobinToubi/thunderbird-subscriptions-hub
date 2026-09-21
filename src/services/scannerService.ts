import { AppSettings, MailFolderInfo, ScanOptions, ScanProgress, Subscription } from '../types';
import { AccountService } from './accountService';
import { LoggerService } from './loggerService';
import { ParserService } from './parserService';
import { StorageService } from './storageService';
import { SubscriptionService } from './subscriptionService';

export type ProgressCallback = (progress: ScanProgress) => void;

export class ScannerService {
  private static isScanning = false;
  private static shouldCancel = false;

  /**
   * Runs a full or incremental analysis of the folders
   */
  static async startScan(
    options: ScanOptions = {},
    onProgress?: ProgressCallback
  ): Promise<{ subscriptions: Record<string, Subscription>; totalProcessed: number }> {
    if (this.isScanning) {
      throw new Error('A scan is already running.');
    }

    this.isScanning = true;
    this.shouldCancel = false;

    const startTime = Date.now();
    LoggerService.info('🚀 Starting the subscriptions scan...');

    const settings: AppSettings = await StorageService.getSettings();
    const existingSubscriptions = await StorageService.getSubscriptions();
    const analyzedIds = await StorageService.getAnalyzedMessageIds();

    const progress: ScanProgress = {
      state: 'running',
      processedMessages: 0,
      totalEstimatedMessages: 0,
      subscriptionsFound: Object.keys(existingSubscriptions).length,
      percent: 0,
      startedAt: startTime
    };

    const updateProgress = (updates: Partial<ScanProgress>) => {
      Object.assign(progress, updates);
      progress.elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
      if (progress.totalEstimatedMessages > 0) {
        progress.percent = Math.min(100, Math.round((progress.processedMessages / progress.totalEstimatedMessages) * 100));
      }
      onProgress?.(progress);
    };

    try {
      // 1. Retrieval of accounts and folder trees
      const allAccounts = await AccountService.listAccounts();
      const targetAccounts = options.accountIds && options.accountIds.length > 0
        ? allAccounts.filter(acc => options.accountIds?.includes(acc.id))
        : allAccounts;

      if (targetAccounts.length === 0) {
        LoggerService.warn('No account found.');
      }

      // Simulation mode for local development
      if (typeof browser === 'undefined' || !browser?.messages?.list) {
        LoggerService.info('Standalone mode (outside Thunderbird): running the simulation scan.');
        return await this.runMockScan(targetAccounts, existingSubscriptions, updateProgress);
      }

      // 2. Total volume estimation
      let estimatedTotal = 0;
      for (const acc of targetAccounts) {
        for (const folder of acc.folders) {
          if (AccountService.isScanEligibleFolder(folder)) {
            estimatedTotal += folder.totalSubMessages || 50;
          }
        }
      }
      updateProgress({ totalEstimatedMessages: Math.max(estimatedTotal, 1) });

      // 3. Browse the folders of each account
      for (const account of targetAccounts) {
        if (this.shouldCancel) break;
        const accountEmail = account.identities[0]?.email || account.name;
        LoggerService.info(`Processing the account: "${account.name}" (${account.folders.length} folder(s))`);

        for (const folder of account.folders) {
          if (this.shouldCancel) break;
          if (!AccountService.isScanEligibleFolder(folder)) {
            LoggerService.info(`⏭️ Folder ignored: "${folder.name}" (${folder.type || 'standard'})`);
            continue;
          }

          updateProgress({
            currentAccountName: account.name,
            currentFolderName: folder.name
          });

          await this.scanFolder(
            folder,
            account.id,
            account.name,
            accountEmail,
            existingSubscriptions,
            analyzedIds,
            settings,
            options,
            updateProgress
          );
        }
      }

      // 4. Finalization and save
      await StorageService.saveSubscriptions(existingSubscriptions);
      await StorageService.saveAnalyzedMessageIds(analyzedIds);
      await StorageService.saveSettings({ lastScanTimestamp: Date.now() });

      const foundCount = Object.keys(existingSubscriptions).length;
      LoggerService.success(`✅ Scan completed successfully: ${progress.processedMessages} messages analyzed, ${foundCount} subscription(s) detected.`);

      updateProgress({
        state: 'completed',
        percent: 100,
        subscriptionsFound: foundCount
      });

      return {
        subscriptions: existingSubscriptions,
        totalProcessed: progress.processedMessages
      };
    } catch (error: any) {
      LoggerService.error('Critical error during the scan:', error?.message || error);
      updateProgress({
        state: 'error',
        errorMessage: error?.message || 'Unexpected error during the analysis'
      });
      throw error;
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Analyzes the messages of a specific folder
   */
  private static async scanFolder(
    folder: MailFolderInfo,
    accountId: string,
    accountName: string,
    accountEmail: string,
    subscriptionsMap: Record<string, Subscription>,
    analyzedIds: Set<number>,
    settings: AppSettings,
    options: ScanOptions,
    updateProgress: (updates: Partial<ScanProgress>) => void
  ): Promise<void> {
    try {
      LoggerService.info(`📂 Opening the folder: "${folder.name}" (id: ${folder.id}, path: ${folder.path})`);

      let messageList: any = null;

      // Attempt 1: via folder.id
      if (folder.id !== undefined) {
        try {
          messageList = await browser.messages.list(folder.id);
        } catch (e1: any) {
          LoggerService.warn(`messages.list(folder.id): ${e1?.message}`);
        }
      }

      // Attempt 2: via native rawFolder
      if (!messageList && folder.rawFolder) {
        try {
          messageList = await browser.messages.list(folder.rawFolder);
        } catch (e2: any) {
          LoggerService.warn(`messages.list(rawFolder): ${e2?.message}`);
        }
      }

      // Attempt 3: via folder
      if (!messageList) {
        try {
          messageList = await browser.messages.list(folder);
        } catch (e3: any) {
          LoggerService.warn(`messages.list(folder): ${e3?.message}`);
        }
      }

      // Attempt 4: via messages.query({ folder: ... })
      if (!messageList && browser.messages?.query) {
        try {
          messageList = await browser.messages.query({ folder: folder.rawFolder || folder });
        } catch (e4: any) {
          LoggerService.warn(`messages.query({ folder }): ${e4?.message}`);
        }
      }

      if (!messageList || !messageList.messages) {
        LoggerService.info(`0 message returned for the folder "${folder.name}".`);
        return;
      }

      let countInFolder = 0;
      const maxInFolder = options.maxMessagesPerFolder || 50000;

      while (messageList && messageList.messages && messageList.messages.length > 0) {
        if (this.shouldCancel || countInFolder >= maxInFolder) break;

        const batch = messageList.messages;
        LoggerService.info(`Reading a batch of ${batch.length} message(s) in "${folder.name}"`);

        for (const msgHeader of batch) {
          if (this.shouldCancel) break;

          const msgId = msgHeader.id;
          countInFolder++;

          try {
            // Reading the complete headers
            let headers: Record<string, string[] | string> = {};
            try {
              const fullMessage = await browser.messages.getFull(msgId);
              headers = fullMessage?.headers || {};
            } catch (fullErr: any) {
              if (browser.messages?.getHeaders) {
                headers = await browser.messages.getHeaders(msgId);
              }
            }

            const subject = msgHeader.subject || '';
            const author = msgHeader.author || '';
            const receivedDate = msgHeader.date ? new Date(msgHeader.date).getTime() : Date.now();
            const isRead = msgHeader.read ?? true;

            const detection = ParserService.isNewsletterMessage(headers, subject);

            if (detection.isNewsletter) {
              const { name: senderName, email: senderEmail, domain: senderDomain } = ParserService.parseAuthor(author);

              // Never consider a message sent by the account itself as a subscription
              // (work emails, applications, sent drafts, etc.).
              const isSelfSent = senderEmail && (
                senderEmail === accountEmail ||
                senderEmail === accountName.toLowerCase()
              );
              
              if (senderEmail && !isSelfSent && !settings.ignoredDomains.includes(senderDomain)) {
                const { subscription, created } = SubscriptionService.upsertFromMessage(
                  subscriptionsMap,
                  { accountId, accountName, accountEmail },
                  {
                    messageId: msgId,
                    subject,
                    senderName,
                    senderEmail,
                    senderDomain,
                    listId: detection.listId,
                    receivedAt: receivedDate,
                    isRead,
                    unsubscribeMethods: detection.unsubscribeMethods
                  }
                );

                if (created) {
                  LoggerService.success(`\u{1F3AF} Subscription identified: "${subscription.senderName}" <${subscription.senderEmail}>`);
                }
              }
            }

            analyzedIds.add(msgId);
          } catch (msgErr: any) {
            LoggerService.warn(`Error reading message #${msgId}:`, msgErr?.message);
          }

          if (countInFolder % settings.scanBatchSize === 0) {
            await new Promise(r => setTimeout(r, settings.scanThrottleDelayMs));
            updateProgress({
              processedMessages: countInFolder,
              subscriptionsFound: Object.keys(subscriptionsMap).length
            });
          }
        }

        // Pagination
        if (messageList.id) {
          messageList = await browser.messages.continueList(messageList.id);
        } else {
          break;
        }
      }
    } catch (err: any) {
      LoggerService.error(`Error while scanning the folder "${folder.name}":`, err?.message || err);
    }
  }

  /**
   * Stops the current analysis
   */
  static stopScan(): void {
    LoggerService.warn('Scan stop request received.');
    this.shouldCancel = true;
  }

  /**
   * Scan simulation for `pnpm dev`: the progress bar runs for real, and the
   * results are the shared demo fixtures, so a simulated scan and a seeded page
   * show exactly the same data. Stripped from the production build.
   */
  private static async runMockScan(
    accounts: any[],
    existingSubscriptions: Record<string, Subscription>,
    updateProgress: (updates: Partial<ScanProgress>) => void
  ): Promise<{ subscriptions: Record<string, Subscription>; totalProcessed: number }> {
    const totalSteps = 60;
    updateProgress({ totalEstimatedMessages: totalSteps, processedMessages: 0 });

    for (let step = 1; step <= totalSteps; step += 10) {
      if (this.shouldCancel) break;
      await new Promise(r => setTimeout(r, 40));
      updateProgress({
        processedMessages: step,
        currentAccountName: accounts[0]?.name || 'Primary Account',
        currentFolderName: step % 2 === 0 ? 'Inbox' : 'Archives'
      });
    }

    if (import.meta.env.DEV) {
      const { buildDemoSubscriptions } = await import('../dev/fixtures');
      Object.assign(existingSubscriptions, buildDemoSubscriptions(accounts));
      await StorageService.saveSubscriptions(existingSubscriptions);
    }

    updateProgress({
      state: 'completed',
      processedMessages: totalSteps,
      percent: 100,
      subscriptionsFound: Object.keys(existingSubscriptions).length
    });

    return {
      subscriptions: existingSubscriptions,
      totalProcessed: totalSteps
    };
  }
}
