import { MailAccountInfo, MailFolderInfo } from '../types';
import { LoggerService } from './loggerService';

export class AccountService {
  /**
   * Retrieves the list of all mail accounts configured in Thunderbird
   * with includeSubFolders = true and rootFolder exploration
   */
  static async listAccounts(): Promise<MailAccountInfo[]> {
    const messengerApi = (typeof browser !== 'undefined' && browser?.accounts)
      ? browser
      : ((typeof window !== 'undefined' && (window as any)?.messenger?.accounts) ? (window as any).messenger : null);

    if (messengerApi?.accounts?.list) {
      try {
        LoggerService.info('Retrieving the list of Thunderbird accounts via messenger.accounts.list(true)...');
        const rawAccounts = await messengerApi.accounts.list(true);
        const accounts: MailAccountInfo[] = [];

        LoggerService.info(`${rawAccounts.length} account(s) detected in Thunderbird.`);

        for (const raw of rawAccounts) {
          const folders: MailFolderInfo[] = [];

          // 1. Thunderbird WebExtensions structures the folders under account.rootFolder.
          //    Sub-folders are obtained via the asynchronous getSubFolders() method
          //    (the subFolders/subfolders/folders properties are absent on the real
          //    MailFolder objects returned by the API).
          if (raw.rootFolder) {
            LoggerService.info(`Account "${raw.name || raw.id}": rootFolder found ("${raw.rootFolder.name || raw.rootFolder.path || 'Root'}").`);
            await this.flattenFolderTree(raw.rootFolder, raw.id, folders, false);
          }

          // 2. Alternative structure account.folders (demo / flat objects)
          if (raw.folders && Array.isArray(raw.folders) && raw.folders.length > 0) {
            for (const f of raw.folders) {
              await this.flattenFolderTree(f, raw.id, folders, true);
            }
          }

          const identities = (raw.identities || []).map((id: any) => ({
            name: id.name || raw.name || '',
            email: id.email || ''
          }));

          const accountName = raw.name || identities[0]?.email || `Account ${raw.id}`;
          LoggerService.info(`Account "${accountName}": ${folders.length} folder(s) in total.`);
          
          if (folders.length > 0) {
            LoggerService.info(`Folders for "${accountName}": ${folders.map(f => `"${f.name}" (${f.path || f.type || 'standard'})`).join(', ')}`);
          }

          accounts.push({
            id: raw.id,
            name: accountName,
            type: raw.type || 'unknown',
            identities,
            folders
          });
        }

        return accounts;
      } catch (err: any) {
        LoggerService.error('Error while retrieving the Thunderbird accounts:', err?.message || err);
        return [];
      }
    }

    // Simulation data for local development
    return this.getMockAccounts();
  }

  /**
   * Recursively traverses the rootFolder / subFolders tree
   * Handles both native Thunderbird MailFolder objects (sub-folders via
   * the asynchronous getSubFolders() method) and flat demo objects
   * (subFolders / subfolders / folders property).
   */
  private static async flattenFolderTree(
    folderNode: any,
    accountId: string,
    outList: MailFolderInfo[],
    includeSelf: boolean = true
  ) {
    if (!folderNode) return;

    // Adds the folder if includeSelf is true and it has a path or name
    if (includeSelf && (folderNode.path || folderNode.name || folderNode.id !== undefined)) {
      // Avoids duplicates
      const alreadyExists = outList.some(f => (f.id !== undefined && f.id === folderNode.id) || (f.path && f.path === folderNode.path));
      if (!alreadyExists) {
        outList.push({
          id: folderNode.id,
          accountId: folderNode.accountId || accountId,
          path: folderNode.path || folderNode.name || '',
          name: folderNode.name || folderNode.path || 'Unnamed folder',
          type: folderNode.type,
          specialUse: Array.isArray(folderNode.specialUse) ? folderNode.specialUse.map(String) : undefined,
          totalSubMessages: folderNode.totalSubMessages,
          rawFolder: folderNode // Direct reference
        });
      }
    }

    // Traverse the sub-folders
    // 1. Native Thunderbird API: getSubFolders() is an asynchronous method
    let subs: any[] | undefined;
    if (folderNode.getSubFolders && typeof folderNode.getSubFolders === 'function') {
      try {
        subs = await folderNode.getSubFolders();
      } catch (err: any) {
        LoggerService.warn(`getSubFolders() for "${folderNode.name || folderNode.path}": ${err?.message}`);
      }
    }
    // 2. Flat demo objects
    if (!subs || subs.length === 0) {
      subs = folderNode.subFolders || folderNode.subfolders || folderNode.folders;
    }

    if (subs && Array.isArray(subs)) {
      for (const sub of subs) {
        await this.flattenFolderTree(sub, accountId, outList, true);
      }
    }
  }

