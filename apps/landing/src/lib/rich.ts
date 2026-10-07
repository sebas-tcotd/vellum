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
