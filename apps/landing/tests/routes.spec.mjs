import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const origin = 'http://127.0.0.1:4178';
const site = 'https://sebas-tcotd.github.io';
const consentKey = 'vellum-analytics-consent-v1';
const translations = Object.fromEntries(
  ['en', 'es'].map((language) => [
    language,
    JSON.parse(
      readFileSync(
        new URL(`../i18n/${language}.json`, import.meta.url),
        'utf8',
      ),
    ),
  ]),
);

/** Every URL the served HTML references through src, href or island attributes. */
function referencedUrls(html) {
  const urls = new Set();
  for (const match of html.matchAll(
    /\s(?:src|href|component-url|renderer-url)="([^"]+)"/g,
  )) {
    urls.add(match[1]);
  }
  return [...urls];
}

/** Records responses from the local server that fail during a page load. */
function observeFailures(page) {
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('response', (response) => {
    if (response.url().startsWith(`${origin}/`) && response.status() >= 400)
      failures.push(`${response.status()} ${response.url()}`);
  });
  return failures;
}

test('the hard #download anchor lands on the home download band', async ({
  page,
}) => {
  const failures = observeFailures(page);
  const response = await page.goto('#download');
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe('/vellum/');
  const band = page.locator('#download');
  await expect(band).toHaveCount(1);
  await expect(
    band.getByRole('heading', {
      level: 2,
      name: translations.en.download.title,
    }),
  ).toBeVisible();
  await expect(band).toBeInViewport();
  expect(page.url()).toMatch(/#download$/);
  expect(failures).toEqual([]);
});

test('privacy without a trailing slash redirects to the static page', async ({
  request,
}) => {
  const redirect = await request.get('privacy', { maxRedirects: 0 });
  expect(redirect.status()).toBe(301);
  expect(redirect.headers().location).toBe('/vellum/privacy/');

  for (const path of ['privacy', 'privacy/']) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.url()).toBe(`${origin}/vellum/privacy/`);
    const html = await response.text();
    expect(html).toContain('<title>Privacy | Vellum City Maps</title>');
    expect(html).toContain('data-page="privacy"');
    expect(html).not.toMatch(/googletagmanager|gtag\(/i);
  }
});

test('privacy without a slash never reaches Google with accepted consent', async ({
  page,
}) => {
  const google = [];
  page.on('request', (request) => {
    if (/google|doubleclick/i.test(new URL(request.url()).hostname))
      google.push(request.url());
  });
  await page.route(/https:\/\/[^/]*(google|doubleclick)[^/]*\//, (route) =>
    route.fulfill({ contentType: 'application/javascript', body: '' }),
  );
  await page.addInitScript(
    (key) => localStorage.setItem(key, 'accepted'),
    consentKey,
  );
  await page.goto('privacy');
  expect(new URL(page.url()).pathname).toBe('/vellum/privacy/');
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: translations.en.privacy.title,
    }),
  ).toBeVisible();
  await page.waitForTimeout(500);
  expect(google).toEqual([]);
});

test('a missing route answers a real 404 page, not the home', async ({
  page,
  request,
}) => {
  const response = await request.get('no-existe');
  expect(response.status()).toBe(404);
  const html = await response.text();
  expect(html).toContain('<title>Page not found | Vellum</title>');
  expect(html).not.toContain('component-url');

  const navigation = await page.goto('no-existe/deeper/path');
  expect(navigation?.status()).toBe(404);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: "This place isn't on the map.",
    }),
  ).toBeVisible();
  const home = page.getByRole('link', { name: 'Back to the Vellum home' });
  await expect(home).toHaveAttribute('href', '/vellum/');
  await home.click();
  await expect(page).toHaveURL(`${origin}/vellum/`);
});

// The 404 is checked from a nested path: GitHub Pages serves it at any depth.
for (const path of ['', 'privacy/', 'no-existe/deeper/path']) {
  test(`every asset of "/vellum/${path}" resolves under /vellum/`, async ({
    page,
    request,
  }) => {
    const html = await (await request.get(path)).text();
    const urls = referencedUrls(html).filter(
      (url) => !url.startsWith('https://') && !url.startsWith('#'),
    );
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url, `${url} must be absolute under the base`).toMatch(
        /^\/vellum\//,
      );
      const response = await request.get(`${origin}${url}`);
      expect(response.status(), url).toBe(200);
    }

    const failures = observeFailures(page);
    const navigation = await page.goto(path);
    await page.waitForLoadState('networkidle');
    // Only the 404 document itself may answer with an error status.
    expect(
      failures.filter((failure) => failure !== `404 ${navigation?.url()}`),
    ).toEqual([]);
  });
}

for (const [path, canonical] of [
  ['', `${site}/vellum/`],
  ['privacy/', `${site}/vellum/privacy/`],
]) {
  test(`"/vellum/${path}" serves English SEO metadata`, async ({ request }) => {
    const html = await (await request.get(path)).text();
    expect(html).toMatch(/<html lang="en">/);
    expect(html).toContain(`<link rel="canonical" href="${canonical}">`);
    expect(html).toContain(`<meta property="og:url" content="${canonical}">`);
    expect(html).toMatch(
      /<meta property="og:image" content="https:\/\/sebas-tcotd\.github\.io\/vellum\/assets\/[^"]+">/,
    );
    // No page has its Spanish pair yet, so no hreflang alternates are claimed.
    expect(html).not.toContain('hreflang');
  });
}

test('the 404 page is English and stays out of the index', async ({
  request,
}) => {
  const html = await (await request.get('no-existe')).text();
  expect(html).toMatch(/<html lang="en">/);
  expect(html).toContain('<meta name="robots" content="noindex">');
  expect(html).not.toContain('rel="canonical"');
});

test('the legacy ?lang=es link still shows Spanish', async ({ page }) => {
  await page.goto('?lang=es');
  await expect(
    page.getByRole('heading', { level: 1, name: translations.es.hero.title }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  expect(new URL(page.url()).pathname).toBe('/vellum/');
});

test('a malformed hash still renders the home', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('?lang=en#%E0');
  await expect(
    page.getByRole('heading', { level: 1, name: translations.en.hero.title }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('the served #download band carries real release links without JS', async ({
  request,
}) => {
  const html = await (await request.get('')).text();
  const band = html.slice(html.indexOf('id="download"'));
  const direct =
    /href="https:\/\/github\.com\/sebas-tcotd\/vellum\/releases\/download\/v\d+\.\d+\.\d+\/[^"]+"/g;
  const links = band.match(direct) ?? [];
  for (const pattern of [
    /_x64-setup\.exe"/,
    /_universal\.dmg"/,
    /_amd64\.deb"/,
    /_amd64\.AppImage"/,
    /\.x86_64\.rpm"/,
  ]) {
    expect(links.some((link) => pattern.test(link))).toBe(true);
  }
  expect(html.match(/id="download"/g)).toHaveLength(1);
});

test('the download band shows only the language of the page', async ({
  page,
}) => {
  await page.goto('?lang=es#download');
  const band = page.locator('#download');
  await expect(
    band.getByRole('heading', {
      level: 2,
      name: translations.es.download.title,
    }),
  ).toBeVisible();
  await expect(band.locator('[lang="en"]')).toBeHidden();
  await expect(band.getByRole('link', { name: /\.exe/ })).toHaveCount(1);
});
