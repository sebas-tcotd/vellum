/**
 * Derives the installer artwork from `brand/` (Story 1.9).
 *
 * WiX and NSIS only accept 24-bit BMP, and no CI runner in this repo has a
 * rasteriser — no `sharp`, no ImageMagick, no `rsvg-convert`. Putting one in
 * the critical path of a release, for artwork that changes about once a year,
 * costs more than it buys. So this script runs **by hand** whenever `brand/`
 * changes, the derived files are committed, and `pnpm check:installer` proves
 * they are still the ones this source produces.
 *
 * Determinism matters, because the check compares hashes: the compositions
 * below contain no text, `loadSystemFonts` is off, and every colour comes from
 * `brand/installer-copy.json`. Two machines running this script on the same
 * source must write byte-identical files. That is also why `@resvg/resvg-js`
 * is pinned to an exact version rather than a caret range — a minor bump
 * changes the encoder's output, and `check:installer` would report it as
 * artwork retouched by hand.
 *
 * Run it: `pnpm brand:build`.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/** Where the derived artwork lands; Tauri consumes it from here. */
export const OUTPUT_DIR = 'apps/desktop/src-tauri/installer';

/** Manifest that ties every derived file back to the source that made it. */
export const MANIFEST_FILE = `${OUTPUT_DIR}/derived-assets.json`;

/** Files under `brand/` whose content decides what the artwork looks like. */
export const BRAND_SOURCES = [
  'brand/vellum-mark.svg',
  'brand/installer-copy.json',
];

/**
 * The five derived files and the dimensions each consumer demands.
 *
 * @remarks
 * The BMP sizes are not suggestions: WiX rejects a banner that is not
 * 493×58 and stretches a dialog image that is not 493×312, and NSIS crops
 * anything that is not 150×57 / 164×314. They are pinned here and re-checked
 * by `verify-installer-identity.mjs` from the file headers.
 */
export const DERIVED_ASSETS = [
  { file: 'wix-banner.bmp', width: 493, height: 58, format: 'bmp' },
  { file: 'wix-dialog.bmp', width: 493, height: 312, format: 'bmp' },
  { file: 'nsis-header.bmp', width: 150, height: 57, format: 'bmp' },
  { file: 'nsis-sidebar.bmp', width: 164, height: 314, format: 'bmp' },
  { file: 'dmg-background.png', width: 660, height: 400, format: 'png' },
];

/**
 * The DMG window layout — icon positions and the arrow drawn between them.
 *
 * @remarks
 * These used to be two independent sources: Finder reads the positions from
 * `tauri.conf.json` while the arrow was hardcoded in the composition below.
 * Nothing tied them, so the icons could drift to opposite corners with the
 * arrow still pointing across the middle at nothing — and the guardrail, which
 * only checked that each point was somewhere inside the window, stayed green.
 * The arrow is now derived from these numbers, and
 * `verify-installer-identity.mjs` asserts the config repeats them exactly.
 */
export const DMG_LAYOUT = {
  appPosition: { x: 180, y: 200 },
  applicationFolderPosition: { x: 480, y: 200 },
  /**
   * The arrow's own span, not derived from an icon radius: a Finder icon plus
   * its label is wider than the icon, and the clearance that reads well is not
   * symmetric. These are the numbers verified on a real mounted DMG.
   */
  arrow: { fromX: 272, toX: 372 },
};

/**
 * The arrow can only sit between the two icons, on their shared row.
 *
 * @remarks
 * Exported so the guardrail and the generator agree on what "aligned" means
 * rather than each carrying its own idea of it.
 */
