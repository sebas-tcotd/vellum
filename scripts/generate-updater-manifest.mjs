import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const REQUIRED_KINDS = [
  {
    id: 'windows-msi-en-US',
    expectedName: (version) => `Vellum_${version}_x64_en-US.msi`,
    matches: (name) => name.endsWith('_x64_en-US.msi'),
    missing: (version) =>
      `Falta el updater MSI en-US exacto "Vellum_${version}_x64_en-US.msi".`,
  },
  {
    id: 'windows-nsis',
    expectedName: (version) => `Vellum_${version}_x64-setup.exe`,
    matches: (name, version) => name === `Vellum_${version}_x64-setup.exe`,
    missing: (version) =>
      `Falta el updater NSIS exacto "Vellum_${version}_x64-setup.exe".`,
  },
  {
    id: 'linux-appimage',
    expectedName: (version) => `Vellum_${version}_amd64.AppImage`,
    matches: (name, version) => name === `Vellum_${version}_amd64.AppImage`,
    missing: (version) =>
      `Falta el updater AppImage exacto "Vellum_${version}_amd64.AppImage".`,
  },
  {
    id: 'linux-deb',
    expectedName: (version) => `Vellum_${version}_amd64.deb`,
    matches: (name, version) => name === `Vellum_${version}_amd64.deb`,
    missing: (version) =>
      `Falta el updater DEB exacto "Vellum_${version}_amd64.deb".`,
  },
  {
    id: 'linux-rpm',
    expectedName: (version) => `Vellum-${version}-1.x86_64.rpm`,
    matches: (name, version) => name === `Vellum-${version}-1.x86_64.rpm`,
    missing: (version) =>
      `Falta el updater RPM exacto "Vellum-${version}-1.x86_64.rpm".`,
  },
  {
    id: 'macos-app',
    expectedName: () => 'Vellum_universal.app.tar.gz',
    matches: (name) => name === 'Vellum_universal.app.tar.gz',
    missing: () =>
      'Falta el updater macOS universal exacto "Vellum_universal.app.tar.gz".',
  },
];

const KNOWN_UPDATER_SUFFIXES = [
  '.msi',
  '.exe',
  '.AppImage',
  '.deb',
  '.rpm',
  '.app.tar.gz',
];

function fail(message) {
  throw new Error(message);
}

function assetNames(inventory) {
  if (!Array.isArray(inventory)) {
    fail('El inventario de release debe ser un array JSON.');
  }

  const names = inventory.map((asset, index) => {
    const name = typeof asset === 'string' ? asset : asset?.name;
    if (typeof name !== 'string' || name.length === 0) {
      fail(`El asset en la posición ${index} no tiene un nombre válido.`);
    }
    if (path.basename(name) !== name) {
      fail(`El asset "${name}" no puede contener separadores de ruta.`);
    }
    return name;
  });

  const duplicates = [
    ...new Set(names.filter((name, i) => names.indexOf(name) !== i)),
  ];
  if (duplicates.length > 0) {
    fail(`El inventario contiene assets duplicados: ${duplicates.join(', ')}`);
  }
  return names;
}

