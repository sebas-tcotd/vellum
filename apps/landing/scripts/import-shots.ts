/**
 * Imports Sebas's PNG originals (LISTA-DE-TOMAS.md: they live outside the
 * repo, in the UX workspace `imports/tomas/`) as optimized WebP into
 * `src/assets/shots/`. The build then makes the responsive sizes.
 *
 * - Applies the registry `crop` (window captures whose UI is not the shot).
 * - Lays translucent exports over their `background`; otherwise trims
 *   transparent margins and window shadows (window captures).
 * - Caps the width at 3200 px: the widest use (the hero) asks for 3200.
 *
 * Run: `pnpm --filter @vellum/landing shots:import <folder with the PNGs>`.
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp, { type Sharp } from 'sharp';
import { SHOTS, type ShotEntry } from '../src/content/shots.ts';

const source = process.argv[2];
if (!source || !existsSync(source)) {
  console.error('Usage: shots:import <folder with the PNG originals>');
  process.exit(1);
}
const target = fileURLToPath(new URL('../src/assets/shots/', import.meta.url));
mkdirSync(target, { recursive: true });

const MAX_WIDTH = 3200;

/** Bounding box of the pixels that are (almost) opaque. */
async function opaqueBox(image: Sharp) {
  const { data, info } = await image
    .clone()
    .ensureAlpha()
    .extractChannel(3)
    .raw()
    .toBuffer({ resolveWithObject: true });
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < info.height; y += 1)
    for (let x = 0; x < info.width; x += 1)
      if ((data[y * info.width + x] ?? 0) >= 250) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
  return right < 0
    ? null
    : { left, top, width: right - left + 1, height: bottom - top + 1 };
}

async function convert(shot: ShotEntry, name: string) {
  let image = sharp(`${source}/${name}.png`, { limitInputPixels: false });
  const meta = await image.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (shot.crop) {
    const { left, top, right, bottom } = shot.crop;
    image = sharp(
      await image
        .extract({
          left: Math.round(width * left),
          top: Math.round(height * top),
          width: Math.round(width * (right - left)),
          height: Math.round(height * (bottom - top)),
        })
        .toBuffer(),
    );
  }
  if (shot.background) {
    image = sharp(
      await image.flatten({ background: shot.background }).toBuffer(),
    );
  } else if (meta.hasAlpha) {
    // Window captures: drop the transparent margin and the shadow.
    const box = await opaqueBox(image);
    if (box) image = sharp(await image.extract(box).toBuffer());
  }
  const info = await image
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: 86, effort: 5 })
    .toFile(`${target}${name}.webp`);
  console.log(`  ${name}.webp  ${info.width}×${info.height}`);
}

const used = new Set<string>();
console.log(`Importando desde ${source}:`);
for (const shot of Object.values(SHOTS) as ShotEntry[]) {
  const names = shot.perLanguage
    ? [`${shot.file}-en`, `${shot.file}-es`]
    : [shot.file];
  for (const name of names) {
    if (!existsSync(`${source}/${name}.png`)) continue;
    used.add(`${name}.png`);
    await convert(shot, name);
  }
}
const ignored = readdirSync(source).filter(
  (file) => file.endsWith('.png') && !used.has(file),
);
if (ignored.length > 0)
  console.log(`Sin uso en la home (no se importan): ${ignored.join(', ')}`);
