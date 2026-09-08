/**
 * Freezes Vellum's installer identity (Story 1.9).
 *
 * Six installers go out on every release and nobody opens five of them. The
 * things that make them recognisably Vellum — a declared publisher, artwork of
 * the exact dimensions WiX and NSIS demand, a `.desktop` entry with a category
 * and a comment — are all one careless edit away from silently reverting to
 * the generic default, and the failure is invisible until a user is already
 * looking at "Unknown publisher".
 *
 * Seven passes, one command:
 *   1. Identity metadata in `tauri.conf.json` matches `brand/installer-copy.json`,
 *      and no `licenseFile` reintroduces a licence agreement in front of the DMG.
 *   2. Every derived artwork file exists, measures what its consumer requires,
 *      and is still the one `pnpm brand:build` produced from `brand/`.
 *   3. The per-platform installer configuration still points at that artwork
 *      and still declares the language and install-mode decisions.
 *   4. The opt-in `.cslmap` association from Story 7.5 is intact — the
 *      fragment is referenced, and the `.wxs` keeps `Level="0"`, the
 *      `ASSOCIATE_CSLMAP` property and the upgrade `RegistrySearch`.
 *   5. No installation script anywhere — including a <CustomAction> in the
 *      fragment, the one place code could reach the installer. Vellum does not
 *      run code on the user's machine to install itself.
 *   6. The mark has not forked: `brand/vellum-mark.svg` and the copy the app
 *      ships are the same drawing.
 *   7. No platform overlay smuggles a `bundle` block past the other six.
 *
 * Run it: `pnpm check:installer`.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  DERIVED_ASSETS,
  DMG_LAYOUT,
  MANIFEST_FILE,
  BRAND_SOURCES,
  OUTPUT_DIR,
} from './build-brand-assets.mjs';

const CONFIG_FILE = 'apps/desktop/src-tauri/tauri.conf.json';
const TAURI_DIR = 'apps/desktop/src-tauri';
const COPY_FILE = 'brand/installer-copy.json';
const FRAGMENT_FILE = 'apps/desktop/src-tauri/windows/cslmap-association.wxs';
const DESKTOP_FILE = 'apps/desktop/src-tauri/linux/vellum.desktop';

/**
 * Identity keys, and where each one's value has to come from.
 *
 * @remarks
 * Presence alone was not enough: a `publisher` typo'd into a different name is
 * as wrong as a missing one, and the only reviewable source of truth for the
 * value is `brand/installer-copy.json`. `source` is the path into that file.
 */
export const IDENTITY_KEYS = [
  { key: 'productName', source: ['productName'], top: true },
  { key: 'publisher', source: ['publisher'] },
  { key: 'homepage', source: ['homepage'] },
  { key: 'copyright', source: ['copyright'] },
  { key: 'license', source: ['license'] },
  { key: 'category', source: ['category'] },
  { key: 'shortDescription', source: ['shortDescription', 'en'] },
  { key: 'longDescription', source: ['longDescription', 'en'] },
];

/**
 * Invariants of the opt-in `.cslmap` association fragment.
 *
 * @remarks
 * Story 7.5 built these and left no guardian. Each one, if it disappears,
 * turns an opt-in association into a silent default or drops a returning
 * user's choice on upgrade — regressions a reviewer reading a diff of a 100
 * line `.wxs` will not reliably catch.
 */
