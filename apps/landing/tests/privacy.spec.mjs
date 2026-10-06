import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

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
const sections = [
  'desktop',
  'store',
  'standalone',
  'files',
  'website',
  'preferences',
  'retention',
  'rights',
  'children',
  'changes',
  'contact',
];

for (const path of ['privacy', 'privacy/']) {
  for (const language of ['en', 'es']) {
    test(`static ${path} opens and refreshes in ${language} under repository prefix`, async ({
      page,
    }) => {
      const failures = [];
      page.on('pageerror', (error) => failures.push(error.message));
      page.on('response', (response) => {
        if (
          response.url().startsWith('http://127.0.0.1:4178/') &&
          response.status() >= 400
        )
          failures.push(response.url());
      });
      const t = translations[language];
      await page.goto(`${path}?lang=${language}`);
      await expect(
        page.getByRole('heading', { level: 1, name: t.privacy.title }),
      ).toBeVisible();
      await page.reload();
      await expect(page).toHaveTitle(t.privacy.metaTitle);
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      for (const section of sections) {
        await expect(
          page.getByRole('heading', {
            level: 2,
            name: t.privacy[section].title,
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByText(t.privacy[section].body, { exact: true }),
        ).toBeVisible();
      }
      await expect(
        page.getByRole('link', { name: t.privacy.githubPrivacy }),
      ).toHaveCount(2);
      expect(failures).toEqual([]);
    });
  }
}

test('changes language, navigates home and returns through privacy footer', async ({
  page,
}) => {
  await page.route('https://www.googletagmanager.com/**', (route) =>
    route.abort(),
  );
  await page.goto('privacy/?lang=en');
  await page
    .getByRole('combobox', { name: translations.en.header.languageLabel })
    .selectOption('es');
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: translations.es.privacy.title,
    }),
  ).toBeVisible();
  await expect(page).toHaveTitle(translations.es.privacy.metaTitle);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    translations.es.privacy.metaDescription,
  );
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await page
    .getByRole('link', { name: translations.es.privacy.home, exact: true })
    .first()
    .click();
  // The legacy `?lang=es` home link leads to the Spanish home.
  await expect(page).toHaveURL('http://127.0.0.1:4178/vellum/es/?lang=es');
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Un mapa para la ciudad que construiste.',
    }),
  ).toBeVisible();
  await page.evaluate(() =>
    localStorage.setItem('vellum-analytics-consent-v1', 'rejected'),
  );
  await page.reload();
  await page
    .getByRole('link', { name: translations.es.footer.privacy, exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: translations.es.privacy.title,
    }),
  ).toBeVisible();
});

test('serves real files without fallback and fits a narrow viewport', async ({
  page,
  request,
}) => {
  expect((await request.get('does-not-exist')).status()).toBe(404);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('privacy/?lang=es');
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: translations.es.privacy.title,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
