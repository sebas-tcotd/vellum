/**
 * The golden flow: the one cartographic journey a release must survive.
 *
 * @remarks
 * Launch the compiled binary with a real `.cslmap` in argv, wait for the map to
 * declare itself ready, open the real `ExportDialog`, export, and verify the
 * file on disk against the dimensions the dialog itself announced. No IPC
 * command is invoked directly: every step goes through the UI a user touches,
 * because a test that calls `export_png` behind the dialog's back proves the
 * command works and nothing about whether the app does.
 *
 * The cancellation half shares this launch on purpose — the expensive part is
 * starting the app and parsing a city, and both halves need the same live
 * session, not the same assertions.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { decodePngToRgba } from '../../../../packages/renderer-webgl/test/export-goldens/png-to-rgba.mjs';
import { waitForMapReady, waitUntil, withApp } from './driver.mjs';

/**
 * One app for the whole file.
 *
 * @remarks
 * `withApp` owns the teardown, so the session is held open from inside its
 * callback and released in `afterAll` rather than by unwinding the plumbing
 * here. That keeps exactly one place responsible for killing the driver and
 * deleting the temp tree, however this file ends.
 */
let app = null;
let releaseApp = () => {};
let appClosed = null;

beforeAll(async () => {
  let markReady = () => {};
  const ready = new Promise((resolve) => {
    markReady = resolve;
  });
  appClosed = withApp(async (context) => {
    app = context;
    markReady();
    await new Promise((resolve) => {
      releaseApp = resolve;
    });
  });
  // Racing against `appClosed` turns a failed launch into that launch's error
  // instead of a hook that hangs until the timeout and says nothing useful.
  await Promise.race([ready, appClosed]);
});

afterAll(async () => {
  releaseApp();
  await appClosed;
});

/**
 * The temp file the export pipeline creates, named exactly as
 * `export/session.rs` names it. Deliberately narrow: a looser `\.part$` would
 * report any unrelated stray file as export residue.
 */
const RESIDUE_PATTERN = /^\.vellum-export-.+\.part$/;

async function outputResidue(downloadsDir) {
  const entries = await readdir(downloadsDir);
  return entries.filter((entry) => RESIDUE_PATTERN.test(entry));
}

/**
 * Reads the app's own export label instead of hardcoding English.
 *
 * @remarks
 * The dialog's footer buttons carry no test id, and this story does not add
 * one — it verifies production, it does not reshape it. The floating document
 * command renders the very same translated string as its `aria-label`, so the
 * label is taken from there and the flow survives a language change.
 */
function readExportLabel(browser) {
  return browser.execute(
    () =>
      document
        .querySelector('[data-focus-id="document-export"]')
        ?.getAttribute('aria-label') ?? null,
  );
}

async function openExportDialog(browser) {
  await browser.execute(() => {
    document.querySelector('[data-focus-id="document-export"]')?.click();
  });
  await waitUntil(
    () =>
      browser.execute(() => document.querySelector('[role="dialog"]') !== null),
    { describe: 'the export dialog to open' },
  );
}

/** Types `name` into the controlled file-name input the way a user would. */
async function setFileName(browser, name) {
  await browser.execute((value) => {
    const dialog = document.querySelector('[role="dialog"]');
    // The one labelled input in the dialog; every other control is a radio or
    // a checkbox.
    const input = dialog?.querySelector('input[aria-label]');
    if (!input) throw new Error('file-name input not found in the dialog');
    // React owns this input's value; assigning `.value` directly is invisible
    // to it, so the change goes through the native setter plus a real event.
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    ).set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, name);
}

/**
 * Reads the dimensions the dialog announces for the current configuration.
 *
 * Returns `null` while the panel is absent (no preview yet, or a vector
 * format), which is what the caller polls on.
 */
function readAnnouncedDimensions(browser) {
  return browser.execute(() => {
    const panel = document.querySelector(
      '[data-testid="export-output-dimensions"]',
    );
    if (!panel) return null;
    const digits = (panel.textContent ?? '')
      .split('·')[0]
      .split(':')
      .slice(1)
      .join(':')
      .split('×')
      // Locale-formatted integers: strip grouping separators of any kind.
      .map((part) => Number(part.replace(/\D/g, '')));
    // `Number(''.replace(/\D/g, ''))` is 0, which is finite — so a panel with
    // no digits would read as a valid 0x0 announcement. Only positive
    // integers count as "the dialog announced something".
    if (
      digits.length !== 2 ||
      digits.some((value) => !Number.isInteger(value) || value <= 0)
    ) {
      return null;
    }
    return { width: digits[0], height: digits[1] };
  });
}

async function confirmExport(browser, exportLabel) {
  await browser.execute((label) => {
    const dialog = document.querySelector('[role="dialog"]');
    const button = Array.from(dialog.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === label,
    );
    if (!button) throw new Error(`export button "${label}" not found`);
    button.click();
  }, exportLabel);
}

/**
 * Collects whatever the app is currently announcing — toasts, alerts, the
 * status lane. Diagnostics only; never asserted on.
 */
function readLiveMessages(browser) {
  return browser.execute(() =>
    Array.from(
      document.querySelectorAll('[role="alert"], [role="status"]'),
      (node) => node.textContent?.trim(),
    ).filter(Boolean),
  );
}

function isExporting(browser) {
  return browser.execute(
    () => document.querySelector('[role="progressbar"]') !== null,
  );
}

