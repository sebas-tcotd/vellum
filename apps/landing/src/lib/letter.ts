/**
 * The manifesto letter, written in the copy as plain text close to its
 * source (`manifesto-final.md`) and parsed into blocks. Blocks are separated
 * by blank lines:
 *
 * - `# Title` (the H1) and `## Chapter` (H2).
 * - `**Whole line in bold**`: a pause.
 * - `---`: a break between parts.
 * - `> Note`: a margin note beside the paragraph right before it.
 * - `[bleed]`, `[lsp]`, `[diptych]`, `[plate]`: the visual moments.
 * - `— Name` + `Place` on the next line: the signature.
 * - `~ Text`: the closing line under the signature.
 * - Anything else: a paragraph (with `*em*`).
 *
 * Pure, so it is unit-tested without the build.
 */

export type LetterVisual = 'bleed' | 'lsp' | 'diptych' | 'plate';

export type LetterBlock =
  | { type: 'title'; text: string }
  | { type: 'chapter'; text: string }
  | { type: 'pause'; text: string }
  | { type: 'break' }
  | { type: 'paragraph'; text: string; note?: string }
  | { type: 'visual'; visual: LetterVisual }
  | { type: 'signature'; name: string; place: string }
  | { type: 'coda'; text: string };

const VISUALS: LetterVisual[] = ['bleed', 'lsp', 'diptych', 'plate'];

export function parseLetter(source: string): LetterBlock[] {
  const blocks: LetterBlock[] = [];
  const chunks = source
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  for (const chunk of chunks) {
    const oneLine = chunk.replace(/\s*\n\s*/g, ' ');
    if (chunk.startsWith('## ')) {
      blocks.push({ type: 'chapter', text: oneLine.slice(3) });
    } else if (chunk.startsWith('# ')) {
      blocks.push({ type: 'title', text: oneLine.slice(2) });
    } else if (chunk === '---') {
      blocks.push({ type: 'break' });
    } else if (/^\*\*[^*]+\*\*$/.test(oneLine)) {
      blocks.push({ type: 'pause', text: oneLine.slice(2, -2) });
    } else if (chunk.startsWith('> ')) {
      const previous = blocks[blocks.length - 1];
      if (previous?.type !== 'paragraph' || previous.note)
        throw new Error(`A margin note needs a paragraph before it: ${chunk}`);
      previous.note = oneLine.slice(2);
    } else if (/^\[\w+\]$/.test(chunk)) {
      const visual = chunk.slice(1, -1) as LetterVisual;
      if (!VISUALS.includes(visual))
        throw new Error(`Unknown visual moment: ${chunk}`);
      blocks.push({ type: 'visual', visual });
    } else if (chunk.startsWith('— ')) {
      const [name = '', place = ''] = chunk.slice(2).split('\n');
      blocks.push({
        type: 'signature',
        name: name.trim(),
        place: place.trim(),
      });
    } else if (chunk.startsWith('~ ')) {
      blocks.push({ type: 'coda', text: oneLine.slice(2) });
    } else {
      blocks.push({ type: 'paragraph', text: oneLine });
    }
  }
  return blocks;
}
