import type { MarkdownInstance } from 'astro';
import {
  assembleChangelog,
  type ChangelogLang,
  type ChangelogSeries,
  type ChangelogSource,
} from './changelog';

/**
 * Reads the committed changelog markdown at build time (no AI, no API: the
 * files are the source). Astro renders the `.md` without extra dependencies.
 */
const files = import.meta.glob<MarkdownInstance<Record<string, unknown>>>(
  '../content/changelog/{en,es}/*.md',
  { eager: true },
);

let cache: Promise<Record<ChangelogLang, ChangelogSeries[]>> | null = null;

/** Series of both languages, newest first. Fails the build on a bad file. */
export function loadChangelog(): Promise<
  Record<ChangelogLang, ChangelogSeries[]>
> {
  cache ??= (async () => {
    const sources: Record<ChangelogLang, ChangelogSource[]> = {
      en: [],
      es: [],
    };
    for (const [path, file] of Object.entries(files)) {
      const relative = path.slice(
        path.indexOf('/changelog/') + '/changelog/'.length,
      );
      const lang = relative.slice(0, 2) as ChangelogLang;
      sources[lang].push({
        path: relative,
        frontmatter: file.frontmatter,
        html: await file.compiledContent(),
      });
    }
    return assembleChangelog(sources);
  })();
  return cache;
}
