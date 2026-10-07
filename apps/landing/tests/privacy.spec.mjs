// Privacy (EXPERIENCE.md · Páginas · Privacidad): static pages in English
// (`/privacy/`, the Partner Center URL) and Spanish (`/es/privacidad/`),
// never redirected by language, without the consent bar or Google.
import { expect, test } from '@playwright/test';
import { PRIVACY } from '../src/content/privacy.ts';

const origin = 'http://127.0.0.1:4178';
const pages = [
  ['privacy', 'en', '/vellum/privacy/'],
  ['privacy/', 'en', '/vellum/privacy/'],
  ['es/privacidad/', 'es', '/vellum/es/privacidad/'],
];

for (const [path, lang, final] of pages) {
  test(`"/vellum/${path}" is the static ${lang} policy and refreshes in place`, async ({
    page,
  }) => {
    const failures = [];
    page.on('pageerror', (error) => failures.push(error.message));
    page.on('response', (response) => {
      if (response.url().startsWith(`${origin}/`) && response.status() >= 400)
        failures.push(response.url());
    });
    const t = PRIVACY[lang];
    await page.goto(path);
    await expect(
      page.getByRole('heading', { level: 1, name: t.title }),
    ).toBeVisible();
    await page.reload();
    expect(new URL(page.url()).pathname).toBe(final);
    await expect(page).toHaveTitle(t.meta.title);
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    await expect(page.getByText('Vellum City Maps').first()).toBeVisible();
    for (const section of t.sections) {
      await expect(
        page.getByRole('heading', {
          level: 2,
          name: section.title,
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByText(section.body, { exact: true })).toBeVisible();
      for (const link of section.links)
        await expect(
          page.locator(`#${section.id} a[href="${link.href}"]`),
        ).toHaveCount(1);
    }
    await expect(page.locator('#analytics-consent')).toHaveCount(0);
    expect(failures).toEqual([]);
  });
}

test('an external entry to /privacy/ with a Spanish browser is not redirected', async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: 'es-PE' });
  const page = await context.newPage();
  await page.goto('privacy/', { referer: 'https://partner.microsoft.com/' });
  await page.waitForTimeout(300);
  expect(new URL(page.url()).pathname).toBe('/vellum/privacy/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const spanish = page.locator('.lang-switch a[hreflang="es"]');
  await expect(spanish).toHaveAttribute(
    'href',
    /^\/vellum\/es\/privacidad\/(\?lang=es)?$/,
  );
  await spanish.click();
  await expect(page).toHaveURL(/\/vellum\/es\/privacidad\/(\?lang=es)?$/);
  await expect(
    page.getByRole('heading', { level: 1, name: PRIVACY.es.title }),
  ).toBeVisible();
  await context.close();
});

test('the footer and the consent bar lead to the privacy page of each language', async ({
  page,
}) => {
  await page.goto('es/?lang=es');
  await expect(
    page.locator('#analytics-consent a[href="/vellum/es/privacidad/"]'),
  ).toHaveCount(1);
  await page.evaluate(() =>
    localStorage.setItem('vellum-analytics-consent-v1', 'rejected'),
  );
  await page.reload();
  await page
    .getByRole('contentinfo')
    .getByRole('link', { name: 'Privacidad', exact: true })
    .click();
  await expect(page).toHaveURL(`${origin}/vellum/es/privacidad/`);
  await expect(
    page.getByRole('heading', { level: 1, name: PRIVACY.es.title }),
  ).toBeVisible();
});

test('serves real files without fallback and fits a narrow viewport', async ({
  page,
  request,
}) => {
  expect((await request.get('does-not-exist')).status()).toBe(404);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('es/privacidad/');
  await expect(
    page.getByRole('heading', { level: 1, name: PRIVACY.es.title }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('the English and Spanish policies have the same sections and links', () => {
  const shape = (lang) =>
    PRIVACY[lang].sections.map((section) => ({
      id: section.id,
      links: section.links.map((link) => link.href),
    }));
  expect(shape('es')).toEqual(shape('en'));
  for (const lang of ['en', 'es'])
    for (const section of PRIVACY[lang].sections) {
      expect(section.title, `${lang} ${section.id}`).not.toBe('');
      expect(section.body, `${lang} ${section.id}`).not.toBe('');
    }
});
