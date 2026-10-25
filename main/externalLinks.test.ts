import { describe, expect, it } from 'vitest';
import { shouldOpenExternally } from './externalLinks.js';

describe('shouldOpenExternally', () => {
  it("allows Windows' colour settings page", () => {
    expect(shouldOpenExternally('ms-settings:colors')).toBe(true);
  });

  it('allows http and https links, such as the copyright link', () => {
    expect(shouldOpenExternally('https://www.bing.com/search?q=x')).toBe(true);
    expect(shouldOpenExternally('http://example.com/')).toBe(true);
  });

  it('refuses other schemes and other settings pages', () => {
    expect(shouldOpenExternally('file:///C:/Windows/System32/calc.exe')).toBe(false);
    expect(shouldOpenExternally('ms-settings:windowsupdate')).toBe(false);
    expect(shouldOpenExternally('javascript:alert(1)')).toBe(false);
  });
});
