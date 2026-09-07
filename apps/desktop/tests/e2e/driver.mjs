/**
 * Process plumbing for the golden-flow E2E suite.
 *
 * @remarks
 * Everything that is not a test step lives here: starting `tauri-driver`,
 * opening a WebDriver session against the **compiled release binary** (never a
 * separate browser pointed at the Vite dev URL — that arrangement tests neither
 * the WebView nor the Rust side), pointing the app's Downloads directory at a
 * throwaway temp tree, and tearing all of it down whether the test passed,
 * failed or threw.
 *
 * `webdriverio` is used as a library (`remote()`), not as a framework: the
 * tests run in the vitest the repo already has, so no `@wdio/cli`, no reporters
 * and no `wdio.conf.ts` enter the dependency tree.
 */

import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { remote } from 'webdriverio';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '../../../..');

/** WebDriver port `tauri-driver` proxies on, and the native driver port behind it. */
const DRIVER_PORT = Number(process.env.VELLUM_E2E_DRIVER_PORT ?? 4444);
const NATIVE_DRIVER_PORT = Number(
  process.env.VELLUM_E2E_NATIVE_DRIVER_PORT ?? 4445,
);

const DRIVER_STARTUP_TIMEOUT_MS = 30_000;

/** The fixture the golden flow opens, unless a test asks for another one. */
export const DEFAULT_FIXTURE = resolve(
  REPO_ROOT,
  'packages/parser-cslmap/fixtures/altavento.cslmap',
);

/**
 * Locates the compiled release binary.
 *
 * @remarks
 * Deliberately does not build it: a test run that silently triggers a 10-minute
 * Rust build hides why it is slow, and CI builds it as an explicit step. A
 * missing binary is an actionable error, not something to paper over.
 */
export async function resolveAppBinary() {
  const override = process.env.VELLUM_E2E_BINARY;
  const candidate = override
    ? resolve(override)
    : resolve(
        REPO_ROOT,
        'target/release',
        process.platform === 'win32' ? 'vellum.exe' : 'vellum',
      );
  try {
    await access(candidate, constants.X_OK);
  } catch {
    throw new Error(
      `Vellum release binary not found at ${candidate}. ` +
        'Build it first with `pnpm --filter @vellum/desktop build`, ' +
        'or point VELLUM_E2E_BINARY at an existing one.',
    );
  }
  return candidate;
}

/** Resolves once something is listening on `port`, or throws after the timeout. */
async function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const reachable = await new Promise((resolvePromise) => {
      const socket = connect({ host: '127.0.0.1', port });
      const settle = (value) => {
        socket.destroy();
        resolvePromise(value);
      };
      socket.once('connect', () => settle(true));
      socket.once('error', () => settle(false));
      socket.setTimeout(1000, () => settle(false));
    });
    if (reachable) return;
    if (Date.now() > deadline) {
      throw new Error(
        `tauri-driver did not start listening on port ${port} within ${timeoutMs}ms`,
      );
    }
    await delay(250);
  }
}

/**
 * Kills `child` and waits for the OS to reap it.
 *
 * @remarks
 * A `tauri-driver` surviving the run would hold the WebDriver port and make the
 * *next* run fail for a reason that has nothing to do with the next run, so the
 * exit is awaited rather than fired and forgotten.
 */
async function killAndWait(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolvePromise) => {
    child.once('exit', resolvePromise);
  });
  child.kill('SIGTERM');
  const timedOut = Symbol('timeout');
  const outcome = await Promise.race([exited, delay(5000, timedOut)]);
  if (outcome === timedOut) {
    child.kill('SIGKILL');
    await exited;
  }
}

/**
 * Creates the throwaway home the app will treat as the user's.
 *
 * @remarks
 * `begin_export` resolves its destination through `app_handle.path()
 * .download_dir()`, which on Linux honours `XDG_DOWNLOAD_DIR` and otherwise
 * falls back to `$HOME/Downloads`. Both are redirected — and the redirected
 * Downloads directory *is* `$HOME/Downloads` — so neither route can reach the
 * real Downloads folder even if the resolution order changes.
 */
