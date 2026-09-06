import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const shellCss = [
  'globals.css',
  'styles/02-themes.css',
  'styles/05-components.css',
  'styles/06-utilities.css',
]
  .map((file) => readFileSync(join(SRC, file), 'utf-8'))
  .join('\n');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) return [];
    return [full];
  });
}

/**
 * macOS, Windows and Linux share one information architecture; only the
 * presentation tokens differ (AD-8). A component that branches on the platform
 * is how that guarantee gets lost, so it is checked rather than assumed.
 */
describe('platform adaptation', () => {
  const files = sourceFiles(SRC);

  it('has source files to check', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('never branches component structure on the operating system', () => {
    const offenders = files.filter((file) => {
      // PlatformContext itself is the one place the platform is resolved.
      if (file.endsWith('PlatformContext.tsx')) return false;
      const source = readFileSync(file, 'utf-8');
      return /platform\s*===\s*['"](macos|windows|linux)['"]/.test(source);
    });

    expect(offenders).toEqual([]);
  });

  it('expresses platform differences only through shell tokens', () => {
    for (const platform of ['macos', 'windows', 'linux']) {
      expect(shellCss).toContain(`[data-platform='${platform}']`);
    }
    // Each profile redefines tokens; none of them redefines layout.
    for (const role of [
      '--shell-surface-sidebar',
      '--shell-surface-floating',
      '--shell-surface-popover',
      '--shell-text-primary',
      '--shell-text-muted',
      '--shell-separator',
      '--shell-focus',
      '--shell-radius-interactive',
      '--shell-radius-panel',
      '--shell-surface-selected',
      '--shell-sidebar-inset',
      '--shell-sidebar-radius',
    ]) {
      expect(shellCss).toContain(role);
    }
  });

  it('expresses the macOS floating sidebar purely as token values', () => {
    // The inset and radius exist as tokens with a neutral zero default, so the
    // platform that floats its sidebars gets that treatment and the ones that
    // do not keep a flush panel — from the same markup.
    expect(shellCss).toMatch(/--shell-sidebar-inset:\s*0px/);
    expect(shellCss).toMatch(/--shell-sidebar-inset:\s*10px/);
    expect(shellCss).toContain('var(--shell-sidebar-inset)');
    expect(shellCss).toContain('var(--shell-sidebar-radius)');
  });

  it('keeps a solid fallback and forced-colours mapping for the shell', () => {
    expect(shellCss).toContain('forced-colors: active');
    expect(shellCss).toContain('prefers-reduced-motion: reduce');
    expect(shellCss).toContain('CanvasText');
    expect(shellCss).toContain('Highlight');
  });
});