export const FRAGMENT_INVARIANTS = [
  {
    name: 'opt-in feature level',
    pattern: /<Feature\s+Id="CslmapAssociationFeature"[^>]*Level="0"/,
    regression:
      'the association feature would install by default instead of only when the user ticks the box.',
  },
  {
    name: 'checkbox condition',
    pattern: /<Condition\s+Level="1">\s*ASSOCIATE_CSLMAP\s*=\s*"1"/,
    regression:
      'nothing raises the feature to Level 1, so ticking the box would no longer register anything.',
  },
  {
    name: 'ASSOCIATE_CSLMAP property',
    pattern: /<Property\s+Id="ASSOCIATE_CSLMAP"\s+Value="0"\s+Secure="yes"/,
    regression:
      'the opt-in property loses its unchecked default or its Secure flag, which is what carries it across the elevation boundary.',
  },
  {
    name: 'upgrade RegistrySearch',
    pattern:
      /<RegistrySearch[^>]*Key="Software\\Vellum\\FileAssociation"[^>]*Name="CslmapAssociated"/,
    regression:
      'an upgrade would stop detecting a prior opt-in and would silently un-associate .cslmap for a user who had chosen it.',
  },
  {
    name: 'upgrade SetProperty',
    pattern:
      /<SetProperty\s+Id="ASSOCIATE_CSLMAP"\s+Value="1"\s+After="AppSearch">/,
    regression:
      'the detected prior opt-in would never reach the checkbox, so the upgrade path degrades to a fresh, unchecked install.',
  },
  {
    name: 'dialog insertion order',
    pattern:
      /<Publish\s+Dialog="InstallDirDlg"\s+Control="Next"[^>]*Value="CslmapAssocDlg"\s+Order="10">/,
    regression:
      "WixUI_InstallDir's built-in transition can win again and skip the association dialog entirely.",
  },
];

/** Keys that would make the installer execute code on the user's machine. */
const SCRIPT_KEYS = [
  'preInstallScript',
  'postInstallScript',
  'preRemoveScript',
  'postRemoveScript',
  'installerHooks',
];

/**
 * Keys that replace a toolkit's own installer template wholesale.
 *
 * @remarks
 * Kept apart from {@link SCRIPT_KEYS}: a custom template does not run code, it
 * takes over the UI — and taking over the WiX template is also how the opt-in
 * `.cslmap` dialog would get silently replaced. Different regression, different
 * message.
 */
const TEMPLATE_KEYS = ['template'];

function readJson(root, relative, violations, rule) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) {
    violations.push({ file: relative, rule, detail: 'File is missing.' });
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch (error) {
    violations.push({
      file: relative,
      rule,
      detail: `Could not be parsed as JSON: ${error.message}`,
    });
    return null;
  }
}

function pick(object, keys) {
  return keys.reduce(
    (value, key) =>
      value === undefined || value === null ? value : value[key],
    object,
  );
}

/**
 * Reads width and height out of an image header.
 *
 * @remarks
 * Header bytes rather than a decoder: this runs in CI, where the point is to
 * catch a 500×60 banner someone resized in Preview, and pulling an image
 * library in to learn two integers would be a dependency per assertion. An
 * unreadable file reports the same failure as a wrongly sized one, because
 * from WiX's point of view they fail the same way.
 */
