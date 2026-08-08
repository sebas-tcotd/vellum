import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function readCargoPackageVersion() {
  const cargo = fs.readFileSync(
    path.join(root, 'apps/desktop/src-tauri/Cargo.toml'),
    'utf8',
  );
  const packageSection = cargo.match(/\[package\]([\s\S]*?)(?=\n\[|$)/)?.[1];
  const version = packageSection?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  if (!version) {
    throw new Error(
      'Could not find [package].version in apps/desktop/src-tauri/Cargo.toml',
    );
  }
  return version;
}

const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`VERSION is not valid SemVer: ${version}`);
}

const desktopPackage = readJson('apps/desktop/package.json');
const tauriConfig = readJson('apps/desktop/src-tauri/tauri.conf.json');
const manifest = readJson('.release-please-manifest.json');
const releaseConfig = readJson('release-please-config.json');
const synchronizedVersions = {
  'apps/desktop/package.json': desktopPackage.version,
  'apps/desktop/src-tauri/Cargo.toml': readCargoPackageVersion(),
  'apps/desktop/src-tauri/tauri.conf.json': tauriConfig.version,
};

for (const [file, fileVersion] of Object.entries(synchronizedVersions)) {
  if (fileVersion !== version) {
    throw new Error(`${file} has ${fileVersion}; expected ${version}`);
  }
}

if (manifest['.'] !== version) {
  throw new Error(
    `.release-please-manifest.json has ${manifest['.']}; expected ${version}`,
  );
}

const packageConfig = releaseConfig.packages?.['.'];
if (
  releaseConfig['include-component-in-tag'] !== false ||
  packageConfig?.['version-file'] !== 'VERSION'
) {
  throw new Error(
    'Release Please must use one root component and VERSION as its state file',
  );
}

console.log(`Release configuration is consistent at ${version}`);
