/**
 * Derives Vellum's Windows icon from its Fluent artwork in `brand/`.
 *
 * macOS has its own Liquid Glass icon (`icons/iconcomposer/`) and Linux keeps
 * the flat one `tauri icon` writes to `icons/`. Windows draws from
 * `brand/windows-app-icon.svg`, a separate Fluent design, into
 * `icons/windows/`:
 *
 * - `icon.ico` for the executable, the NSIS and MSI installers and Explorer;
 * - the MSIX logos, with the `scale-*` and `targetsize-*` qualifiers that
 *   `makepri` resolves when `package-msix.ps1` packs them. The `altform-unplated`
 *   and `altform-lightunplated` taskbar icons keep Windows from drawing a
 *   coloured plate behind the artwork on dark and light taskbars.
 *
 * Same contract as `build-brand-assets.mjs`: it runs by hand, the derived
 * files are committed, `@resvg/resvg-js` is pinned so two machines write
 * byte-identical files, and `pnpm check:installer` proves the files on disk
 * are still the ones this source produces.
 *
 * Run it: `pnpm brand:build` (both generators) or `pnpm icons:windows`.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The Fluent artwork, exported from Figma. */
export const WINDOWS_ICON_SOURCE = 'brand/windows-app-icon.svg';

/** Where the derived icon lands; `tauri.windows.conf.json` points here. */
export const WINDOWS_ICON_DIR = 'apps/desktop/src-tauri/icons/windows';

/** Ties every derived file back to the source that made it. */
export const WINDOWS_ICON_MANIFEST = `${WINDOWS_ICON_DIR}/derived-icons.json`;

/**
 * Sizes inside `icon.ico`, in file order: 256 first, then the shell sizes
 * Windows asks for from 100 % to 400 % scaling (16 to 64) and the large icon
 * views (72 to 128).
 *
 * @remarks
 * The order matters. tauri-codegen takes the **first** entry as the window
 * icon (`entries()[0]`), and the taskbar shows that one whenever it has no
 * shortcut to read the icon from, such as Vellum opened from the NSIS Finish
 * page. With 16 first it was stretched to 24–36 px and looked blurry; with
 * 256 first Windows only ever scales down.
 */
export const ICO_SIZES = [
  256, 16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 128,
];

/** The scale qualifiers Windows recommends for every MSIX logo. */
const SCALES = [100, 125, 150, 200, 400];

/**
 * Taskbar and Start sizes; each one ships plated, unplated and light-unplated.
 *
 * @remarks
 * The full set Microsoft lists, not just 16/24/32/48/256: the taskbar draws at
 * 24 px times the display scale (30 at 125 %, 36 at 150 %), and a missing size
 * is resampled from its neighbour, which is what made the icon look soft.
 */
export const TARGET_SIZES = [
  16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 256,
];
const TARGET_FORMS = ['', '_altform-unplated', '_altform-lightunplated'];

/** The logos `apps/desktop/msix/AppxManifest.xml` names, at 100 % scale. */
export const MSIX_LOGOS = {
  Square44x44Logo: 44,
  Square150x150Logo: 150,
  StoreLogo: 50,
};

/** Every PNG this generator writes, with its pixel size. */
export function windowsIconPngs() {
  const files = [];
  for (const [logo, base] of Object.entries(MSIX_LOGOS)) {
    for (const scale of SCALES) {
      files.push({
        file: `${logo}.scale-${scale}.png`,
        size: Math.round((base * scale) / 100),
      });
    }
  }
  for (const size of TARGET_SIZES) {
    for (const form of TARGET_FORMS) {
      files.push({
        file: `Square44x44Logo.targetsize-${size}${form}.png`,
        size,
      });
    }
  }
  return files;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Packs PNG images into an `.ico`.
 *
 * @remarks
 * Hand-written for the same reason as `encodeBmp`: an ICO is a 6-byte header,
 * one 16-byte entry per image and the images themselves, and Windows has read
 * PNG-compressed entries since Vista. A width or height of 256 is stored as 0.
 */
export function encodeIco(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

/**
 * Regenerates the Windows icon and its manifest.
 *
 * @param root - Absolute path to the repository root.
 * @returns The manifest that was written.
 */
export async function buildWindowsIcon(root) {
  const { Resvg } = await import('@resvg/resvg-js');
  const source = fs.readFileSync(path.join(root, WINDOWS_ICON_SOURCE));
  const svg = source.toString('utf8');

  // Each size is rendered from the vector, never downscaled from a bigger PNG,
  // so the 16 px icon gets resvg's own antialiasing at 16 px.
  const cache = new Map();
  const render = (size) => {
    if (!cache.has(size)) {
      const rendered = new Resvg(svg, {
        font: { loadSystemFonts: false },
        fitTo: { mode: 'width', value: size },
      }).render();
      if (rendered.width !== size || rendered.height !== size) {
        throw new Error(
          `${WINDOWS_ICON_SOURCE} rendered at ${rendered.width}x${rendered.height} for ${size}; the artwork must be square`,
        );
      }
      cache.set(size, rendered.asPng());
    }
    return cache.get(size);
  };

  const outputDir = path.join(root, WINDOWS_ICON_DIR);
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const files = {};
  const write = (file, bytes, size) => {
    fs.writeFileSync(path.join(outputDir, file), bytes);
    files[file] = { size, sha256: sha256(bytes) };
  };

  write(
    'icon.ico',
    encodeIco(ICO_SIZES.map((size) => ({ size, png: render(size) }))),
    Math.max(...ICO_SIZES),
  );
  for (const { file, size } of windowsIconPngs()) {
    write(file, render(size), size);
  }

  const manifest = {
    $comment:
      'Generated by `pnpm icons:windows`. Do not edit: `pnpm check:installer` compares these hashes against brand/ and against the files on disk.',
    source: { [WINDOWS_ICON_SOURCE]: sha256(source) },
    files,
  };
  fs.writeFileSync(
    path.join(root, WINDOWS_ICON_MANIFEST),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const manifest = await buildWindowsIcon(process.cwd());
  console.log(
    `${WINDOWS_ICON_DIR}: ${Object.keys(manifest.files).length} files from ${WINDOWS_ICON_SOURCE}. Commit them together with the source.`,
  );
}
