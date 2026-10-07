// Unit tests of the language rules, OS detection, shot file choice and the
// download band decision
// (EXPERIENCE.md · Idioma and State Patterns). No browser page needed.
import { expect, test } from '@playwright/test';
import { downloadBand } from '../src/data/release.ts';
import { pickShotFile } from '../src/lib/shot-file.ts';
import { decideLanguage } from '../src/scripts/language.ts';
import { classifyVisitor, detectPlatform } from '../src/scripts/platform.ts';

const base = '/vellum/';
const input = (overrides = {}) => ({
  pathname: '/vellum/',
  search: '',
  hash: '',
  base,
  origin: 'https://sebas-tcotd.github.io',
  referrer: 'https://www.reddit.com/',
  pairs: [['', 'es/']],
  stored: null,
  storageOk: true,
  firstNavigation: true,
  browserLanguage: 'en-US',
  ...overrides,
});

test('an external first visit with a Spanish browser goes to /es/, keeping the hash', () => {
  expect(
    decideLanguage(input({ hash: '#download', browserLanguage: 'es-PE' })),
  ).toEqual({ url: '/vellum/es/#download', save: null });
});

test('a saved Spanish choice also redirects an external English entry', () => {
  expect(decideLanguage(input({ stored: 'es' })).url).toBe('/vellum/es/');
});

test('a saved English choice wins over a Spanish browser', () => {
  expect(
    decideLanguage(input({ stored: 'en', browserLanguage: 'es-ES' })).url,
  ).toBeNull();
});

test('a Spanish URL is never redirected, whatever was saved', () => {
  for (const referrer of ['', 'https://www.reddit.com/'])
    expect(
      decideLanguage(
        input({ pathname: '/vellum/es/', stored: 'en', referrer }),
      ),
    ).toEqual({ url: null, save: null });
});

test('?lang=en on /es/ leads to the English page with its hash and saves en', () => {
  expect(
    decideLanguage(
      input({ pathname: '/vellum/es/', search: '?lang=en', hash: '#download' }),
    ),
  ).toEqual({ url: '/vellum/?lang=en#download', save: 'en' });
});

test('?lang= on its own language only saves the choice and turns redirection off', () => {
  expect(
    decideLanguage(input({ search: '?lang=en', browserLanguage: 'es' })),
  ).toEqual({ url: null, save: 'en' });
  expect(decideLanguage(input({ search: '?lang=fr' }))).toEqual({
    url: null,
    save: null,
  });
});

test('no redirect without storage, after the first page, or from this same site', () => {
  const spanish = { browserLanguage: 'es' };
  expect(
    decideLanguage(input({ ...spanish, storageOk: false })).url,
  ).toBeNull();
  expect(
    decideLanguage(input({ ...spanish, firstNavigation: false })).url,
  ).toBeNull();
  expect(
    decideLanguage(
      input({
        ...spanish,
        referrer: 'https://sebas-tcotd.github.io/vellum/es/',
      }),
    ).url,
  ).toBeNull();
});

test('pages outside the bilingual pairs (privacy) are never redirected', () => {
  expect(
    decideLanguage(
      input({
        pathname: '/vellum/privacy/',
        browserLanguage: 'es',
        stored: 'es',
      }),
    ).url,
  ).toBeNull();
});

test('a release without assets sends every platform to GitHub Releases', () => {
  const empty = downloadBand({
    version: '1.0.0',
    tag: 'v1.0.0',
    url: 'https://example.test',
    platforms: { windows: [], macos: [], linux: [] },
  });
  expect(empty.direct).toBe(false);
  for (const platform of empty.platforms)
    expect(platform.fallbackUrl).toBe(
      'https://github.com/sebas-tcotd/vellum/releases/latest',
    );
  expect(downloadBand(null).direct).toBe(false);
});

test('a referrer from another Pages project of the origin is an external entry', () => {
  expect(
    decideLanguage(
      input({
        browserLanguage: 'es',
        referrer: 'https://sebas-tcotd.github.io/other-project/',
      }),
    ).url,
  ).toBe('/vellum/es/');
});

test('a release missing one platform keeps direct links for the others', () => {
  const file = {
    format: 'exe',
    name: 'a.exe',
    url: 'u',
    size: 1,
    sha256: null,
  };
  const band = downloadBand({
    version: '1.0.0',
    tag: 'v1.0.0',
    url: 'https://example.test',
    platforms: { windows: [file], macos: [], linux: [file] },
  });
  expect(band.direct).toBe(true);
  expect(band.platforms.map((platform) => platform.fallbackUrl)).toEqual([
    null,
    'https://github.com/sebas-tcotd/vellum/releases/latest',
    null,
  ]);
});