  /**
   * Stable identifier for a folder across Thunderbird restarts.
   *
   * `MailFolder.id` is a runtime handle and may differ between sessions, so the
   * stored exclusions key on the account id plus the folder path instead.
   * Account ids never contain a colon and paths always start with `/`, so the
   * first colon is an unambiguous separator.
   */
  static folderKey(folder: Pick<MailFolderInfo, 'accountId' | 'path'>): string {
    return `${folder.accountId}:${folder.path}`;
  }

  /**
   * Folders the add-on never analyzes, whatever the settings say: a
   * subscription has no business being detected in Trash, Junk, Sent or Drafts.
   */
  static isSystemIgnoredFolder(folder: MailFolderInfo): boolean {
    // MV3: the type property has been removed from MailFolder, replaced by specialUse.
    // To be safe, both are checked: type (MV2 / demo) and specialUse (MV3).
    const type = (folder.type || '').toLowerCase();
    const specialUses = (folder.specialUse || []).map(u => u.toLowerCase());
    const ignoredTypes = ['trash', 'junk', 'outbox', 'drafts', 'templates', 'sent'];
    if (type && ignoredTypes.includes(type)) {
      return true;
    }
    if (specialUses.some(u => ignoredTypes.includes(u))) {
      return true;
    }

    const lowerName = (folder.name || '').toLowerCase();
    const lowerPath = (folder.path || '').toLowerCase();

    const ignoredKeywords = [
      'corbeille', 'trash', 'bin', 'deleted',
      'indésirables', 'indesirables', 'spam', 'junk',
      'brouillons', 'drafts',
      'éléments envoyés', 'elements envoyes', 'envoyés', 'envoyes', 'sent messages', 'sent mail', 'sent items',
      'outbox', 'boîte d\'envoi', 'boite d\'envoi'
    ];

    for (const kw of ignoredKeywords) {
      if (
        lowerName === kw ||
        lowerName.endsWith(`/${kw}`) ||
        lowerName.includes(`/${kw}/`) ||
        lowerPath.endsWith(`/${kw}`)
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Whether the user excluded this folder in the settings.
   *
   * Excluding a folder excludes everything under it — the settings list only
   * offers one checkbox per folder, and nobody expects a sub-folder of an
   * excluded folder to keep being analyzed.
   */
  static isFolderExcluded(
    folder: Pick<MailFolderInfo, 'accountId' | 'path'>,
    excludedFolders: string[] = []
  ): boolean {
    if (excludedFolders.length === 0) return false;
    const key = this.folderKey(folder);
    return excludedFolders.some(excluded => key === excluded || key.startsWith(`${excluded}/`));
  }

  /**
   * Determines whether a folder should be analyzed
   */
  static isScanEligibleFolder(folder: MailFolderInfo, excludedFolders: string[] = []): boolean {
    if (this.isSystemIgnoredFolder(folder)) return false;
    return !this.isFolderExcluded(folder, excludedFolders);
  }

  /**
   * Demo accounts for `pnpm dev`. The fixtures live behind `import.meta.env.DEV`
   * so they are stripped from the add-on Thunderbird actually installs.
   */
  private static async getMockAccounts(): Promise<MailAccountInfo[]> {
    if (!import.meta.env.DEV) return [];
    const { DEMO_ACCOUNTS } = await import('../dev/fixtures');
    return DEMO_ACCOUNTS;
  }
}
