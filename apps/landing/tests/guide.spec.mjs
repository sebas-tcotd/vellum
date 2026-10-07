// The Guide in the static build (EXPERIENCE.md · Páginas · Guía): the I/O
// matrix of spec-landing-pagina-guia, with and without JS and at 320 px.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { BRIDGE_WORKSHOP_URL } from '../src/content/links.ts';
import { SITE } from '../src/content/site.ts';

const consentKey = 'vellum-analytics-consent-v1';
const stepIds = ['install', 'bridge', 'export', 'open', 'explore', 'share'];
const pages = {
  en: {
    path: 'guide/',
    download: '/vellum/download/',
    h1: 'From nothing to seeing your city.',
    nav: 'Guide',
  },
  es: {
    path: 'es/guia/',
    download: '/vellum/es/descargar/',
    h1: 'De cero a ver tu ciudad.',
    nav: 'Guía',
  },
};

/** Visible labels of the app and of Bridge that the Guide quotes. */
const uiLabels = {
  en: {
    app: [
      'Open file',
      'Drop your city (.vellummap or .cslmap) here',
      'Layers',
      'Map style',
      'Schematic view',
      'Export Map',
      'Background',
      'White',
      'Dark',
      'Transparent',
    ],
    bridge: ['Export city'],
  },
  es: {
    app: [
      'Abrir archivo',
      'Arrastra tu ciudad (.vellummap o .cslmap) aquí',
      'Capas',
      'Estilo de mapa',
      'Vista esquemática',
      'Exportar mapa',
      'Fondo',
      'Blanco',
      'Oscuro',
      'Transparente',
    ],
    bridge: ['Exportar ciudad'],
  },
};

/** Every string value of a nested locale object. */
function values(object) {
  return Object.values(object).flatMap((value) =>
    typeof value === 'string' ? [value] : values(value),
  );
}

const repo = new URL('../../../', import.meta.url);
const locales = Object.fromEntries(
  ['en', 'es'].map((lang) => [
    lang,
    values(
      JSON.parse(
        readFileSync(
          new URL(`packages/ui/src/i18n/locales/${lang}.json`, repo),
          'utf8',
        ),
      ),
    ),
  ]),
);
const bridgeStrings = readFileSync(
  new URL('tools/vellum-bridge/src/Strings.cs', repo),
  'utf8',
);

test.beforeEach(({ page }) =>
  page.addInitScript(
    (key) => localStorage.setItem(key, 'rejected'),
    consentKey,
  ),
);