async function createSandboxHome() {
  const root = await mkdtemp(join(tmpdir(), 'vellum-e2e-'));
  const home = join(root, 'home');
  const downloads = join(home, 'Downloads');
  await mkdir(downloads, { recursive: true });
  return { root, home, downloads };
}

/**
 * Runs `fn` against a live Vellum session and guarantees the cleanup.
 *
 * `fn` receives `{ browser, downloadsDir, homeDir, binaryPath, fixture }`.
 *
 * @remarks
 * The session, the driver process and the temp tree are torn down in a
 * `finally`, each independently: a failed `deleteSession` must not be the
 * reason a `tauri-driver` process or a temp directory outlives the run.
 */
export async function withApp(fn, options = {}) {
  const fixture = resolve(options.fixture ?? DEFAULT_FIXTURE);
  const binaryPath = await resolveAppBinary();
  const sandbox = await createSandboxHome();

  let driver = null;
  let browser = null;
  const driverOutput = [];

  try {
    driver = spawn(
      process.env.VELLUM_E2E_TAURI_DRIVER ?? 'tauri-driver',
      [
        '--port',
        String(DRIVER_PORT),
        '--native-port',
        String(NATIVE_DRIVER_PORT),
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          HOME: sandbox.home,
          XDG_DOWNLOAD_DIR: sandbox.downloads,
        },
      },
    );
    // Kept only to make a startup failure legible; never asserted on.
    driver.stdout.on('data', (chunk) => driverOutput.push(String(chunk)));
    driver.stderr.on('data', (chunk) => driverOutput.push(String(chunk)));
    driver.once('error', (error) => {
      driverOutput.push(
        `failed to spawn tauri-driver: ${error.message}. ` +
          'Install it with `cargo install tauri-driver --locked`.',
      );
    });

    await waitForPort(DRIVER_PORT, DRIVER_STARTUP_TIMEOUT_MS).catch((error) => {
      throw new Error(`${error.message}\n${driverOutput.join('')}`);
    });

    browser = await remote({
      hostname: '127.0.0.1',
      port: DRIVER_PORT,
      path: '/',
      logLevel: 'error',
      connectionRetryCount: 1,
      capabilities: {
        browserName: 'wry',
        // The production load path: the app reads the `.cslmap` argument in
        // `startup::capture_startup_file_path`, exactly as a file association
        // or a shell invocation delivers it. No IPC shortcut.
        'tauri:options': { application: binaryPath, args: [fixture] },
      },
    });

    return await fn({
      browser,
      downloadsDir: sandbox.downloads,
      homeDir: sandbox.home,
      binaryPath,
      fixture,
    });
  } finally {
    if (browser) {
      await browser.deleteSession().catch(() => {});
    }
    await killAndWait(driver).catch(() => {});
    await rm(sandbox.root, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Polls `check` until it returns a truthy value.
 *
 * @remarks
 * The suite never sleeps for a fixed duration: a timed wait either flakes on a
 * slow CI runner or wastes the difference on a fast one. Every wait here is a
 * condition with a named failure.
 */
export async function waitUntil(
  check,
  { timeoutMs = 60_000, intervalMs = 250, describe: description } = {},
) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  for (;;) {
    try {
      const value = await check();
      if (value) return value;
      lastError = null;
    } catch (error) {
      lastError = error;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `Timed out after ${timeoutMs}ms waiting for ${description ?? 'condition'}` +
          (lastError ? `: ${lastError.message}` : ''),
      );
    }
    await delay(intervalMs);
  }
}

/** Waits for `map-surface` to publish `data-map-state="ready"`. */
export async function waitForMapReady(browser, timeoutMs = 120_000) {
  return waitUntil(
    async () => {
      const state = await browser.execute(
        () =>
          document
            .querySelector('[data-testid="map-surface"]')
            ?.getAttribute('data-map-state') ?? null,
      );
      if (state === 'empty') {
        throw new Error(
          'the map reported `empty` — the startup .cslmap argument was never consumed',
        );
      }
      return state === 'ready';
    },
    { timeoutMs, describe: 'the map to report data-map-state="ready"' },
  );
}
