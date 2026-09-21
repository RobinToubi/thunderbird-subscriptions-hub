import { StorageService } from '../../services/storageService';
import { AppSettings } from '../../types';

/**
 * Pins the colour scheme the Thunderbird tokens resolve against. `auto` removes
 * the attribute so `color-scheme: light dark` follows the Thunderbird theme.
 */
export function applyTheme(theme: AppSettings['theme']): void {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') {
    root.setAttribute('data-theme', theme);
  } else {
    root.removeAttribute('data-theme');
  }
}

export async function applyStoredTheme(): Promise<AppSettings> {
  const settings = await StorageService.getSettings();
  applyTheme(settings.theme);
  return settings;
}

/**
 * The options page is a separate document, so a theme change there only reaches
 * an already-open dashboard through the storage change event.
 */
export function watchThemeChanges(): void {
  StorageService.onSettingsChanged((settings) => applyTheme(settings.theme));
}
