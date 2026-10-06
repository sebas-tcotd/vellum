const repository = 'sebas-tcotd/vellum';

/** Fallback link used wherever a platform has no direct download. */
export const releasesUrl = `https://github.com/${repository}/releases/latest`;

/** Asset fields of the GitHub releases API that the landing reads. */
export interface ReleaseAsset {
  name: string;
  size: number;
  /** `sha256:<hex>` as published by the GitHub releases API. */
  digest: string | null;
  browser_download_url: string;
}

/** Release fields of the GitHub releases API that the landing reads. */
export interface RawRelease {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  html_url: string;
  assets: ReleaseAsset[];
}

export type PlatformId = 'windows' | 'macos' | 'linux';

/** One downloadable installer picked from the release. */
export interface DownloadFile {
  format: string;
  name: string;
  url: string;
  size: number;
  /** Lowercase hex SHA-256, without the `sha256:` prefix. */
  sha256: string | null;
}

/** The release the landing links to, or `null` when none qualifies. */
export interface ReleaseData {
  version: string;
  tag: string;
  url: string;
  platforms: Record<PlatformId, DownloadFile[]>;
}

const platformPatterns: Record<PlatformId, [format: string, RegExp][]> = {
  windows: [['exe', /_x64-setup\.exe$/]],
  macos: [['dmg', /_universal\.dmg$/]],
  linux: [
    ['deb', /_amd64\.deb$/],
    ['AppImage', /_amd64\.AppImage$/],
    ['rpm', /\.x86_64\.rpm$/],
  ],
};

const tagPattern = /^v(\d+)\.(\d+)\.(\d+)$/;

function semver(tag: string): [number, number, number] | null {
  const match = tagPattern.exec(tag);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function compareVersions(a: number[], b: number[]): number {
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

/** Picks the highest `v<semver>` release that is neither a draft nor a prerelease. */
export function selectRelease(releases: RawRelease[]): RawRelease | null {
  let best: { release: RawRelease; version: number[] } | null = null;
  for (const release of releases) {
    if (release.draft || release.prerelease) continue;
    const version = semver(release.tag_name);
    if (!version) continue;
    if (!best || compareVersions(version, best.version) > 0)
      best = { release, version };
  }
  return best?.release ?? null;
}

/** Matches each platform's installers by name pattern; absent formats are skipped. */
export function pickAssets(
  release: RawRelease,
): Record<PlatformId, DownloadFile[]> {
  const platforms: Record<PlatformId, DownloadFile[]> = {
    windows: [],
    macos: [],
    linux: [],
  };
  for (const id of Object.keys(platformPatterns) as PlatformId[]) {
    for (const [format, pattern] of platformPatterns[id]) {
      const asset = release.assets.find((candidate) =>
        pattern.test(candidate.name),
      );
      if (!asset) continue;
      platforms[id].push({
        format,
        name: asset.name,
        url: asset.browser_download_url,
        size: asset.size,
        sha256: asset.digest?.startsWith('sha256:')
          ? asset.digest.slice('sha256:'.length)
          : null,
      });
    }
  }
  return platforms;
}

/** Builds the landing's release data from raw API releases. */
export function buildReleaseData(releases: RawRelease[]): ReleaseData | null {
  const release = selectRelease(releases);
  if (!release) return null;
  return {
    version: release.tag_name.slice(1),
    tag: release.tag_name,
    url: release.html_url,
    platforms: pickAssets(release),
  };
}

async function fetchReleases(): Promise<RawRelease[]> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(
    `https://api.github.com/repos/${repository}/releases?per_page=100`,
    { headers, signal: AbortSignal.timeout(15_000) },
  );
  if (!response.ok) {
    throw new Error(
      `GitHub releases API answered ${response.status} ${response.statusText}; refusing to build the landing without release data.`,
    );
  }
  const body: unknown = await response.json();
  if (!Array.isArray(body)) {
    throw new Error('GitHub releases API returned an unexpected payload.');
  }
  return body as RawRelease[];
}

/** Resolves where release data comes from; an unknown override is an error. */
export function resolveReleaseSource(
  env: Record<string, string | undefined>,
): 'live' | 'fixture' {
  const override = env.LANDING_RELEASE_SOURCE;
  if (override === 'live' || override === 'fixture') return override;
  if (override) {
    throw new Error(
      `LANDING_RELEASE_SOURCE must be "live" or "fixture", got "${override}".`,
    );
  }
  return env.CI === 'true' ? 'live' : 'fixture';
}

let cached: Promise<ReleaseData | null> | undefined;

/**
 * Reads the release data once per build.
 *
 * @remarks
 * `CI=true` queries the GitHub API and fails the build if it cannot; anywhere
 * else the committed fixture is used. `LANDING_RELEASE_SOURCE=live|fixture`
 * overrides either default.
 */
export function loadRelease(): Promise<ReleaseData | null> {
  cached ??= (async () => {
    const source = resolveReleaseSource(process.env);
    const releases =
      source === 'live'
        ? await fetchReleases()
        : ((await import('./release.fixture.json')).default as RawRelease[]);
    return buildReleaseData(releases);
  })();
  return cached;
}

/** What the download band shows for one platform. */
export interface BandPlatform {
  id: PlatformId;
  /** Direct installers; empty when the release lacks them. */
  files: DownloadFile[];
  /** Where the platform links when it has no direct installer. */
  fallbackUrl: string | null;
}

/**
 * Decides the download band from the release data: direct links when there
 * are any, otherwise every platform points at GitHub Releases and the band
 * uses its fallback heading (EXPERIENCE.md · Datos del release no
 * disponibles).
 */
export function downloadBand(release: ReleaseData | null): {
  direct: boolean;
  platforms: BandPlatform[];
} {
  const ids: PlatformId[] = ['windows', 'macos', 'linux'];
  const platforms = ids.map((id) => {
    const files = release?.platforms[id] ?? [];
    return { id, files, fallbackUrl: files.length > 0 ? null : releasesUrl };
  });
  return {
    direct: platforms.some((platform) => platform.files.length > 0),
    platforms,
  };
}