export function readImageSize(buffer, format) {
  if (format === 'bmp') {
    if (buffer.length < 54 || buffer[0] !== 0x42 || buffer[1] !== 0x4d) {
      throw new Error('not a BMP file');
    }
    const bitCount = buffer.readUInt16LE(28);
    if (bitCount !== 24) {
      throw new Error(
        `is ${bitCount}-bit; WiX and NSIS only render 24-bit BI_RGB bitmaps`,
      );
    }
    // Bit depth alone was not enough: a 24-bit RLE or BITFIELDS bitmap has the
    // right depth and the right dimensions, and WiX paints it as a black
    // rectangle. BI_RGB is 0.
    const compression = buffer.readUInt32LE(30);
    if (compression !== 0) {
      throw new Error(
        `uses BMP compression ${compression}; WiX and NSIS only render 24-bit BI_RGB bitmaps`,
      );
    }
    return {
      width: buffer.readInt32LE(18),
      height: Math.abs(buffer.readInt32LE(22)),
    };
  }
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) {
    throw new Error('not a PNG file');
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/** Pass 1 — identity metadata, and that it says what `brand/` says. */
function checkIdentityMetadata(config, copy) {
  const violations = [];
  const bundle = config.bundle ?? {};

  for (const { key, source, top } of IDENTITY_KEYS) {
    const label = top ? key : `bundle.${key}`;
    const actual = top ? config[key] : bundle[key];
    const expected = pick(copy, source);

    // A key missing from brand/ used to skip the comparison instead of failing
    // it, which made deleting the source the quietest way to disable the check
    // on the destination. Absent source is now the louder failure of the two.
    if (expected === undefined || expected === null || expected === '') {
      violations.push({
        file: COPY_FILE,
        rule: 'identity-metadata',
        detail: `${source.join('.')} is missing. brand/ is the source ${label} is checked against; without it nothing verifies what the installer says.`,
      });
      continue;
    }
    if (actual === undefined || actual === null || actual === '') {
      violations.push({
        file: CONFIG_FILE,
        rule: 'identity-metadata',
        detail: `${label} is missing. Without it the installer falls back to a generic default — an empty publisher in Add/Remove Programs, a .desktop entry with no comment. Its value lives in ${COPY_FILE} (${source.join('.')}).`,
      });
      continue;
    }
    if (actual !== expected) {
      violations.push({
        file: CONFIG_FILE,
        rule: 'identity-metadata',
        detail: `${label} is ${JSON.stringify(actual)} but ${COPY_FILE} says ${JSON.stringify(expected)}. brand/ is the source; run the values across rather than editing them at the destination.`,
      });
    }
  }

  if (bundle.licenseFile !== undefined) {
    violations.push({
      file: CONFIG_FILE,
      rule: 'identity-metadata',
      detail:
        'bundle.licenseFile is set. On macOS hdiutil embeds it as a software licence agreement, so the MIT text has to be accepted before the volume even mounts — and the DMG window, which is the thing that explains dragging Vellum to Applications, is what the user should meet first. MIT is permissive and requires no acceptance. bundle.license ("MIT") stays; it feeds MSI, .deb and .rpm metadata without putting a EULA in front of anyone.',
    });
  }

  if (bundle.fileAssociations) {
    violations.push({
      file: CONFIG_FILE,
      rule: 'identity-metadata',
      detail:
        'bundle.fileAssociations registers .cslmap unconditionally on every install and would duplicate the opt-in MSI fragment. The association stays opt-in and MSI-only.',
    });
  }

  return violations;
}

/** Pass 2 — the derived artwork, against its dimensions and against `brand/`. */
function checkDerivedArtwork(root) {
  const violations = [];
  const manifest = readJson(root, MANIFEST_FILE, violations, 'derived-artwork');

  for (const asset of DERIVED_ASSETS) {
    const relative = `${OUTPUT_DIR}/${asset.file}`;
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) {
      violations.push({
        file: relative,
        rule: 'derived-artwork',
        detail: `Missing. Expected a ${asset.width}x${asset.height} ${asset.format.toUpperCase()}; run "pnpm brand:build" and commit the result.`,
      });
      continue;
    }
    const bytes = fs.readFileSync(absolute);
    let size;
    try {
      size = readImageSize(bytes, asset.format);
    } catch (error) {
      violations.push({
        file: relative,
        rule: 'derived-artwork',
        detail: `Expected a ${asset.width}x${asset.height} ${asset.format.toUpperCase()}, but the file ${error.message}.`,
      });
      continue;
    }
    if (size.width !== asset.width || size.height !== asset.height) {
      violations.push({
        file: relative,
        rule: 'derived-artwork',
        detail: `Expected ${asset.width}x${asset.height}, got ${size.width}x${size.height}. These dimensions are required, not advisory: WiX and NSIS stretch or crop anything else.`,
      });
      continue;
    }
    if (!manifest) continue;
    const recorded = manifest.assets?.[asset.file];
    if (typeof recorded?.sha256 !== 'string') {
      violations.push({
        file: MANIFEST_FILE,
        rule: 'derived-artwork',
        detail: `No sha256 recorded for ${asset.file}. A row missing from the manifest used to skip the content check rather than fail it, which made truncating this generated file the quietest way to ship hand-retouched artwork. Run "pnpm brand:build".`,
      });
      continue;
    }
    if (sha256(bytes) !== recorded.sha256) {
      violations.push({
        file: relative,
        rule: 'derived-artwork',
        detail:
          'Content does not match the hash recorded by "pnpm brand:build". Installer artwork is derived from brand/, never edited at its destination.',
      });
    }
  }

  if (manifest) {
    for (const relative of BRAND_SOURCES) {
      const absolute = path.join(root, relative);
      if (!fs.existsSync(absolute)) {
        violations.push({
          file: relative,
          rule: 'derived-artwork',
          detail: 'Missing. brand/ is the source the artwork is derived from.',
        });
        continue;
      }
      const recorded = manifest.source?.[relative];
      if (typeof recorded !== 'string') {
        violations.push({
          file: MANIFEST_FILE,
          rule: 'derived-artwork',
          detail: `No sha256 recorded for ${relative}. Same reason as a missing asset row: an absent entry must fail, not disappear. Run "pnpm brand:build".`,
        });
        continue;
      }
      if (sha256(fs.readFileSync(absolute)) !== recorded) {
        violations.push({
          file: relative,
          rule: 'derived-artwork',
          detail: `Changed since the artwork was generated. Run "pnpm brand:build" and commit the derived files in ${OUTPUT_DIR}/ together with this change.`,
        });
      }
    }

    // Exact coverage, both ways. An extra row is as suspect as a missing one:
    // it means the manifest was hand-edited, and the manifest is the only
    // thing standing between brand/ and what actually ships.
    const expectedAssets = new Set(DERIVED_ASSETS.map((asset) => asset.file));
    for (const file of Object.keys(manifest.assets ?? {})) {
      if (!expectedAssets.has(file)) {
        violations.push({
          file: MANIFEST_FILE,
          rule: 'derived-artwork',
          detail: `Records "${file}", which is not one of the derived assets. The manifest is generated; do not edit it by hand.`,
        });
      }
    }
    for (const file of Object.keys(manifest.source ?? {})) {
      if (!BRAND_SOURCES.includes(file)) {
        violations.push({
          file: MANIFEST_FILE,
          rule: 'derived-artwork',
          detail: `Records "${file}", which is not one of the brand/ sources. The manifest is generated; do not edit it by hand.`,
        });
      }
    }
  }

  return violations;
}

