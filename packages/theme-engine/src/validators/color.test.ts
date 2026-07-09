import { describe, it, expect } from 'vitest';
import { isColorToken, isHexColor, isHslColor } from './color';

describe('isHexColor', () => {
  it('accepts 3, 4, 6 and 8-digit hex colors', () => {
    expect(isHexColor('#abc')).toBe(true);
    expect(isHexColor('#abcd')).toBe(true);
    expect(isHexColor('#a098b0')).toBe(true);
    expect(isHexColor('#a098b0ff')).toBe(true);
  });

  it('accepts uppercase hex digits', () => {
    expect(isHexColor('#A098B0')).toBe(true);
  });

  it('rejects malformed hex colors', () => {
    expect(isHexColor('a098b0')).toBe(false); // missing '#'
    expect(isHexColor('#a098b')).toBe(false); // 5 digits
    expect(isHexColor('#gggggg')).toBe(false); // invalid digits
    expect(isHexColor('')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isHexColor(123)).toBe(false);
    expect(isHexColor(null)).toBe(false);
    expect(isHexColor(undefined)).toBe(false);
  });
});

describe('isHslColor', () => {
  it('accepts well-formed hsl() strings', () => {
    expect(isHslColor('hsl(210, 40%, 60%)')).toBe(true);
    expect(isHslColor('hsl(0, 0%, 0%)')).toBe(true);
    expect(isHslColor('hsl(210.5, 40.2%, 60.8%)')).toBe(true);
  });

  it('accepts an optional alpha channel', () => {
    expect(isHslColor('hsl(210, 40%, 60%, 0.5)')).toBe(true);
    expect(isHslColor('hsl(210, 40%, 60%, 50%)')).toBe(true);
  });

  it('rejects malformed hsl() strings', () => {
    expect(isHslColor('hsl(210, 40, 60)')).toBe(false); // missing '%'
    expect(isHslColor('rgb(255, 0, 0)')).toBe(false);
    expect(isHslColor('hsl(210 40% 60%')).toBe(false); // unclosed paren
    expect(isHslColor('')).toBe(false);
  });
});

describe('isColorToken', () => {
  it('accepts both hex and hsl colors', () => {
    expect(isColorToken('#a098b0')).toBe(true);
    expect(isColorToken('hsl(210, 40%, 60%)')).toBe(true);
  });

  it('rejects anything that is neither', () => {
    expect(isColorToken('not-a-color')).toBe(false);
    expect(isColorToken('rgb(255, 0, 0)')).toBe(false);
  });
});
