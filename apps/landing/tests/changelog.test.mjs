// Unit tests of the changelog loader (src/lib/changelog.ts) and the letter
// parser of the manifesto (src/lib/letter.ts). No browser page needed.
import { readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  assembleChangelog,
  compareVersionsDesc,
} from '../src/lib/changelog.ts';
import { parseLetter } from '../src/lib/letter.ts';

const series = (lang, n) => ({
  path: `${lang}/_series-${n}.md`,
  frontmatter: { title: `Vellum ${n}.x` },
  html: '<p>Summary.</p>',
});
const entry = (lang, version, extra = {}) => ({
  path: `${lang}/${version}.md`,
  frontmatter: { version, date: '2026-10-04', title: 'Title', ...extra },
  html:
    lang === 'en'
      ? '<p>Intro.</p>\n<h2 id="fixed">Fixed</h2>\n<ul><li>b</li></ul>\n<h2 id="new">New</h2>\n<ul><li>a</li></ul>'
      : '<p>Intro.</p>\n<h2 id="nuevo">Nuevo</h2>\n<ul><li>a</li></ul>',
});
const both = (make) => ({ en: make('en'), es: make('es') });

test('orders versions by semver, not as text', () => {
  const versions = ['0.9.0', '0.13.0', '1.0.0', '0.2.0', '0.10.0'];
  expect(versions.sort(compareVersionsDesc)).toEqual([
    '1.0.0',
    '0.13.0',
    '0.10.0',
    '0.9.0',
    '0.2.0',
  ]);
});

test('groups entries by series, newest first, with patches and ordered groups', () => {
  const result = assembleChangelog(
    both((lang) => [
      series(lang, 0),
      series(lang, 1),
      entry(lang, '0.9.0'),
      entry(lang, '0.13.0', {
        patches: [{ version: '0.13.2', date: '2026-10-05' }],
      }),
      entry(lang, '1.0.0', { date: new Date('2026-10-15T00:00:00Z') }),
    ]),
  );
  expect(result.en.map((one) => one.major)).toEqual([1, 0]);
  expect(result.en[1].entries.map((one) => one.version)).toEqual([
    '0.13.0',
    '0.9.0',
  ]);
  expect(result.en[1].to).toBe('2026-10-05');
  expect(result.en[0].entries[0].date).toBe('2026-10-15');
  expect(result.en[1].entries[0].patches).toEqual([
    { version: '0.13.2', date: '2026-10-05' },
  ]);
  // New before Fixed, whatever the order in the file.
  expect(result.en[1].entries[0].groups.map((group) => group.kind)).toEqual([
    'new',
    'fixed',
  ]);
  expect(result.es[0].entries[0].groups[0].label).toBe('Nuevo');
});

test('a version with an English file but no Spanish one fails naming the file', () => {
  expect(() =>
    assembleChangelog({
      en: [series('en', 0), entry('en', '0.9.0'), entry('en', '0.10.0')],
      es: [series('es', 0), entry('es', '0.9.0')],
    }),
  ).toThrow(/changelog\/es\/0\.10\.0\.md: the file is missing/);
});

test('a missing frontmatter field fails naming the file', () => {
  expect(() =>
    assembleChangelog(
      both((lang) => [series(lang, 0), entry(lang, '0.9.0', { title: '' })]),
    ),
  ).toThrow(/changelog\/en\/0\.9\.0\.md: missing "title"/);
  expect(() =>
    assembleChangelog(
      both((lang) => [series(lang, 0), entry(lang, '0.9.0', { date: 'soon' })]),
    ),
  ).toThrow(/0\.9\.0\.md: "date" must be a date/);
  expect(() =>
    assembleChangelog(
      both((lang) => [
        series(lang, 0),
        entry(lang, '0.9.0', { version: '0.9.1' }),
      ]),
    ),
  ).toThrow(/"version" says 0\.9\.1 but the file is 0\.9\.0/);
  expect(() =>
    assembleChangelog(both((lang) => [entry(lang, '0.9.0')])),
  ).toThrow(/_series-0\.md: the series 0\.x has no summary/);
});