/** Pass 3 — per-platform installer configuration. */
function checkPlatformConfig(root, config, copy) {
  const violations = [];
  const bundle = config.bundle ?? {};
  const tauriDir = path.join(root, TAURI_DIR);

  const artwork = [
    {
      key: 'bundle.windows.wix.bannerPath',
      value: pick(bundle, ['windows', 'wix', 'bannerPath']),
      asset: 'wix-banner.bmp',
    },
    {
      key: 'bundle.windows.wix.dialogImagePath',
      value: pick(bundle, ['windows', 'wix', 'dialogImagePath']),
      asset: 'wix-dialog.bmp',
    },
    {
      key: 'bundle.windows.nsis.headerImage',
      value: pick(bundle, ['windows', 'nsis', 'headerImage']),
      asset: 'nsis-header.bmp',
    },
    {
      key: 'bundle.windows.nsis.sidebarImage',
      value: pick(bundle, ['windows', 'nsis', 'sidebarImage']),
      asset: 'nsis-sidebar.bmp',
    },
    {
      key: 'bundle.macOS.dmg.background',
      value: pick(bundle, ['macOS', 'dmg', 'background']),
      asset: 'dmg-background.png',
    },
  ];

  for (const { key, value, asset } of artwork) {
    if (typeof value !== 'string' || value === '') {
      violations.push({
        file: CONFIG_FILE,
        rule: 'installer-artwork-reference',
        detail: `${key} is not set, so this installer surface falls back to the toolkit default. It must point at installer/${asset}.`,
      });
      continue;
    }
    if (path.basename(value) !== asset) {
      violations.push({
        file: CONFIG_FILE,
        rule: 'installer-artwork-reference',
        detail: `${key} points at "${value}" instead of the derived installer/${asset}. Installer artwork comes from brand/ only.`,
      });
    }
    if (!fs.existsSync(path.resolve(tauriDir, value))) {
      violations.push({
        file: CONFIG_FILE,
        rule: 'installer-artwork-reference',
        detail: `${key} points at "${value}", which does not exist relative to ${TAURI_DIR}. Tauri fails the bundle late, on the release runner.`,
      });
    }
  }

  const installerIcon = pick(bundle, ['windows', 'nsis', 'installerIcon']);
  if (
    typeof installerIcon !== 'string' ||
    !fs.existsSync(path.resolve(tauriDir, installerIcon))
  ) {
    violations.push({
      file: CONFIG_FILE,
      rule: 'installer-artwork-reference',
      detail: `bundle.windows.nsis.installerIcon must point at an existing .ico; found ${JSON.stringify(installerIcon)}.`,
    });
  }

  const wixLanguages = pick(bundle, ['windows', 'wix', 'language']);
  for (const language of ['en-US', 'es-ES']) {
    if (!Array.isArray(wixLanguages) || !wixLanguages.includes(language)) {
      violations.push({
        file: CONFIG_FILE,
        rule: 'installer-language',
        detail: `bundle.windows.wix.language must list "${language}". The .cslmap fragment's own dialog is written in Spanish; an English-only MSI puts it on top of an English base UI.`,
      });
    }
  }

  const nsis = pick(bundle, ['windows', 'nsis']) ?? {};
  for (const language of ['English', 'Spanish']) {
    if (!Array.isArray(nsis.languages) || !nsis.languages.includes(language)) {
      violations.push({
        file: CONFIG_FILE,
        rule: 'installer-language',
        detail: `bundle.windows.nsis.languages must list "${language}".`,
      });
    }
  }
  if (nsis.displayLanguageSelector !== true) {
    violations.push({
      file: CONFIG_FILE,
      rule: 'installer-language',
      detail:
        'bundle.windows.nsis.displayLanguageSelector must stay true, otherwise the second language is unreachable for anyone whose OS locale is the first.',
    });
  }
  if (nsis.installMode !== 'currentUser') {
    violations.push({
      file: CONFIG_FILE,
      rule: 'installer-privileges',
      detail: `bundle.windows.nsis.installMode must be "currentUser"; found ${JSON.stringify(nsis.installMode)}. Vellum writes only inside its install prefix and the user's data directories, so it never needs the UAC elevation a per-machine install prompts for.`,
    });
  }

  const dmg = pick(bundle, ['macOS', 'dmg']) ?? {};
  const background = DERIVED_ASSETS.find(
    (asset) => asset.file === 'dmg-background.png',
  );
  if (
    dmg.windowSize?.width !== background.width ||
    dmg.windowSize?.height !== background.height
  ) {
    violations.push({
      file: CONFIG_FILE,
      rule: 'dmg-layout',
      detail: `bundle.macOS.dmg.windowSize must be ${background.width}x${background.height} to match installer/dmg-background.png; found ${JSON.stringify(dmg.windowSize)}. A mismatch stretches the background and moves the arrow away from the icons.`,
    });
  }
  // Inside-the-window was too weak: two icons in opposite corners passed while
  // the arrow baked into the background still ran across the middle pointing
  // at nothing. The positions and the arrow now come from one constant, and
  // the config has to repeat it exactly.
  for (const key of ['appPosition', 'applicationFolderPosition']) {
    const position = dmg[key];
    const expected = DMG_LAYOUT[key];
    if (position?.x !== expected.x || position?.y !== expected.y) {
      violations.push({
        file: CONFIG_FILE,
        rule: 'dmg-layout',
        detail: `bundle.macOS.dmg.${key} must be ${JSON.stringify(expected)}; found ${JSON.stringify(position)}. The arrow in installer/dmg-background.png is drawn between these two points — move one and the DMG window stops explaining anything. Change DMG_LAYOUT in scripts/build-brand-assets.mjs and re-run "pnpm brand:build" instead.`,
      });
    }
  }
  if (typeof pick(bundle, ['macOS', 'minimumSystemVersion']) !== 'string') {
    violations.push({
      file: CONFIG_FILE,
      rule: 'identity-metadata',
      detail:
        'bundle.macOS.minimumSystemVersion must be declared, so macOS refuses the install instead of launching into a blank WebView.',
    });
  }

  const deb = pick(bundle, ['linux', 'deb']) ?? {};
  const rpm = pick(bundle, ['linux', 'rpm']) ?? {};
  const expectedTemplate = 'linux/vellum.desktop';
  for (const [name, value] of [
    ['bundle.linux.deb.desktopTemplate', deb.desktopTemplate],
    ['bundle.linux.rpm.desktopTemplate', rpm.desktopTemplate],
  ]) {
    if (value !== expectedTemplate) {
      violations.push({
        file: CONFIG_FILE,
        rule: 'linux-desktop-entry',
        detail: `${name} must be "${expectedTemplate}"; found ${JSON.stringify(value)}. The .desktop entry is the whole of Vellum's identity on Linux, and .deb and .rpm share one.`,
      });
    }
  }
  if (deb.section !== copy?.linux?.debSection) {
    violations.push({
      file: CONFIG_FILE,
      rule: 'linux-desktop-entry',
      detail: `bundle.linux.deb.section is ${JSON.stringify(deb.section)} but ${COPY_FILE} says ${JSON.stringify(copy?.linux?.debSection)}.`,
    });
  }

  violations.push(...checkDesktopEntry(root, copy));
  return violations;
}

