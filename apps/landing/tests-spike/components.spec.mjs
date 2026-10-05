// Step-4 spike: is a real app component inside Declarative Shadow DOM, on a
// landing page, pixel-identical to the same component rendered with the app's
// complete globals.css?
//
// Comparator and threshold are the repo's golden ones (compareRgbaPixels and
// manifest.json of packages/renderer-webgl/test/export-goldens), not
// Playwright's toHaveScreenshot.
import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import {
  compareRgbaPixels,
  DEFAULT_MANIFEST_PATH,
  RGB_CHANNEL_DELTA_EXCLUSIVE,
} from '../../../packages/renderer-webgl/test/export-goldens/harness.mjs';
import { decodePngToRgba } from '../../../packages/renderer-webgl/test/export-goldens/png-to-rgba.mjs';
import { encodeRgbaPng } from './png-encode.mjs';

const VARIANTS = ['linux-light', 'macos-light', 'linux-dark'];
const COMPONENTS = ['panel', 'card'];

const manifest = JSON.parse(await readFile(DEFAULT_MANIFEST_PATH, 'utf8'));
const { rgbChannelDeltaExclusive, maxDifferentPixelRatio } =
  manifest.harness.comparison;

/** Loads a page and waits until it can be captured deterministically. */
async function open(page, path) {
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
}

/** Captures a frame as RGBA. */
async function capture(locator) {
  const png = await locator.screenshot({
    animations: 'disabled',
    caret: 'hide',
  });
  return { png, ...decodePngToRgba(png) };
}

/** Red where the RGB delta exceeds the golden tolerance or alpha differs, faded reference elsewhere. */
function diffImage(actual, expected) {
  const pixels = new Uint8Array(expected.pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    const different =
      Math.abs(actual.pixels[i] - expected.pixels[i]) >
        RGB_CHANNEL_DELTA_EXCLUSIVE ||
      Math.abs(actual.pixels[i + 1] - expected.pixels[i + 1]) >
        RGB_CHANNEL_DELTA_EXCLUSIVE ||
      Math.abs(actual.pixels[i + 2] - expected.pixels[i + 2]) >
        RGB_CHANNEL_DELTA_EXCLUSIVE ||
      // The comparator checks alpha exactly.
      actual.pixels[i + 3] !== expected.pixels[i + 3];
    if (different) {
      pixels.set([255, 0, 0, 255], i);
    } else {
      const gray =
        (expected.pixels[i] + expected.pixels[i + 1] + expected.pixels[i + 2]) /
        3;
      const faded = Math.round(255 - (255 - gray) * 0.25);
      pixels.set([faded, faded, faded, 255], i);
    }
  }
  return encodeRgbaPng({
    width: expected.width,
    height: expected.height,
    pixels,
  });
}

/**
 * Compares an embedded frame with its reference, logs the result and writes
 * the three images next to the test output when they differ.
 */
async function compareFrames(label, embedded, reference, testInfo) {
  const actual = await capture(embedded);
  const expected = await capture(reference);
  const sizes = `${actual.width}x${actual.height} vs ${expected.width}x${expected.height}`;
  if (actual.width !== expected.width || actual.height !== expected.height) {
    await writeFile(testInfo.outputPath('embed.png'), actual.png);
    await writeFile(testInfo.outputPath('reference.png'), expected.png);
    console.log(`[spike] ${label}: size differs (${sizes})`);
    testInfo.annotations.push({ type: 'diff', description: `size ${sizes}` });
    expect(sizes, `${label}: frame size`).toBe(
      `${expected.width}x${expected.height} vs ${expected.width}x${expected.height}`,
    );
    return;
  }
  // The golden comparator throws above its ratio; ask for the counts with a
  // ratio of 1 and apply the manifest threshold here, so the report always
  // carries the measured percentage.
  const { differentPixels, differentPixelRatio, totalPixels } =
    compareRgbaPixels(actual.pixels, expected.pixels, {
      dimensions: { width: expected.width, height: expected.height },
      maxDifferentPixelRatio: 1,
    });
  const percent = (differentPixelRatio * 100).toFixed(4);
  console.log(
    `[spike] ${label}: ${percent}% different (${differentPixels}/${totalPixels} px, ${actual.width}x${actual.height}); threshold ${(maxDifferentPixelRatio * 100).toFixed(2)}%`,
  );
  testInfo.annotations.push({
    type: 'diff',
    description: `${percent}% (${differentPixels}/${totalPixels} px)`,
  });
  if (differentPixels > 0) {
    await writeFile(testInfo.outputPath('embed.png'), actual.png);
    await writeFile(testInfo.outputPath('reference.png'), expected.png);
    await writeFile(
      testInfo.outputPath('diff.png'),
      diffImage(actual, expected),
    );
  }
  expect(
    differentPixelRatio,
    `${label}: ${percent}% of pixels differ (diff.png in ${testInfo.outputDir})`,
  ).toBeLessThanOrEqual(maxDifferentPixelRatio);
}

test('uses the golden comparator settings', () => {
  // compareRgbaPixels applies its own constant; it must match the manifest.
  expect(rgbChannelDeltaExclusive).toBe(RGB_CHANNEL_DELTA_EXCLUSIVE);
  expect(manifest.harness.comparison.alpha).toBe('exact');
});

