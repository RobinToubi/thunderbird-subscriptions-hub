import { StorageService } from '../services/storageService';

/**
 * Seeds the demo data `pnpm dev` runs on.
 *
 * A Node script cannot do this: outside Thunderbird the add-on persists into the
 * browser's `localStorage`, which only exists inside the page. So the seeding
 * happens on load instead, and `?seed=` drives it:
 *
 *   /dashboard.html              seed once, then leave the stored data alone
 *   /dashboard.html?seed=force   rebuild the demo data, discarding local edits
 *   /dashboard.html?seed=clear   wipe it and stay empty (to see the empty state)
 *
 * The marker below is what stops the first mode from resurrecting the data every
 * time you reload after a reset.
 */
const SEEDED_MARKER = 'subhub_dev_seeded';

type SeedMode = 'auto' | 'force' | 'clear';

function readMode(): SeedMode {
  const value = new URLSearchParams(window.location.search).get('seed');
  if (value === 'force' || value === 'reset') return 'force';
  if (value === 'clear' || value === 'none') return 'clear';
  return 'auto';
}

/** Keeps a reload from re-running a one-shot `?seed=` instruction. */
function dropSeedParam(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('seed')) return;
  url.searchParams.delete('seed');
  window.history.replaceState({}, '', url.toString());
}

export async function seedDevData(): Promise<void> {
  const mode = readMode();
  dropSeedParam();

  if (mode === 'clear') {
    await StorageService.clearAllData();
    localStorage.setItem(SEEDED_MARKER, '1');
    return;
  }

  if (mode === 'auto') {
    if (localStorage.getItem(SEEDED_MARKER)) return;
    const existing = await StorageService.getSubscriptions();
    if (Object.keys(existing).length > 0) {
      localStorage.setItem(SEEDED_MARKER, '1');
      return;
    }
  }

  const { buildDemoSubscriptions } = await import('./fixtures');
  await StorageService.saveSubscriptions(buildDemoSubscriptions());
  localStorage.setItem(SEEDED_MARKER, '1');
}
