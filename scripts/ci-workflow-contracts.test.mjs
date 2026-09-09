import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(resolve(path), 'utf8');

function job(workflow, name, nextName) {
  const start = workflow.indexOf(`  ${name}:`);
  const end = nextName ? workflow.indexOf(`  ${nextName}:`, start + 1) : -1;
  expect(start).toBeGreaterThanOrEqual(0);
  return workflow.slice(start, end >= 0 ? end : undefined);
}

describe('contratos de optimización de CI', () => {
  it('fija Rust y comparte la caché Cargo del workspace raíz', () => {
    const setup = read('.github/actions/setup-vellum/action.yml');
    const toolchain = read('rust-toolchain.toml');
    const pinned = toolchain.match(/channel = "([^"]+)"/)?.[1];

    expect(pinned).toBe('1.96.0');
    expect(setup).toContain(`dtolnay/rust-toolchain@${pinned}`);
    expect(setup).toContain("workspaces: '. -> target'");
    expect(setup).toContain('shared-key: vellum-workspace');
  });

  it('mantiene cargo check independiente de Node y del frontend', () => {
    const action = read('.github/actions/build-tauri-platform/action.yml');
    const ci = read('.github/workflows/ci.yml');
    const compile = job(ci, 'compile-matrix', 'lint-and-test');

    expect(action).toMatch(
      /Install frontend dependencies[\s\S]*?if: inputs\.mode == 'release'/,
    );
    expect(action).toMatch(
      /Download pre-built frontend[\s\S]*?if: inputs\.mode == 'release'/,
    );
    expect(compile).toContain("node: 'false'");
    expect(compile).not.toContain('pnpm install');
    expect(compile).not.toContain('frontend-dist');
  });

  it('reutiliza el frontend en E2E sin romper la ejecución manual', () => {
    const e2e = read('.github/workflows/e2e-golden-flow.yml');
    const reusableInputs = e2e.slice(
      e2e.indexOf('  workflow_call:'),
      e2e.indexOf('  workflow_dispatch:'),
    );

    expect(reusableInputs).toMatch(
      /frontend_artifact:[\s\S]*?type: boolean[\s\S]*?default: false/,
    );
    expect(e2e).toContain('if: inputs.frontend_artifact == true');
    expect(e2e).toContain('if: inputs.frontend_artifact != true');
    expect(e2e).toContain('"beforeBuildCommand":""');
  });

  it('solapa E2E y builds, pero conserva la publicación detrás del gate', () => {
    const release = read('.github/workflows/publish-release.yml');
    const builds = job(release, 'build-release', 'finalize-release');
    const finalize = job(release, 'finalize-release');

    expect(release).toContain('group: publish-release-${{ github.ref }}');
    expect(release).toContain('cancel-in-progress: false');
    expect(builds).toContain('needs: [preflight, build-frontend]');
    expect(builds).not.toContain(
      'needs: [preflight, build-frontend, e2e-golden-flow]',
    );
    expect(builds).toContain('max-parallel: 1');
    expect(finalize).toContain(
      'needs: [preflight, build-release, e2e-golden-flow, dependency-audit]',
    );
    expect(finalize).not.toMatch(/^\s+if:\s*always\(\)/m);
  });

  it('permite publicar sin firma de plataforma y deja notarización en espera', () => {
    const release = read('.github/workflows/publish-release.yml');

    expect(release).toContain('MACOS_SIGNING=false');
    expect(release).toContain('published without an Authenticode signature');
    expect(release).toContain('published unsigned and un-notarized');
    expect(release).not.toContain('xcrun notarytool');
    expect(release).toContain('TAURI_SIGNING_PRIVATE_KEY is required');
  });
});
