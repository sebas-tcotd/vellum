// The v1.0 home in the static build: language redirect, no-JS rendering,
// keyboard interactions and layout (EXPERIENCE.md · Home, Idioma, State
// Patterns, Accessibility Floor).
import { expect, test } from '@playwright/test';

const consentKey = 'vellum-analytics-consent-v1';
const sectionIds = [
  'mapas-reales',
  'capas',
  'temas',
  'nocturno',
  'esquematica',
  'distritos',
  'creadores',
  'lamina',
  'sistemas',
  'download',
];

/** Skips the consent bar so it does not cover what a test clicks. */
async function rejectConsent(page) {
  await page.addInitScript(
    (key) => localStorage.setItem(key, 'rejected'),
    consentKey,
  );
}

test.describe('with a Spanish browser', () => {
  test.use({ locale: 'es-PE' });

  test('an external entry to /#download lands on /es/#download', async ({
    page,
  }) => {
    await page.goto('#download', { referer: 'https://www.reddit.com/' });
    await expect(page).toHaveURL(/\/vellum\/es\/#download$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('#download')).toBeInViewport();
  });

  test('/es/ with a saved English choice stays in Spanish', async ({
    page,
  }) => {
    await page.addInitScript(() =>
      localStorage.setItem('vellum-landing-language', 'en'),
    );
    await page.goto('es/', { referer: 'https://www.reddit.com/' });
    await expect(page).toHaveURL(/\/vellum\/es\/$/);
  });

  test('blocked storage: no redirect, Auto theme and a consent bar without Google', async ({
    page,
  }) => {
    const google = [];
    page.on('request', (request) => {
      if (/google|doubleclick/i.test(new URL(request.url()).hostname))
        google.push(request.url());
    });
    await page.addInitScript(() => {
      for (const method of ['getItem', 'setItem'])
        Storage.prototype[method] = () => {
          throw new Error('Storage blocked');
        };
    });
    await page.goto('', { referer: 'https://www.reddit.com/' });
    await expect(page).toHaveURL(/\/vellum\/$/);
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /./);
    await expect(
      page.getByRole('region', { name: 'Analytics preferences' }),
    ).toBeVisible();
    expect(google).toEqual([]);
  });
});

test('/es/?lang=en leads to the English home with the hash and saves it', async ({
  page,
}) => {
  await page.goto('es/?lang=en#download');
  await expect(page).toHaveURL(/\/vellum\/\?lang=en#download$/);
  expect(
    await page.evaluate(() => localStorage.getItem('vellum-landing-language')),
  ).toBe('en');
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  for (const [path, lang] of [
    ['', 'en'],
    ['es/', 'es'],
  ]) {
    test(`"/vellum/${path}" serves every section, statically`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      for (const id of sectionIds)
        await expect(
          page.locator(`#${id}`).getByRole('heading', { level: 2 }),
          `section #${id} has its H2`,
        ).toHaveCount(1);
      // Comparator with Day and Transit whole, chips without controls.
      await expect(page.locator('.comparator--static')).toHaveCount(1);
      await expect(page.getByRole('slider')).toHaveCount(0);
      await expect(page.getByRole('radio')).toHaveCount(0);
      await expect(page.locator('[data-layer-thumb]')).toHaveCount(6);
      await expect(page.getByRole('button', { name: /Menu|Menú/ })).toHaveCount(
        0,
      );
      await expect(page.locator('[data-theme-switch]')).toBeHidden();
      await expect(page.locator('#download .platform')).toHaveCount(3);
      // The real app components are inert, hidden from assistive tech and
      // carry no client script.
      const embeds = page.locator('vellum-app-embed');
      await expect(embeds).toHaveCount(2);
      for (const embed of await embeds.all()) {
        await expect(embed).toHaveAttribute('inert');
        await expect(embed).toHaveAttribute('aria-hidden', 'true');
      }
      expect(await page.locator('astro-island').count()).toBe(0);
    });
  }
});

test('the skip link is the first focus and lands on main', async ({ page }) => {
  await rejectConsent(page);
  await page.goto('');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main#contenido')).toBeFocused();
});

test('the consent region is the second focus and its choice moves focus to main', async ({
  page,
}) => {
  await page.goto('');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Read the privacy policy' }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Reject analytics' }).click();
  await expect(page.locator('main#contenido')).toBeFocused();
  await page.getByRole('button', { name: 'Analytics preferences' }).click();
  await expect(
    page.getByRole('region', { name: 'Analytics preferences' }),
  ).toBeFocused();
});

test('the comparator divider moves with the keyboard and names both themes', async ({
  page,
}) => {
  await rejectConsent(page);
  await page.goto('');
  const slider = page.getByRole('slider', { name: 'Comparison divider' });
  await expect(slider).toHaveAttribute('aria-valuenow', '52');
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '57');
  await expect(slider).toHaveAttribute(
    'aria-valuetext',
    '57 % Day · 43 % Transit',
  );
  await page.keyboard.press('Shift+ArrowLeft');
  await expect(slider).toHaveAttribute('aria-valuenow', '47');
  await page.keyboard.press('End');
  await expect(slider).toHaveAttribute('aria-valuenow', '100');
});

