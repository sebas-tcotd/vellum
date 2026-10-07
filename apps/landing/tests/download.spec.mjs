// The download page in the static build (EXPERIENCE.md · Páginas · Descarga,
// State Patterns and Interaction Primitives): the I/O matrix of
// spec-landing-pagina-descarga with emulated user agents and without JS.
import { expect, test } from '@playwright/test';

const consentKey = 'vellum-analytics-consent-v1';
const agents = {
  windows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  macos:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  linux:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  chromeos:
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
};

/** The user agent under test decides: Chromium's client hints report the host. */
async function prepare(page) {
  await page.addInitScript((key) => {
    localStorage.setItem(key, 'rejected');
    Object.defineProperty(Navigator.prototype, 'userAgentData', {
      get: () => undefined,
    });
  }, consentKey);
}

/** Ids of the platform cards in DOM order. */
const cardOrder = (page) =>
  page
    .locator('#all-platforms .dl-card')
    .evaluateAll((cards) => cards.map((card) => card.id));

/** Ids of the top-level blocks of the page in DOM order. */
const blockOrder = (page) =>
  page
    .locator('.dl-sections > section')
    .evaluateAll((blocks) => blocks.map((block) => block.id));

test.describe('Windows detected', () => {
  test.use({ userAgent: agents.windows });
  test.beforeEach(({ page }) => prepare(page));

  test('Store then .exe in the main pair, Windows card first, T22 in the header', async ({
    page,
  }) => {
    await page.goto('es/descargar/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Descarga Vellum para Windows.',
    );
    const pair = page.locator('.dl-header .dl-pair');
    const links = await pair
      .locator('a')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')));
    expect(links[0]).toMatch(/^https:\/\/get\.microsoft\.com\//);
    expect(links[1]).toMatch(/_x64-setup\.exe$/);
    await expect(
      pair.getByRole('link', { name: /Vellum_[\d.]+_x64-setup\.exe/ }),
    ).toBeVisible();
    // Alternatives: the MSI of the page language, the other folded.
    const alt = page.locator('.dl-header .dl-alt');
    await expect(alt.locator('> p a[href$="_es-ES.msi"]')).toBeVisible();
    await expect(alt.locator('details a[href$="_en-US.msi"]')).toBeHidden();
    await expect(
      page.locator('.dl-header [data-shell="windows"]'),
    ).toBeVisible();
    expect(await cardOrder(page)).toEqual(['windows', 'macos', 'linux']);
    await expect(page.locator('#windows')).toContainText(
      'Recomendado para tu sistema',
    );
    // The spine order: Bridge, SmartScreen, then every platform.
    expect((await blockOrder(page)).slice(0, 3)).toEqual([
      'bridge',
      'smartscreen',
      'all-platforms',
    ]);
    await expect(page.locator('[data-step-line]')).toBeHidden();
    await expect(page.locator('.nav__download')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('a download moves the focus to step 2 with «Your download has started.»', async ({
    page,
  }) => {
    await page.route(/github\.com\/.*\/releases\/download\//, (route) =>
      route.fulfill({
        status: 200,
        headers: { 'Content-Disposition': 'attachment; filename="x.exe"' },
        body: '',
      }),
    );
    await page.goto('download/');
    const live = page.locator('[aria-live]');
    await expect(live).toHaveCount(1);
    await page.locator('.dl-header a.dl-main').click();
    const heading = page.locator('#bridge-title');
    await expect(heading).toBeFocused();
    const note = page.locator('.dl-started');
    await expect(note).toHaveText('Your download has started.');
    expect(
      await note.evaluate(
        (node) => node.nextElementSibling?.id === 'bridge-title',
      ),
    ).toBe(true);
    await expect(note).not.toHaveAttribute('aria-live', /./);
    await expect(live).toHaveText('');
    // A second download does not repeat the line.
    await page.locator('#windows a[href$=".msi"]').first().click();
    await expect(page.locator('.dl-started')).toHaveCount(1);
  });

  test('«Copy» works from the keyboard and is announced once, without resizing', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('es/descargar/#verify');
    const row = page.locator('[data-hash-row][data-detected]');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('recomendado');
    const button = row.getByRole('button', {
      name: /^Copiar SHA256 de Vellum_[\d.]+_x64-setup\.exe$/,
    });
    const width = await button.evaluate((node) => node.offsetWidth);
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('data-copied', '');
    await expect(button).toContainText('Copiado ✓');
    expect(await button.evaluate((node) => node.offsetWidth)).toBe(width);
    await expect(page.locator('[aria-live="polite"]')).toHaveText('Copiado');
    const hash = (await row.locator('[data-hash]').textContent()).trim();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      hash,
    );
    await expect(button).not.toHaveAttribute('data-copied', '', {
      timeout: 3000,
    });
  });
});

test.describe('macOS detected', () => {
  test.use({ userAgent: agents.macos });
  test.beforeEach(({ page }) => prepare(page));

  test('the macOS card goes first and the header shows the .dmg and T23', async ({
    page,
  }) => {
    await page.goto('download/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Download Vellum for macOS.',
    );
    expect(await cardOrder(page)).toEqual(['macos', 'windows', 'linux']);
    await expect(
      page.locator('.dl-header a.dl-main[href$="_universal.dmg"]'),
    ).toBeVisible();
    await expect(page.locator('.dl-header [data-shell="macos"]')).toBeVisible();
    await expect(page.locator('.dl-header [data-shell="windows"]')).toHaveCount(
      0,
    );
  });
});

test.describe('Linux detected', () => {
  test.use({ userAgent: agents.linux });
  test.beforeEach(({ page }) => prepare(page));

  test('the .deb leads, with .AppImage and .rpm beside it, and T24 in the header', async ({
    page,
  }) => {
    await page.goto('download/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Download Vellum for Linux.',
    );
    await expect(page.locator('.dl-header a.dl-main')).toHaveAttribute(
      'href',
      /_amd64\.deb$/,
    );
    await expect(
      page.locator('.dl-header a[href$="_amd64.AppImage"]'),
    ).toHaveCount(1);
    await expect(page.locator('.dl-header a[href$=".x86_64.rpm"]')).toHaveCount(
      1,
    );
    await expect(page.locator('.dl-header [data-shell="linux"]')).toBeVisible();
    expect(await cardOrder(page)).toEqual(['linux', 'windows', 'macos']);
  });
});

test.describe('unknown system', () => {
  test.use({ userAgent: agents.chromeos });
  test.beforeEach(({ page }) => prepare(page));

  test('«Choose your system», three equal columns and nothing recommended', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('es/descargar/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Elige tu sistema.',
    );
    await expect(page.locator('.dl-header')).toContainText(
      'No pudimos reconocer tu sistema.',
    );
    await expect(page.locator('[data-detected]')).toHaveCount(0);
    expect(await cardOrder(page)).toEqual(['windows', 'macos', 'linux']);
    const widths = await page
      .locator('.dl-card')
      .evaluateAll((cards) => cards.map((card) => card.offsetWidth));
    expect(new Set(widths).size).toBe(1);
    const tops = await page
      .locator('.dl-card')
      .evaluateAll((cards) => cards.map((card) => card.offsetTop));
    expect(new Set(tops).size).toBe(1);
    await expect(page.locator('[data-shell-slot]')).toBeHidden();
    await expect(page.locator('[data-step-line]')).toBeVisible();
  });
});

test.describe('on a phone', () => {
  test.use({ userAgent: agents.iphone, viewport: { width: 390, height: 844 } });
  test.beforeEach(({ page }) => prepare(page));

  test('«Vellum is for desktop»; «Copy link» copies the canonical URL; no Share without Web Share', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.addInitScript(() => {
      delete Navigator.prototype.share;
    });
    await page.goto('es/descargar/?utm=x#bridge');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Vellum es para escritorio.',
    );
    await expect(page.getByRole('button', { name: 'Compartir…' })).toHaveCount(
      0,
    );
    await page.getByRole('button', { name: 'Copiar enlace' }).click();
    await expect(page.locator('[aria-live="polite"]')).toHaveText(
      'Enlace copiado',
    );
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      'https://sebas-tcotd.github.io/vellum/es/descargar/',
    );
    // Every platform stays, after Bridge, without a primary button.
    await expect(page.locator('.dl-card')).toHaveCount(3);
    await expect(page.locator('.dl-header a.dl-main')).toHaveCount(0);
    await expect(page.locator('[data-step1]')).toBeHidden();
    await expect(page.locator('[data-step-line]')).toBeHidden();
    await expect(page.locator('[data-lede]')).toContainText(
      'Lo instalas en el PC donde juegas Cities: Skylines.',
    );
    expect((await blockOrder(page)).slice(0, 2)).toEqual([
      'bridge',
      'all-platforms',
    ]);
  });

  test('«Share…» appears only when the browser offers it', async ({ page }) => {
    await page.addInitScript(() => {
      Navigator.prototype.share = () => Promise.resolve();
    });
    await page.goto('download/');
    await expect(page.getByRole('button', { name: 'Share…' })).toBeVisible();
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false, userAgent: agents.windows });

  for (const [path, title, msiFirst] of [
    ['download/', 'Download Vellum.', '_en-US.msi'],
    ['es/descargar/', 'Descarga Vellum.', '_es-ES.msi'],
  ]) {
    test(`"/vellum/${path}" serves the three platforms, Bridge and the post-download block`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
      expect(await cardOrder(page)).toEqual(['windows', 'macos', 'linux']);
      await expect(page.locator('[data-detected]')).toHaveCount(0);
      await expect(page.locator('#bridge-title')).toBeVisible();
      await expect(page.locator('#bridge-manual')).toBeVisible();
      await expect(page.locator('.dl-after')).toBeVisible();
      await expect(page.getByRole('button')).toHaveCount(0);
      await expect(page.locator('#verify')).not.toHaveAttribute('open', '');
      for (const pattern of [
        /_x64-setup\.exe$/,
        /_en-US\.msi$/,
        /_es-ES\.msi$/,
        /_universal\.dmg$/,
        /_amd64\.deb$/,
        /_amd64\.AppImage$/,
        /\.x86_64\.rpm$/,
      ])
        expect(
          await page
            .locator('#all-platforms a')
            .evaluateAll(
              (links, source) =>
                links.some((link) => new RegExp(source).test(link.href)),
              pattern.source,
            ),
        ).toBe(true);
      // The Store first in the Windows card.
      await expect(page.locator('#windows .dl-row').first()).toContainText(
        'Microsoft Store',
      );
      // The MSI of the page language comes before the other one.
      const msis = await page
        .locator('#windows a[href$=".msi"]')
        .evaluateAll((links) => links.map((link) => link.href));
      expect(msis).toHaveLength(2);
      expect(msis[0].endsWith(msiFirst)).toBe(true);
    });
  }
});