/** The `.desktop` template itself — Linux has no other installer surface. */
function checkDesktopEntry(root, copy) {
  const violations = [];
  const absolute = path.join(root, DESKTOP_FILE);
  if (!fs.existsSync(absolute)) {
    return [
      {
        file: DESKTOP_FILE,
        rule: 'linux-desktop-entry',
        detail:
          "Missing. Without it the .deb and .rpm ship Tauri's default entry: a name, an icon, and no category or comment.",
      },
    ];
  }
  const contents = fs.readFileSync(absolute, 'utf8');

  // Without the group header the whole file is inert and every key-level check
  // below would still pass on it.
  if (!/^\[Desktop Entry\]\s*$/m.test(contents)) {
    violations.push({
      file: DESKTOP_FILE,
      rule: 'linux-desktop-entry',
      detail:
        'Missing the [Desktop Entry] group header. Launchers ignore the file entirely without it.',
    });
  }

  // The locale suffix is `[lang_COUNTRY@modifier]`, not two letters: the old
  // pattern dropped Comment[pt_BR] out of the map, so a future translation read
  // as an absent key rather than a present one.
  const entry = new Map();
  const duplicates = new Set();
  for (const line of contents.split('\n')) {
    if (line.trimStart().startsWith('#')) continue;
    const match = line.match(
      /^([A-Za-z0-9-]+(?:\[[a-z]{2,3}(?:_[A-Z]{2})?(?:@[A-Za-z0-9-]+)?\])?)=(.*)$/,
    );
    if (!match) continue;
    if (entry.has(match[1])) duplicates.add(match[1]);
    entry.set(match[1], match[2]);
  }
  for (const key of duplicates) {
    violations.push({
      file: DESKTOP_FILE,
      rule: 'linux-desktop-entry',
      detail: `${key} is declared more than once. Which one wins is undefined across desktop environments.`,
    });
  }

  const categories = (entry.get('Categories') ?? '').split(';').filter(Boolean);
  const expectedCategories = (copy?.linux?.categories ?? '')
    .split(';')
    .filter(Boolean);
  if (expectedCategories.length === 0) {
    violations.push({
      file: COPY_FILE,
      rule: 'linux-desktop-entry',
      detail:
        'linux.categories is missing. It is the source the .desktop entry is checked against.',
    });
  }
  for (const category of expectedCategories) {
    if (!categories.includes(category)) {
      violations.push({
        file: DESKTOP_FILE,
        rule: 'linux-desktop-entry',
        detail: `Categories must include "${category}", which ${COPY_FILE} declares; found "${categories.join(';')}". Without it Vellum lands in the launcher's "Other" bucket.`,
      });
    }
  }

  if (entry.get('Comment') !== '{{comment}}') {
    violations.push({
      file: DESKTOP_FILE,
      rule: 'linux-desktop-entry',
      detail:
        'Comment must interpolate {{comment}}, which the bundler fills from bundle.shortDescription.',
    });
  }

  // Every brand-sourced string, compared rather than merely present. An absent
  // source is a violation of its own: it must not be a way to switch the
  // comparison off.
  const localized = [
    ['Comment[es]', ['shortDescription', 'es']],
    ['GenericName', ['linux', 'genericName', 'en']],
    ['GenericName[es]', ['linux', 'genericName', 'es']],
    ['Keywords', ['linux', 'keywords', 'en']],
    ['Keywords[es]', ['linux', 'keywords', 'es']],
  ];
  for (const [key, source] of localized) {
    const expected = pick(copy, source);
    if (typeof expected !== 'string' || expected === '') {
      violations.push({
        file: COPY_FILE,
        rule: 'linux-desktop-entry',
        detail: `${source.join('.')} is missing. It is the source ${key} is checked against.`,
      });
      continue;
    }
    if (entry.get(key) !== expected) {
      violations.push({
        file: DESKTOP_FILE,
        rule: 'linux-desktop-entry',
        detail: `${key} is ${JSON.stringify(entry.get(key))} but ${COPY_FILE} says ${JSON.stringify(expected)}. Both languages are written once, in brand/.`,
      });
    }
  }

  for (const key of ['Name', 'Icon', 'Exec', 'Type']) {
    if (!entry.has(key)) {
      violations.push({
        file: DESKTOP_FILE,
        rule: 'linux-desktop-entry',
        detail: `${key} is missing; a desktop entry without it does not show up in the launcher.`,
      });
    }
  }

  // `%F` is what hands the file path to Vellum. Losing it leaves an entry that
  // still launches from the menu and silently stops opening files from the file
  // manager — presence of the key alone would never catch that.
  const exec = entry.get('Exec') ?? '';
  if (exec && !/(^|\s)%[fFuU](\s|$)/.test(exec)) {
    violations.push({
      file: DESKTOP_FILE,
      rule: 'linux-desktop-entry',
      detail: `Exec is ${JSON.stringify(exec)} and passes no file argument. Without %F the launcher starts Vellum with no path when a .cslmap is opened through it.`,
    });
  }

  return violations;
}

