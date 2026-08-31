import { ParserService } from '../services/parserService';
import { ScannerService } from '../services/scannerService';
import { StorageService } from '../services/storageService';
import { UnsubscribeService } from '../services/unsubscribeService';

console.log('[Subscriptions Hub] Background script initialized.');

/**
 * Registers the icon in the Spaces Toolbar sidebar
 * (The vertical bar on the left with Mail, Calendar, Contacts, etc.)
 */
async function registerSpace() {
  if (typeof browser !== 'undefined' && browser?.spaces?.create) {
    try {
      // Checks whether the space already exists to avoid duplication or error
      if (browser.spaces.query) {
        const existingSpaces = await browser.spaces.query({ name: 'subscriptions_hub' });
        if (existingSpaces && existingSpaces.length > 0) {
          console.log('[Subscriptions Hub] The space is already active in the Spaces sidebar.');
          return;
        }
      }

      // Creates the space in the Spaces Toolbar
      await browser.spaces.create(
        'subscriptions_hub',
        {
          url: 'dashboard.html'
        },
        {
          title: 'Subscriptions Hub - Subscriptions',
          icons: {
            '32': 'icons/icon-32.svg',
            '64': 'icons/icon-64.svg'
          }
        }
      );
      console.log('[Subscriptions Hub] Space created successfully in the Spaces sidebar.');
    } catch (e) {
      console.warn('[Subscriptions Hub] Unable to create the Spaces space:', e);
    }
  }
}

/**
 * Opens or activates the full dashboard tab
 */
async function openDashboardTab() {
  if (typeof browser !== 'undefined' && browser?.tabs) {
    try {
      const url = browser.runtime.getURL('dashboard.html');
      const existingTabs = await browser.tabs.query({});
      const targetTab = existingTabs.find((t: any) => t.url && t.url.includes('dashboard.html'));

      if (targetTab && targetTab.id) {
        await browser.tabs.update(targetTab.id, { active: true });
        if (targetTab.windowId && browser.windows) {
          await browser.windows.update(targetTab.windowId, { focused: true });
        }
      } else {
        await browser.tabs.create({ url: 'dashboard.html' });
      }
    } catch (err) {
      console.error('[Subscriptions Hub] Error opening the tab:', err);
    }
  }
}

// Click on the toolbar action icon
if (typeof browser !== 'undefined' && browser?.action?.onClicked) {
  browser.action.onClicked.addListener(() => {
    openDashboardTab();
  });
}

// Listener for inter-process messages (Dashboard <-> Background)
if (typeof browser !== 'undefined' && browser?.runtime?.onMessage) {
  browser.runtime.onMessage.addListener((message: any, sender: any, sendResponse: (res: any) => void) => {
    const { action, payload } = message || {};

    if (action === 'OPEN_DASHBOARD') {
      openDashboardTab().then(() => sendResponse({ success: true }));
      return true;
    }

    if (action === 'START_SCAN') {
      ScannerService.startScan(payload?.options, (progress) => {
        // Sends the progress to open tabs
        browser.runtime.sendMessage({
          action: 'SCAN_PROGRESS',
          payload: progress
        }).catch(() => {});
      }).then((result) => {
        sendResponse({ success: true, result });
      }).catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }

    if (action === 'STOP_SCAN') {
      ScannerService.stopScan();
      sendResponse({ success: true });
      return true;
    }

    if (action === 'UNSUBSCRIBE') {
      UnsubscribeService.unsubscribe(payload.subscription, payload.method)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, message: err.message }));
      return true;
    }

    if (action === 'DELETE_MESSAGES') {
      UnsubscribeService.deleteMessages(payload.messageIds)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ deletedCount: 0, error: err.message }));
      return true;
    }

    return false;
  });
}

/**
 * Listener for incoming new emails (incremental real-time analysis)
 */
if (typeof browser !== 'undefined' && browser?.messages?.onNewMailReceived) {
  browser.messages.onNewMailReceived.addListener(async (folder: any, messagesList: any) => {
    try {
      const settings = await StorageService.getSettings();
      if (!settings.autoScanOnNewMail) return;

      const subscriptions = await StorageService.getSubscriptions();
      const analyzedIds = await StorageService.getAnalyzedMessageIds();
      const messages = messagesList?.messages || [];

      for (const msg of messages) {
        if (analyzedIds.has(msg.id)) continue;

        const fullMessage = await browser.messages.getFull(msg.id);
        const headers = fullMessage?.headers || {};
        const detection = ParserService.isNewsletterMessage(headers, msg.subject);

        if (detection.isNewsletter) {
          const { name: senderName, email: senderEmail, domain: senderDomain } = ParserService.parseAuthor(msg.author);
          if (senderEmail && !settings.ignoredDomains.includes(senderDomain)) {
            const accountId = folder.accountId || 'default';
            const subId = ParserService.generateSubscriptionId(accountId, senderEmail, detection.listId);
            const bestMethod = ParserService.getBestUnsubscribeMethod(detection.unsubscribeMethods);

            if (!subscriptions[subId]) {
              subscriptions[subId] = {
                id: subId,
                accountId,
                accountName: `Account ${accountId}`,
                accountEmail: senderEmail,
                senderName: senderName || senderEmail,
                senderEmail,
                senderDomain,
                listId: detection.listId,
                category: 'newsletter',
                totalMessages: 1,
                unreadMessages: 1,
                firstReceivedAt: Date.now(),
                lastReceivedAt: Date.now(),
                frequencyEstimate: 'occasional',
                recentSubjects: msg.subject ? [msg.subject] : [],
                recentMessageIds: [msg.id],
                unsubscribeMethods: detection.unsubscribeMethods,
                primaryUnsubscribeMethod: bestMethod,
                status: 'active',
                tags: []
              };
            } else {
              const sub = subscriptions[subId];
              sub.totalMessages += 1;
              sub.unreadMessages += 1;
              sub.lastReceivedAt = Date.now();
              if (msg.subject && !sub.recentSubjects.includes(msg.subject)) {
                sub.recentSubjects.unshift(msg.subject);
                if (sub.recentSubjects.length > 5) sub.recentSubjects.pop();
              }
              if (!sub.recentMessageIds.includes(msg.id)) {
                sub.recentMessageIds.push(msg.id);
              }
            }
          }
        }

        analyzedIds.add(msg.id);
      }

      await StorageService.saveSubscriptions(subscriptions);
      await StorageService.saveAnalyzedMessageIds(analyzedIds);
    } catch (err) {
      console.warn('[Subscriptions Hub] Error analyzing new mail:', err);
    }
  });
}

// Initialization on background service startup
registerSpace();
