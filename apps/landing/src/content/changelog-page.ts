import type { Lang } from './routes';

/**
 * Chrome of Novedades (EXPERIENCE.md · Páginas · Novedades). The entries
 * themselves are the committed markdown of `src/content/changelog/`.
 * Strings go through `rich()` (`*em*`, `**strong**`, `` `code` ``).
 */
export interface ChangelogPageCopy {
  meta: { title: string; description: string };
  header: {
    eyebrow: string;
    title: string;
    lede: string;
    update: string;
    source: string;
    sourceLink: string;
  };
  series: {
    /** «Series 1.x». */
    label: string;
    /** Number of published versions, patches included. */
    versions: (count: number) => string;
    /** Summary of a folded series. */
    show: (count: number) => string;
  };
  entry: {
    /** «includes 0.13.1 and 0.13.2». */
    includes: (versions: string[]) => string;
    technical: string;
    update: string;
    permalink: string;
  };
}

function list(items: string[], and: string): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`;
}

export const CHANGELOG_PAGE: Record<Lang, ChangelogPageCopy> = {
  en: {
    meta: {
      title: 'What’s new · Vellum',
      description:
        'Every version of Vellum in a few lines: what is new, what got better and what was fixed.',
    },
    header: {
      eyebrow: 'What’s new',
      title: 'What changed, *told for people.*',
      lede: 'Every version of Vellum in a few lines: what is new, what got better and what we fixed.',
      update: 'How to update',
      source: 'Written from the technical record:',
      sourceLink: 'CHANGELOG.md on GitHub',
    },
    series: {
      label: 'Series',
      versions: (count) => (count === 1 ? '1 version' : `${count} versions`),
      show: (count) =>
        count === 1 ? 'Show its entry' : `Show its ${count} entries`,
    },
    entry: {
      includes: (versions) => `includes ${list(versions, 'and')}`,
      technical: 'Technical details',
      update: 'How to update',
      permalink: 'Link to this version',
    },
  },
  es: {
    meta: {
      title: 'Novedades · Vellum',
      description:
        'Cada versión de Vellum en pocas líneas: qué es nuevo, qué mejoró y qué se arregló.',
    },
    header: {
      eyebrow: 'Novedades',
      title: 'Lo que cambió, *contado para personas.*',
      lede: 'Cada versión de Vellum en pocas líneas: qué es nuevo, qué mejoró y qué arreglamos.',
      update: 'Cómo actualizar',
      source: 'Notas redactadas a partir del registro técnico:',
      sourceLink: 'CHANGELOG.md en GitHub',
    },
    series: {
      label: 'Serie',
      versions: (count) => (count === 1 ? '1 versión' : `${count} versiones`),
      show: (count) =>
        count === 1 ? 'Mostrar su entrada' : `Mostrar sus ${count} entradas`,
    },
    entry: {
      includes: (versions) => `incluye ${list(versions, 'y')}`,
      technical: 'Detalle técnico',
      update: 'Cómo actualizar',
      permalink: 'Enlace a esta versión',
    },
  },
};