test('#verify in the URL opens the details', async ({ page }) => {
  await prepare(page);
  await page.goto('download/#verify');
  await expect(page.locator('details#verify')).toHaveAttribute('open', '');
  await page.goto('download/');
  await expect(page.locator('details#verify')).not.toHaveAttribute('open', '');
  await page.evaluate(() => {
    location.hash = 'verify';
  });
  await expect(page.locator('details#verify')).toHaveAttribute('open', '');
});

test('#bridge-manual is «Coming soon», without a file or steps', async ({
  page,
}) => {
  await page.goto('download/#bridge-manual');
  const manual = page.locator('#bridge-manual');
  await expect(manual).toContainText('Coming soon');
  // Only the prose link to What's new (EXPERIENCE.md · State Patterns).
  await expect(manual.locator('ol')).toHaveCount(0);
  await expect(manual.locator('a')).toHaveCount(1);
  await expect(manual.locator('a')).toHaveAttribute(
    'href',
    '/vellum/changelog/',
  );
  await expect(page.locator('#verify')).not.toContainText(/\.dll/i);
});

for (const [width, agent] of [
  [320, agents.iphone],
  [320, agents.windows],
  [390, agents.linux],
  [1280, agents.windows],
]) {
  test(`no horizontal scroll at ${width} px (${agent.slice(13, 25)})`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      userAgent: agent,
      viewport: { width, height: 800 },
    });
    const page = await context.newPage();
    await prepare(page);
    await page.goto('es/descargar/#verify');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await context.close();
  });
}

