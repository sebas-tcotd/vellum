// Novedades and the Manifesto in the static build (spec
// landing-novedades-manifiesto-privacidad): anchors, the folded 0.x series,
// the literal letter, the Los Santos Pobres strip and its lightbox.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const consentKey = 'vellum-analytics-consent-v1';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    (key) => localStorage.setItem(key, 'rejected'),
    consentKey,
  );
});

/** Every minor of the 0.x series and their patch aliases. */
const minors = [
  '0.14.0',
  '0.13.0',
  '0.12.0',
  '0.11.0',
  '0.10.0',
  '0.9.0',
  '0.8.0',
  '0.7.0',
  '0.6.0',
  '0.5.0',
  '0.4.0',
  '0.3.0',
  '0.2.0',
];
const aliases = {
  '0.13.1': '0.13.0',
  '0.13.2': '0.13.0',
  '0.11.1': '0.11.0',
  '0.5.1': '0.5.0',
  '0.4.1': '0.4.0',
  '0.2.8': '0.2.0',
};

for (const [path, update] of [
  ['changelog/', '/vellum/download/#update'],
  ['es/novedades/', '/vellum/es/descargar/#update'],
]) {
  test(`"/vellum/${path}" serves every entry with its anchor, date and links without JS`, async ({
    request,
  }) => {
    const html = await (await request.get(path)).text();
    for (const version of ['1.0.0', ...minors]) {
      const start = html.indexOf(`<article class="cl-entry" id="${version}"`);
      expect(start, version).toBeGreaterThan(-1);
      const entry = html.slice(start, html.indexOf('</article>', start));
      expect(entry).toMatch(/<time datetime="\d{4}-\d{2}-\d{2}">/);
      expect(entry).toContain(
        `href="https://github.com/sebas-tcotd/vellum/releases/tag/v${version}"`,
      );
      expect(entry).toContain(`href="${update}"`);
    }
    for (const [patch, minor] of Object.entries(aliases)) {
      const alias = html.indexOf(`<span class="cl-alias" id="${patch}"`);
      expect(alias, patch).toBeGreaterThan(
        html.indexOf(`<article class="cl-entry" id="${minor}"`),
      );
    }
    // The 1.x series is open; 0.x is a closed <details>.
    expect(html.indexOf('id="1.0.0"')).toBeLessThan(
      html.indexOf('<details class="cl-fold"'),
    );
    expect(html.indexOf('<details class="cl-fold"')).toBeLessThan(
      html.indexOf('id="0.14.0"'),
    );
    expect(html).not.toMatch(/<details class="cl-fold" open/);
    expect(html).toContain(`href="${update}"`);
    expect(html).toMatch(/t30-ventana-vellum-day-(en|es)/);
    expect(html).not.toMatch(/POR CONFIRMAR|client:only/);
  });
}

test('a link to a folded version opens the 0.x series and shows the entry', async ({
  page,
}) => {
  await page.goto('changelog/#0.9.0');
  await expect(page.locator('details.cl-fold')).toHaveAttribute('open', '');
  await expect(page.locator('[id="0.9.0"]')).toBeInViewport();
  // A patch alias leads to its minor, also after a hash change.
  await page.evaluate(() => {
    location.hash = '#0.13.2';
  });
  await expect(page.locator('[id="0.13.0"]')).toBeInViewport();
});

test('without JS, the folded series opens with one click', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('es/novedades/');
  const fold = page.locator('details.cl-fold');
  await expect(fold).not.toHaveAttribute('open', '');
  await expect(page.locator('[id="0.9.0"] h3')).toBeHidden();
  await fold.locator('summary').click();
  await expect(fold).toHaveAttribute('open', '');
  await expect(page.locator('[id="0.9.0"] h3')).toBeVisible();
  await context.close();
});

test('every new page marks itself in the nav', async ({ request }) => {
  for (const [path, href, links] of [
    [
      'changelog/',
      '/vellum/changelog/',
      ['/vellum/guide/', '/vellum/manifesto/'],
    ],
    [
      'es/novedades/',
      '/vellum/es/novedades/',
      ['/vellum/es/guia/', '/vellum/es/manifiesto/'],
    ],
    [
      'manifesto/',
      '/vellum/manifesto/',
      ['/vellum/guide/', '/vellum/changelog/'],
    ],
    [
      'es/manifiesto/',
      '/vellum/es/manifiesto/',
      ['/vellum/es/guia/', '/vellum/es/novedades/'],
    ],
  ]) {
    const html = await (await request.get(path)).text();
    const nav = html.slice(
      html.indexOf('<header class="nav"'),
      html.indexOf('</header>'),
    );
    expect(nav).toContain(
      `class="nav__link" href="${href}" aria-current="page"`,
    );
    for (const other of links) expect(nav).toContain(`href="${other}"`);
  }
});

