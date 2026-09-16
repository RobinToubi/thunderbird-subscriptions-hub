import { beforeEach, describe, expect, it } from 'vitest';
import { Subscription, UnsubscribeMethod } from '../../types';
import { AnalyzedMessage, SubscriptionAccountContext, SubscriptionService } from '../subscriptionService';

const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 0, 1);

const ACCOUNT: SubscriptionAccountContext = {
  accountId: 'acc-perso',
  accountName: 'Personal (Gmail)',
  accountEmail: 'me@example.com'
};

const ONE_CLICK: UnsubscribeMethod = {
  type: 'http-post',
  target: 'https://news.example.com/unsubscribe/abc',
  postPayload: 'List-Unsubscribe=One-Click',
  source: 'header-rfc8058'
};

function message(overrides: Partial<AnalyzedMessage> = {}): AnalyzedMessage {
  return {
    messageId: 1,
    subject: 'Today in tech',
    senderName: 'Daily Digest',
    senderEmail: 'news@example.com',
    senderDomain: 'example.com',
    receivedAt: START,
    isRead: true,
    unsubscribeMethods: [ONE_CLICK],
    ...overrides
  };
}

/** Feeds `count` messages spaced `intervalDays` apart, as a real scan would. */
function ingestCadence(
  subscriptions: Record<string, Subscription>,
  count: number,
  intervalDays: number,
  overrides: Partial<AnalyzedMessage> = {}
): Subscription {
  let last!: Subscription;
  for (let i = 0; i < count; i++) {
    last = SubscriptionService.upsertFromMessage(
      subscriptions,
      ACCOUNT,
      message({
        messageId: i + 1,
        subject: `Issue #${i + 1}`,
        receivedAt: START + i * intervalDays * DAY,
        ...overrides
      })
    ).subscription;
  }
  return last;
}