for (const variant of VARIANTS) {
  for (const component of COMPONENTS) {
    test(`${component} · ${variant} matches the reference`, async ({
      browser,
    }, testInfo) => {
      const embedPage = await browser.newPage();
      const referencePage = await browser.newPage();
      await open(embedPage, `/embed/${variant}/`);
      await open(referencePage, `/reference/${variant}/`);
      await compareFrames(
        `${component} ${variant}`,
        embedPage
          .getByTestId(`embed-${component}`)
          .locator('.app-embed__frame'),
        referencePage.getByTestId(`ref-${component}`),
        testInfo,
      );
    });
  }
}

/** Tokens whose value depends on the shell profile and the appearance. */
const PROFILE_TOKENS = [
  '--shell-separator',
  '--shell-text-primary',
  '--shell-solid-surface',
];

for (const variant of VARIANTS) {
  test(`${variant}: profile tokens resolve as on the app's <html>`, async ({
    browser,
  }) => {
    // A token defined with var() and resolved on :host instead of the
    // profile's element differs by only a few pixels (a hairline), under the
    // golden ratio; compare the computed values directly.
    const embedPage = await browser.newPage();
    const referencePage = await browser.newPage();
    await open(embedPage, `/embed/${variant}/`);
    await open(referencePage, `/reference/${variant}/`);
    const read = (element, names) => {
      const style = getComputedStyle(element);
      return Object.fromEntries(
        names.map((name) => [name, style.getPropertyValue(name).trim()]),
      );
    };
    const expected = await referencePage
      .locator('html')
      .evaluate(read, PROFILE_TOKENS);
    for (const component of COMPONENTS) {
      const actual = await embedPage
        .getByTestId(`embed-${component}`)
        .locator('.app-embed__frame')
        .evaluate(read, PROFILE_TOKENS);
      expect(actual, `${component} ${variant}`).toEqual(expected);
      for (const name of PROFILE_TOKENS) expect(actual[name]).not.toBe('');
    }
  });
}

test('a real difference fails and writes the diff', async ({
  browser,
}, testInfo) => {
  // Light embed against the dark reference: same size, different paint.
  const embedPage = await browser.newPage();
  const referencePage = await browser.newPage();
  await open(embedPage, '/embed/linux-light/');
  await open(referencePage, '/reference/linux-dark/');
  await expect(
    compareFrames(
      'panel light vs dark (negative control)',
      embedPage.getByTestId('embed-panel').locator('.app-embed__frame'),
      referencePage.getByTestId('ref-panel'),
      testInfo,
    ),
  ).rejects.toThrow(/of pixels differ/);
  await expect(
    readFile(testInfo.outputPath('diff.png')).then((png) => png.length),
  ).resolves.toBeGreaterThan(0);
});

test.describe('style leaks', () => {
  test('embed.css does not reach the landing document', async ({ page }) => {
    await open(page, '/embed/linux-light/');
    const styles = await page.evaluate(() => {
      const body = getComputedStyle(document.body);
      const probe = document.querySelector('[data-testid="leak-probe"]');
      const probeStyle = getComputedStyle(probe);
      return {
        bodyMinWidth: body.minWidth,
        bodyOverflow: body.overflow,
        probePosition: probeStyle.position,
        probeDisplay: probeStyle.display,
        rootShellSurface: getComputedStyle(document.documentElement)
          .getPropertyValue('--shell-surface')
          .trim(),
        rootColorBg: getComputedStyle(document.documentElement)
          .getPropertyValue('--color-bg')
          .trim(),
      };
    });
    // The landing's own body (min-width: 320px), not 03-generic's 900px.
    expect(styles.bodyMinWidth).toBe('320px');
    expect(styles.bodyOverflow).toBe('visible');
    // `.place-card` and `.desktop-shell` outside the shadow root stay unstyled.
    expect(styles.probePosition).toBe('static');
    expect(styles.probeDisplay).toBe('block');
    expect(styles.rootShellSurface).toBe('');
    expect(styles.rootColorBg).toBe('');
  });

  for (const component of COMPONENTS) {
    test(`inherited page styles do not reach the ${component}`, async ({
      browser,
    }, testInfo) => {
      const embedPage = await browser.newPage();
      const referencePage = await browser.newPage();
      await open(embedPage, '/embed-hostile/');
      await open(referencePage, '/reference/linux-light/');
      await compareFrames(
        `${component} under a hostile page`,
        embedPage
          .getByTestId(`embed-${component}`)
          .locator('.app-embed__frame'),
        referencePage.getByTestId(`ref-${component}`),
        testInfo,
      );
    });
  }
});

test.describe('served HTML without JS', () => {
  for (const variant of VARIANTS) {
    test(`${variant}: components are in declarative shadow roots, no scripts`, async ({
      request,
    }) => {
      const response = await request.get(`/embed/${variant}/`);
      expect(response.status()).toBe(200);
      const html = await response.text();
      expect(html.match(/<template shadowrootmode="open">/g)).toHaveLength(2);
      expect(html).not.toMatch(/<script\b/i);
      expect(html).not.toContain('astro-island');
      expect(
        html.match(/<vellum-app-embed\b[^>]*\binert\b[^>]*aria-hidden="true"/g),
      ).toHaveLength(2);
    });
  }

  test('the shadow roots attach with JavaScript disabled', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/embed/linux-light/');
    for (const component of COMPONENTS) {
      await expect(
        page.getByTestId(`embed-${component}`).locator('.app-embed__frame'),
      ).toBeVisible();
    }
    await context.close();
  });
});
