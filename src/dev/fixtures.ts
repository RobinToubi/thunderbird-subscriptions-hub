/**
 * Demo data for `pnpm dev`.
 *
 * None of this ships: every use site sits behind `import.meta.env.DEV`, which
 * Vite replaces with `false` when building, so Rollup drops the branch — and the
 * dynamic import with it — and this module never reaches `dist/`. Keep it that
 * way: import it dynamically, inside a DEV guard, never at the top of a file
 * that the add-on loads in Thunderbird.
 *
 * Addresses are deliberately on `example.com` / `example.org`: this file is
 * public, and demo data has no business carrying a real mailbox.
 */

import { ParserService } from '../services/parserService';
import { MailAccountInfo, Subscription, UnsubscribeMethod } from '../types';

const DAY = 86_400_000;

export const DEMO_ACCOUNTS: MailAccountInfo[] = [
  {
    id: 'acc-personal',
    name: 'Personal (IMAP)',
    type: 'imap',
    identities: [{ name: 'Robin', email: 'robin@example.com' }],
    folders: [
      { accountId: 'acc-personal', path: '/INBOX', name: 'Inbox', type: 'inbox', totalSubMessages: 1840 },
      { accountId: 'acc-personal', path: '/Archives', name: 'Archives', type: 'archives', totalSubMessages: 9200 },
      { accountId: 'acc-personal', path: '/Newsletters', name: 'Newsletters', type: 'user', totalSubMessages: 430 },
      { accountId: 'acc-personal', path: '/Trash', name: 'Trash', type: 'trash', totalSubMessages: 120 }
    ]
  },
  {
    id: 'acc-work',
    name: 'Work',
    type: 'imap',
    identities: [{ name: 'R. Gimenez', email: 'r.gimenez@example.org' }],
    folders: [
      { accountId: 'acc-work', path: '/INBOX', name: 'Inbox', type: 'inbox', totalSubMessages: 3100 },
      { accountId: 'acc-work', path: '/Veille', name: 'Veille', type: 'user', totalSubMessages: 260 }
    ]
  }
];

const oneClick = (target: string): UnsubscribeMethod => ({
  type: 'http-post',
  target,
  postPayload: 'List-Unsubscribe=One-Click',
  source: 'header-rfc8058'
});

const webLink = (target: string): UnsubscribeMethod => ({
  type: 'http-get',
  target,
  source: 'header-rfc2369'
});

const byMail = (target: string): UnsubscribeMethod => ({
  type: 'mailto',
  target,
  subject: 'unsubscribe',
  source: 'header-rfc2369'
});

/**
 * The cases worth having on screen while working on the dashboard: both
 * accounts, all four frequencies, the three unsubscribe methods, an already
 * unsubscribed row, a sender with no display name, an overlong subject, and a
 * subject carrying quotes and angle brackets — that last one is the regression
 * fixture for the attribute escaping in `escapeHtml`.
 */
interface DemoSeed {
  senderName: string;
  senderEmail: string;
  listId?: string;
  accountIndex: 0 | 1;
  subjects: string[];
  method?: UnsubscribeMethod;
  total: number;
  unread: number;
  frequency: Subscription['frequencyEstimate'];
  lastReceivedDaysAgo: number;
  status?: Subscription['status'];
  category?: Subscription['category'];
  tags?: string[];
}