describe('SubscriptionService.upsertFromMessage', () => {
  let subscriptions: Record<string, Subscription>;

  beforeEach(() => {
    subscriptions = {};
  });

  describe('frequency estimation', () => {
    // Regression: the estimate used to be hardcoded to 'occasional' at creation and
    // never recomputed, so every sender was reported as occasional in the dashboard.
    it('reports a sender received every day as daily, not occasional', () => {
      const sub = ingestCadence(subscriptions, 30, 1);

      expect(sub.totalMessages).toBe(30);
      expect(sub.frequencyEstimate).toBe('daily');
    });

    it('reports a weekly and a monthly sender accordingly', () => {
      expect(ingestCadence({}, 12, 7).frequencyEstimate).toBe('weekly');
      expect(ingestCadence({}, 12, 30).frequencyEstimate).toBe('monthly');
    });

    it('leaves a sender seen only once as occasional', () => {
      const { subscription } = SubscriptionService.upsertFromMessage(subscriptions, ACCOUNT, message());
      expect(subscription.frequencyEstimate).toBe('occasional');
    });

    it('refreshes the estimate as new messages arrive', () => {
      // Two messages a month apart look monthly...
      SubscriptionService.upsertFromMessage(subscriptions, ACCOUNT, message({ messageId: 1, receivedAt: START }));
      const monthly = SubscriptionService.upsertFromMessage(
        subscriptions,
        ACCOUNT,
        message({ messageId: 2, receivedAt: START + 30 * DAY })
      ).subscription;
      expect(monthly.frequencyEstimate).toBe('monthly');

      // ...until the rest of the daily backlog is scanned.
      for (let i = 3; i <= 31; i++) {
        SubscriptionService.upsertFromMessage(
          subscriptions,
          ACCOUNT,
          message({ messageId: i, receivedAt: START + (i - 1) * DAY })
        );
      }
      expect(subscriptions[monthly.id].frequencyEstimate).toBe('daily');
    });

    it('does not depend on the order messages are scanned in', () => {
      const ascending: Record<string, Subscription> = {};
      const descending: Record<string, Subscription> = {};

      for (let i = 0; i < 30; i++) {
        SubscriptionService.upsertFromMessage(
          ascending,
          ACCOUNT,
          message({ messageId: i + 1, receivedAt: START + i * DAY })
        );
      }
      for (let i = 29; i >= 0; i--) {
        SubscriptionService.upsertFromMessage(
          descending,
          ACCOUNT,
          message({ messageId: i + 1, receivedAt: START + i * DAY })
        );
      }

      const [asc] = Object.values(ascending);
      const [desc] = Object.values(descending);
      expect(asc.frequencyEstimate).toBe('daily');
      expect(desc.frequencyEstimate).toBe('daily');
      expect(desc.firstReceivedAt).toBe(asc.firstReceivedAt);
      expect(desc.lastReceivedAt).toBe(asc.lastReceivedAt);
    });
  });

  describe('creation', () => {
    it('initialises the subscription from the first message', () => {
      const { subscription, created } = SubscriptionService.upsertFromMessage(
        subscriptions,
        ACCOUNT,
        message({ isRead: false })
      );

      expect(created).toBe(true);
      expect(subscriptions[subscription.id]).toBe(subscription);
      expect(subscription).toMatchObject({
        accountId: ACCOUNT.accountId,
        accountName: ACCOUNT.accountName,
        accountEmail: ACCOUNT.accountEmail,
        senderName: 'Daily Digest',
        senderEmail: 'news@example.com',
        senderDomain: 'example.com',
        category: 'newsletter',
        status: 'active',
        totalMessages: 1,
        unreadMessages: 1,
        firstReceivedAt: START,
        lastReceivedAt: START,
        primaryUnsubscribeMethod: ONE_CLICK
      });
    });

    it('falls back to the email address when the sender has no display name', () => {
      const { subscription } = SubscriptionService.upsertFromMessage(
        subscriptions,
        ACCOUNT,
        message({ senderName: '' })
      );
      expect(subscription.senderName).toBe('news@example.com');
    });

    it('keeps two mailing lists from the same sender apart', () => {
      SubscriptionService.upsertFromMessage(subscriptions, ACCOUNT, message({ listId: 'list-a' }));
      SubscriptionService.upsertFromMessage(subscriptions, ACCOUNT, message({ listId: 'list-b' }));
      expect(Object.keys(subscriptions)).toHaveLength(2);
    });

    it('reports created=false and reuses the subscription afterwards', () => {
      const first = SubscriptionService.upsertFromMessage(subscriptions, ACCOUNT, message({ messageId: 1 }));
      const second = SubscriptionService.upsertFromMessage(subscriptions, ACCOUNT, message({ messageId: 2 }));

      expect(second.created).toBe(false);
      expect(second.subscription.id).toBe(first.subscription.id);
      expect(Object.keys(subscriptions)).toHaveLength(1);
    });
  });

  describe('aggregation', () => {
    it('counts only unread messages as unread', () => {
      SubscriptionService.upsertFromMessage(subscriptions, ACCOUNT, message({ messageId: 1, isRead: true }));
      SubscriptionService.upsertFromMessage(subscriptions, ACCOUNT, message({ messageId: 2, isRead: false }));
      const sub = SubscriptionService.upsertFromMessage(
        subscriptions,
        ACCOUNT,
        message({ messageId: 3, isRead: false })
      ).subscription;

      expect(sub.totalMessages).toBe(3);
      expect(sub.unreadMessages).toBe(2);
    });

    it('widens the reception window in both directions', () => {
      SubscriptionService.upsertFromMessage(subscriptions, ACCOUNT, message({ messageId: 1, receivedAt: START }));
      SubscriptionService.upsertFromMessage(
        subscriptions,
        ACCOUNT,
        message({ messageId: 2, receivedAt: START - 10 * DAY })
      );
      const sub = SubscriptionService.upsertFromMessage(
        subscriptions,
        ACCOUNT,
        message({ messageId: 3, receivedAt: START + 10 * DAY })
      ).subscription;

      expect(sub.firstReceivedAt).toBe(START - 10 * DAY);
      expect(sub.lastReceivedAt).toBe(START + 10 * DAY);
    });

    it('keeps the 5 most recent distinct subjects, newest first', () => {
      const sub = ingestCadence(subscriptions, 8, 1);

      expect(sub.recentSubjects).toHaveLength(5);
      expect(sub.recentSubjects[0]).toBe('Issue #8');
      expect(sub.recentSubjects).not.toContain('Issue #1');
    });

    it('ignores a message id it has already recorded', () => {
      SubscriptionService.upsertFromMessage(subscriptions, ACCOUNT, message({ messageId: 42 }));
      const sub = SubscriptionService.upsertFromMessage(
        subscriptions,
        ACCOUNT,
        message({ messageId: 42, subject: 'Same message, seen again' })
      ).subscription;

      expect(sub.recentMessageIds).toEqual([42]);
    });

    it('backfills unsubscribe methods discovered on a later message', () => {
      SubscriptionService.upsertFromMessage(
        subscriptions,
        ACCOUNT,
        message({ messageId: 1, unsubscribeMethods: [] })
      );
      const sub = SubscriptionService.upsertFromMessage(
        subscriptions,
        ACCOUNT,
        message({ messageId: 2, unsubscribeMethods: [ONE_CLICK] })
      ).subscription;

      expect(sub.unsubscribeMethods).toEqual([ONE_CLICK]);
      expect(sub.primaryUnsubscribeMethod).toEqual(ONE_CLICK);
    });

    it('does not overwrite unsubscribe methods already known', () => {
      const later: UnsubscribeMethod = { type: 'web', target: 'https://example.com/prefs', source: 'body-link' };
      SubscriptionService.upsertFromMessage(subscriptions, ACCOUNT, message({ messageId: 1 }));
      const sub = SubscriptionService.upsertFromMessage(
        subscriptions,
        ACCOUNT,
        message({ messageId: 2, unsubscribeMethods: [later] })
      ).subscription;

      expect(sub.unsubscribeMethods).toEqual([ONE_CLICK]);
    });
  });
});