function isKnownUpdaterArtifact(name) {
  return KNOWN_UPDATER_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

function immutableUrl(repository, tag, assetName) {
  return `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(assetName)}`;
}

function platformEntry(candidate, repository, tag, readSignature) {
  const signatureName = `${candidate.name}.sig`;
  const signature = readSignature(signatureName);
  if (typeof signature !== 'string' || signature.trim().length === 0) {
    fail(`La firma updater "${signatureName}" está vacía.`);
  }
  return {
    signature: signature.trim(),
    url: immutableUrl(repository, tag, candidate.name),
  };
}

export function generateUpdaterManifest({
  inventory,
  repository,
  tag,
  version,
  pubDate,
  notes = '',
  readSignature,
}) {
  if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) {
    fail(`Repositorio inválido: "${repository}"; se esperaba owner/repo.`);
  }
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    fail(`Versión inválida: "${version}".`);
  }
  if (tag !== `v${version}`) {
    fail(`El tag "${tag}" no corresponde a la versión "${version}".`);
  }
  if (Number.isNaN(Date.parse(pubDate))) {
    fail(`Fecha de publicación inválida: "${pubDate}".`);
  }
  if (typeof readSignature !== 'function') {
    fail('Se requiere un lector de firmas updater.');
  }

  const names = assetNames(inventory);
  const nameSet = new Set(names);
  const candidates = new Map();

  for (const kind of REQUIRED_KINDS) {
    const matches = names
      .filter((name) => !name.endsWith('.sig') && kind.matches(name, version))
      .sort();
    if (matches.length > 1) {
      fail(`Inventario ambiguo para ${kind.id}: ${matches.join(', ')}`);
    }
    if (matches.length === 0) {
      fail(kind.missing(version));
    }
    const expectedName = kind.expectedName(version);
    if (matches[0] !== expectedName) {
      fail(
        `El candidato ${kind.id} "${matches[0]}" no coincide con el nombre esperado "${expectedName}".`,
      );
    }
    candidates.set(kind.id, { ...kind, name: matches[0] });
  }

  for (const name of names.filter((asset) => asset.endsWith('.sig')).sort()) {
    const artifactName = name.slice(0, -4);
    if (isKnownUpdaterArtifact(artifactName) && !nameSet.has(artifactName)) {
      fail(
        `Firma updater huérfana: "${name}" no tiene su archive correspondiente.`,
      );
    }
  }

  for (const candidate of candidates.values()) {
    const signatureName = `${candidate.name}.sig`;
    if (!nameSet.has(signatureName)) {
      fail(
        `Falta la firma updater exacta "${signatureName}" para "${candidate.name}".`,
      );
    }
  }

  const windowsMsi = candidates.get('windows-msi-en-US');
  const windowsNsis = candidates.get('windows-nsis');
  const linuxAppImage = candidates.get('linux-appimage');
  const linuxDeb = candidates.get('linux-deb');
  const linuxRpm = candidates.get('linux-rpm');
  const macos = candidates.get('macos-app');

  const entries = new Map();
  const add = (key, candidate) => {
    entries.set(key, platformEntry(candidate, repository, tag, readSignature));
  };

  // El inventario real de Vellum usa unzippedSig. La entrada genérica Windows
  // debe apuntar al MSI en-US por contrato, nunca al primer asset encontrado.
  add('windows-x86_64', windowsMsi);
  add('windows-x86_64-msi', windowsMsi);
  add('windows-x86_64-nsis', windowsNsis);

  add('linux-x86_64', linuxAppImage);
  add('linux-x86_64-appimage', linuxAppImage);
  add('linux-x86_64-deb', linuxDeb);
  add('linux-x86_64-rpm', linuxRpm);

  for (const arch of ['aarch64', 'x86_64']) {
    add(`darwin-${arch}`, macos);
    add(`darwin-${arch}-app`, macos);
  }
  return {
    version,
    notes,
    pub_date: new Date(pubDate).toISOString(),
    platforms: Object.fromEntries(
      [...entries].sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) {
    fail(`Falta el argumento obligatorio ${name}.`);
  }
  return process.argv[index + 1];
}

function main() {
  const inventoryPath = argument('--inventory');
  const signaturesDir = argument('--signatures-dir');
  const outputPath = argument('--output');
  const notesPath = argument('--notes-file');
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
  const manifest = generateUpdaterManifest({
    inventory,
    repository: argument('--repository'),
    tag: argument('--tag'),
    version: argument('--version'),
    pubDate: argument('--pub-date'),
    notes: fs.readFileSync(notesPath, 'utf8'),
    readSignature: (name) => {
      const signaturePath = path.join(signaturesDir, name);
      if (!fs.existsSync(signaturePath)) {
        fail(`No se descargó la firma updater "${name}" en ${signaturesDir}.`);
      }
      return fs.readFileSync(signaturePath, 'utf8');
    },
  });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `Manifest updater válido: ${Object.keys(manifest.platforms).length} entradas escritas en ${outputPath}.`,
  );
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  main();
}