for (const [lang, t] of Object.entries(pages)) {
  test(`"/vellum/${t.path}": one h1, six steps in an <ol> and no skipped heading level`, async ({
    page,
  }) => {
    await page.goto(t.path);
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText(t.h1);
    const steps = page.locator('ol.guide-steps > li');
    expect(
      await steps.evaluateAll((items) => items.map((li) => li.id)),
    ).toEqual(stepIds);
    for (const id of stepIds)
      await expect(
        page.locator(`#${id}`).getByRole('heading', { level: 2 }),
      ).toHaveCount(1);
    const levels = await page
      .locator('h1, h2, h3, h4, h5, h6')
      .evaluateAll((headings) => headings.map((h) => Number(h.tagName[1])));
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i += 1)
      expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
    const html = await page.content();
    expect(html).not.toMatch(/POR CONFIRMAR|URL de Sebas|tiempo estimado/i);
    // The essential step: number in the link colour and a visible flag.
    await expect(page.locator('#bridge.guide-step--required')).toHaveCount(1);
    await expect(page.locator('#bridge .guide-step__flag')).toBeVisible();
  });

  test(`"/vellum/${t.path}": the placeholder only where a shot is missing; T28 with its version`, async ({
    page,
  }) => {
    await page.goto(t.path);
    const figures = page.locator('.guide-step__figure');
    await expect(figures).toHaveCount(6);
    for (const figure of await figures.all()) {
      const shot = figure.locator('[data-shot]');
      if ((await shot.getAttribute('data-shot-status')) === 'missing') {
        await expect(shot.locator('img')).toHaveCount(0);
        await expect(shot.locator('.shot-missing__id')).toHaveText(
          (await shot.getAttribute('data-shot')) ?? '',
        );
        await expect(figure.locator('figcaption')).toHaveCount(0);
      } else {
        await expect(shot.locator('img')).not.toHaveAttribute('alt', '');
        await expect(figure.locator('figcaption')).toHaveText(/^Vellum \d/);
      }
    }
    const t28 = page.locator('#open [data-shot="T28"]');
    await expect(t28).toHaveAttribute('data-shot-status', 'final');
    await expect(t28.locator('img')).toHaveAttribute(
      'alt',
      lang === 'es' ? /bienvenida de Vellum/ : /Vellum welcome/,
    );
    await expect(page.locator('#open figcaption')).toHaveText('Vellum 0.14.0');
    // Delivered on 2026-10-07; T26 is still pending.
    for (const id of ['T25', 'T27', 'T29', 'T30'])
      await expect(page.locator(`[data-shot="${id}"]`)).toHaveAttribute(
        'data-shot-status',
        'final',
      );
    await expect(page.locator('[data-shot="T26"]')).toHaveAttribute(
      'data-shot-status',
      'missing',
    );
  });

  test(`"/vellum/${t.path}": step links lead to the download page of its language`, async ({
    page,
  }) => {
    await page.goto(t.path);
    const install = page.locator('#install');
    await expect(install.locator(`a[href="${t.download}"]`)).toHaveCount(1);
    await expect(
      install.locator(`a[href="${t.download}#smartscreen"]`),
    ).toHaveCount(1);
    const bridge = page.locator('#bridge');
    await expect(
      bridge.locator(`a[href="${t.download}#bridge-manual"]`),
    ).toHaveCount(1);
    if (BRIDGE_WORKSHOP_URL === null) {
      await expect(
        bridge.locator(`a[href="${t.download}#bridge"]`),
      ).toHaveCount(1);
      await expect(bridge.locator('.pending')).toHaveCount(0);
    } else {
      await expect(
        bridge.locator(`a[href="${BRIDGE_WORKSHOP_URL}"]`),
      ).toHaveCount(1);
    }
    await expect(
      page.locator('a[href="https://github.com/sebas-tcotd/vellum/issues"]'),
    ).toHaveCount(1);
    const issues = page.locator(
      'a[href="https://github.com/sebas-tcotd/vellum/issues"]',
    );
    await expect(issues).toHaveAttribute('target', '_blank');
    await expect(issues).toHaveAttribute('rel', 'noopener');
    await expect(issues.locator('.visually-hidden')).toHaveText(
      SITE[lang].newTab,
    );
    await expect(install.locator(`a[href="${t.download}#macos"]`)).toHaveCount(
      1,
    );
  });

  test(`"/vellum/${t.path}": every quoted UI label exists as is in the app`, async ({
    page,
  }) => {
    await page.goto(t.path);
    const text = await page.locator('main').innerText();
    for (const label of uiLabels[lang].app) {
      expect(locales[lang], `app label «${label}»`).toContain(label);
      expect(text, `the Guide quotes «${label}»`).toContain(label);
    }
    for (const label of uiLabels[lang].bridge) {
      expect(bridgeStrings, `Bridge label «${label}»`).toContain(`"${label}"`);
      expect(text).toContain(label);
    }
  });

  test(`"/vellum/${t.path}": the nav marks the Guide`, async ({ page }) => {
    await page.goto(t.path);
    const link = page.locator('.nav__links').getByRole('link', {
      name: t.nav,
      exact: true,
    });
    await expect(link).toHaveAttribute('href', `/vellum/${t.path}`);
    await expect(link).toHaveAttribute('aria-current', 'page');
  });

  test(`"/vellum/${t.path}": with JS the index marks the step being read`, async ({
    page,
  }) => {
    const current = page.locator('.guide-toc [aria-current]');
    // Top of the page: the first step.
    await page.goto(t.path);
    await expect(current).toHaveCount(1);
    await expect(current).toHaveAttribute('href', '#install');
    await expect(current).toHaveAttribute('aria-current', 'location');
    // An anchor in the URL.
    await page.goto(`${t.path}#open`);
    await expect(current).toHaveAttribute('href', '#open');
    await page.evaluate(() =>
      document.getElementById('share').scrollIntoView({ block: 'start' }),
    );
    await expect(current).toHaveAttribute('href', '#share');
    // The end of the page marks the last target, even on a tall viewport.
    await page.setViewportSize({ width: 1280, height: 1600 });
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    await expect(current).toHaveAttribute('href', '#advanced');
    await expect(current).toHaveAttribute('aria-current', 'location');
  });
}

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  for (const t of Object.values(pages))
    test(`"/vellum/${t.path}" shows every step and marks none in the index`, async ({
      page,
    }) => {
      await page.goto(`${t.path}#export`);
      for (const id of stepIds)
        await expect(page.locator(`#${id}`)).toBeVisible();
      await expect(page.locator('.guide-toc__list a')).toHaveCount(7);
      await expect(page.locator('.guide-toc [aria-current]')).toHaveCount(0);
      await expect(page.locator('#advanced')).toBeVisible();
    });
});

