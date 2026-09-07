/**
 * Surface and shell-profile regression against committed baselines.
 *
 * @remarks
 * Reuses the comparator the export goldens already use
 * (`compareRgbaPixels` + `decodePngToRgba` from
 * `packages/renderer-webgl/test/export-goldens`) and the threshold those
 * goldens already version in `manifest.json`. A second image comparator with a
 * second threshold would mean two different definitions of "the same picture"
 * in one repository.
 *
 * WebDriver hands screenshots over as base64 PNG, which is exactly what that
 * decoder takes — so nothing new is introduced on the capture side either.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { RGB_CHANNEL_DELTA_EXCLUSIVE } from '../../../../packages/renderer-webgl/test/export-goldens/harness.mjs';
import { decodePngToRgba } from '../../../../packages/renderer-webgl/test/export-goldens/png-to-rgba.mjs';
import { compareAgainstBaseline } from './baseline-compare.mjs';
import { REPO_ROOT, waitForMapReady, withApp } from './driver.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE_DIR = join(HERE, 'baselines');
const GOLDEN_MANIFEST = resolve(
  REPO_ROOT,
  'packages/renderer-webgl/test/export-goldens/manifest.json',
);

/**
 * Explicit, documented escape hatch for regenerating baselines.
 *
 * @remarks
 * A run with this set can never be green: it writes the PNGs and then fails,
 * so a regenerated baseline is always a reviewed diff in the repository rather
 * than something a passing pipeline quietly accepted.
 */
const UPDATE_BASELINES = process.env.VELLUM_E2E_UPDATE_BASELINES === '1';

/** The three shell profiles `02-themes.css` defines distinct tokens for. */
const PLATFORM_PROFILES = ['linux', 'windows', 'macos'];

/** Time for the platform token swap and the map's opacity transition to settle. */
const REPAINT_SETTLE_MS = 900;

let comparison = null;
let app = null;
let releaseApp = () => {};
let appClosed = null;
const captures = new Map();

beforeAll(async () => {
  const manifest = JSON.parse(await readFile(GOLDEN_MANIFEST, 'utf8'));
  comparison = manifest.harness?.comparison;
  let markReady = () => {};
  const ready = new Promise((resolve_) => {
    markReady = resolve_;
  });
  appClosed = withApp(async (context) => {
    app = context;
    markReady();
    await new Promise((resolve_) => {
      releaseApp = resolve_;
    });
  });
  await Promise.race([ready, appClosed]);
});

afterAll(async () => {
  releaseApp();
  await appClosed;
});

function repoPath(absolutePath) {
  return relative(REPO_ROOT, absolutePath);
}

/**
 * Switches the shell profile without restarting the app.
 *
 * @remarks
 * `PlatformProvider` writes `data-platform` in a layout effect keyed by
 * `platform`, so the effect never re-runs while the app stays on one OS and the
 * override survives. If `PlatformProvider` ever receives a different `platform`
 * at runtime, this override is lost and the sweep would need a relaunch per
 * profile.
 */
async function captureProfile(browser, platform) {
  await browser.execute((value) => {
    document.documentElement.dataset.platform = value;
  }, platform);
  // Three captures that merely differ from each other would also be produced
  // by an override that never stuck plus some transition timing. Reading the
  // attribute back is what ties each baseline to the profile it claims.
  const applied = await browser.execute(
    () => document.documentElement.dataset.platform,
  );
  if (applied !== platform) {
    throw new Error(
      `the ${platform} profile did not stick: data-platform reads "${applied}". ` +
        'PlatformProvider may now re-assert it at runtime, in which case the ' +
        'sweep needs a relaunch per profile.',
    );
  }
  await delay(REPAINT_SETTLE_MS);
  const bytes = Buffer.from(await browser.takeScreenshot(), 'base64');
  // The original PNG bytes travel with the decode: a baseline is written
  // exactly as the WebView produced it, never through a re-encoder this
  // repository does not have.
  return { ...decodePngToRgba(bytes), bytes };
}

describe('shell profile and surface regression', () => {
  beforeAll(async () => {
    await waitForMapReady(app.browser);
    for (const platform of PLATFORM_PROFILES) {
      captures.set(platform, await captureProfile(app.browser, platform));
    }
  });

  it('uses the same versioned threshold as the export goldens', () => {
    // The threshold is not re-declared here: it is asserted to be the one the
    // goldens already version, so there is one number to change and one review
    // to have when it changes.
    expect(comparison).toBeDefined();
    expect(comparison.rgbChannelDeltaExclusive).toBe(
      RGB_CHANNEL_DELTA_EXCLUSIVE,
    );
    expect(comparison.alpha).toBe('exact');
    expect(typeof comparison.maxDifferentPixelRatio).toBe('number');
  });

  it.each(PLATFORM_PROFILES)(
    'renders the %s shell profile within the baseline threshold',
    async (platform) => {
      const capture = captures.get(platform);
      const baselinePath = join(BASELINE_DIR, `shell-${platform}.png`);

      await compareAgainstBaseline({
        capture,
        baselinePath,
        maxDifferentPixelRatio: comparison.maxDifferentPixelRatio,
        updateBaselines: UPDATE_BASELINES,
        describePath: repoPath,
      });
    },
  );

  it('gives each shell profile a visibly different appearance', () => {
    // Fluent 2, Liquid Glass and the neutral profile define different tokens.
    // Two profiles rendering identically means the token swap never reached the
    // shell — a green baseline for each would still be hiding that.
    for (const [first, second] of [
      ['linux', 'windows'],
      ['windows', 'macos'],
      ['linux', 'macos'],
    ]) {
      const a = captures.get(first);
      const b = captures.get(second);
      // `pixels` is a Uint8Array, which has no `equals`; Buffer.compare reads
      // one without copying it.
      expect(
        Buffer.compare(a.pixels, b.pixels) === 0,
        `the ${first} and ${second} profiles rendered identically`,
      ).toBe(false);
    }
  });
});