/** Pass 4 — the opt-in `.cslmap` association (Story 7.5). */
function checkCslmapFragment(root, config) {
  const violations = [];
  const wix = pick(config.bundle ?? {}, ['windows', 'wix']) ?? {};

  if (!(wix.fragmentPaths ?? []).includes('windows/cslmap-association.wxs')) {
    violations.push({
      file: CONFIG_FILE,
      rule: 'cslmap-association',
      detail:
        'bundle.windows.wix.fragmentPaths no longer references windows/cslmap-association.wxs. The MSI would build clean and silently ship without the .cslmap association.',
    });
  }
  if (!(wix.featureRefs ?? []).includes('CslmapAssociationFeature')) {
    violations.push({
      file: CONFIG_FILE,
      rule: 'cslmap-association',
      detail:
        'bundle.windows.wix.featureRefs no longer references CslmapAssociationFeature. The fragment would be compiled and then dropped, because nothing in the generated product refers to it.',
    });
  }

  const absolute = path.join(root, FRAGMENT_FILE);
  if (!fs.existsSync(absolute)) {
    violations.push({
      file: FRAGMENT_FILE,
      rule: 'cslmap-association',
      detail: 'Missing. The opt-in .cslmap association lives only here.',
    });
    return violations;
  }
  const fragment = fs.readFileSync(absolute, 'utf8');
  for (const { name, pattern, regression } of FRAGMENT_INVARIANTS) {
    if (!pattern.test(fragment)) {
      violations.push({
        file: FRAGMENT_FILE,
        rule: 'cslmap-association',
        detail: `The ${name} is gone or was rewritten. Regression: ${regression}`,
      });
    }
  }

  // "No installer runs code" is the strongest claim in the docs, and the JSON
  // walk cannot see the one place code could actually be added: a CustomAction
  // in the fragment reaches the installer through fragmentPaths and executes at
  // install time. There are none today; this keeps it that way.
  if (/<CustomAction\b/.test(fragment)) {
    violations.push({
      file: FRAGMENT_FILE,
      rule: 'no-install-scripts',
      detail:
        'Declares a <CustomAction>, which runs code during install or uninstall. The fragment writes registry keys and nothing else.',
    });
  }
  return violations;
}

