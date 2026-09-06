import { describe, expect, it } from 'vitest';
import { isDarkThemeBackground } from './theme-appearance';

describe('isDarkThemeBackground', () => {
  it('marks the bundled dark theme dark and the light ones light', () => {
    expect(isDarkThemeBackground('#1a1a2e')).toBe(true); // transit
    expect(isDarkThemeBackground('#ede5d2')).toBe(false); // day
    expect(isDarkThemeBackground('#e7d898')).toBe(false); // classic
    expect(isDarkThemeBackground('#ffffff')).toBe(false); // grayscale
  });

  it('accepts shorthand hex and hsl(), and falls back to light', () => {
    expect(isDarkThemeBackground('#111')).toBe(true);
    expect(isDarkThemeBackground('hsl(220, 40%, 12%)')).toBe(true);
    expect(isDarkThemeBackground('hsl(40 30% 90%)')).toBe(false);
    expect(isDarkThemeBackground(undefined)).toBe(false);
    expect(isDarkThemeBackground('not-a-color')).toBe(false);
  });
});
