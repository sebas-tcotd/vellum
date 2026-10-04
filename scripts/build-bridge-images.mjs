#!/usr/bin/env node
/**
 * Rasterizes the images of the Vellum Bridge options panel.
 *
 * CS1 (Unity 5.6) cannot draw SVG, so the mod embeds PNGs and shows them with a
 * UITextureSprite. The PNGs are committed and derived with the same pinned
 * resvg as the Windows icons, so rebuilding them on another machine writes the
 * same bytes:
 * - the Vellum mark, from brand/vellum-mark.svg;
 * - the Microsoft Store badges (dark, English and Spanish), from Microsoft's
 *   official artwork at get.microsoft.com/images/, kept unmodified in
 *   tools/vellum-bridge/assets-src/. Only the format changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Each image is drawn at half its width in the panel, so it stays sharp with CS1's UI scaling.
export const BRIDGE_IMAGES = [
  {
    source: 'brand/vellum-mark.svg',
    target: 'tools/vellum-bridge/assets/vellum-mark.png',
    width: 128,
  },
  {
    source: 'tools/vellum-bridge/assets-src/store-badge-en.svg',
    target: 'tools/vellum-bridge/assets/store-badge-en.png',
    width: 322,
  },
  {
    source: 'tools/vellum-bridge/assets-src/store-badge-es.svg',
    target: 'tools/vellum-bridge/assets/store-badge-es.png',
    width: 322,
  },
];

export async function buildBridgeImages(root) {
  const { Resvg } = await import('@resvg/resvg-js');
  const written = [];
  for (const image of BRIDGE_IMAGES) {
    const svg = fs.readFileSync(path.join(root, image.source), 'utf8');
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: image.width } })
      .render()
      .asPng();
    const target = path.join(root, image.target);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, png);
    written.push(target);
  }
  return written;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  for (const target of await buildBridgeImages(root)) {
    console.log(`wrote ${path.relative(root, target)}`);
  }
}