/** Pass 5 — no installation scripts, anywhere in the bundle configuration. */
function checkNoInstallScripts(config) {
  const violations = [];
  const walk = (value, trail) => {
    if (!value || typeof value !== 'object') return;
    // Arrays used to end the walk, so a script key inside an array member was
    // never reported.
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, [...trail, String(index)]));
      return;
    }
    for (const [key, nested] of Object.entries(value)) {
      if (SCRIPT_KEYS.includes(key)) {
        violations.push({
          file: CONFIG_FILE,
          rule: 'no-install-scripts',
          detail: `${[...trail, key].join('.')} is set. Vellum's installers copy files and write their own registry keys; they never run a script on the user's machine, and nothing outside the install prefix is touched.`,
        });
      }
      if (TEMPLATE_KEYS.includes(key)) {
        violations.push({
          file: CONFIG_FILE,
          rule: 'no-installer-template',
          detail: `${[...trail, key].join('.')} is set. A custom template takes over the whole installer UI — including, on WiX, the opt-in .cslmap dialog this guardrail exists to protect. Customise through the documented keys instead.`,
        });
      }
      walk(nested, [...trail, key]);
    }
  };
  walk(config.bundle ?? {}, ['bundle']);
  return violations;
}

/**
 * Runs every pass against a repository root.
 *
 * @param root - Absolute path to the repository root to inspect.
 * @returns Every violation found, in pass order. Empty means the installer
 *   identity is intact.
 */
