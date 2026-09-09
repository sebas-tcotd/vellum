import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { generateUpdaterManifest } from './generate-updater-manifest.mjs';

const artifacts = {
  msi: 'Vellum_0.2.1_x64_en-US.msi',
  nsis: 'Vellum_0.2.1_x64-setup.exe',
  appimage: 'Vellum_0.2.1_amd64.AppImage',
  deb: 'Vellum_0.2.1_amd64.deb',
  rpm: 'Vellum-0.2.1-1.x86_64.rpm',
  macos: 'Vellum_universal.app.tar.gz',
};

const requiredArtifacts = Object.values(artifacts);

const platformArtifacts = {
  'darwin-aarch64': artifacts.macos,
  'darwin-aarch64-app': artifacts.macos,
  'darwin-x86_64': artifacts.macos,
  'darwin-x86_64-app': artifacts.macos,
  'linux-x86_64': artifacts.appimage,
  'linux-x86_64-appimage': artifacts.appimage,
  'linux-x86_64-deb': artifacts.deb,
  'linux-x86_64-rpm': artifacts.rpm,
  'windows-x86_64': artifacts.msi,
  'windows-x86_64-msi': artifacts.msi,
  'windows-x86_64-nsis': artifacts.nsis,
};

function completeInventory() {
  return [
    'latest.json',
    ...requiredArtifacts.flatMap((name) => [name, `${name}.sig`]),
    // WiX también publica otros idiomas. No son candidatos al manifest.
    'Vellum_0.2.1_x64_es-ES.msi',
    'Vellum_0.2.1_x64_es-ES.msi.sig',
  ];
}

function fixture(overrides = {}) {
  const inventory = overrides.inventory ?? completeInventory();
  const signatures = overrides.signatures ?? {};
  return generateUpdaterManifest({
    inventory,
    repository: 'sebas-tcotd/vellum',
    tag: overrides.tag ?? 'v0.2.1',
    version: overrides.version ?? '0.2.1',
    pubDate: '2026-09-08T12:00:00Z',
    notes: 'Notas',
    readSignature: (name) => signatures[name] ?? `firma:${name}`,
  });
}

function withoutArtifact(name) {
  return completeInventory().filter(
    (asset) => asset !== name && asset !== `${name}.sig`,
  );
}

