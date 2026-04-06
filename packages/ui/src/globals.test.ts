// packages/ui/src/globals.test.ts
// Verifica que globals.css declare los tokens CSS esperados
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const css = readFileSync(resolve(__dirname, './globals.css'), 'utf-8');

describe('globals.css design tokens', () => {
  it('define todos los tokens de color de la paleta pergamino', () => {
    expect(css).toContain('--color-bg');
    expect(css).toContain('--color-terrain');
    expect(css).toContain('--color-water');
    expect(css).toContain('--color-green');
    expect(css).toContain('--color-text');
    expect(css).toContain('--color-text-subtle');
    expect(css).toContain('--color-border');
  });

  it('define los tokens de tipografía', () => {
    expect(css).toContain('--font-wordmark');
    expect(css).toContain('--font-ui');
    expect(css).toContain('--font-mono');
  });

  it('define los tokens de radius y sombras', () => {
    expect(css).toContain('--radius-sm');
    expect(css).toContain('--radius-md');
    expect(css).toContain('--radius-lg');
    expect(css).toContain('--shadow-panel');
  });

  it('define los tokens de transición', () => {
    expect(css).toContain('--transition-layer');
    expect(css).toContain('--transition-panel');
    expect(css).toContain('--transition-theme');
  });

  it('hace referencia a Cormorant Garamond en el token --font-wordmark', () => {
    expect(css).toContain('Cormorant Garamond');
  });

  it('usa font-display: block (no swap) para evitar FOUT en el wordmark', () => {
    expect(css).toContain('font-display: block');
    expect(css).not.toContain('font-display: swap');
  });

  it('aplica reset mínimo: box-sizing border-box', () => {
    expect(css).toContain('box-sizing: border-box');
  });

  it('body tiene overflow: hidden (app canvas-first)', () => {
    expect(css).toContain('overflow: hidden');
  });
});
