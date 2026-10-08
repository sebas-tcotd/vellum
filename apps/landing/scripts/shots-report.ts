/**
 * Lists what the landing still needs before launch: shots without their
 * final file (with the stand-in they show meanwhile), the Los Santos Pobres
 * alts Sebas still has to write, Workshop authors and the Bridge Workshop URL.
 *
 * Run: `pnpm --filter @vellum/landing shots:report` (Node strips the types).
 */
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CITIES } from '../src/content/cities.ts';
import { BRIDGE_WORKSHOP_URL } from '../src/content/links.ts';
import {
  LSP_PAIR,
  LSP_STRIP,
  SHOTS,
  type ShotEntry,
} from '../src/content/shots.ts';
import { pickShotFile } from '../src/lib/shot-file.ts';

const root = (path: string) => fileURLToPath(new URL(path, import.meta.url));
/** Names (no extension) of the images the build picks up in a folder. */
const names = (folder: string) =>
  existsSync(root(folder))
    ? readdirSync(root(folder))
        // The same extensions as src/lib/shots.ts.
        .filter((file) => /.(png|webp|jpe?g|avif)$/.test(file))
        .map((file) => file.slice(0, file.lastIndexOf('.')))
    : [];
const finals = names('../src/assets/shots/');
const standIns = names('../src/assets/standins/');
const has = (name: string) => finals.includes(name);

const lines: string[] = [];
let pending = 0;

lines.push(
  'Tomas (PNG con el nombre exacto; impórtalas con `shots:import <carpeta>`):',
);
for (const shot of Object.values(SHOTS) as ShotEntry[]) {
  const done =
    has(shot.file) || (has(`${shot.file}-en`) && has(`${shot.file}-es`));
  if (done) continue;
  pending += 1;
  const shown = pickShotFile(shot, 'en', finals, standIns);
  const meanwhile =
    shown.kind === 'stand-in'
      ? `provisional: ${shown.name}`
      : 'marcador visible';
  lines.push(
    `  ${shot.id} ${shot.priority}  ${shot.perLanguage ? `${shot.file}-en.png + ${shot.file}-es.png` : `${shot.file}.png`}  — ${shot.pending.es} (${meanwhile})`,
  );
}

const lsp = [...LSP_STRIP.before, ...LSP_STRIP.after, ...LSP_PAIR].filter(
  (photo) => photo.altPending,
);
if (lsp.length > 0) {
  pending += lsp.length;
  lines.push(
    '',
    'Alt de Los Santos Pobres (src/content/shots.ts · LspPhoto; hoy son neutros y mergear exige los de Sebas):',
    `  ${lsp.map((photo) => photo.label).join(', ')}`,
  );
}

lines.push('', 'Datos:');
for (const city of Object.values(CITIES)) {
  if (city.origin !== 'game' && city.author === null) {
    pending += 1;
    lines.push(`  Autor de ${city.city} (Workshop ${city.workshopId ?? '—'})`);
  }
  if (city.origin === 'workshop' && city.permission !== 'granted')
    lines.push(
      `  Permiso de ${city.city}: ${city.permission} (riesgo D4, asumido por Sebas)`,
    );
}
if (BRIDGE_WORKSHOP_URL === null) {
  pending += 1;
  lines.push(
    '  URL del ítem de Vellum Bridge en Steam Workshop (src/content/links.ts)',
  );
}

lines.push('', `${pending} pendientes.`);
console.log(lines.join('\n'));
