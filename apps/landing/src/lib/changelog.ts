/**
 * Novedades (EXPERIENCE.md · Páginas · Novedades): the committed markdown of
 * `src/content/changelog/{en,es}/` turned into series and entries. Pure, so
 * it is unit-tested without the build; `changelog-load.ts` feeds it the
 * files with `import.meta.glob`.
 *
 * - `X.Y.Z.md`: one entry per minor (frontmatter `version`, `date`, `title`
 *   and optional `patches`), an intro paragraph and `## New` / `## Improved` /
 *   `## Fixed` groups (`## Nuevo` / `## Mejorado` / `## Arreglado`), plus
 *   an optional `shot` of the registry.
 * - `_series-N.md`: the summary of the series N.x (frontmatter `title`).
 *
 * Every file must exist in both languages, and every field must be there:
 * otherwise the build fails naming the file.
 */

export type ChangelogLang = 'en' | 'es';

/** A markdown file as the loader reads it. */
export interface ChangelogSource {
  /** Path relative to the changelog folder, e.g. `en/0.13.0.md`. */
  path: string;
  frontmatter: Record<string, unknown>;
  /** The body rendered to HTML. */
  html: string;
}

export type GroupKind = 'new' | 'improved' | 'fixed';

export interface ChangelogGroup {
  kind: GroupKind;
  label: string;
  html: string;
}

export interface ChangelogPatch {
  version: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  /** Patch releases folded into this minor; each keeps an alias anchor. */
  patches: ChangelogPatch[];
  /** Optional shot id of the registry shown with the entry (`shot: T30`). */
  shot?: string;
  /** HTML before the first group. */
  intro: string;
  groups: ChangelogGroup[];
}

export interface ChangelogSeries {
  major: number;
  title: string;
  /** Summary HTML. */
  summary: string;
  /** Oldest and newest dates of its entries (patches included). */
  from: string;
  to: string;
  /** Newest first. */
  entries: ChangelogEntry[];
}

/** Group headings per language, in the order they are shown. */
export const GROUP_LABELS: Record<ChangelogLang, Record<GroupKind, string>> = {
  en: { new: 'New', improved: 'Improved', fixed: 'Fixed' },
  es: { new: 'Nuevo', improved: 'Mejorado', fixed: 'Arreglado' },
};

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
const ENTRY_FILE = /^(\d+\.\d+\.\d+)\.md$/;
const SERIES_FILE = /^_series-(\d+)\.md$/;

const LANGS: ChangelogLang[] = ['en', 'es'];

function fail(path: string, problem: string): never {
  throw new Error(`Changelog src/content/changelog/${path}: ${problem}`);
}

