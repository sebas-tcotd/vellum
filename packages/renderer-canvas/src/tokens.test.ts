import { describe, it, expect } from 'vitest';
import { readTokensFromDOM } from './tokens';

describe('readTokensFromDOM', () => {
  it('retorna fallbacks cuando no hay variables CSS definidas', () => {
    // jsdom no tiene globals.css cargado — los fallbacks deben coincidir
    // con los valores del design system
    const tokens = readTokensFromDOM();
    expect(tokens.terrain).toBe('#f7f6f1');
    expect(tokens.water).toBe('#90cccb');
    expect(tokens.green).toBe('#d0dcae');
    expect(tokens.text).toBe('#333333');
    expect(tokens.transitBg).toBe('#1a1a2e');
  });
});
