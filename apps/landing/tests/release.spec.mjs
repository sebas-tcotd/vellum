import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  buildReleaseData,
  downloadBand,
  downloadPage,
  pickAssets,
  resolveReleaseSource,
  selectRelease,
} from '../src/data/release.ts';

const asset = (name) => ({
  name,
  size: 10,
  digest: `sha256:${'a'.repeat(64)}`,
  browser_download_url: `https://example.test/${name}`,
});
const release = (tag_name, extra = {}) => ({
  tag_name,
  draft: false,
  prerelease: false,
  html_url: `https://example.test/${tag_name}`,
  assets: [],
  ...extra,
});

test('selects the highest plain semver release by number, not by text', () => {
  const chosen = selectRelease([
    release('v0.9.0'),
    release('v0.14.0'),
    release('v0.15.0', { draft: true }),
    release('v1.0.0-rc.1', { prerelease: true }),
    release('v2.0.0', { prerelease: true }),
    release('nightly'),
  ]);
  expect(chosen?.tag_name).toBe('v0.14.0');
  expect(selectRelease([release('nightly')])).toBeNull();
  expect(selectRelease([])).toBeNull();
});

test('picks installers by pattern and skips signatures and other bundles', () => {
  const platforms = pickAssets(
    release('v1.2.3', {
      assets: [
        asset('Vellum_1.2.3_x64-setup.exe'),
        asset('Vellum_1.2.3_x64-setup.exe.sig'),
        asset('Vellum_1.2.3_x64_en-US.msi'),
        asset('VellumCityMaps_1.2.3.0_x64.msix'),
        asset('Vellum_1.2.3_amd64.deb'),
        asset('Vellum_1.2.3_amd64.AppImage'),
        asset('Vellum-1.2.3-1.x86_64.rpm'),
      ],
    }),
  );
  expect(platforms.windows.map((file) => file.format)).toEqual([
    'exe',
    'msi-en',
  ]);
  expect(platforms.macos).toEqual([]);
  expect(platforms.linux.map((file) => file.format)).toEqual([
    'deb',
    'AppImage',
    'rpm',
  ]);
  expect(platforms.windows[0].sha256).toBe('a'.repeat(64));
});

test('the committed fixture resolves to a complete release', () => {
  const fixture = JSON.parse(
    readFileSync(
      new URL('../src/data/release.fixture.json', import.meta.url),
      'utf8',
    ),
  );
  const data = buildReleaseData(fixture);
  expect(data?.tag).toMatch(/^v\d+\.\d+\.\d+$/);
  expect(data?.platforms.windows.map((file) => file.format)).toEqual([
    'exe',
    'msi-en',
    'msi-es',
  ]);
  expect(data?.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(data?.platforms.macos).toHaveLength(1);
  expect(data?.platforms.linux).toHaveLength(3);
});

test('no valid release yields no data', () => {
  expect(buildReleaseData([])).toBeNull();
});

test('CI reads the live API, local builds the fixture, bad overrides fail', () => {
  expect(resolveReleaseSource({ CI: 'true' })).toBe('live');
  expect(resolveReleaseSource({})).toBe('fixture');
  expect(
    resolveReleaseSource({ CI: 'true', LANDING_RELEASE_SOURCE: 'fixture' }),
  ).toBe('fixture');
  expect(resolveReleaseSource({ LANDING_RELEASE_SOURCE: 'live' })).toBe('live');
  expect(() =>
    resolveReleaseSource({ LANDING_RELEASE_SOURCE: 'Live' }),
  ).toThrow();
});

const fullRelease = () =>
  release('v1.0.0', {
    published_at: '2026-10-04T15:28:05Z',
    assets: [
      'latest.json',
      'Vellum_1.0.0_x64-setup.exe',
      'Vellum_1.0.0_x64-setup.exe.sig',
      'Vellum_1.0.0_x64_en-US.msi',
      'Vellum_1.0.0_x64_es-ES.msi',
      'VellumCityMaps_1.0.0.0_x64.msix',
      'Vellum_1.0.0_universal.dmg',
      'Vellum_universal.app.tar.gz',
      'Vellum_1.0.0_amd64.deb',
      'Vellum_1.0.0_amd64.AppImage',
      'Vellum-1.0.0-1.x86_64.rpm',
    ].map(asset),
  });

test('never picks the msix, signatures, updater bundles or latest.json', () => {
  const names = Object.values(pickAssets(fullRelease()))
    .flat()
    .map((file) => file.name);
  expect(names).toHaveLength(7);
  for (const name of names)
    expect(name).not.toMatch(/\.msix$|\.sig$|\.tar\.gz$|latest\.json/);
});

test('the release date travels with the data', () => {
  expect(buildReleaseData([fullRelease()])?.publishedAt).toBe(
    '2026-10-04T15:28:05Z',
  );
  expect(buildReleaseData([release('v1.0.0')])?.publishedAt).toBeNull();
});

test('download page: a complete release has rows, alternatives and hashes', () => {
  const page = downloadPage(buildReleaseData([fullRelease()]));
  expect(page.direct).toBe(true);
  expect(page.version).toBe('1.0.0');
  expect(page.publishedAt).toBe('2026-10-04T15:28:05Z');
  expect(page.platforms.map((platform) => platform.id)).toEqual([
    'windows',
    'macos',
    'linux',
  ]);
  const [windows, macos, linux] = page.platforms;
  expect(windows.primary?.format).toBe('exe');
  expect(windows.alternatives.map((file) => file.format)).toEqual([
    'msi-en',
    'msi-es',
  ]);
  expect(macos.primary?.format).toBe('dmg');
  expect(macos.alternatives).toEqual([]);
  expect(linux.primary?.format).toBe('deb');
  expect(linux.alternatives.map((file) => file.format)).toEqual([
    'AppImage',
    'rpm',
  ]);
  expect(
    page.platforms.every((platform) => platform.fallbackUrl === null),
  ).toBe(true);
  expect(page.hasHashes).toBe(true);
  expect(page.hashes).toHaveLength(7);
  expect(page.hashes.filter((row) => row.primary)).toHaveLength(3);
});

test('download page: a missing asset only hides its row', () => {
  const partial = fullRelease();
  partial.assets = partial.assets.filter((file) => !file.name.endsWith('.rpm'));
  const page = downloadPage(buildReleaseData([partial]));
  const linux = page.platforms[2];
  expect(linux.primary?.format).toBe('deb');
  expect(linux.alternatives.map((file) => file.format)).toEqual(['AppImage']);
  expect(page.hashes).toHaveLength(6);
  expect(page.direct).toBe(true);
});

test('download page: no assets or no release sends everything to GitHub Releases', () => {
  for (const data of [buildReleaseData([release('v1.0.0')]), null]) {
    const page = downloadPage(data);
    expect(page.direct).toBe(false);
    expect(page.version).toBeNull();
    expect(page.hasHashes).toBe(false);
    for (const platform of page.platforms) {
      expect(platform.primary).toBeNull();
      expect(platform.fallbackUrl).toBe(
        'https://github.com/sebas-tcotd/vellum/releases/latest',
      );
    }
  }
});

test('download page: without digests there is no #verify', () => {
  const bare = fullRelease();
  bare.assets = bare.assets.map((file) => ({ ...file, digest: null }));
  const page = downloadPage(buildReleaseData([bare]));
  expect(page.direct).toBe(true);
  expect(page.hasHashes).toBe(false);
});

test('the home band keeps its formats: no MSI', () => {
  const band = downloadBand(buildReleaseData([fullRelease()]));
  expect(band.platforms[0].files.map((file) => file.format)).toEqual(['exe']);
});