describe('generateUpdaterManifest', () => {
  it('reproduce exactamente las claves observadas en latest.json de v0.2.1', () => {
    const manifest = fixture();

    expect(Object.keys(manifest.platforms)).toEqual([
      'darwin-aarch64',
      'darwin-aarch64-app',
      'darwin-x86_64',
      'darwin-x86_64-app',
      'linux-x86_64',
      'linux-x86_64-appimage',
      'linux-x86_64-deb',
      'linux-x86_64-rpm',
      'windows-x86_64',
      'windows-x86_64-msi',
      'windows-x86_64-nsis',
    ]);
    expect(manifest.platforms).not.toHaveProperty('darwin-universal');
    expect(manifest.platforms['windows-x86_64']).toEqual(
      manifest.platforms['windows-x86_64-msi'],
    );
    expect(manifest.platforms['windows-x86_64'].url).toBe(
      `https://github.com/sebas-tcotd/vellum/releases/download/v0.2.1/${artifacts.msi}`,
    );
    expect(manifest.platforms['linux-x86_64']).toEqual(
      manifest.platforms['linux-x86_64-appimage'],
    );
    expect(manifest.platforms['darwin-aarch64']).toEqual(
      manifest.platforms['darwin-x86_64'],
    );
  });

  it.each(Object.entries(platformArtifacts))(
    'mapea %s al artefacto y firma exactos',
    (platform, artifact) => {
      const entry = fixture().platforms[platform];

      expect(entry).toEqual({
        signature: `firma:${artifact}.sig`,
        url: `https://github.com/sebas-tcotd/vellum/releases/download/v0.2.1/${artifact}`,
      });
    },
  );

  it('permite MSI localizados adicionales sin convertirlos en candidatos', () => {
    const manifest = fixture();
    expect(manifest.platforms['windows-x86_64-msi'].url).toContain(
      artifacts.msi,
    );
    expect(JSON.stringify(manifest)).not.toContain('es-ES');
  });

  it('falla con el AppImage faltante observado en el draft v0.2.1', () => {
    expect(() =>
      fixture({ inventory: withoutArtifact(artifacts.appimage) }),
    ).toThrow(`Falta el updater AppImage exacto "${artifacts.appimage}".`);
  });

  it.each([
    ['MSI en-US', artifacts.msi, 'Falta el updater MSI en-US exacto'],
    ['NSIS', artifacts.nsis, 'Falta el updater NSIS exacto'],
    ['DEB', artifacts.deb, 'Falta el updater DEB exacto'],
    ['RPM', artifacts.rpm, 'Falta el updater RPM exacto'],
    ['macOS app', artifacts.macos, 'Falta el updater macOS universal exacto'],
  ])('exige la clase %s', (_label, name, expectedError) => {
    expect(() => fixture({ inventory: withoutArtifact(name) })).toThrow(
      expectedError,
    );
  });

  it('falla con el nombre exacto de una firma ausente', () => {
    const inventory = completeInventory().filter(
      (name) => name !== `${artifacts.deb}.sig`,
    );
    expect(() => fixture({ inventory })).toThrow(
      `Falta la firma updater exacta "${artifacts.deb}.sig" para "${artifacts.deb}".`,
    );
  });

  it('rechaza firmas vacías', () => {
    expect(() =>
      fixture({ signatures: { [`${artifacts.rpm}.sig`]: '  \n' } }),
    ).toThrow(`La firma updater "${artifacts.rpm}.sig" está vacía.`);
  });

  it('normaliza el whitespace alrededor de las firmas descargadas', () => {
    const manifest = fixture({
      signatures: { [`${artifacts.rpm}.sig`]: '  firma-rpm\n' },
    });

    expect(manifest.platforms['linux-x86_64-rpm'].signature).toBe('firma-rpm');
  });

  it('rechaza firmas huérfanas de clases updater conocidas', () => {
    const orphan = 'Vellum_0.2.0_amd64.AppImage.sig';
    expect(() =>
      fixture({ inventory: [...completeInventory(), orphan] }),
    ).toThrow(`Firma updater huérfana: "${orphan}"`);
  });

  it('rechaza nombres duplicados exactos en el inventario', () => {
    expect(() =>
      fixture({ inventory: [...completeInventory(), artifacts.deb] }),
    ).toThrow(`El inventario contiene assets duplicados: ${artifacts.deb}`);
  });

  it('rechaza más de un MSI en-US sin elegir por orden incidental', () => {
    const second = 'Vellum-preview_0.2.1_x64_en-US.msi';
    expect(() =>
      fixture({
        inventory: [...completeInventory(), second, `${second}.sig`],
      }),
    ).toThrow(
      `Inventario ambiguo para windows-msi-en-US: ${second}, ${artifacts.msi}`,
    );
  });

  it('rechaza un único MSI en-US cuyo nombre no es el esperado', () => {
    const wrong = 'Vellum-preview_0.2.1_x64_en-US.msi';
    const inventory = withoutArtifact(artifacts.msi);
    inventory.push(wrong, `${wrong}.sig`);
    expect(() => fixture({ inventory })).toThrow(
      `no coincide con el nombre esperado "${artifacts.msi}"`,
    );
  });

  it('rechaza tags que no corresponden a la versión', () => {
    expect(() => fixture({ tag: 'v0.2.2' })).toThrow(
      'El tag "v0.2.2" no corresponde a la versión "0.2.1".',
    );
  });

  it('no mezcla latest.json heredado y produce el mismo documento en reruns', () => {
    const first = fixture();
    const second = fixture();
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(JSON.stringify(second)).not.toContain('stale-platform');
  });

  it('ejecuta el CLI con firmas del filesystem y serializa el manifest', () => {
    const directory = mkdtempSync(join(tmpdir(), 'vellum-updater-manifest-'));
    const signaturesDirectory = join(directory, 'signatures');
    const inventoryPath = join(directory, 'inventory.json');
    const notesPath = join(directory, 'notes.txt');
    const outputPath = join(directory, 'latest.json');

    try {
      mkdirSync(signaturesDirectory);
      writeFileSync(inventoryPath, JSON.stringify(completeInventory()));
      writeFileSync(notesPath, 'Notas desde CLI');
      for (const artifact of requiredArtifacts) {
        writeFileSync(
          join(signaturesDirectory, `${artifact}.sig`),
          `firma-cli:${artifact}\n`,
        );
      }

      const result = spawnSync(
        process.execPath,
        [
          resolve('scripts/generate-updater-manifest.mjs'),
          '--inventory',
          inventoryPath,
          '--signatures-dir',
          signaturesDirectory,
          '--repository',
          'sebas-tcotd/vellum',
          '--tag',
          'v0.2.1',
          '--version',
          '0.2.1',
          '--pub-date',
          '2026-09-08T12:00:00Z',
          '--notes-file',
          notesPath,
          '--output',
          outputPath,
        ],
        { encoding: 'utf8' },
      );

      expect(result.status, result.stderr).toBe(0);
      const manifest = JSON.parse(readFileSync(outputPath, 'utf8'));
      expect(manifest.notes).toBe('Notas desde CLI');
      expect(manifest.platforms['windows-x86_64-nsis']).toEqual({
        signature: `firma-cli:${artifacts.nsis}`,
        url: `https://github.com/sebas-tcotd/vellum/releases/download/v0.2.1/${artifacts.nsis}`,
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