test('an unknown group heading fails instead of shipping a bare list', () => {
  expect(() =>
    assembleChangelog(
      both((lang) => [
        series(lang, 0),
        { ...entry(lang, '0.9.0'), html: '<p>Intro.</p><h2>Changes</h2>' },
      ]),
    ),
  ).toThrow(/unknown group "Changes"/);
});

test('the body guards: a repeated group, no intro, a foreign patch, a bad name', () => {
  const html = (body) =>
    both((lang) => [series(lang, 0), { ...entry(lang, '0.13.0'), html: body }]);
  expect(() =>
    assembleChangelog(
      html('<p>Intro.</p><h2>New</h2><ul></ul><h2>New</h2><ul></ul>'),
    ),
  ).toThrow(/0\.13\.0\.md: the group "New" appears twice/);
  expect(() =>
    assembleChangelog(html('<h2>New</h2><ul><li>a</li></ul>')),
  ).toThrow(/0\.13\.0\.md: the entry needs an intro paragraph/);
  expect(() =>
    assembleChangelog(
      both((lang) => [
        series(lang, 0),
        entry(lang, '0.13.0', {
          patches: [{ version: '0.12.1', date: '2026-10-03' }],
        }),
      ]),
    ),
  ).toThrow(/0\.13\.0\.md: the patch 0\.12\.1 does not belong to 0\.13\.0/);
  expect(() =>
    assembleChangelog(
      both((lang) => [
        series(lang, 0),
        { ...entry(lang, '0.13.0'), path: `${lang}/0.13.md` },
      ]),
    ),
  ).toThrow(/0\.13\.md: name it X\.Y\.Z\.md/);
});

test('a patch that repeats or equals its minor fails naming the file', () => {
  const withPatches = (list) =>
    both((lang) => [
      series(lang, 0),
      entry(lang, '0.13.0', {
        patches: list.map((version) => ({ version, date: '2026-10-03' })),
      }),
    ]);
  expect(() => assembleChangelog(withPatches(['0.13.1', '0.13.1']))).toThrow(
    /en\/0\.13\.0\.md: the patch 0\.13\.1 is listed twice/,
  );
  expect(() => assembleChangelog(withPatches(['0.13.0']))).toThrow(
    /en\/0\.13\.0\.md: the patch 0\.13\.0 is the entry itself/,
  );
});

test('English and Spanish of one version must agree on date, patches and shot', () => {
  const pair = (es) => ({
    en: [series('en', 0), entry('en', '0.13.0')],
    es: [series('es', 0), entry('es', '0.13.0', es)],
  });
  for (const differs of [
    { date: '2026-10-05' },
    { patches: [{ version: '0.13.1', date: '2026-10-03' }] },
    { shot: 'T30' },
  ])
    expect(() => assembleChangelog(pair(differs))).toThrow(
      /es\/0\.13\.0\.md: its date, patches or shot differ from en\/0\.13\.0\.md/,
    );
  expect(() => assembleChangelog(pair({}))).not.toThrow();
});

test('the committed changelog has every version in both languages', () => {
  const dir = new URL('../src/content/changelog/', import.meta.url);
  const en = readdirSync(new URL('en/', dir)).sort();
  const es = readdirSync(new URL('es/', dir)).sort();
  expect(en).toEqual(es);
  for (const minor of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
    expect(en).toContain(`0.${minor}.0.md`);
  expect(en).toContain('1.0.0.md');
  expect(en).toContain('_series-0.md');
  expect(en).toContain('_series-1.md');
});

test('the letter parser keeps pauses, notes, visuals and the signature', () => {
  const blocks = parseLetter(
    '# Title\n\nOne.\n\n> Note.\n\n**Pause.**\n\n[bleed]\n\n---\n\n## Chapter\n\n— Name\nPlace\n\n~ Coda.',
  );
  expect(blocks).toEqual([
    { type: 'title', text: 'Title' },
    { type: 'paragraph', text: 'One.', note: 'Note.' },
    { type: 'pause', text: 'Pause.' },
    { type: 'visual', visual: 'bleed' },
    { type: 'break' },
    { type: 'chapter', text: 'Chapter' },
    { type: 'signature', name: 'Name', place: 'Place' },
    { type: 'coda', text: 'Coda.' },
  ]);
  expect(() => parseLetter('[timelapse]')).toThrow(/Unknown visual/);
});