const DEMO_SEEDS: DemoSeed[] = [
  {
    senderName: 'Medium Daily Digest',
    senderEmail: 'noreply@medium.example.com',
    listId: 'medium-daily-curated',
    accountIndex: 0,
    subjects: ['10 architecture patterns for modern web apps', 'Why Rust and WebAssembly are the future'],
    method: webLink('https://medium.example.com/me/unsubscribe?token=demo'),
    total: 268,
    unread: 45,
    frequency: 'daily',
    lastReceivedDaysAgo: 0,
    tags: ['Tech']
  },
  {
    senderName: 'GitHub Explore',
    senderEmail: 'explore@github.example.com',
    listId: 'github-explore-digest',
    accountIndex: 1,
    subjects: ['Trending repositories this week', 'Universe 2026 announcements'],
    method: oneClick('https://github.example.com/settings/unsubscribe/one-click'),
    total: 24,
    unread: 6,
    frequency: 'weekly',
    lastReceivedDaysAgo: 1,
    tags: ['Tech']
  },
  {
    senderName: 'Emma | GetYourGuide',
    senderEmail: 'hello@mkt.getyourguide.example.com',
    accountIndex: 0,
    subjects: ['Skipped these national parks?', 'Discover top travel destinations'],
    method: oneClick('https://travelers-api.getyourguide.example.com/marketing-emails/unsubscribe/DEMO'),
    total: 14,
    unread: 4,
    frequency: 'weekly',
    lastReceivedDaysAgo: 2,
    category: 'marketing',
    tags: ['Travel']
  },
  {
    senderName: 'Le Monde — La Matinale',
    senderEmail: 'matinale@lemonde.example.com',
    listId: 'lemonde-matinale',
    accountIndex: 0,
    subjects: [
      'La revue de presse du jour : « tout ce qu\'il faut savoir » avant 8h, et un titre volontairement très long pour vérifier que la troncature de la carte tient bien la route',
      'Édition spéciale <résultats> & analyses'
    ],
    method: byMail('unsubscribe-lemonde@example.com'),
    total: 412,
    unread: 0,
    frequency: 'daily',
    lastReceivedDaysAgo: 0,
    tags: ['News']
  },
  {
    senderName: '',
    senderEmail: 'no-reply@status.example.org',
    accountIndex: 1,
    subjects: ['Scheduled maintenance on Sunday'],
    method: webLink('https://status.example.org/subscriptions'),
    total: 9,
    unread: 1,
    frequency: 'occasional',
    lastReceivedDaysAgo: 12,
    category: 'transactional',
    tags: []
  },
  {
    senderName: 'Figma Updates',
    senderEmail: 'updates@figma.example.com',
    listId: 'figma-product-updates',
    accountIndex: 1,
    subjects: ['What shipped in September', 'New in Dev Mode'],
    method: oneClick('https://figma.example.com/unsubscribe/one-click'),
    total: 31,
    unread: 12,
    frequency: 'monthly',
    lastReceivedDaysAgo: 5,
    tags: ['Design', 'Tech']
  },
  {
    senderName: 'Decathlon',
    senderEmail: 'offres@mail.decathlon.example.com',
    accountIndex: 0,
    subjects: ['-30% sur la rando cette semaine', 'Votre sélection du week-end'],
    method: undefined, // no method detected: the card must still render and act
    total: 96,
    unread: 58,
    frequency: 'weekly',
    lastReceivedDaysAgo: 3,
    category: 'marketing',
    tags: ['Shopping']
  },
  {
    senderName: 'Notion Newsletter',
    senderEmail: 'team@notion.example.com',
    listId: 'notion-newsletter',
    accountIndex: 0,
    subjects: ['Thanks for reading', 'Template of the month'],
    method: oneClick('https://notion.example.com/unsubscribe'),
    total: 47,
    unread: 0,
    frequency: 'monthly',
    lastReceivedDaysAgo: 34,
    status: 'unsubscribed',
    tags: ['Productivity']
  }
];

export function buildDemoSubscriptions(accounts: MailAccountInfo[] = DEMO_ACCOUNTS): Record<string, Subscription> {
  const now = Date.now();
  const result: Record<string, Subscription> = {};

  for (const seed of DEMO_SEEDS) {
    const account = accounts[seed.accountIndex] || accounts[0];
    const senderDomain = seed.senderEmail.split('@')[1] || 'example.com';
    const id = ParserService.generateSubscriptionId(account.id, seed.senderEmail, seed.listId);
    const lastReceivedAt = now - seed.lastReceivedDaysAgo * DAY;

    result[id] = {
      id,
      accountId: account.id,
      accountName: account.name,
      accountEmail: account.identities[0]?.email || account.name,
      senderName: seed.senderName,
      senderEmail: seed.senderEmail,
      senderDomain,
      listId: seed.listId,
      category: seed.category || 'newsletter',
      totalMessages: seed.total,
      unreadMessages: seed.unread,
      firstReceivedAt: lastReceivedAt - seed.total * 3 * DAY,
      lastReceivedAt,
      frequencyEstimate: seed.frequency,
      recentSubjects: seed.subjects,
      recentMessageIds: [101, 102, 103],
      unsubscribeMethods: seed.method ? [seed.method] : [],
      primaryUnsubscribeMethod: seed.method,
      status: seed.status || 'active',
      unsubscribedAt: seed.status === 'unsubscribed' ? lastReceivedAt : undefined,
      tags: seed.tags || []
    };
  }

  return result;
}
