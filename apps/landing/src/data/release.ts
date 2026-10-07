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
  /** ISO 8601 publication time. */
  published_at?: string | null;
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
  /** ISO 8601 publication time of the release, when GitHub reports it. */
  publishedAt: string | null;
  platforms: Record<PlatformId, DownloadFile[]>;
}

const platformPatterns: Record<PlatformId, [format: string, RegExp][]> = {
  windows: [
    ['exe', /_x64-setup\.exe$/],
    ['msi-en', /_x64_en-US\.msi$/],
    ['msi-es', /_x64_es-ES\.msi$/],
  ],
  macos: [['dmg', /_universal\.dmg$/]],
  linux: [
    ['deb', /_amd64\.deb$/],
    ['AppImage', /_amd64\.AppImage$/],
    ['rpm', /\.x86_64\.rpm$/],
  ],
};

/**
 * Assets the landing never offers, whatever the patterns: the Store package
 * (EXPERIENCE.md · State Patterns), the updater signatures and bundles, and
 * the updater manifest.
 */
const excludedAsset = /\.msix$|\.sig$|\.tar\.gz$|^latest\.json$/;

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
      const asset = release.assets.find(
        (candidate) =>
          !excludedAsset.test(candidate.name) && pattern.test(candidate.name),
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
    publishedAt: release.published_at ?? null,
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

/** Fixed order of the platforms in the served HTML. */
export const PLATFORM_ORDER: readonly PlatformId[] = [
  'windows',
  'macos',
  'linux',
];

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
  const platforms = PLATFORM_ORDER.map((id) => {
    // The MSIs belong to the download page; the band keeps its own formats.
    const files = (release?.platforms[id] ?? []).filter(
      (file) => !file.format.startsWith('msi-'),
    );
    return { id, files, fallbackUrl: files.length > 0 ? null : releasesUrl };
  });
  return {
    direct: platforms.some((platform) => platform.files.length > 0),
    platforms,
  };
}

/** One platform card of the download page (`#windows`, `#macos`, `#linux`). */
export interface PagePlatform {
  id: PlatformId;
  /** The recommended installer: `.exe`, `.dmg` or `.deb`. */
  primary: DownloadFile | null;
  /** The other formats: the MSIs on Windows, `.AppImage` and `.rpm` on Linux. */
  alternatives: DownloadFile[];
  /** GitHub Releases when the platform has no file at all. */
  fallbackUrl: string | null;
}

/** One row of "Verify the download". */
export interface HashRow {
  platform: PlatformId;
  file: DownloadFile & { sha256: string };
  /** The platform's recommended installer. */
  primary: boolean;
}

/** Everything the download page shows from the release. */
export interface DownloadPageData {
  /** At least one direct file; otherwise everything points at GitHub Releases. */
  direct: boolean;
  version: string | null;
  publishedAt: string | null;
  platforms: PagePlatform[];
  /** Files with a published SHA-256, in platform order. */
  hashes: HashRow[];
  /** `#verify` is rendered only when there is at least one hash. */
  hasHashes: boolean;
}

const primaryFormat: Record<PlatformId, string> = {
  windows: 'exe',
  macos: 'dmg',
  linux: 'deb',
};

/**
 * Decides the download page from the release data (EXPERIENCE.md · Páginas ·
 * Descarga and State Patterns): a missing asset only hides its row; a release
 * without assets, or no release, sends every platform to GitHub Releases; the
 * hashes are the per-asset `digest` GitHub publishes.
 */
export function downloadPage(release: ReleaseData | null): DownloadPageData {
  const platforms = PLATFORM_ORDER.map((id): PagePlatform => {
    const files = release?.platforms[id] ?? [];
    const primary =
      files.find((file) => file.format === primaryFormat[id]) ?? null;
    return {
      id,
      primary,
      alternatives: files.filter((file) => file !== primary),
      fallbackUrl: files.length > 0 ? null : releasesUrl,
    };
  });
  const hashes = platforms.flatMap((platform) =>
    [platform.primary, ...platform.alternatives].flatMap((file) =>
      file?.sha256
        ? [
            {
              platform: platform.id,
              file: { ...file, sha256: file.sha256 },
              primary: file === platform.primary,
            },
          ]
        : [],
    ),
  );
  const direct = platforms.some((platform) => platform.fallbackUrl === null);
  return {
    direct,
    version: direct ? (release?.version ?? null) : null,
    publishedAt: direct ? (release?.publishedAt ?? null) : null,
    platforms,
    hashes,
    hasHashes: hashes.length > 0,
  };
}
