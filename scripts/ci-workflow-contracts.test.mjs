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
  it('fija Rust y separa la caché Cargo por runner y clase de trabajo', () => {
    const setup = read('.github/actions/setup-vellum/action.yml');
    const toolchain = read('rust-toolchain.toml');
    const pinned = toolchain.match(/channel = "([^"]+)"/)?.[1];

    expect(pinned).toBe('1.96.0');
    expect(setup).toContain(`dtolnay/rust-toolchain@${pinned}`);
    expect(setup).toContain("workspaces: '. -> target'");
    // Una sola clave para todos los jobs Linux (`runner.os` es `Linux` tanto
    // en ubuntu-22.04 como en ubuntu-latest) hacía que `cargo check` restaurara
    // un target/ producido por clippy/test en otra imagen: E0463 intermitente.
    expect(setup).toContain(
      'shared-key: vellum-${{ inputs.os }}-${{ inputs.cache-class }}',
    );

    // Ningún job con Rust puede quedarse con la clase por defecto: eso los
    // volvería a juntar a todos en la misma entrada de caché.
    const rustJobs = [
      ['.github/workflows/ci.yml', 3],
      ['.github/workflows/publish-release.yml', 2],
      ['.github/workflows/e2e-golden-flow.yml', 1],
    ];
    for (const [workflow, expected] of rustJobs) {
      expect(read(workflow).match(/cache-class:/g) ?? []).toHaveLength(
        expected,
      );
    }
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
    const action = read('.github/actions/build-tauri-platform/action.yml');
    const builds = job(release, 'build-release', 'generate-updater-manifest');
    const manifest = job(
      release,
      'generate-updater-manifest',
      'finalize-release',
    );
    const finalize = job(release, 'finalize-release');

    expect(release).toContain('group: publish-release-${{ github.ref }}');
    expect(release).toContain('cancel-in-progress: false');
    expect(builds).toContain('needs: [preflight, build-frontend]');
    expect(builds).not.toContain(
      'needs: [preflight, build-frontend, e2e-golden-flow]',
    );
    expect(builds).not.toContain('max-parallel: 1');
    expect(action).toContain('includeUpdaterJson: false');
    expect(manifest).toContain('needs: [preflight, build-release]');
    expect(manifest).toContain('node scripts/generate-updater-manifest.mjs');
    expect(manifest).toContain('gh api --paginate --slurp "$ASSETS_API"');
    expect(manifest).toContain('for attempt in $(seq 1 6)');
    expect(manifest).toContain("RELEASE_TAG=$(jq -r '.tag_name' release.json)");
    expect(manifest).toContain('name=latest.json');
    expect(manifest.match(/name=latest\.json/g)).toHaveLength(1);
    expect(finalize).toContain('generate-updater-manifest');
    expect(finalize.indexOf('generate-updater-manifest')).toBeLessThan(
      finalize.indexOf('e2e-golden-flow'),
    );
    expect(finalize).not.toMatch(/^\s+if:\s*always\(\)/m);
  });

  it('mantiene un único escritor de latest.json y conserva las firmas updater', () => {
    const action = read('.github/actions/build-tauri-platform/action.yml');
    const release = read('.github/workflows/publish-release.yml');
    const manifest = job(
      release,
      'generate-updater-manifest',
      'finalize-release',
    );

    expect(action.match(/includeUpdaterJson:\s*false/g)).toHaveLength(1);
    expect(action).not.toMatch(/includeUpdaterJson:\s*true/);
    expect(manifest).toContain('select(.name | endswith(".sig"))');
    expect(manifest).toContain('select(.name == "latest.json")');
    expect(manifest).toContain('gh api --method DELETE');
    expect(manifest).toContain('> uploaded-latest.json');
    expect(manifest).toContain('cmp -s latest.json uploaded-latest.json');
    expect(manifest).toContain('MATCHING_ID');
    expect(manifest).not.toContain('--input updater-signatures');
    expect(release.match(/--input latest\.json/g)).toHaveLength(1);
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
