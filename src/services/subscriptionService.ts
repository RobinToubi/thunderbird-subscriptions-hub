import { Subscription, UnsubscribeMethod } from '../types';
import { ParserService } from './parserService';

/** The account a message was found in. */
export interface SubscriptionAccountContext {
  accountId: string;
  accountName: string;
  accountEmail: string;
}

/** A single message, already parsed and recognised as belonging to a subscription. */
export interface AnalyzedMessage {
  messageId: number;
  subject: string;
  senderName: string;
  senderEmail: string;
  senderDomain: string;
  listId?: string;
  receivedAt: number;
  isRead: boolean;
  unsubscribeMethods: UnsubscribeMethod[];
}

/** Maximum number of recent subjects kept per subscription. */
const MAX_RECENT_SUBJECTS = 5;

export class SubscriptionService {
  /**
   * Folds one analyzed message into the subscriptions map, creating the subscription
   * on first sight and aggregating into it afterwards.
   *
   * This is the single aggregation path shared by the full scan (`ScannerService`) and
   * the incremental `onNewMailReceived` analysis, so counters and the derived frequency
   * can never drift apart between the two.
   */
  static upsertFromMessage(
    subscriptions: Record<string, Subscription>,
    account: SubscriptionAccountContext,
    message: AnalyzedMessage
  ): { subscription: Subscription; created: boolean } {
    const subId = ParserService.generateSubscriptionId(
      account.accountId,
      message.senderEmail,
      message.listId
    );
    const bestMethod = ParserService.getBestUnsubscribeMethod(message.unsubscribeMethods);
    const existing = subscriptions[subId];

    if (!existing) {
      const subscription: Subscription = {
        id: subId,
        accountId: account.accountId,
        accountName: account.accountName,
        accountEmail: account.accountEmail,
        senderName: message.senderName || message.senderEmail,
        senderEmail: message.senderEmail,
        senderDomain: message.senderDomain,
        listId: message.listId,
        category: 'newsletter',
        totalMessages: 1,
        unreadMessages: message.isRead ? 0 : 1,
        firstReceivedAt: message.receivedAt,
        lastReceivedAt: message.receivedAt,
        // A first message carries no interval yet; refreshed on every later message.
        frequencyEstimate: 'occasional',
        recentSubjects: message.subject ? [message.subject] : [],
        recentMessageIds: [message.messageId],
        unsubscribeMethods: message.unsubscribeMethods,
        primaryUnsubscribeMethod: bestMethod,
        status: 'active',
        tags: []
      };
      subscriptions[subId] = subscription;
      return { subscription, created: true };
    }

    existing.totalMessages += 1;
    if (!message.isRead) existing.unreadMessages += 1;
    if (message.receivedAt < existing.firstReceivedAt) existing.firstReceivedAt = message.receivedAt;
    if (message.receivedAt > existing.lastReceivedAt) existing.lastReceivedAt = message.receivedAt;

    if (message.subject && !existing.recentSubjects.includes(message.subject)) {
      existing.recentSubjects.unshift(message.subject);
      if (existing.recentSubjects.length > MAX_RECENT_SUBJECTS) existing.recentSubjects.pop();
    }

    if (!existing.recentMessageIds.includes(message.messageId)) {
      existing.recentMessageIds.push(message.messageId);
    }

    // Backfill the unsubscribe methods when the first message we saw had none.
    if (message.unsubscribeMethods.length > 0 && (!existing.unsubscribeMethods || existing.unsubscribeMethods.length === 0)) {
      existing.unsubscribeMethods = message.unsubscribeMethods;
      existing.primaryUnsubscribeMethod = bestMethod;
    }

    // Must run last: it reads the counters and the window updated just above.
    existing.frequencyEstimate = ParserService.estimateFrequencyFromRange(
      existing.firstReceivedAt,
      existing.lastReceivedAt,
      existing.totalMessages
    );

    return { subscription: existing, created: false };
  }
}