/** The letter as text: manifesto-final.md without its marks. */
function sourceText() {
  const source = readFileSync(
    new URL('./fixtures/manifesto-final.md', import.meta.url),
    'utf8',
  )
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  return source
    .split('\n')
    .filter((line) => !/^>\s*\[/.test(line) && line.trim() !== '---')
    .map((line) => line.replace(/^#+\s|^>\s/, '').replace(/\*/g, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

test('the Spanish letter matches manifesto-final.md sentence by sentence', async ({
  page,
}) => {
  await page.goto('es/manifiesto/');
  const text = await page.evaluate(() => {
    const letter = document.querySelector('.letter').cloneNode(true);
    for (const skip of letter.querySelectorAll(
      'figure, .letter__note, .letter__close, .eyebrow',
    ))
      skip.remove();
    for (const br of letter.querySelectorAll('br')) br.replaceWith(' ');
    return [...letter.querySelectorAll('h1, h2, p')]
      .map((block) => block.textContent)
      .join(' ');
  });
  const normalize = (value) => value.replace(/\s+/g, ' ').trim();
  const sentences = (value) => normalize(value).split(/(?<=[.?:,])\s+/);
  expect(sentences(text)).toEqual(sentences(sourceText()));
});

for (const [path, lang, gap, button, download] of [
  [
    'es/manifiesto/',
    'es',
    '10 · no se conservó',
    'Descargar Vellum',
    '/vellum/es/descargar/',
  ],
  ['manifesto/', 'en', '10 · not kept', 'Download Vellum', '/vellum/download/'],
])
  test(`"/vellum/${path}" shows its pauses, notes, visual moments, signature and one button`, async ({
    page,
  }) => {
    await page.goto(path);
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('.letter__chapter')).toHaveCount(6);
    await expect(page.locator('.letter__pause strong')).toHaveCount(12);
    await expect(page.locator('aside.letter__note')).toHaveCount(6);
    await expect(page.locator('.letter__break')).toHaveCount(8);
    for (const shot of ['T32', 'T11', 'T18', 'T21'])
      await expect(page.locator(`[data-shot="${shot}"] img`)).toHaveCount(1);
    await expect(
      page.locator('.lsp__strip a[data-lightbox="lsp"]'),
    ).toHaveCount(16);
    await expect(page.getByText(gap)).toBeVisible();
    await expect(page.locator('.lsp__pair a')).toHaveCount(2);
    await expect(page.locator('.letter__signature')).toContainText(
      '— Sebastian Vargas Pizango',
    );
    await expect(page.locator('.letter__signature')).toContainText(
      'Lima, 2026',
    );
    await expect(page.locator('.letter__coda')).toHaveCount(1);
    const buttons = page.locator('.letter a.button');
    await expect(buttons).toHaveCount(1);
    await expect(buttons).toHaveText(button);
    await expect(buttons).toHaveAttribute('href', download);
    const html = await (await page.request.get(path)).text();
    expect(html).not.toMatch(/POR CONFIRMAR|client:only|\[VISUAL|\[MARGEN/);
  });

test('each changelog entry heading is named by its version and title', async ({
  page,
}) => {
  await page.goto('changelog/');
  await expect(
    page.getByRole('heading', { level: 3, name: '1.0.0 Vellum, version 1.0' }),
  ).toBeVisible();
  await page.goto('es/novedades/#0.14.0');
  await expect(
    page.getByRole('heading', {
      level: 3,
      name: '0.14.0 Un Day más claro y una costa de tinta',
    }),
  ).toBeVisible();
});

test('the lightbox walks the strip with the arrows and returns focus on Esc', async ({
  page,
}) => {
  await page.goto('es/manifiesto/');
  const five = page.locator('.lsp__strip a[data-lightbox="lsp"]').nth(5);
  await five.scrollIntoViewIfNeeded();
  await five.click();
  const dialog = page.locator('dialog[data-lightbox-dialog]');
  await expect(dialog).toHaveAttribute('open', '');
  await expect(dialog.locator('[data-lightbox-caption]')).toHaveText(
    'Los Santos Pobres · 05',
  );
  await expect(page.getByRole('button', { name: 'Cerrar' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(dialog.locator('[data-lightbox-caption]')).toHaveText(
    'Los Santos Pobres · 06',
  );
  await expect(dialog.locator('[data-lightbox-live]')).toHaveText(
    'Snapshot 06',
  );
  // The gap of 10 is skipped: 09 → 11.
  for (let step = 0; step < 3; step += 1)
    await page.keyboard.press('ArrowRight');
  await expect(dialog.locator('[data-lightbox-caption]')).toHaveText(
    'Los Santos Pobres · 09',
  );
  await page.keyboard.press('ArrowRight');
  await expect(dialog.locator('[data-lightbox-caption]')).toHaveText(
    'Los Santos Pobres · 11',
  );
  await page.keyboard.press('Escape');
  await expect(dialog).not.toHaveAttribute('open', '');
  await expect(five).toBeFocused();
  // The loose 14 Bus / Train pair announces its own label too.
  await page.locator('.lsp__pair a').first().click();
  await page.keyboard.press('ArrowRight');
  await expect(dialog.locator('[data-lightbox-live]')).toHaveText(
    'Snapshot 14 · Train',
  );
  await page.keyboard.press('Escape');
});

test('without JS, a strip photo is a link to the large image', async ({
  browser,
  request,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('manifesto/');
  const link = page.locator('.lsp__strip a').first();
  const href = await link.getAttribute('href');
  expect(href).toMatch(/^\/vellum\/.+\.webp$/);
  expect((await request.get(`http://127.0.0.1:4178${href}`)).status()).toBe(
    200,
  );
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${href.replace(/[.?]/g, '\\$&')}$`));
  await context.close();
});

test('the manifesto fits 320 px without horizontal scroll', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  for (const path of ['manifesto/', 'es/novedades/']) {
    await page.goto(path);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      path,
    ).toBe(true);
  }
});