/**
 * Pass 6 — the mark has not forked from the one the app ships.
 *
 * @remarks
 * `brand/vellum-mark.svg` is the artwork source and `apps/desktop/public/`
 * holds the same mark for the app itself. Two copies of one drawing is exactly
 * the divergence this story exists to end, so they are pinned to each other.
 */
function checkMarkIsSingleSource(root) {
  const copies = [
    'brand/vellum-mark.svg',
    'apps/desktop/public/vellum-logo.svg',
  ];
  const hashes = copies.map((relative) => {
    const absolute = path.join(root, relative);
    return fs.existsSync(absolute) ? sha256(fs.readFileSync(absolute)) : null;
  });
  if (hashes.some((hash) => hash === null)) {
    return copies
      .filter((_, index) => hashes[index] === null)
      .map((relative) => ({
        file: relative,
        rule: 'brand-single-source',
        detail:
          'Missing. The mark exists in exactly two places and they must agree.',
      }));
  }
  if (hashes[0] !== hashes[1]) {
    return [
      {
        file: copies[1],
        rule: 'brand-single-source',
        detail: `Has diverged from ${copies[0]}. The installer artwork and the mark the app shows are the same drawing; update brand/, copy it across, and re-run "pnpm brand:build".`,
      },
    ];
  }
  return [];
}

/**
 * Platform overlay configs Tauri merges into the bundle.
 *
 * @remarks
 * Both hold only `app` keys today, but Tauri merges their `bundle` block too —
 * so a `licenseFile`, a `postInstallScript` or a per-machine `installMode`
 * dropped in here used to pass every pass of this checker.
 */
const OVERLAY_FILES = [
  'apps/desktop/src-tauri/tauri.macos.conf.json',
  'apps/desktop/src-tauri/tauri.windows.conf.json',
];

function checkOverlays(root) {
  const violations = [];
  for (const relative of OVERLAY_FILES) {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) continue;
    const overlay = readJson(root, relative, violations, 'identity-metadata');
    if (!overlay?.bundle) continue;
    violations.push({
      file: relative,
      rule: 'identity-metadata',
      detail:
        'Declares a "bundle" block. Tauri merges it over tauri.conf.json, so packaging decisions here bypass every check in this guardrail. Packaging stays in the single contract; these overlays exist for window chrome only.',
    });
  }
  return violations;
}

export function verifyInstallerIdentity(root) {
  const violations = [];
  const config = readJson(root, CONFIG_FILE, violations, 'identity-metadata');
  const copy = readJson(root, COPY_FILE, violations, 'identity-metadata');
  if (config === null || copy === null) return violations;

  return [
    ...violations,
    ...checkIdentityMetadata(config, copy),
    ...checkDerivedArtwork(root),
    ...checkPlatformConfig(root, config, copy),
    ...checkCslmapFragment(root, config),
    ...checkNoInstallScripts(config),
    ...checkMarkIsSingleSource(root),
    ...checkOverlays(root),
  ];
}

function main() {
  const root = process.cwd();
  const violations = verifyInstallerIdentity(root);

  if (violations.length === 0) {
    console.log(
      'Installer identity intact: metadata matches brand/, artwork is derived and correctly sized, the .cslmap association stays opt-in, and no installer runs a script.',
    );
    return;
  }

  console.error(
    `Installer identity regression — ${violations.length} finding(s):`,
  );
  for (const violation of violations) {
    console.error(
      `  [${violation.rule}] ${violation.file}\n    ${violation.detail}`,
    );
  }
  process.exitCode = 1;
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main();
}
