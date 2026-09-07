// packages/ui/src/globals.test.ts
// Verifica que globals.css declare los tokens CSS esperados
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const cssFiles = [
  './globals.css',
  './styles/01-settings.css',
  './styles/02-themes.css',
  './styles/03-generic.css',
  './styles/04-objects.css',
  './styles/05-components.css',
  './styles/06-utilities.css',
  './styles/07-animations.css',
];

const css = cssFiles
  .map((file) => readFileSync(resolve(__dirname, file), 'utf-8'))
  .join('\n');

describe('globals.css design tokens', () => {
  it('define tokens semánticos para el chrome, no una paleta cartográfica', () => {
    expect(css).toContain('--color-bg');
    expect(css).toContain('--color-text');
    expect(css).toContain('--color-text-subtle');
    expect(css).toContain('--color-border');
    expect(css).toContain('--ui-accent-water');
    expect(css).toContain('--ui-accent-rule');
    expect(css).toContain('--ui-decoration-primary');
    expect(css).toContain('--ui-decoration-water');
    expect(css).toContain('--about-border');
    expect(css).toContain('--about-divider');
    expect(css).toContain('--shell-surface-dialog');
    expect(css).not.toMatch(
      /--color-(terrain|water|green|building|district|road|transit)/,
    );
  });

  it('usa una superficie opaca para todos los diálogos modales', () => {
    expect(css).toMatch(
      /\.shell-dialog-content\s*\{[^}]*background:\s*var\(--shell-surface-dialog\)/,
    );
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

  it('references DM Mono in the --font-mono token', () => {
    expect(css).toContain('DM Mono');
    expect(css).toContain("--font-mono: 'DM Mono'");
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