export function assertDmgLayout(layout = DMG_LAYOUT) {
  const { appPosition, applicationFolderPosition, arrow } = layout;
  if (appPosition.y !== applicationFolderPosition.y) {
    throw new Error('DMG_LAYOUT: the two icons must share a row');
  }
  if (
    !(appPosition.x < arrow.fromX && arrow.fromX < arrow.toX) ||
    !(arrow.toX < applicationFolderPosition.x)
  ) {
    throw new Error(
      'DMG_LAYOUT: the arrow must run between the two icons, left to right',
    );
  }
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * The arrow that says "drag this one onto that one", drawn from
 * {@link DMG_LAYOUT} so it can never point somewhere the icons are not.
 */
function dragArrow(colour) {
  assertDmgLayout();
  const {
    appPosition: { y },
    arrow: { fromX: from, toX: to },
  } = DMG_LAYOUT;
  return (
    `<path d="M${from} ${y} H ${to}" stroke="${colour}" stroke-width="2" opacity="0.55" fill="none"/>` +
    `<path d="M${to} ${y} L ${to - 14} ${y - 8} L ${to - 14} ${y + 8} Z" fill="${colour}" opacity="0.55"/>`
  );
}

/**
 * Pulls the two path outlines out of the canonical mark.
 *
 * @remarks
 * The mark is two paths in a fixed order — the disc, then the V glyph — so the
 * compositions can recolour them independently (a parchment disc is invisible
 * on a parchment banner). Reading them instead of copying the `d` strings is
 * what makes `brand/vellum-mark.svg` the single source rather than a
 * decoration nobody consumes.
 */
export function readMarkPaths(svg) {
  const paths = [...svg.matchAll(/\sd="([^"]+)"/g)].map((match) => match[1]);
  if (paths.length !== 2) {
    throw new Error(
      `brand/vellum-mark.svg must contain exactly two paths (disc, glyph); found ${paths.length}`,
    );
  }
  const viewBox = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  if (!viewBox || viewBox[1] !== viewBox[2]) {
    throw new Error(
      'brand/vellum-mark.svg must declare a square viewBox starting at 0 0',
    );
  }
  return { disc: paths[0], glyph: paths[1], extent: Number(viewBox[1]) };
}

/** One placement of the mark, recoloured for the surface it sits on. */
function markGroup(mark, { x, y, size, disc, glyph }) {
  const scale = size / mark.extent;
  return [
    `<g transform="translate(${x} ${y}) scale(${round(scale)})">`,
    `<path d="${mark.disc}" fill="${disc}"/>`,
    `<path d="${mark.glyph}" fill="${glyph}"/>`,
    `</g>`,
  ].join('');
}

function round(value) {
  return Number(value.toFixed(6));
}

/**
 * A run of hairlines that reads as contour lines without being a picture.
 *
 * @remarks
 * The installer chrome belongs to the OS, so the artwork has to be quiet. This
 * is the whole decorative vocabulary: the mark, a rule, and these.
 */
function contourLines({ x, y, width, count, gap, color, opacity }) {
  return Array.from({ length: count }, (_, index) => {
    const offset = y + index * gap;
    const inset = (index % 2) * (width * 0.12);
    return `<rect x="${round(x + inset)}" y="${offset}" width="${round(width - inset)}" height="1" fill="${color}" opacity="${opacity}"/>`;
  }).join('');
}

/**
 * The five compositions.
 *
 * @remarks
 * No `<text>` anywhere on purpose. Cormorant Garamond and DM Mono only exist
 * in this repo as woff2 inside the app bundle, which `resvg` cannot read, and
 * falling back to whatever serif the build machine happens to have would make
 * the committed BMPs depend on the machine that generated them. Every
 * installer already renders the product name itself, so the artwork carries
 * the mark and the palette and nothing that needs a font.
 */
export function compose(name, mark, palette, { width, height }) {
  const { parchment, softInk, sepia } = palette;
  const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  const ground = `<rect width="${width}" height="${height}" fill="${parchment}"/>`;

  switch (name) {
    // WiX draws the page title over the left of the banner, so the mark goes
    // right and the left half stays empty.
    case 'wix-banner.bmp':
      return `${open}${ground}${contourLines({
        x: 300,
        y: 12,
        width: 120,
        count: 5,
        gap: 8,
        color: softInk,
        opacity: '0.18',
      })}${markGroup(mark, {
        x: width - 52,
        y: 9,
        size: 40,
        disc: sepia,
        glyph: parchment,
      })}<rect x="0" y="${height - 1}" width="${width}" height="1" fill="${sepia}" opacity="0.35"/></svg>`;

    // The welcome/exit dialogs write their text from x≈165 rightwards; the
    // 164px band on the left is the only part of this bitmap that stays visible.
    case 'wix-dialog.bmp':
      return `${open}${ground}<rect x="0" y="0" width="164" height="${height}" fill="${sepia}"/>${markGroup(
        mark,
        { x: 42, y: 62, size: 80, disc: parchment, glyph: sepia },
      )}${contourLines({
        x: 30,
        y: 190,
        width: 104,
        count: 7,
        gap: 9,
        color: parchment,
        opacity: '0.22',
      })}<rect x="164" y="0" width="1" height="${height}" fill="${sepia}" opacity="0.4"/></svg>`;

    // NSIS places this bitmap at the right end of the header strip, so the
    // whole tile is the logo area.
    case 'nsis-header.bmp':
      return `${open}${ground}${markGroup(mark, {
        x: (width - 42) / 2,
        y: (height - 42) / 2,
        size: 42,
        disc: sepia,
        glyph: parchment,
      })}</svg>`;

    // Welcome and Finish pages: a full-bleed panel down the left of the window.
    case 'nsis-sidebar.bmp':
      return `${open}<rect width="${width}" height="${height}" fill="${sepia}"/>${markGroup(
        mark,
        { x: (width - 84) / 2, y: 46, size: 84, disc: parchment, glyph: sepia },
      )}${contourLines({
        x: 26,
        y: 176,
        width: 112,
        count: 9,
        gap: 10,
        color: parchment,
        opacity: '0.2',
      })}<rect x="26" y="${height - 46}" width="112" height="1" fill="${parchment}" opacity="0.4"/></svg>`;

    // The DMG window: Vellum.app sits at (180, 200), the Applications alias at
    // (480, 200). The arrow lives in the gap between them and is the only
    // instruction the window needs.
    case 'dmg-background.png':
      return `${open}${ground}${markGroup(mark, {
        x: (width - 46) / 2,
        y: 34,
        size: 46,
        disc: sepia,
        glyph: parchment,
      })}${dragArrow(sepia)}${contourLines({
        x: 60,
        y: 330,
        width: 540,
        count: 4,
        gap: 9,
        color: softInk,
        opacity: '0.1',
      })}</svg>`;

    default:
      throw new Error(`No composition defined for ${name}`);
  }
}

/**
 * Encodes RGBA pixels as a 24-bit bottom-up BMP.
 *
 * @remarks
 * Hand-written rather than pulled in as a second dependency: a BI_RGB BMP is a
 * 14-byte file header, a 40-byte DIB header and rows of BGR triples padded to
 * a multiple of four, written bottom row first. Alpha is composited over the
 * given background because 24-bit BMP has none — and because a BMP with an
 * alpha channel is exactly what makes WiX render a black rectangle.
 */
export function encodeBmp(rgba, width, height, background) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowSize * height;
  const buffer = Buffer.alloc(54 + pixelBytes);

  buffer.write('BM', 0, 'ascii');
  buffer.writeUInt32LE(54 + pixelBytes, 2);
  buffer.writeUInt32LE(0, 6);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(0, 30);
  buffer.writeUInt32LE(pixelBytes, 34);
  buffer.writeInt32LE(2835, 38);
  buffer.writeInt32LE(2835, 42);
  buffer.writeUInt32LE(0, 46);
  buffer.writeUInt32LE(0, 50);

  for (let y = 0; y < height; y += 1) {
    const target = 54 + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4;
      const alpha = rgba[source + 3] / 255;
      const blend = (channel, ground) =>
        Math.round(rgba[source + channel] * alpha + ground * (1 - alpha));
      const offset = target + x * 3;
      buffer[offset] = blend(2, background.b);
      buffer[offset + 1] = blend(1, background.g);
      buffer[offset + 2] = blend(0, background.r);
    }
  }
  return buffer;
}

