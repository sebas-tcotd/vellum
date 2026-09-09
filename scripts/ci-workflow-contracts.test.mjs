import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(resolve(path), 'utf8');

function job(workflow, name, nextName) {
  const start = workflow.indexOf(`  ${name}:`);
  expect(start).toBeGreaterThanOrEqual(0);
  if (!nextName) return workflow.slice(start);

  const end = workflow.indexOf(`  ${nextName}:`, start + 1);
  if (end < 0) {
    throw new Error(`No se encontró el job siguiente '${nextName}'.`);
  }
  return workflow.slice(start, end);
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
    const compile = job(ci, 'compile-matrix', 'landing-quality');

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

  it('falla cerrado si no encuentra el límite siguiente de un job', () => {
    expect(() => job('jobs:\n  primero:\n', 'primero', 'ausente')).toThrow(
      "No se encontró el job siguiente 'ausente'.",
    );
  });

  it('reutiliza una única validación de landing manual y desde el gate', () => {
    const landing = read('.github/workflows/landing-ci.yml');
    const ci = read('.github/workflows/ci.yml');
    const landingJob = job(ci, 'landing-quality', 'lint-and-test');
    const gate = job(ci, 'lint-and-test');

    expect(landing).toMatch(/on:\n  workflow_call:\n  workflow_dispatch:/);
    expect(landing).not.toMatch(/^  pull_request:/m);
    expect(landing).toContain('uses: ./.github/actions/setup-vellum');
    expect(landing).toContain("rust: 'false'");
    expect(landing).toContain("linux-deps: 'false'");
    expect(landing).toContain('pnpm --filter @vellum/landing lint');
    expect(landing).toContain('pnpm --filter @vellum/landing build');
    expect(landing).toContain(
      'group: landing-ci-${{ github.workflow }}-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}',
    );
    expect(landing).toContain('cancel-in-progress: true');

    expect(landingJob).toContain('needs: detect-changes');
    expect(landingJob).toContain(
      "if: needs.detect-changes.outputs.landing == 'true'",
    );
    expect(landingJob).toContain('uses: ./.github/workflows/landing-ci.yml');
    expect(gate).toContain('- landing-quality');
    expect(gate).toContain(
      'LANDING_EXPECTED: ${{ needs.detect-changes.outputs.landing }}',
    );
    expect(gate).toContain(
      'LANDING_RESULT: ${{ needs.landing-quality.result }}',
    );
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
