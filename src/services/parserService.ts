import { FrequencyEstimate, UnsubscribeMethod } from '../types';

export class ParserService {
  /**
   * Extracts the name, email and domain from a From header ("Name" <email@domain.com>)
   */
  static parseAuthor(authorString: string): { name: string; email: string; domain: string } {
    if (!authorString) {
      return { name: 'Unknown Sender', email: '', domain: '' };
    }

    let name = '';
    let email = '';

    // Detects the format with angle brackets: "Emma | GetYourGuide" <hello@mkt.getyourguide.com>
    const matchWithBrackets = authorString.match(/(.*?)\s*<([^>]+)>/);
    if (matchWithBrackets) {
      name = matchWithBrackets[1].replace(/["']/g, '').trim();
      email = matchWithBrackets[2].trim().toLowerCase();
    } else if (authorString.includes('@')) {
      email = authorString.replace(/["']/g, '').trim().toLowerCase();
      name = email.split('@')[0];
    } else {
      name = authorString.trim();
    }

    if (!name && email) {
      name = email.split('@')[0];
    }

    let domain = '';
    if (email.includes('@')) {
      domain = email.split('@')[1];
    }

    return { name, email, domain };
  }

  /**
   * Analyzes and extracts all unsubscribe methods from the headers
   */
  static parseUnsubscribeHeaders(headers: Record<string, string[] | string>): UnsubscribeMethod[] {
    const methods: UnsubscribeMethod[] = [];
    if (!headers) return methods;

    // Normalizes the header keys to lowercase and gathers the values
    const normHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      const valStr = Array.isArray(value) ? value.join(' ') : String(value || '');
      normHeaders[key.toLowerCase()] = valStr;
    }

    // Retrieves the List-Unsubscribe and List-Unsubscribe-Post headers
    const listUnsub = normHeaders['list-unsubscribe'] || '';
    const listUnsubPost = normHeaders['list-unsubscribe-post'] || '';
    const isOneClick = listUnsubPost.toLowerCase().includes('list-unsubscribe=one-click');

    if (listUnsub) {
      // 1. Extracts the items between angle brackets < ... >
      const angleMatches = listUnsub.match(/<([^>]+)>/g);
      if (angleMatches && angleMatches.length > 0) {
        for (const item of angleMatches) {
          const cleanTarget = item.replace(/[<>]/g, '').trim();
          this.addUnsubscribeTarget(cleanTarget, isOneClick, 'header-rfc8058', 'header-rfc2369', methods);
        }
      } else {
        // 2. Extraction when angle brackets are absent (raw URLs and mailtos)
        const tokens = listUnsub.replace(/[\r\n\t]/g, ' ').split(/[\s,]+/);
        for (const token of tokens) {
          const cleanTarget = token.trim();
          if (cleanTarget.startsWith('http://') || cleanTarget.startsWith('https://') || cleanTarget.startsWith('mailto:')) {
            this.addUnsubscribeTarget(cleanTarget, isOneClick, 'header-rfc8058', 'header-rfc2369', methods);
          }
        }
      }
    }

    return methods;
  }

  /**
   * Helper to format and insert an unsubscribe method
   */
  private static addUnsubscribeTarget(
    target: string,
    isOneClick: boolean,
    oneClickSource: 'header-rfc8058',
    standardSource: 'header-rfc2369',
    outMethods: UnsubscribeMethod[]
  ) {
    if (!target) return;

    if (target.startsWith('mailto:')) {
      try {
        const mailtoUrl = new URL(target);
        const targetEmail = mailtoUrl.pathname;
        const subject = mailtoUrl.searchParams.get('subject') || undefined;
        const body = mailtoUrl.searchParams.get('body') || undefined;

        outMethods.push({
          type: 'mailto',
          target: targetEmail,
          subject,
          body,
          source: standardSource
        });
      } catch {
        const email = target.replace(/^mailto:/i, '').split('?')[0];
        outMethods.push({
          type: 'mailto',
          target: email,
          source: standardSource
        });
      }
    } else if (target.startsWith('http://') || target.startsWith('https://')) {
      outMethods.push({
        type: isOneClick ? 'http-post' : 'http-get',
        target,
        postPayload: isOneClick ? 'List-Unsubscribe=One-Click' : undefined,
        source: isOneClick ? oneClickSource : standardSource
      });
    }
  }

  /**
   * Detects whether a message matches a newsletter or mailing list
   */
  static isNewsletterMessage(
    headers: Record<string, string[] | string> = {},
    subject: string = '',
    bodyHtml?: string
  ): {
    isNewsletter: boolean;
    unsubscribeMethods: UnsubscribeMethod[];
    listId?: string;
  } {
    const normHeaders: Record<string, string> = {};
    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        const valStr = Array.isArray(value) ? value.join(' ') : String(value || '');
        normHeaders[key.toLowerCase()] = valStr;
      }
    }

    const unsubMethods = this.parseUnsubscribeHeaders(headers);

    let listId: string | undefined;
    if (normHeaders['list-id']) {
      listId = normHeaders['list-id'].replace(/[<>]/g, '').trim();
    }

    // 1. Detection via standard RFC headers (List-Unsubscribe, List-ID, List-Owner, List-Help)
    if (
      unsubMethods.length > 0 ||
      listId ||
      normHeaders['list-unsubscribe'] ||
      normHeaders['list-help'] ||
      normHeaders['list-owner'] ||
      normHeaders['list-archive'] ||
      normHeaders['list-subscribe']
    ) {
      return {
        isNewsletter: true,
        unsubscribeMethods: unsubMethods,
        listId
      };
    }

    // 2. Detection via bulk sending / marketing CRM service headers
    const mailer = normHeaders['x-mailer']?.toLowerCase() || '';
    const isMarketingHeader = Boolean(
      normHeaders['feedback-id'] ||
      normHeaders['x-feedback-id'] ||
      normHeaders['x-sg-eid'] ||
      normHeaders['x-sg-id'] ||
      normHeaders['x-mailgun-sending-account'] ||
      normHeaders['x-campaign'] ||
      normHeaders['x-mc-id'] ||
      normHeaders['x-klaviyo-job'] ||
      normHeaders['x-customerio-campaign-id'] ||
      normHeaders['x-mailjet-campaign'] ||
      normHeaders['x-braze-campaign-id'] ||
      normHeaders['x-appboy-campaign-id'] ||
      mailer.includes('mailchimp') ||
      mailer.includes('sendgrid') ||
      mailer.includes('brevo') ||
      mailer.includes('sendinblue') ||
      mailer.includes('klaviyo') ||
      normHeaders['precedence'] === 'bulk' ||
      normHeaders['precedence'] === 'list' ||
      normHeaders['auto-submitted'] === 'auto-generated'
    );

    if (isMarketingHeader) {
      return {
        isNewsletter: true,
        unsubscribeMethods: unsubMethods,
        listId
      };
    }

    // 3. Fallback analysis in the HTML body if available
    if (bodyHtml) {
      const bodyUnsub = this.extractUnsubscribeFromHtml(bodyHtml);
      if (bodyUnsub.length > 0) {
        return {
          isNewsletter: true,
          unsubscribeMethods: bodyUnsub,
          listId
        };
      }
    }

    return {
      isNewsletter: false,
      unsubscribeMethods: [],
      listId: undefined
    };
  }

  /**
   * Searches for unsubscribe links in the HTML body
   */
  static extractUnsubscribeFromHtml(html: string): UnsubscribeMethod[] {
    const methods: UnsubscribeMethod[] = [];
    const linkRegex = /<a\s+(?:[^>]*?\s+)?href=(["'])(.*?)\1[^>]*?>(.*?)<\/a>/gi;
    let match;

    const unsubKeywords = [
      'désabonner',
      'desabonner',
      'désinscription',
      'desinscription',
      'unsubscribe',
      'opt-out',
      'optout',
      'gérer vos préférences',
      'manage preferences',
      'email preferences',
      'préférences de messagerie'
    ];

    while ((match = linkRegex.exec(html)) !== null) {
      const url = match[2].trim();
      const anchorText = match[3].replace(/<[^>]+>/g, '').toLowerCase().trim();
      const urlLower = url.toLowerCase();

      const matchesText = unsubKeywords.some(kw => anchorText.includes(kw));
      const matchesUrl = unsubKeywords.some(kw => urlLower.includes(kw));

      if ((matchesText || matchesUrl) && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:'))) {
        if (url.startsWith('mailto:')) {
          try {
            const mailtoUrl = new URL(url);
            methods.push({
              type: 'mailto',
              target: mailtoUrl.pathname,
              subject: mailtoUrl.searchParams.get('subject') || undefined,
              source: 'body-link'
            });
          } catch {
            // Ignore malformed URL
          }
        } else {
          methods.push({
            type: 'web',
            target: url,
            source: 'body-link'
          });
        }
      }
    }

    return methods;
  }

  /**
   * Selects the best unsubscribe method
   * Priority: 1-Click HTTP POST > HTTPS URL > Mailto > Standard web
   */
  static getBestUnsubscribeMethod(methods: UnsubscribeMethod[]): UnsubscribeMethod | undefined {
    if (!methods || methods.length === 0) return undefined;

    const postMethod = methods.find(m => m.type === 'http-post');
    if (postMethod) return postMethod;

    const httpsMethod = methods.find(m => (m.type === 'http-get' || m.type === 'web') && m.target.startsWith('https://'));
    if (httpsMethod) return httpsMethod;

    const mailtoMethod = methods.find(m => m.type === 'mailto');
    if (mailtoMethod) return mailtoMethod;

    return methods[0];
  }

  /**
   * Estimates the reception frequency from the reception window of a subscription.
   *
   * A subscription only stores `firstReceivedAt` / `lastReceivedAt` / `totalMessages`
   * (never the full timestamp list), so this is the variant the scan actually uses.
   * The average interval between two consecutive messages is the span divided by the
   * number of gaps, which is exactly what `estimateFrequency` computes from a full list.
   */
  static estimateFrequencyFromRange(
    firstReceivedAt: number,
    lastReceivedAt: number,
    totalMessages: number
  ): FrequencyEstimate {
    // A single message gives no interval to measure: the frequency stays unknown.
    if (totalMessages <= 1) return 'occasional';
    if (!Number.isFinite(firstReceivedAt) || !Number.isFinite(lastReceivedAt)) return 'occasional';

    // An inverted window means the stored data is inconsistent: claim nothing.
    if (lastReceivedAt < firstReceivedAt) return 'occasional';

    const spanMs = lastReceivedAt - firstReceivedAt;
    const avgIntervalDays = (spanMs / (totalMessages - 1)) / (1000 * 60 * 60 * 24);

    if (avgIntervalDays <= 2) return 'daily';
    if (avgIntervalDays <= 10) return 'weekly';
    if (avgIntervalDays <= 45) return 'monthly';
    return 'occasional';
  }

  /**
   * Estimates the reception frequency based on the timestamps
   */
  static estimateFrequency(timestamps: number[]): FrequencyEstimate {
    if (timestamps.length <= 1) return 'occasional';

    const sorted = [...timestamps].sort((a, b) => a - b);
    return this.estimateFrequencyFromRange(sorted[0], sorted[sorted.length - 1], sorted.length);
  }

  /**
   * Generates a unique and stable identifier for a subscription
   */
  static generateSubscriptionId(accountId: string, senderEmail: string, listId?: string): string {
    const rawKey = `${accountId}__${listId || senderEmail.toLowerCase()}`;
    let hash = 0;
    for (let i = 0; i < rawKey.length; i++) {
      const char = rawKey.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return `sub_${Math.abs(hash).toString(36)}`;
  }
}