/** Orders `a` before `b` when `a` is the newer version. */
export function compareVersionsDesc(a: string, b: string): number {
  const pa = VERSION.exec(a)?.slice(1).map(Number) ?? [];
  const pb = VERSION.exec(b)?.slice(1).map(Number) ?? [];
  for (let i = 0; i < 3; i += 1) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** YAML turns `2026-10-04` into a Date; both forms become `YYYY-MM-DD`. */
function isoDate(value: unknown, path: string, field: string): string {
  // The parser's Date may come from another realm: no `instanceof`.
  if (
    Object.prototype.toString.call(value) === '[object Date]' &&
    !Number.isNaN((value as Date).getTime())
  )
    return (value as Date).toISOString().slice(0, 10);
  // Astro hands the frontmatter Date over serialized (`…T00:00:00.000Z`).
  const match =
    typeof value === 'string'
      ? /^(\d{4}-\d{2}-\d{2})(?:T00:00:00(?:\.000)?Z)?$/.exec(value)
      : null;
  if (match?.[1]) return match[1];
  return fail(path, `"${field}" must be a date YYYY-MM-DD`);
}

function text(value: unknown, path: string, field: string): string {
  if (typeof value !== 'string' || value.trim() === '')
    return fail(path, `missing "${field}" in the frontmatter`);
  return value.trim();
}

/** Splits the body at its `<h2>` group headings. */
export function splitGroups(
  html: string,
  lang: ChangelogLang,
  path: string,
): { intro: string; groups: ChangelogGroup[] } {
  const kinds = Object.entries(GROUP_LABELS[lang]) as [GroupKind, string][];
  const parts = html.split(/<h2[^>]*>([\s\S]*?)<\/h2>/);
  const intro = (parts[0] ?? '').trim();
  const groups: ChangelogGroup[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const label = (parts[i] ?? '').replace(/<[^>]+>/g, '').trim();
    const kind = kinds.find(([, name]) => name === label)?.[0];
    if (!kind)
      fail(
        path,
        `unknown group "${label}" (use ${Object.values(GROUP_LABELS[lang]).join(', ')})`,
      );
    if (groups.some((group) => group.kind === kind))
      fail(path, `the group "${label}" appears twice`);
    groups.push({ kind, label, html: (parts[i + 1] ?? '').trim() });
  }
  if (!intro)
    fail(path, 'the entry needs an intro paragraph before its groups');
  const order = kinds.map(([kind]) => kind);
  groups.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return { intro, groups };
}

function patches(
  value: unknown,
  entry: string,
  path: string,
): ChangelogPatch[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return fail(path, '"patches" must be a list');
  const seen = new Set<string>();
  return value.map((patch: unknown) => {
    const record = (patch ?? {}) as Record<string, unknown>;
    const version = text(record.version, path, 'patches.version');
    const [major, minor] = entry.split('.');
    if (!VERSION.test(version) || !version.startsWith(`${major}.${minor}.`))
      fail(path, `the patch ${version} does not belong to ${entry}`);
    // Each patch is an alias anchor: it must be unique and not the minor.
    if (version === entry)
      fail(path, `the patch ${version} is the entry itself`);
    if (seen.has(version)) fail(path, `the patch ${version} is listed twice`);
    seen.add(version);
    return { version, date: isoDate(record.date, path, 'patches.date') };
  });
}

/**
 * Builds the series of both languages. Throws, naming the file, when a file
 * has no pair in the other language, misses a frontmatter field, disagrees
 * with its pair on date, patches or shot, or repeats a patch.
 */
export function assembleChangelog(
  sources: Record<ChangelogLang, ChangelogSource[]>,
): Record<ChangelogLang, ChangelogSeries[]> {
  const names = Object.fromEntries(
    LANGS.map((lang) => [
      lang,
      new Set(
        sources[lang].map((source) => source.path.slice(lang.length + 1)),
      ),
    ]),
  ) as Record<ChangelogLang, Set<string>>;
  for (const lang of LANGS) {
    const other = lang === 'en' ? 'es' : 'en';
    for (const name of names[lang])
      if (!names[other].has(name))
        fail(
          `${other}/${name}`,
          `the file is missing (${lang}/${name} exists; every version needs its English and Spanish files)`,
        );
  }

  const result = {} as Record<ChangelogLang, ChangelogSeries[]>;
  for (const lang of LANGS) {
    const entries: ChangelogEntry[] = [];
    const summaries = new Map<number, { title: string; summary: string }>();
    for (const source of sources[lang]) {
      const name = source.path.slice(lang.length + 1);
      const series = SERIES_FILE.exec(name);
      if (series) {
        summaries.set(Number(series[1]), {
          title: text(source.frontmatter.title, source.path, 'title'),
          summary: source.html.trim(),
        });
        continue;
      }
      const file = ENTRY_FILE.exec(name);
      if (!file)
        fail(source.path, 'name it X.Y.Z.md (an entry) or _series-N.md');
      const version = text(source.frontmatter.version, source.path, 'version');
      if (version !== file[1])
        fail(
          source.path,
          `"version" says ${version} but the file is ${file[1]}`,
        );
      entries.push({
        version,
        date: isoDate(source.frontmatter.date, source.path, 'date'),
        title: text(source.frontmatter.title, source.path, 'title'),
        patches: patches(source.frontmatter.patches, version, source.path),
        ...(typeof source.frontmatter.shot === 'string'
          ? { shot: source.frontmatter.shot }
          : {}),
        ...splitGroups(source.html, lang, source.path),
      });
    }

    entries.sort((a, b) => compareVersionsDesc(a.version, b.version));
    // The English and Spanish files of a version must agree on its facts.
    if (lang === 'es') {
      const english = new Map(
        result.en
          .flatMap((one) => one.entries)
          .map((entry) => [entry.version, entry]),
      );
      for (const entry of entries) {
        const other = english.get(entry.version);
        const facts = (one: ChangelogEntry | undefined) =>
          JSON.stringify([one?.date, one?.patches, one?.shot ?? null]);
        if (facts(entry) !== facts(other))
          fail(
            `es/${entry.version}.md`,
            `its date, patches or shot differ from en/${entry.version}.md`,
          );
      }
    }
    const majors = [
      ...new Set(entries.map((entry) => Number(entry.version.split('.')[0]))),
    ].sort((a, b) => b - a);
    result[lang] = majors.map((major) => {
      const summary = summaries.get(major);
      if (!summary)
        fail(
          `${lang}/_series-${major}.md`,
          `the series ${major}.x has no summary`,
        );
      const own = entries.filter((entry) =>
        entry.version.startsWith(`${major}.`),
      );
      const dates = own
        .flatMap((entry) => [entry.date, ...entry.patches.map((p) => p.date)])
        .sort();
      return {
        major,
        ...summary,
        from: dates[0] ?? '',
        to: dates[dates.length - 1] ?? '',
        entries: own,
      };
    });
  }
  return result;
}
