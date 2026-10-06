/**
 * Lists what the home still needs before launch: shots without their final
 * file (with the stand-in they show meanwhile), Workshop authors, the Bridge
 * Workshop URL and the dark Store badges.
 *
 * Run: `pnpm --filter @vellum/landing shots:report` (Node strips the types).
 */
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CITIES } from '../src/content/cities.ts';
import { BRIDGE_WORKSHOP_URL } from '../src/content/links.ts';
import { SHOTS, type ShotEntry } from '../src/content/shots.ts';
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

lines.push('', 'Datos:');
for (const city of Object.values(CITIES)) {
  if (city.origin !== 'game' && city.author === null) {
    pending += 1;
    lines.push(`  Autor de ${city.city} (Workshop ${city.workshopId ?? '—'})`);
  }
  if (city.origin === 'workshop' && city.permission !== 'granted')
    lines.push(`  Permiso de ${city.city}: ${city.permission} (riesgo D4)`);
}
if (BRIDGE_WORKSHOP_URL === null) {
  pending += 1;
  lines.push(
    '  URL del ítem de Vellum Bridge en Steam Workshop (src/content/links.ts)',
  );
}
for (const lang of ['en', 'es']) {
  if (!existsSync(root(`../public/assets/store-badge-${lang}-dark.svg`))) {
    pending += 1;
    lines.push(
      `  Insignia oficial de Microsoft Store para fondo oscuro (${lang}): public/assets/store-badge-${lang}-dark.svg`,
    );
  }
}

lines.push('', `${pending} pendientes.`);
console.log(lines.join('\n'));
