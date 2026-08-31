import { Subscription, UnsubscribeMethod } from '../types';
import { StorageService } from './storageService';

export interface UnsubscribeResult {
  success: boolean;
  message: string;
  actionTaken: 'http-post' | 'web-opened' | 'mailto-opened' | 'manual-required';
  tabId?: number;
}

export class UnsubscribeService {
  /**
   * Executes the unsubscribe according to the chosen method
   */
  static async unsubscribe(subscription: Subscription, customMethod?: UnsubscribeMethod): Promise<UnsubscribeResult> {
    const method = customMethod || subscription.primaryUnsubscribeMethod || subscription.unsubscribeMethods[0];

    if (!method) {
      return {
        success: false,
        message: 'No unsubscribe method found for this sender.',
        actionTaken: 'manual-required'
      };
    }

    try {
      // 1. One-Click RFC 8058 method (HTTP POST)
      if (method.type === 'http-post' && method.target) {
        return await this.executeOneClickPost(method.target, method.postPayload || 'List-Unsubscribe=One-Click', subscription);
      }

      // 2. Mailto method (RFC 2369)
      if (method.type === 'mailto' && method.target) {
        return await this.executeMailto(method.target, method.subject, method.body, subscription);
      }

      // 3. Web Link method (HTTP GET / Web page)
      if ((method.type === 'http-get' || method.type === 'web') && method.target) {
        return await this.executeWebOpen(method.target, subscription);
      }

      return {
        success: false,
        message: 'Unrecognized method type.',
        actionTaken: 'manual-required'
      };
    } catch (error: any) {
      console.error('Error during the unsubscribe:', error);
      return {
        success: false,
        message: `Unsubscribe failed: ${error?.message || 'Network or unknown error'}`,
        actionTaken: 'manual-required'
      };
    }
  }

  /**
   * Executes a One-Click HTTP POST request compliant with RFC 8058
   */
  private static async executeOneClickPost(url: string, payload: string, subscription: Subscription): Promise<UnsubscribeResult> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: payload
      });

      if (response.ok || response.status === 200 || response.status === 202) {
        await this.markAsUnsubscribed(subscription.id);
        return {
          success: true,
          message: 'One-click unsubscribe (RFC 8058) executed successfully.',
          actionTaken: 'http-post'
        };
      } else {
        // In case of POST error, we offer to open the URL in a tab
        await this.executeWebOpen(url, subscription);
        return {
          success: true,
          message: `One-Click request rejected (${response.status}), the web page was opened for manual confirmation.`,
          actionTaken: 'web-opened'
        };
      }
    } catch (e: any) {
      // If CORS or network blocks the direct POST, fall back to opening the tab
      await this.executeWebOpen(url, subscription);
      return {
        success: true,
        message: 'Unsubscribe link opened in a new tab.',
        actionTaken: 'web-opened'
      };
    }
  }

  /**
   * Opens the compose window of an unsubscribe message (mailto)
   */
  private static async executeMailto(email: string, subject?: string, body?: string, subscription?: Subscription): Promise<UnsubscribeResult> {
    const subText = subject || 'Unsubscribe';
    const bodyText = body || 'Please unsubscribe me from this mailing list.';

    if (typeof browser !== 'undefined' && browser?.compose?.beginNew) {
      try {
        await browser.compose.beginNew({
          to: [email],
          subject: subText,
          body: bodyText
        });
      } catch (err) {
        window.open(`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subText)}&body=${encodeURIComponent(bodyText)}`);
      }
    } else {
      window.open(`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subText)}&body=${encodeURIComponent(bodyText)}`);
    }

    if (subscription) {
      await this.markAsUnsubscribed(subscription.id);
    }

    return {
      success: true,
      message: 'Unsubscribe email prepared.',
      actionTaken: 'mailto-opened'
    };
  }

  /**
   * Opens the unsubscribe link in a Thunderbird tab
   */
  private static async executeWebOpen(url: string, subscription: Subscription): Promise<UnsubscribeResult> {
    let tabId: number | undefined;

    if (typeof browser !== 'undefined' && browser?.tabs?.create) {
      const tab = await browser.tabs.create({ url });
      tabId = tab?.id;
    } else {
      window.open(url, '_blank');
    }

    await this.markAsUnsubscribed(subscription.id);

    return {
      success: true,
      message: 'Unsubscribe page opened in a new tab.',
      actionTaken: 'web-opened',
      tabId
    };
  }

  /**
   * Updates the status in the local database
   */
  static async markAsUnsubscribed(subscriptionId: string): Promise<void> {
    const all = await StorageService.getSubscriptions();
    if (all[subscriptionId]) {
      all[subscriptionId].status = 'unsubscribed';
      all[subscriptionId].unsubscribedAt = Date.now();
      await StorageService.saveSubscriptions(all);
    }
  }

  /**
   * Deletes or moves to trash the messages associated with this subscription
   */
  static async deleteMessages(messageIds: number[]): Promise<{ deletedCount: number; error?: string }> {
    if (!messageIds || messageIds.length === 0) {
      return { deletedCount: 0 };
    }

    if (typeof browser !== 'undefined' && browser?.messages?.delete) {
      try {
        // Batch deletion to avoid overloading the API
        const batchSize = 100;
        let deletedCount = 0;

        for (let i = 0; i < messageIds.length; i += batchSize) {
          const batch = messageIds.slice(i, i + batchSize);
          await browser.messages.delete(batch, true); // true = moveToTrash
          deletedCount += batch.length;
        }

        return { deletedCount };
      } catch (err: any) {
        console.error('Error while deleting the messages:', err);
        return { deletedCount: 0, error: err?.message || 'Error during the deletion' };
      }
    }

    return { deletedCount: messageIds.length };
  }
}
