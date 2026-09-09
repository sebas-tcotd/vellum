/**
 * Pins the installer-identity guardrail (Story 1.9).
 *
 * One synthetic repository per row of the spec's I/O matrix. The clean root is
 * a copy of the real files rather than a hand-written fake: the guardrail's
 * whole job is to compare committed artwork against committed sources, and a
 * fixture that invented its own BMPs would prove the checks run without
 * proving they hold over what actually ships.
 */

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  IDENTITY_KEYS,
  FRAGMENT_INVARIANTS,
  NSIS_TEMPLATE_INVARIANTS,
  readImageSize,
  verifyInstallerIdentity,
} from './verify-installer-identity.mjs';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const CONFIG = 'apps/desktop/src-tauri/tauri.conf.json';
const COPY = 'brand/installer-copy.json';
const DESKTOP = 'apps/desktop/src-tauri/linux/vellum.desktop';
const FRAGMENT = 'apps/desktop/src-tauri/windows/cslmap-association.wxs';

const roots = [];

afterEach(() => {
  while (roots.length > 0) {
    fs.rmSync(roots.pop(), { recursive: true, force: true });
  }
});

/**
 * Everything the guardrail reads, copied out of the real repository — plus
 * `LICENSE`, so the licenseFile test can point at a file that genuinely
 * exists and still be rejected.
 */
const FIXTURE_TREE = [
  'brand',
  'LICENSE',
  'apps/desktop/src-tauri/installer',
  'apps/desktop/src-tauri/linux',
  'apps/desktop/src-tauri/windows',
  'apps/desktop/src-tauri/icons/icon.ico',
  'apps/desktop/public/vellum-logo.svg',
  'apps/desktop/src-tauri/tauri.macos.conf.json',
  'apps/desktop/src-tauri/tauri.windows.conf.json',
  CONFIG,
];

function cleanRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vellum-installer-'));
  roots.push(root);
  for (const relative of FIXTURE_TREE) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(path.join(repoRoot, relative), target, { recursive: true });
  }
  return root;
}

function readJson(root, relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
}

function writeJson(root, relative, value) {
  fs.writeFileSync(
    path.join(root, relative),
    `${JSON.stringify(value, null, 2)}\n`,
  );
}

/** Applies one edit to the fixture's tauri.conf.json. */
function editConfig(root, mutate) {
  const config = readJson(root, CONFIG);
  mutate(config.bundle, config);
  writeJson(root, CONFIG, config);
  return root;
}

function rules(root) {
  return verifyInstallerIdentity(root).map((violation) => violation.rule);
}

function details(root) {
  return verifyInstallerIdentity(root)
    .map((violation) => violation.detail)
    .join('\n');
}