test('in the browser, /download/#bridge from outside with Spanish saved redirects to /es/descargar/#bridge', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('vellum-landing-language', 'es'),
  );
  await page.goto('download/#bridge', { referer: 'https://www.reddit.com/' });
  await expect(page).toHaveURL(/\/vellum\/es\/descargar\/#bridge$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
});

for (const [path, changelog] of [
  ['download/', '/vellum/changelog/'],
  ['es/descargar/', '/vellum/es/novedades/'],
])
  test(`"/vellum/${path}" links What's new of its language at the release version`, async ({
    request,
  }) => {
    const html = await (await request.get(path)).text();
    // The release the page was built with (fixture locally, the API in CI).
    const version = /releases\/download\/v(\d+\.\d+\.\d+)\//.exec(html)?.[1];
    expect(version).toBeTruthy();
    const after = html.slice(html.indexOf('<section class="dl-after"'));
    expect(after).toContain(
      `class="link-ghost" href="${changelog}#${version}"`,
    );
    const update = html.slice(
      html.indexOf('id="update"'),
      html.indexOf('</section>', html.indexOf('id="update"')),
    );
    expect(update).toContain(`href="${changelog}"`);
    const target = await (
      await request.get(`http://127.0.0.1:4178${changelog}`)
    ).text();
    // A minor's entry or a patch alias inside it.
    expect(target).toContain(`id="${version}"`);
  });