test('shot files: per-language final, then neutral final, then stand-in', () => {
  const shot = { file: 't22-shell-windows', standIn: { file: 'old' } };
  expect(
    pickShotFile(
      shot,
      'es',
      ['t22-shell-windows-en', 't22-shell-windows-es'],
      ['old'],
    ),
  ).toEqual({ kind: 'final', name: 't22-shell-windows-es' });
  expect(pickShotFile(shot, 'es', ['t22-shell-windows'], ['old'])).toEqual({
    kind: 'final',
    name: 't22-shell-windows',
  });
  expect(pickShotFile(shot, 'es', ['t22-shell-windows-en'], ['old'])).toEqual({
    kind: 'stand-in',
    name: 'old',
  });
  expect(pickShotFile(shot, 'en', [], [])).toEqual({ kind: 'missing' });
});

const desktop = { maxTouchPoints: 0 };
for (const [name, platform, expected] of [
  [
    'Windows',
    { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    'windows',
  ],
  [
    'macOS',
    { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
    'macos',
  ],
  ['Linux', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' }, 'linux'],
  ['Client hints', { userAgent: 'Mozilla/5.0', uaPlatform: 'Linux' }, 'linux'],
  [
    'iPhone',
    { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
    null,
  ],
  ['Android', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' }, null],
  [
    'iPad with a desktop UA',
    {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      maxTouchPoints: 5,
    },
    null,
  ],
  ['ChromeOS', { userAgent: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)' }, null],
  [
    'mobile client hint',
    { userAgent: 'Mozilla/5.0', uaPlatform: 'Windows', mobile: true },
    null,
  ],
]) {
  test(`OS detection: ${name} → ${expected}`, () => {
    expect(detectPlatform({ ...desktop, ...platform })).toBe(expected);
  });
}

const pairs = [
  ['', 'es/'],
  ['download/', 'es/descargar/'],
  ['guide/', 'es/guia/'],
];

test('an external entry to /guide/#open with a saved Spanish choice lands on /es/guia/#open', () => {
  expect(
    decideLanguage(
      input({
        pathname: '/vellum/guide/',
        hash: '#open',
        stored: 'es',
        pairs,
      }),
    ),
  ).toEqual({ url: '/vellum/es/guia/#open', save: null });
});

test('/es/guia/?lang=en leads to /guide/ with the step hash and saves en', () => {
  expect(
    decideLanguage(
      input({
        pathname: '/vellum/es/guia/',
        search: '?lang=en',
        hash: '#bridge',
        pairs,
      }),
    ),
  ).toEqual({ url: '/vellum/guide/?lang=en#bridge', save: 'en' });
});

test('an external entry to /download/#bridge with a saved Spanish choice lands on /es/descargar/#bridge', () => {
  expect(
    decideLanguage(
      input({
        pathname: '/vellum/download/',
        hash: '#bridge',
        stored: 'es',
        pairs,
      }),
    ),
  ).toEqual({ url: '/vellum/es/descargar/#bridge', save: null });
});

test('/es/descargar/?lang=en leads to /download/ with the hash and saves en', () => {
  expect(
    decideLanguage(
      input({
        pathname: '/vellum/es/descargar/',
        search: '?lang=en',
        hash: '#verify',
        pairs,
      }),
    ),
  ).toEqual({ url: '/vellum/download/?lang=en#verify', save: 'en' });
});

for (const [name, platform, expected] of [
  [
    'Windows',
    { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    'windows',
  ],
  [
    'macOS',
    { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
    'macos',
  ],
  ['Linux', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' }, 'linux'],
  [
    'iPhone',
    { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
    'mobile',
  ],
  [
    'Android',
    { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' },
    'mobile',
  ],
  [
    'iPad with a desktop UA',
    {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      maxTouchPoints: 5,
    },
    'mobile',
  ],
  [
    'mobile client hint',
    { userAgent: 'Mozilla/5.0', uaPlatform: 'Windows', mobile: true },
    'mobile',
  ],
  [
    'ChromeOS',
    { userAgent: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)' },
    'unknown',
  ],
  ['nothing recognizable', { userAgent: 'Mozilla/5.0 (FreeBSD)' }, 'unknown'],
]) {
  test(`visitor kind: ${name} → ${expected}`, () => {
    const visitor = { ...desktop, ...platform };
    const kind = classifyVisitor(visitor);
    expect(kind).toBe(expected);
    // Consistent with the band's detection.
    expect(detectPlatform(visitor)).toBe(
      kind === 'mobile' || kind === 'unknown' ? null : kind,
    );
  });
}