test('at 320 px: one column, the index above the steps and no horizontal scroll', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 320, height: 720 },
  });
  const page = await context.newPage();
  for (const t of Object.values(pages)) {
    await page.goto(t.path);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const toc = await page.locator('.guide-toc').boundingBox();
    const first = await page.locator('#install').boundingBox();
    expect(toc && first && toc.y + toc.height <= first.y).toBe(true);
    const figure = await page
      .locator('#install .guide-step__figure')
      .boundingBox();
    const title = await page.locator('#install h2').boundingBox();
    expect(figure && title && figure.y > title.y).toBe(true);
  }
  await context.close();
});

test('an external entry to /guide/#open with Spanish saved lands on /es/guia/#open', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('vellum-landing-language', 'es'),
  );
  await page.goto('guide/#open', { referer: 'https://www.reddit.com/' });
  await expect(page).toHaveURL(/\/vellum\/es\/guia\/#open$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
});

for (const [path, guide, label] of [
  ['es/descargar/', '/vellum/es/guia/', /^Abrir la guía rápida\s*→$/],
  ['download/', '/vellum/guide/', /^Open the quick guide\s*→$/],
])
  test(`the post-download block of "/vellum/${path}" opens the Guide`, async ({
    page,
  }) => {
    await page.goto(path);
    const button = page.locator('.dl-after a.button');
    await expect(button).toHaveText(label);
    await expect(button).toHaveAttribute('href', guide);
  });

test('every published page links the Guide of its language in the nav and the footer', async ({
  request,
}) => {
  for (const [path, href] of [
    ['', '/vellum/guide/'],
    ['es/', '/vellum/es/guia/'],
    ['download/', '/vellum/guide/'],
    ['es/descargar/', '/vellum/es/guia/'],
    ['guide/', '/vellum/guide/'],
    ['es/guia/', '/vellum/es/guia/'],
    ['changelog/', '/vellum/guide/'],
    ['es/novedades/', '/vellum/es/guia/'],
    ['manifesto/', '/vellum/guide/'],
    ['es/manifiesto/', '/vellum/es/guia/'],
    ['privacy/', '/vellum/guide/'],
    ['es/privacidad/', '/vellum/es/guia/'],
  ]) {
    const html = await (await request.get(path)).text();
    expect(html).toContain(`class="nav__link" href="${href}"`);
    const footer = html.slice(html.indexOf('<footer class="footer"'));
    expect(footer, `footer of "/vellum/${path}"`).toContain(`href="${href}"`);
  }
});
