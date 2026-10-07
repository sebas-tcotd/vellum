/**
 * Minimal inline markup for copy strings, rendered with `set:html`:
 * `**strong**`, `*em*`, `` `code` `` and `[[kbd]]`. The text is escaped
 * first, so copy can never inject HTML.
 */
export function rich(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[\[([^\]]+)\]\]/g, '<kbd>$1</kbd>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

/** Target of a `{key|label}` link in copy. */
export interface RichLink {
  href: string;
  /** Opens in a new tab, with ↗ and the hidden «(opens in a new tab)». */
  external?: boolean;
}

/**
 * `rich()` plus prose links written `{key|label}`, whose targets come from
 * the page (they depend on the language and the base). An unknown key fails
 * the build instead of shipping a dead link.
 */
export function richLinks(
  text: string,
  links: Record<string, RichLink>,
  newTab: string,
): string {
  return rich(text).replace(
    /\{(\w+)\|([^}]+)\}/g,
    (_match, key: string, label: string) => {
      const link = links[key];
      if (!link) throw new Error(`Unknown link "${key}" in: ${text}`);
      return link.external
        ? `<a class="link" href="${link.href}" target="_blank" rel="noopener">${label}<span aria-hidden="true"> ↗</span><span class="visually-hidden"> ${newTab}</span></a>`
        : `<a class="link" href="${link.href}">${label}</a>`;
    },
  );
}