test('choosing on one side the theme of the other swaps them and announces it', async ({
  page,
}) => {
  await rejectConsent(page);
  await page.goto('');
  const left = page.getByRole('radiogroup', { name: 'Left side' });
  const right = page.getByRole('radiogroup', { name: 'Right side' });
  await expect(left.getByRole('radio', { checked: true })).toHaveAttribute(
    'data-theme',
    'day',
  );
  await left.locator('[data-theme="transit"]').click();
  await expect(left.locator('[data-theme="transit"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(right.locator('[data-theme="day"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.locator('[data-theme-live]')).toHaveText(
    'Comparing Transit with Day',
  );
  // Arrows move and select inside one group.
  await right.locator('[data-theme="day"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(right.locator('[data-theme="transit"]')).toBeFocused();
});

test('the layer strip thumbnails are toggle buttons', async ({ page }) => {
  await rejectConsent(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('');
  const thumbs = page.locator('#capas [data-layer-thumb]');
  await expect(thumbs.nth(5)).toHaveAttribute('aria-pressed', 'true');
  await thumbs.nth(1).focus();
  await page.keyboard.press('Enter');
  await expect(thumbs.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(thumbs.nth(5)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#capas .layer-stage img').last()).toHaveAttribute(
    'alt',
    /terrain, water and roads/,
  );
});

test('the gallery opens a modal lightbox and returns focus', async ({
  page,
}) => {
  await rejectConsent(page);
  await page.goto('');
  const trigger = page.getByRole('link', {
    name: 'View Island Hopping full size',
  });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(dialog).toContainText('San Rico');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('the page theme switcher applies and remembers the choice', async ({
  page,
}) => {
  await rejectConsent(page);
  await page.goto('');
  await page.getByText('Dark', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
});

test('the language switcher keeps the hash', async ({ page }) => {
  await rejectConsent(page);
  await page.goto('#download');
  await page.getByRole('link', { name: 'Español' }).click();
  await expect(page).toHaveURL(/\/vellum\/es\/\?lang=es#download$/);
});

test.describe('on a Linux desktop', () => {
  test.use({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0' });

  // Chromium keeps reporting the host OS through client hints; drop them so
  // the user agent under test decides.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() =>
      Object.defineProperty(Navigator.prototype, 'userAgentData', {
        get: () => undefined,
      }),
    );
  });

  test('the Linux row becomes the recommended primary download', async ({
    page,
  }) => {
    await page.goto('#download');
    await expect(
      page.locator('#download .platform[data-detected]'),
    ).toHaveCount(1);
    const row = page.locator('#download-linux[data-detected]');
    await expect(row).toContainText('Recommended for your system');
    await expect(row.locator('.platform__primary')).toHaveCount(1);
    await expect(page.locator('#download .platform')).toHaveCount(3);
  });
});

test.describe('on a phone', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148',
  });

  // Chromium keeps reporting the host OS through client hints; drop them so
  // the user agent under test decides.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() =>
      Object.defineProperty(Navigator.prototype, 'userAgentData', {
        get: () => undefined,
      }),
    );
  });

  test('no system is recommended and every platform stays', async ({
    page,
  }) => {
    await page.goto('#download');
    await expect(page.locator('#download .platform')).toHaveCount(3);
    await expect(page.locator('#download [data-detected]')).toHaveCount(0);
  });
});

for (const width of [320, 390, 1280]) {
  test(`no horizontal scroll at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test('missing shots show their id, never an image with a provisional alt', async ({
  page,
}) => {
  await page.goto('');
  // Vacuous once every shot is delivered, which is the launch goal.
  const missing = page.locator('[data-shot-status="missing"]');
  for (const shot of await missing.all()) {
    await expect(shot.locator('img')).toHaveCount(0);
    await expect(shot).toContainText(/T\d\d/);
  }
});

test('one official Store badge per page mode, never a Microsoft request', async ({
  page,
}) => {
  const microsoft = [];
  page.on('request', (request) => {
    if (/microsoft\.com$/.test(new URL(request.url()).hostname))
      microsoft.push(request.url());
  });
  await rejectConsent(page);
  await page.goto('es/#download');
  const badges = page.locator('#download .store-badge img');
  await expect(badges).toHaveCount(2);
  await expect(
    page.getByRole('img', { name: 'Obtenlo de Microsoft' }),
  ).toHaveAttribute('src', /store-badge-es-on-light\.svg$/);
  await page.getByText('Oscuro', { exact: true }).click();
  await expect(
    page.getByRole('img', { name: 'Obtenlo de Microsoft' }),
  ).toHaveAttribute('src', /store-badge-es-on-dark\.svg$/);
  expect(microsoft).toEqual([]);
});
