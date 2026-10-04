#!/usr/bin/env node
/**
 * Rasterizes the Vellum mark for the Vellum Bridge options panel.
 *
 * CS1 (Unity 5.6) cannot draw SVG, so the mod embeds a PNG and shows it with a
 * UITextureSprite. The PNG is committed and derived from brand/vellum-mark.svg
 * with the same pinned resvg as the Windows icons, so rebuilding it on another
 * machine writes the same bytes.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const BRIDGE_ICON_SOURCE = 'brand/vellum-mark.svg';
export const BRIDGE_ICON_TARGET = 'tools/vellum-bridge/assets/vellum-mark.png';
// Drawn at 52 px in the panel; 128 px keeps it sharp with CS1's UI scaling.
export const BRIDGE_ICON_SIZE = 128;

export async function buildBridgeIcon(root) {
  const { Resvg } = await import('@resvg/resvg-js');
  const svg = fs.readFileSync(path.join(root, BRIDGE_ICON_SOURCE), 'utf8');
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: BRIDGE_ICON_SIZE },
  })
    .render()
    .asPng();
  const target = path.join(root, BRIDGE_ICON_TARGET);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, png);
  return target;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const target = await buildBridgeIcon(root);
  console.log(`wrote ${path.relative(root, target)}`);
}
