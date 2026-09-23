import { describe, expect, it } from 'vitest';
import { AccountService } from '../accountService';
import { MailFolderInfo } from '../../types';

const folder = (path: string, extra: Partial<MailFolderInfo> = {}): MailFolderInfo => ({
  accountId: 'account1',
  path,
  name: path.split('/').filter(Boolean).pop() || path,
  ...extra
});

describe('AccountService.folderKey', () => {
  it('keys on the account and the path, not the runtime folder id', () => {
    expect(AccountService.folderKey(folder('/INBOX'))).toBe('account1:/INBOX');
  });

  it('separates two accounts holding the same path', () => {
    const a = AccountService.folderKey(folder('/INBOX'));
    const b = AccountService.folderKey({ ...folder('/INBOX'), accountId: 'account2' });
    expect(a).not.toBe(b);
  });
});

describe('AccountService.isSystemIgnoredFolder', () => {
  it('ignores a folder by its MV3 specialUse', () => {
    expect(AccountService.isSystemIgnoredFolder(folder('/Bin', { specialUse: ['trash'] }))).toBe(true);
  });

  it('ignores a folder by its MV2 type', () => {
    expect(AccountService.isSystemIgnoredFolder(folder('/Sent', { type: 'sent' }))).toBe(true);
  });

  it('ignores the French system folder names', () => {
    expect(AccountService.isSystemIgnoredFolder(folder('/Corbeille'))).toBe(true);
    expect(AccountService.isSystemIgnoredFolder(folder('/Indésirables'))).toBe(true);
  });

  it('keeps an ordinary user folder', () => {
    expect(AccountService.isSystemIgnoredFolder(folder('/Newsletters'))).toBe(false);
  });
});

describe('AccountService.isFolderExcluded', () => {
  it('is false when nothing is excluded', () => {
    expect(AccountService.isFolderExcluded(folder('/INBOX'), [])).toBe(false);
  });

  it('excludes the folder the user picked', () => {
    expect(AccountService.isFolderExcluded(folder('/Archives'), ['account1:/Archives'])).toBe(true);
  });

  it('excludes everything under an excluded folder', () => {
    expect(AccountService.isFolderExcluded(folder('/Archives/2024'), ['account1:/Archives'])).toBe(true);
  });

  it('does not let a prefix match a sibling with a longer name', () => {
    expect(AccountService.isFolderExcluded(folder('/Archives-old'), ['account1:/Archives'])).toBe(false);
  });

  it('stays scoped to the account it was stored for', () => {
    const otherAccount = { ...folder('/Archives'), accountId: 'account2' };
    expect(AccountService.isFolderExcluded(otherAccount, ['account1:/Archives'])).toBe(false);
  });
});

describe('AccountService.isScanEligibleFolder', () => {
  it('scans a user folder that nobody excluded', () => {
    expect(AccountService.isScanEligibleFolder(folder('/Newsletters'))).toBe(true);
  });

  it('skips a folder excluded in the settings', () => {
    expect(AccountService.isScanEligibleFolder(folder('/Newsletters'), ['account1:/Newsletters'])).toBe(false);
  });

  it('skips a system folder even with an empty exclusion list', () => {
    expect(AccountService.isScanEligibleFolder(folder('/Trash', { type: 'trash' }))).toBe(false);
  });
});
