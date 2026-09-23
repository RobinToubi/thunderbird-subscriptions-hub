/**
 * Types and interfaces for the Subscriptions Hub extension
 */

// Declaration for the browser object in the Thunderbird/WebExtensions environment
declare global {
  const browser: any;
}

export type SubscriptionCategory = 'newsletter' | 'marketing' | 'transactional' | 'billing' | 'other';

export type SubscriptionStatus = 'active' | 'unsubscribing' | 'unsubscribed' | 'ignored';

export type FrequencyEstimate = 'daily' | 'weekly' | 'monthly' | 'occasional';

export interface UnsubscribeMethod {
  type: 'http-post' | 'http-get' | 'mailto' | 'web';
  target: string; // URL or mailto email address
  postPayload?: string; // e.g. "List-Unsubscribe=One-Click"
  subject?: string;
  body?: string;
  source: 'header-rfc8058' | 'header-rfc2369' | 'body-link';
}

export interface Subscription {
  id: string; // Unique hash (e.g. accountId + senderEmail/listId)
  accountId: string;
  accountName: string;
  accountEmail: string;
  senderName: string;
  senderEmail: string;
  senderDomain: string;
  listId?: string;
  category: SubscriptionCategory;
  totalMessages: number;
  unreadMessages: number;
  firstReceivedAt: number;
  lastReceivedAt: number;
  frequencyEstimate: FrequencyEstimate;
  recentSubjects: string[];
  recentMessageIds: number[];
  unsubscribeMethods: UnsubscribeMethod[];
  primaryUnsubscribeMethod?: UnsubscribeMethod;
  status: SubscriptionStatus;
  unsubscribedAt?: number;
  tags: string[];
  notes?: string;
}

export interface MailAccountInfo {
  id: string;
  name: string;
  type: string;
  identities: Array<{
    name: string;
    email: string;
  }>;
  folders: MailFolderInfo[];
}

export interface MailFolderInfo {
  id?: string | number;
  accountId: string;
  path: string;
  name: string;
  type?: string;
  specialUse?: string[];
  totalSubMessages?: number;
  rawFolder?: any;
}

export type ScanState = 'idle' | 'running' | 'paused' | 'completed' | 'error';

export interface ScanProgress {
  state: ScanState;
  currentAccountName?: string;
  currentFolderName?: string;
  processedMessages: number;
  totalEstimatedMessages: number;
  subscriptionsFound: number;
  percent: number;
  startedAt?: number;
  elapsedSeconds?: number;
  errorMessage?: string;
}

export interface ScanOptions {
  accountIds?: string[]; // If empty, all accounts
  folderTypes?: string[]; // 'inbox', 'archives', etc.
  maxMessagesPerFolder?: number;
  onlyUnprocessed?: boolean;
}

export interface AppSettings {
  autoScanOnNewMail: boolean;
  scanBatchSize: number;
  scanThrottleDelayMs: number;
  theme: 'auto' | 'light' | 'dark';
  ignoredDomains: string[];
  /** Folders the user opted out of, as `accountId:path` keys (see `AccountService.folderKey`). */
  excludedFolders: string[];
  lastScanTimestamp?: number;
}

export type SortField = 'lastReceivedAt' | 'totalMessages' | 'senderName' | 'senderDomain' | 'unreadMessages';
export type SortDirection = 'asc' | 'desc';

export interface FilterState {
  searchQuery: string;
  accountId: string; // 'all' or account identifier
  status: string; // 'all', 'active', 'unsubscribed', 'ignored'
  frequency: string; // 'all', 'daily', 'weekly', 'monthly', 'occasional'
  sortField: SortField;
  sortDirection: SortDirection;
}

export interface MessageStats {
  totalSubscriptions: number;
  activeSubscriptions: number;
  unsubscribedCount: number;
  totalEmailsTracked: number;
  topDomains: Array<{ domain: string; count: number }>;
  accountsBreakdown: Array<{ accountName: string; count: number }>;
}