describe('golden cartographic flow', () => {
  it('opens the fixture from argv, exports, and writes the announced PNG', async () => {
    const { browser, downloadsDir } = app;

    // Stage: startup + load + ready. Each is named so a failure says which.
    await waitForMapReady(browser);

    // A viewport export announces its size only once the renderer hands the
    // dialog a preview snapshot, and that capture resolves on MapLibre's next
    // `render` event with a 1.5s deadline (`map-libre-renderer.ts`,
    // PREVIEW_CAPTURE_TIMEOUT_MS). A settled map emits no `render` at all, so
    // on a slow host the capture times out and the dialog shows no dimensions
    // — which is a real product fragility, tracked separately, not something
    // this flow should silently absorb. Nudging a resize guarantees the frame
    // the capture is waiting for, so the assertions below are about the
    // export, not about who won that race.
    await browser.execute(() => window.dispatchEvent(new Event('resize')));

    // Stage: the export dialog.
    await openExportDialog(browser);
    const exportLabel = await readExportLabel(browser);
    expect(exportLabel, 'the app never published an export label').toBeTruthy();

    await setFileName(browser, 'golden-flow');
    const announced = await waitUntil(() => readAnnouncedDimensions(browser), {
      describe: 'the dialog to announce output dimensions',
    });
    expect(announced.width).toBeGreaterThan(0);
    expect(announced.height).toBeGreaterThan(0);

    // Stage: export. Waited on by the artifact, not by the progress overlay: a
    // 1x viewport export can be over before the overlay is ever observed, so
    // "no progressbar" is not evidence that anything happened.
    const finalPath = join(downloadsDir, 'golden-flow.png');
    await confirmExport(browser, exportLabel);
    await waitUntil(
      async () => (await stat(finalPath).catch(() => null)) !== null,
      {
        describe: `the exported PNG to appear at ${finalPath}`,
      },
      // An export that never lands is the least self-explanatory failure in
      // this file: the click succeeded and nothing on disk says why. What the
      // app is telling the user, and what the directory actually holds, are
      // the two answers worth having before anyone starts guessing.
    ).catch(async (error) => {
      throw new Error(
        `${error.message}\n` +
          `app said: ${JSON.stringify(await readLiveMessages(browser))}\n` +
          `${downloadsDir} holds: ${JSON.stringify(
            await readdir(downloadsDir).catch(
              (e) => `unreadable: ${e.message}`,
            ),
          )}`,
      );
    });
    await waitUntil(async () => !(await isExporting(browser)), {
      describe: 'the export session to settle',
    });

    // Stage: verification. The file, not the toast, is the evidence.
    const stats = await stat(finalPath).catch(() => null);
    expect(stats, `no export was written to ${finalPath}`).not.toBeNull();
    // "Missing" and "present but empty" are different failures: a zero-byte
    // file means the pipeline published a placeholder it never filled.
    expect(stats.size, 'the exported PNG exists but is empty').toBeGreaterThan(
      0,
    );

    const decoded = decodePngToRgba(await readFile(finalPath));
    expect({ width: decoded.width, height: decoded.height }).toEqual(announced);

    expect(await outputResidue(downloadsDir)).toEqual([]);
  });

  it('leaves no output and no orphan .part behind when the export is cancelled', async () => {
    const { browser, downloadsDir } = app;

    await waitForMapReady(browser);
    await openExportDialog(browser);
    const exportLabel = await readExportLabel(browser);
    await setFileName(browser, 'cancelled-export');

    // The full map is the slow route on purpose: a viewport 1x export can
    // finish before a cancel can be issued, and a cancellation test that
    // cannot reach the cancel button proves nothing.
    await browser.execute(() => {
      document
        .querySelector('input[name="export-area"][value="full-map"]')
        ?.click();
    });
    await waitUntil(() => readAnnouncedDimensions(browser), {
      describe: 'the dialog to announce full-map dimensions',
    });

    await confirmExport(browser, exportLabel);
    await waitUntil(() => isExporting(browser), {
      timeoutMs: 30_000,
      intervalMs: 50,
      describe: 'the export to start reporting progress',
    });
    // Progress alone is not evidence that an export began: a `begin_export`
    // that fails outright still flashes the overlay before the error toast
    // replaces it, and this test's assertions are all about absence — they
    // would pass just as well for an export that never started. The `.part`
    // file only exists once the session is genuinely open, so it is what makes
    // the cancellation below a cancellation.
    await waitUntil(
      async () => (await outputResidue(downloadsDir)).length > 0,
      {
        timeoutMs: 30_000,
        intervalMs: 50,
        describe: 'the export session to open its .part file',
      },
    );

    await browser.execute(() => {
      document.querySelector('[role="progressbar"] button')?.click();
    });
    await waitUntil(async () => !(await isExporting(browser)), {
      describe: 'the cancelled export to settle',
    });

    const finalPath = join(downloadsDir, 'cancelled-export.png');
    const stats = await stat(finalPath).catch(() => null);
    expect(stats, 'a cancelled export published a final file').toBeNull();
    // The overlay disappearing and Rust unlinking the `.part` are not the same
    // instant. Polling distinguishes "cleanup is a moment behind the UI" from
    // "cleanup never happened"; asserting immediately would call the first one
    // an orphan.
    await waitUntil(
      async () => (await outputResidue(downloadsDir)).length === 0,
      { describe: 'the cancelled export to clean up its .part file' },
    ).catch(async () => {
      expect(
        await outputResidue(downloadsDir),
        'a cancelled export left an orphan .part file behind',
      ).toEqual([]);
    });
  });
});
