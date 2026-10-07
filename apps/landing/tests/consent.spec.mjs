import { expect, test } from '@playwright/test';

const consentKey = 'vellum-analytics-consent-v1';
const tagUrl = 'https://www.googletagmanager.com/gtag/js?id=G-468WQTVLLD';

async function observeGoogle(page) {
  const requests = [];
  page.on('request', (request) => {
    if (/google|doubleclick/i.test(new URL(request.url()).hostname))
      requests.push(request.url());
  });
  // Keep tests offline while observing every attempted Google request.
  await page.route(/https:\/\/[^/]*(google|doubleclick)[^/]*\//, (route) =>
    route.fulfill({ contentType: 'application/javascript', body: '' }),
  );
  return requests;
}

for (const lang of ['en', 'es']) {
  test(`blocks Google before consent and after rejection in ${lang}`, async ({
    page,
  }) => {
    const google = await observeGoogle(page);
    await page.goto(`?lang=${lang}`);
    const reject = lang === 'en' ? 'Reject analytics' : 'Rechazar analítica';
    await expect(
      page.getByRole('button', { name: reject, exact: true }),
    ).toBeVisible();
    await page.waitForTimeout(500);
    expect(google).toEqual([]);
    expect(
      await page.evaluate(() =>
        document.querySelector('script[src*="googletagmanager"]'),
      ),
    ).toBeNull();
    await page.getByRole('button', { name: reject, exact: true }).click();
    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), consentKey))
      .toBe('rejected');
    await page.reload();
    await page.waitForTimeout(500);
    expect(google).toEqual([]);
    await expect(page.locator('#analytics-consent')).toHaveCount(0);
  });
}

test('accepts once, persists, sends denied advertising signals and revokes without Google pings', async ({
  page,
}) => {
  const google = await observeGoogle(page);
  await page.goto('?lang=en');
  await page
    .getByRole('button', { name: 'Accept analytics', exact: true })
    .click();
  await expect.poll(() => google.length).toBe(1);
  expect(google).toEqual([tagUrl]);
  const queue = await page.evaluate(() =>
    window.dataLayer.map((item) => Array.from(item)),
  );
  expect(queue[0]).toEqual([
    'consent',
    'default',
    {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
    },
  ]);
  expect(queue[1]).toEqual([
    'consent',
    'update',
    {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'granted',
    },
  ]);
  expect(queue[3]).toEqual([
    'config',
    'G-468WQTVLLD',
    { allow_google_signals: false, allow_ad_personalization_signals: false },
  ]);
  await page.reload();
  await expect.poll(() => google.length).toBe(2);
  await expect(page.locator('#analytics-consent')).toHaveCount(0);
  await page.evaluate(() => {
    document.cookie = '_ga=test; Path=/';
    document.cookie = '_ga_468WQTVLLD=test; Path=/vellum/';
  });
  await page
    .getByRole('button', { name: 'Analytics preferences', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Reject analytics', exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.querySelectorAll('script[src*="googletagmanager"]').length,
      ),
    )
    .toBe(0);
  await page.waitForTimeout(500);
  expect(google).toHaveLength(2);
  expect(await page.evaluate(() => document.cookie)).not.toMatch(/_ga/);
  await page
    .getByRole('button', { name: 'Analytics preferences', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Accept analytics', exact: true })
    .click();
  await expect.poll(() => google.length).toBe(3);
});

test('privacy never loads Google even with accepted consent', async ({
  page,
}) => {
  const google = await observeGoogle(page);
  await page.addInitScript(
    (key) => localStorage.setItem(key, 'accepted'),
    consentKey,
  );
  await page.goto('privacy/?lang=en');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForTimeout(500);
  expect(google).toEqual([]);
});

test('fails closed for inaccessible stored consent', async ({ page }) => {
  const google = await observeGoogle(page);
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error('Storage blocked');
    };
    Storage.prototype.setItem = () => {
      throw new Error('Storage blocked');
    };
  });
  await page.goto('?lang=en');
  await expect(
    page.getByRole('button', { name: 'Accept analytics', exact: true }),
  ).toBeVisible();
  expect(google).toEqual([]);
  await page
    .getByRole('button', { name: 'Accept analytics', exact: true })
    .click();
  await expect.poll(() => google.length).toBe(1);
  await page
    .getByRole('button', { name: 'Analytics preferences', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Reject analytics', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Accept analytics', exact: true }),
  ).toBeVisible();
  expect(google).toHaveLength(1);
});

test('withdrawal in another tab unloads analytics in open tabs', async ({
  page,
  context,
}) => {
  const google = await observeGoogle(page);
  await page.goto('?lang=en');
  await page
    .getByRole('button', { name: 'Accept analytics', exact: true })
    .click();
  await expect.poll(() => google.length).toBe(1);
  const privacy = await context.newPage();
  await observeGoogle(privacy);
  await privacy.goto('privacy/?lang=en');
  await privacy
    .getByRole('button', { name: 'Analytics preferences', exact: true })
    .click();
  const analyticsTabReload = page.waitForNavigation();
  await privacy
    .getByRole('button', { name: 'Reject analytics', exact: true })
    .click();
  await analyticsTabReload;
  await expect(page.locator('script[src*="googletagmanager"]')).toHaveCount(0);
  expect(google).toHaveLength(1);
});

test('invalid stored choice stays off and banner fits mobile', async ({
  page,
}) => {
  const google = await observeGoogle(page);
  await page.addInitScript(
    (key) => localStorage.setItem(key, 'true'),
    consentKey,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('?lang=es');
  await expect(
    page.getByRole('button', { name: 'Rechazar analítica', exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(500);
  expect(google).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: '../../target/analytics-consent-es-mobile.png',
  });
});