function hexToRgb(hex) {
  // A shorthand or malformed colour used to parse to NaN channels, which the
  // BMP encoder writes as 0 — silently producing black artwork that passes
  // every dimension check downstream.
  if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(
      `palette colour ${JSON.stringify(hex)} must be a 6-digit hex like "#f7f6f1"`,
    );
  }
  const value = hex.replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

/**
 * Regenerates every derived file plus the manifest.
 *
 * @param root - Absolute path to the repository root.
 * @returns The manifest that was written.
 */
export async function buildBrandAssets(root) {
  const { Resvg } = await import('@resvg/resvg-js');

  const svgSource = fs.readFileSync(path.join(root, BRAND_SOURCES[0]), 'utf8');
  const copy = JSON.parse(
    fs.readFileSync(path.join(root, BRAND_SOURCES[1]), 'utf8'),
  );
  const mark = readMarkPaths(svgSource);
  const palette = copy.palette ?? {};
  // Named up front so a missing colour reports its key, instead of destructuring
  // to undefined and throwing something opaque halfway through a render.
  for (const key of ['parchment', 'softInk', 'sepia']) {
    hexToRgb(palette[key]);
  }
  const background = hexToRgb(palette.parchment);

  const outputDir = path.join(root, OUTPUT_DIR);
  fs.mkdirSync(outputDir, { recursive: true });

  const assets = {};
  for (const asset of DERIVED_ASSETS) {
    const svg = compose(asset.file, mark, palette, asset);
    const renderer = new Resvg(svg, {
      // Off on purpose: nothing here draws text, and a font database that
      // varies per machine would make the committed bytes vary too.
      font: { loadSystemFonts: false },
      fitTo: { mode: 'width', value: asset.width },
      background: palette.parchment,
    });
    const rendered = renderer.render();
    // Checked before encoding, not after: encoding a wrong-sized buffer wastes
    // the work and puts a mis-sized buffer one line away from being written.
    if (rendered.width !== asset.width || rendered.height !== asset.height) {
      throw new Error(
        `${asset.file} rendered at ${rendered.width}x${rendered.height}; expected ${asset.width}x${asset.height}`,
      );
    }
    const bytes =
      asset.format === 'png'
        ? rendered.asPng()
        : encodeBmp(
            rendered.pixels,
            rendered.width,
            rendered.height,
            background,
          );
    fs.writeFileSync(path.join(outputDir, asset.file), bytes);
    assets[asset.file] = {
      width: asset.width,
      height: asset.height,
      format: asset.format,
      sha256: sha256(bytes),
    };
  }

  const manifest = {
    $comment:
      'Generated by `pnpm brand:build`. Do not edit: `pnpm check:installer` compares these hashes against brand/ and against the files on disk.',
    source: Object.fromEntries(
      BRAND_SOURCES.map((relative) => [
        relative,
        sha256(fs.readFileSync(path.join(root, relative))),
      ]),
    ),
    assets,
  };
  fs.writeFileSync(
    path.join(root, MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

async function main() {
  const root = process.cwd();
  const manifest = await buildBrandAssets(root);
  for (const [file, asset] of Object.entries(manifest.assets)) {
    console.log(`${OUTPUT_DIR}/${file} — ${asset.width}x${asset.height}`);
  }
  console.log(
    'Installer artwork rebuilt from brand/. Commit the derived files together with the source.',
  );
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  await main();
}