describe('verify-installer-identity', () => {
  it('passes on the real repository', () => {
    expect(verifyInstallerIdentity(repoRoot)).toEqual([]);
  });

  it('passes on a faithful copy of it', () => {
    expect(verifyInstallerIdentity(cleanRoot())).toEqual([]);
  });

  describe('identity metadata', () => {
    for (const { key, top } of IDENTITY_KEYS) {
      const label = top ? key : `bundle.${key}`;
      it(`fails when ${label} is deleted, and names the key`, () => {
        const root = cleanRoot();
        const config = readJson(root, CONFIG);
        if (top) {
          delete config[key];
        } else {
          delete config.bundle[key];
        }
        writeJson(root, CONFIG, config);
        expect(rules(root)).toContain('identity-metadata');
        expect(details(root)).toContain(label);
      });
    }

    it('fails when a metadata value drifts from brand/installer-copy.json', () => {
      const root = editConfig(cleanRoot(), (bundle) => {
        bundle.publisher = 'Someone Else';
      });
      expect(details(root)).toContain('Someone Else');
      expect(details(root)).toContain(COPY);
    });

    it('fails when licenseFile reappears, even pointing at the real LICENSE', () => {
      const root = editConfig(cleanRoot(), (bundle) => {
        bundle.licenseFile = '../../../LICENSE';
      });
      expect(rules(root)).toContain('identity-metadata');
      expect(details(root)).toContain('bundle.licenseFile');
      expect(details(root)).toContain('software licence agreement');
    });

    it('fails when bundle.fileAssociations reappears', () => {
      const root = editConfig(cleanRoot(), (bundle) => {
        bundle.fileAssociations = [{ ext: ['cslmap'] }];
      });
      expect(details(root)).toContain('opt-in');
    });

    it('fails when minimumSystemVersion is dropped', () => {
      const root = editConfig(cleanRoot(), (bundle) => {
        delete bundle.macOS.minimumSystemVersion;
      });
      expect(details(root)).toContain('minimumSystemVersion');
    });
  });

  describe('derived artwork', () => {
    it('fails when an artwork file is deleted, naming it', () => {
      const root = cleanRoot();
      fs.rmSync(
        path.join(root, 'apps/desktop/src-tauri/installer/wix-banner.bmp'),
      );
      expect(rules(root)).toContain('derived-artwork');
      expect(details(root)).toContain('493x58');
    });

    it('fails on a wrongly sized BMP, naming expected and actual', () => {
      const root = cleanRoot();
      const file = path.join(
        root,
        'apps/desktop/src-tauri/installer/wix-banner.bmp',
      );
      const bytes = fs.readFileSync(file);
      bytes.writeInt32LE(500, 18);
      bytes.writeInt32LE(60, 22);
      fs.writeFileSync(file, bytes);
      expect(details(root)).toContain('Expected 493x58, got 500x60');
    });

    it('fails on an unreadable file with the same message', () => {
      const root = cleanRoot();
      fs.writeFileSync(
        path.join(root, 'apps/desktop/src-tauri/installer/wix-dialog.bmp'),
        'this is not a bitmap',
      );
      expect(details(root)).toContain('493x312');
      expect(details(root)).toContain('not a BMP file');
    });

    it('fails when the PNG background is the wrong size', () => {
      const root = cleanRoot();
      const file = path.join(
        root,
        'apps/desktop/src-tauri/installer/dmg-background.png',
      );
      const bytes = fs.readFileSync(file);
      bytes.writeUInt32BE(800, 16);
      fs.writeFileSync(file, bytes);
      expect(details(root)).toContain('got 800x400');
    });

    it('fails when brand/ changed but the derivatives were not rebuilt', () => {
      const root = cleanRoot();
      const copy = readJson(root, COPY);
      copy.palette.sepia = '#000000';
      writeJson(root, COPY, copy);
      expect(details(root)).toContain('pnpm brand:build');
    });

    it('fails when a derivative was retouched in place', () => {
      const root = cleanRoot();
      const file = path.join(
        root,
        'apps/desktop/src-tauri/installer/nsis-sidebar.bmp',
      );
      const bytes = fs.readFileSync(file);
      bytes[60] = bytes[60] ^ 0xff;
      fs.writeFileSync(file, bytes);
      expect(details(root)).toContain('never edited at its destination');
    });
  });

  describe('platform configuration', () => {
    it('fails when an artwork reference is removed', () => {
      const root = editConfig(cleanRoot(), (bundle) => {
        delete bundle.windows.wix.bannerPath;
      });
      expect(rules(root)).toContain('installer-artwork-reference');
    });

    it('fails when an artwork reference points somewhere else', () => {
      const root = editConfig(cleanRoot(), (bundle) => {
        bundle.windows.nsis.sidebarImage = 'icons/icon.ico';
      });
      expect(details(root)).toContain('nsis-sidebar.bmp');
    });

    it('fails when a referenced artwork file does not exist', () => {
      const root = cleanRoot();
      fs.rmSync(
        path.join(root, 'apps/desktop/src-tauri/installer/nsis-header.bmp'),
      );
      expect(details(root)).toContain('does not exist relative to');
    });

    it('fails when the NSIS splash is not bundled as a resource', () => {
      const root = editConfig(cleanRoot(), (bundle) => {
        bundle.resources = bundle.resources.filter(
          (resource) => resource !== 'installer/vellum-splash.bmp',
        );
      });
      expect(details(root)).toContain('vellum-splash.bmp');
    });

    it('fails when the WiX Spanish locale is dropped', () => {
      const root = editConfig(cleanRoot(), (bundle) => {
        bundle.windows.wix.language = ['en-US'];
      });
      expect(rules(root)).toContain('installer-language');
    });

    it('fails when NSIS stops offering a language selector', () => {
      const root = editConfig(cleanRoot(), (bundle) => {
        bundle.windows.nsis.displayLanguageSelector = false;
      });
      expect(rules(root)).toContain('installer-language');
    });

    it('fails when NSIS switches to a per-machine install', () => {
      const root = editConfig(cleanRoot(), (bundle) => {
        bundle.windows.nsis.installMode = 'perMachine';
      });
      expect(rules(root)).toContain('installer-privileges');
    });

    it('fails when the DMG window stops matching its background', () => {
      const root = editConfig(cleanRoot(), (bundle) => {
        bundle.macOS.dmg.windowSize = { width: 540, height: 380 };
      });
      expect(rules(root)).toContain('dmg-layout');
    });

    it('fails when an icon is positioned outside the DMG window', () => {
      const root = editConfig(cleanRoot(), (bundle) => {
        bundle.macOS.dmg.applicationFolderPosition = { x: 900, y: 200 };
      });
      expect(rules(root)).toContain('dmg-layout');
    });

    it('fails when the .deb and .rpm stop sharing the desktop template', () => {
      const root = editConfig(cleanRoot(), (bundle) => {
        delete bundle.linux.rpm.desktopTemplate;
      });
      expect(rules(root)).toContain('linux-desktop-entry');
    });
  });

  describe('linux desktop entry', () => {
    function editDesktop(root, mutate) {
      const file = path.join(root, DESKTOP);
      fs.writeFileSync(file, mutate(fs.readFileSync(file, 'utf8')));
      return root;
    }

    it('fails when the entry disappears', () => {
      const root = cleanRoot();
      fs.rmSync(path.join(root, DESKTOP));
      expect(rules(root)).toContain('linux-desktop-entry');
    });

    it('fails when a category is dropped', () => {
      const root = editDesktop(cleanRoot(), (text) =>
        text.replace('Categories=Graphics;Education;', 'Categories=Graphics;'),
      );
      expect(details(root)).toContain('Education');
    });

    it('fails when the comment stops being interpolated', () => {
      const root = editDesktop(cleanRoot(), (text) =>
        text.replace('Comment={{comment}}', 'Comment=A map thing'),
      );
      expect(details(root)).toContain('{{comment}}');
    });

    it('fails when the Spanish comment drifts from brand/', () => {
      const root = editDesktop(cleanRoot(), (text) =>
        text.replace(/^Comment\[es\]=.*$/m, 'Comment[es]=Otra cosa'),
      );
      expect(details(root)).toContain(COPY);
    });

    it('declares no MimeType, because nothing installs a shared-mime-info definition', () => {
      const root = cleanRoot();
      const text = fs.readFileSync(path.join(root, DESKTOP), 'utf8');
      expect(text).not.toMatch(/^MimeType=/m);
    });

    it('fails when Exec loses its file argument', () => {
      const root = editDesktop(cleanRoot(), (text) =>
        text.replace(/^Exec=.*$/m, 'Exec={{exec}}'),
      );
      expect(details(root)).toContain('passes no file argument');
    });

    it('fails when the [Desktop Entry] header is gone', () => {
      const root = editDesktop(cleanRoot(), (text) =>
        text.replace('[Desktop Entry]\n', ''),
      );
      expect(details(root)).toContain('[Desktop Entry]');
    });

    it('fails when a key is declared twice', () => {
      const root = editDesktop(
        cleanRoot(),
        (text) => `${text}Categories=Graphics;Education;\n`,
      );
      expect(details(root)).toContain('declared more than once');
    });

    it('parses a lang_COUNTRY locale suffix rather than dropping the line', () => {
      const root = editDesktop(
        cleanRoot(),
        (text) => `${text}Comment[pt_BR]=Mapas imprimiveis.\n`,
      );
      expect(verifyInstallerIdentity(root)).toEqual([]);
    });

    it('ignores commented-out lines', () => {
      const root = editDesktop(
        cleanRoot(),
        (text) => `${text}# Categories=Nonsense;\n`,
      );
      expect(verifyInstallerIdentity(root)).toEqual([]);
    });
  });

  describe('the opt-in .cslmap association', () => {
    it('fails when the fragment stops being referenced', () => {
      const root = editConfig(cleanRoot(), (bundle) => {
        bundle.windows.wix.fragmentPaths = [];
      });
      expect(rules(root)).toContain('cslmap-association');
      expect(details(root)).toContain('silently ship without');
    });

    it('fails when the featureRef is removed', () => {
      const root = editConfig(cleanRoot(), (bundle) => {
        bundle.windows.wix.featureRefs = [];
      });
      expect(details(root)).toContain('compiled and then dropped');
    });

    it('fails when the fragment file is gone', () => {
      const root = cleanRoot();
      fs.rmSync(path.join(root, FRAGMENT));
      expect(rules(root)).toContain('cslmap-association');
    });

    it('fails when the feature stops being opt-in, explaining the regression', () => {
      const root = cleanRoot();
      const file = path.join(root, FRAGMENT);
      fs.writeFileSync(
        file,
        fs.readFileSync(file, 'utf8').replace('Level="0"', 'Level="1"'),
      );
      expect(details(root)).toContain('install by default');
    });

    it('fails when the upgrade RegistrySearch is dropped', () => {
      const root = cleanRoot();
      const file = path.join(root, FRAGMENT);
      fs.writeFileSync(
        file,
        fs.readFileSync(file, 'utf8').replace(/<RegistrySearch[^>]*\/>/, ''),
      );
      expect(details(root)).toContain('silently un-associate');
    });

    it('covers every documented fragment invariant', () => {
      // A guardrail is only as good as the invariant list; this fails the day
      // someone adds one without a matching mutation above.
      expect(FRAGMENT_INVARIANTS.length).toBe(6);
      const fragment = fs.readFileSync(path.join(repoRoot, FRAGMENT), 'utf8');
      for (const { pattern } of FRAGMENT_INVARIANTS) {
        expect(pattern.test(fragment)).toBe(true);
      }
    });
  });

  describe('installation scripts', () => {
    for (const [where, key] of [
      ['linux.deb', 'postInstallScript'],
      ['linux.rpm', 'preRemoveScript'],
      ['windows.nsis', 'installerHooks'],
    ]) {
      it(`fails on bundle.${where}.${key}`, () => {
        const root = editConfig(cleanRoot(), (bundle) => {
          const [platform, format] = where.split('.');
          bundle[platform][format][key] = 'something.sh';
        });
        expect(rules(root)).toContain('no-install-scripts');
        expect(details(root)).toContain(`bundle.${where}.${key}`);
      });
    }

    // A custom template does not run code — it takes over the UI, including
    // the opt-in .cslmap dialog. Separate rule, separate message.
    it('fails on bundle.windows.wix.template under its own rule', () => {
      const root = editConfig(cleanRoot(), (bundle) => {
        bundle.windows.wix.template = 'main.wxs';
      });
      expect(rules(root)).toContain('no-installer-template');
      expect(rules(root)).not.toContain('no-install-scripts');
    });

    it('requires the reviewed NSIS template and every Tauri invariant', () => {
      const root = cleanRoot();
      const file = path.join(
        root,
        'apps/desktop/src-tauri/installer/vellum-installer.nsi',
      );
      fs.writeFileSync(
        file,
        fs.readFileSync(file, 'utf8').replace('WriteUninstaller', '; removed'),
      );
      expect(rules(root)).toContain('nsis-template');
      expect(NSIS_TEMPLATE_INVARIANTS).toHaveLength(11);
    });

    it('finds a script key nested inside an array', () => {
      const root = editConfig(cleanRoot(), (bundle) => {
        bundle.linux.deb.recommends = [{ postInstallScript: 'sneaky.sh' }];
      });
      expect(rules(root)).toContain('no-install-scripts');
    });

    it('fails on a <CustomAction> in the .cslmap fragment', () => {
      const root = cleanRoot();
      const file = path.join(root, FRAGMENT);
      fs.writeFileSync(
        file,
        fs
          .readFileSync(file, 'utf8')
          .replace(
            '</Fragment>',
            '<CustomAction Id="Boom" ExeCommand="cmd" /></Fragment>',
          ),
      );
      expect(details(root)).toContain('CustomAction');
    });
  });

  describe('the manifest cannot switch the check off', () => {
    const MANIFEST = 'apps/desktop/src-tauri/installer/derived-assets.json';

    it('fails when an asset row is missing, instead of skipping it', () => {
      const root = cleanRoot();
      const manifest = readJson(root, MANIFEST);
      delete manifest.assets['nsis-sidebar.bmp'];
      writeJson(root, MANIFEST, manifest);
      const bytes = fs.readFileSync(
        path.join(root, 'apps/desktop/src-tauri/installer/nsis-sidebar.bmp'),
      );
      bytes[100] = bytes[100] ^ 0xff;
      fs.writeFileSync(
        path.join(root, 'apps/desktop/src-tauri/installer/nsis-sidebar.bmp'),
        bytes,
      );
      expect(details(root)).toContain(
        'No sha256 recorded for nsis-sidebar.bmp',
      );
    });

    it('fails when a source row is missing, instead of skipping it', () => {
      const root = cleanRoot();
      const manifest = readJson(root, MANIFEST);
      delete manifest.source[COPY];
      writeJson(root, MANIFEST, manifest);
      const copy = readJson(root, COPY);
      copy.palette.sepia = '#000000';
      writeJson(root, COPY, copy);
      expect(details(root)).toContain(`No sha256 recorded for ${COPY}`);
    });

    it('fails on a row for something that is not a derived asset', () => {
      const root = cleanRoot();
      const manifest = readJson(root, MANIFEST);
      manifest.assets['extra.bmp'] = { sha256: 'x' };
      writeJson(root, MANIFEST, manifest);
      expect(details(root)).toContain('extra.bmp');
    });
  });

  describe('a single source for the mark and for packaging', () => {
    it('fails when the app copy of the mark diverges from brand/', () => {
      const root = cleanRoot();
      const file = path.join(root, 'apps/desktop/public/vellum-logo.svg');
      fs.writeFileSync(file, `${fs.readFileSync(file, 'utf8')}<!-- drift -->`);
      expect(rules(root)).toContain('brand-single-source');
    });

    it('fails when a platform overlay declares a bundle block', () => {
      const root = cleanRoot();
      const overlay = 'apps/desktop/src-tauri/tauri.windows.conf.json';
      const value = readJson(root, overlay);
      value.bundle = { windows: { nsis: { installMode: 'perMachine' } } };
      writeJson(root, overlay, value);
      expect(details(root)).toContain('bundle');
      expect(rules(root)).toContain('identity-metadata');
    });
  });

  describe('the DMG layout has one source', () => {
    it('fails when an icon drifts inside the window, away from the arrow', () => {
      const root = editConfig(cleanRoot(), (bundle) => {
        bundle.macOS.dmg.appPosition = { x: 20, y: 20 };
        bundle.macOS.dmg.applicationFolderPosition = { x: 640, y: 390 };
      });
      expect(rules(root)).toContain('dmg-layout');
      expect(details(root)).toContain('stops explaining anything');
    });
  });

  describe('reading image headers', () => {
    it('rejects a BMP that is not 24-bit', () => {
      const bytes = fs.readFileSync(
        path.join(repoRoot, 'apps/desktop/src-tauri/installer/wix-banner.bmp'),
      );
      bytes.writeUInt16LE(32, 28);
      expect(() => readImageSize(bytes, 'bmp')).toThrow(/32-bit/);
    });

    it('rejects a 24-bit BMP that is not BI_RGB', () => {
      const bytes = fs.readFileSync(
        path.join(repoRoot, 'apps/desktop/src-tauri/installer/wix-banner.bmp'),
      );
      bytes.writeUInt32LE(2, 30);
      expect(() => readImageSize(bytes, 'bmp')).toThrow(/compression 2/);
    });

    it('reads a bottom-up and a top-down BMP the same way', () => {
      const bytes = fs.readFileSync(
        path.join(repoRoot, 'apps/desktop/src-tauri/installer/nsis-header.bmp'),
      );
      expect(readImageSize(bytes, 'bmp')).toEqual({ width: 150, height: 57 });
      bytes.writeInt32LE(-57, 22);
      expect(readImageSize(bytes, 'bmp')).toEqual({ width: 150, height: 57 });
    });
  });

  describe('unreadable inputs', () => {
    it('reports malformed JSON instead of crashing', () => {
      const root = cleanRoot();
      fs.writeFileSync(path.join(root, CONFIG), '{ "bundle": }');
      expect(details(root)).toContain('Could not be parsed as JSON');
    });
  });
});
