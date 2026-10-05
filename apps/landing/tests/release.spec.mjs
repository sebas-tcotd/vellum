import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  buildReleaseData,
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
  expect(platforms.windows.map((file) => file.format)).toEqual(['exe']);
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
  expect(data?.platforms.windows).toHaveLength(1);
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
