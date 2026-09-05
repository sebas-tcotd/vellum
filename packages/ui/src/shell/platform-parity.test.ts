import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

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
    const css = readFileSync(join(SRC, 'globals.css'), 'utf-8');
    for (const platform of ['macos', 'windows', 'linux']) {
      expect(css).toContain(`[data-platform='${platform}']`);
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
    ]) {
      expect(css).toContain(role);
    }
  });

  it('keeps a solid fallback and forced-colours mapping for the shell', () => {
    const css = readFileSync(join(SRC, 'globals.css'), 'utf-8');
    expect(css).toContain('forced-colors: active');
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain('CanvasText');
    expect(css).toContain('Highlight');
  });
});
