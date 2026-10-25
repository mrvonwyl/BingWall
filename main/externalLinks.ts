const ALLOWED_SETTINGS_PAGES = new Set(['ms-settings:colors']);

export function shouldOpenExternally(url: string): boolean {
  if (ALLOWED_SETTINGS_PAGES.has(url)) {
    return true;
  }
  return /^https?:\/\//i.test(url);
}
