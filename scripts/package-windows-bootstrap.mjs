/**
 * Packages the `installer-bootstrap` spike (ADR-0003) together with the NSIS
 * installer `pnpm tauri build --bundles nsis` already produced.
 *
 * The bootstrap looks for a sibling file named exactly `vellum-installer.exe`
 * when run with no arguments, but `tauri-bundler` names its output
 * `{productName}_{version}_{arch}-setup.exe` — a name that changes on every
 * version bump. Without this step, running the bootstrap standalone silently
 * fails to find the installer and falls through to its "installation failed"
 * path (see ADR-0003's evidence section for exactly that failure, caught on
 * real Windows).
 *
 * Run it after `pnpm tauri build --bundles nsis`, from the repo root:
 *   node scripts/package-windows-bootstrap.mjs
 *
 * Output: `apps/desktop/src-tauri/installer-bootstrap/dist/`, containing
 * `Vellum-Setup.exe` (the bootstrap, renamed to what a user should double-click)
 * and `vellum-installer.exe` (the NSIS build, renamed to what the bootstrap
 * looks for by default) side by side.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const BOOTSTRAP_DIR = 'apps/desktop/src-tauri/installer-bootstrap';
const NSIS_BUNDLE_DIR = 'target/release/bundle/nsis';
const DIST_DIR_NAME = 'dist';

/** Cargo's own workspace root always shares one `target/`, even though this
 * crate declares its own empty `[workspace]` to opt out of the *build*. NSIS
 * output lands at the repo root's `target/`, not under `src-tauri/`. */
function findNsisInstaller(root) {
  const dir = path.join(root, NSIS_BUNDLE_DIR);
  if (!fs.existsSync(dir)) {
    throw new Error(
      `${NSIS_BUNDLE_DIR} does not exist. Run "pnpm tauri build --bundles nsis" first.`,
    );
  }
  const candidates = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.exe'));
  if (candidates.length === 0) {
    throw new Error(`No .exe found in ${NSIS_BUNDLE_DIR}.`);
  }
  if (candidates.length > 1) {
    throw new Error(
      `Expected exactly one .exe in ${NSIS_BUNDLE_DIR}, found ${candidates.length}: ${candidates.join(', ')}. Clean the bundle directory and rebuild.`,
    );
  }
  return path.join(dir, candidates[0]);
}

function buildBootstrap(root) {
  const cwd = path.join(root, BOOTSTRAP_DIR);
  execFileSync('cargo', ['build', '--release'], { cwd, stdio: 'inherit' });
  const binaryName =
    process.platform === 'win32'
      ? 'installer-bootstrap.exe'
      : 'installer-bootstrap';
  const binary = path.join(cwd, 'target', 'release', binaryName);
  if (!fs.existsSync(binary)) {
    throw new Error(`Expected build output at ${binary}, found nothing.`);
  }
  return binary;
}

export { findNsisInstaller };

export function packageWindowsBootstrap(root) {
  const nsisInstaller = findNsisInstaller(root);
  const bootstrapBinary = buildBootstrap(root);

  const distDir = path.join(root, BOOTSTRAP_DIR, DIST_DIR_NAME);
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });

  const packagedInstaller = path.join(distDir, 'vellum-installer.exe');
  const packagedBootstrap = path.join(distDir, 'Vellum-Setup.exe');
  fs.copyFileSync(nsisInstaller, packagedInstaller);
  fs.copyFileSync(bootstrapBinary, packagedBootstrap);

  return { distDir, packagedInstaller, packagedBootstrap };
}

function main() {
  const root = process.cwd();
  const { distDir, packagedInstaller, packagedBootstrap } =
    packageWindowsBootstrap(root);
  console.log(`Packaged into ${distDir}:`);
  console.log(`  ${path.basename(packagedBootstrap)}  <- double-click this`);
  console.log(
    `  ${path.basename(packagedInstaller)}  <- what it silently drives`,
  );
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main();
}
