/**
 * Freezes Vellum's network surface (Story 1.8, AC4).
 *
 * Vellum is offline-by-design: the only socket it may ever open is the
 * `tauri-plugin-updater` check, which lives in Rust and is opt-out. That is
 * true today only because nobody has added a `fetch` yet — this script turns
 * the fact into a rule.
 *
 * Three passes, one command:
 *   1. Frontend production sources may not use browser networking APIs or
 *      name an analytics/telemetry SDK.
 *   2. Rust workspace manifests may not take a direct dependency on an HTTP,
 *      shell or websocket capability.
 *   3. The *declared* surface — CSP, capability permissions, updater endpoint
 *      — must still say what it says today.
 *
 * `apps/landing/**` is deliberately out of scope: the marketing site is a
 * separate deliverable, it does run Google Analytics, and it ships nothing
 * into the desktop binary.
 *
 * Run it: `pnpm check:network`.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * Opt-out marker for a line that matches a forbidden pattern but is provably
 * not a network call. Must be written on the matching line or the one above
 * it, and must carry a reason after the colon.
 */
export const ALLOW_MARKER = 'vellum-allow-network:';

/** URLs the WebView is allowed to hand to the system browser. */
export const EXPECTED_OPENER_ORIGIN = 'https://github.com/sebas-tcotd/vellum';

/**
 * Every URL the app actually asks the opener plugin to open.
 *
 * @remarks
 * Checked against the capability's globs so a scope that is narrowed too far
 * fails here instead of at runtime — a denied `openUrl` only produces a
 * `console.warn` inside a WebView nobody is watching.
 */
export const OPENED_URLS = [
  'https://github.com/sebas-tcotd/vellum',
  'https://github.com/sebas-tcotd/vellum/releases/tag/v0.0.0',
];

/** The single updater endpoint the desktop app is allowed to contact. */
export const EXPECTED_UPDATER_ENDPOINT =
  'https://github.com/sebas-tcotd/vellum/releases/latest/download/latest.json';

/**
 * Browser-side networking and telemetry patterns forbidden in production code.
 *
 * @remarks
 * ESLint cannot express these: `no-restricted-imports` never sees `fetch(` or
 * `new WebSocket(`, and `eslint.config.mjs` ignores `**\/src-tauri/**`
 * entirely, so the Rust and capability passes below would have no home there
 * either. Hence one node script over TS, Rust and JSON in a single sweep.
 */
const FRONTEND_PATTERNS = [
  { name: 'fetch(', regex: /\bfetch\s*\(/ },
  { name: 'XMLHttpRequest', regex: /\bXMLHttpRequest\b/ },
  { name: 'WebSocket', regex: /\bWebSocket\b/ },
  { name: 'EventSource', regex: /\bEventSource\b/ },
  { name: 'sendBeacon', regex: /\bsendBeacon\b/ },
  { name: 'axios', regex: /\baxios\b/ },
  { name: 'analytics SDK', regex: /\b(?:gtag|dataLayer|googletagmanager)\b/ },
  {
    name: 'analytics SDK',
    // `segment` on its own is a road segment in this codebase; the analytics
    // product is only ever reached through one of these spellings.
    regex:
      /\b(?:posthog|mixpanel|amplitude|plausible|matomo|umami|segmentio|analytics\.track)\b|cdn\.segment\.com/i,
  },
  { name: 'crash reporting SDK', regex: /@sentry\b|\bSentry\s*\./ },
  {
    name: 'tauri http plugin',
    regex: /@tauri-apps\/plugin-(?:http|websocket)/,
  },
  { name: 'tauri shell plugin', regex: /@tauri-apps\/plugin-shell/ },
];

/** Rust crates that would open a socket or a subprocess from the shell. */
const FORBIDDEN_RUST_DEPS = [
  'tauri-plugin-http',
  'tauri-plugin-shell',
  'tauri-plugin-websocket',
  'reqwest',
  'ureq',
  'hyper',
];

/** Capability permission prefixes that would widen the sandbox (AC4). */
const FORBIDDEN_PERMISSION_PREFIXES = ['fs:', 'http:', 'shell:', 'websocket:'];

/**
 * Source roots that ship inside the desktop binary.
 *
 * @remarks
 * Derived from disk rather than listed: a hardcoded list silently stops
 * covering a package the day someone adds one, and the guardrail would report
 * success over less code than it did the day before. `apps/landing` is the one
 * deliberate exclusion — it is the marketing site, it legitimately loads
 * Google Analytics, and none of it reaches the desktop binary.
 */
function productionSourceRoots(root) {
  const roots = [];
  const desktop = path.join(root, 'apps/desktop/src');
  if (fs.existsSync(desktop)) roots.push('apps/desktop/src');
  let packages;
  try {
    packages = fs.readdirSync(path.join(root, 'packages'), {
      withFileTypes: true,
    });
  } catch {
    packages = [];
  }
  for (const entry of packages) {
    if (!entry.isDirectory()) continue;
    const relative = path.join('packages', entry.name, 'src');
    if (fs.existsSync(path.join(root, relative))) roots.push(relative);
  }
  return roots;
}

/**
 * Rust manifests in the cargo workspace, including the workspace root.
 *
 * @remarks
 * The root `Cargo.toml` matters as much as the members: `[workspace.dependencies]`
 * is the idiomatic place to add `reqwest` once and inherit it everywhere.
 */
function rustManifests(root) {
  const found = [];
  if (fs.existsSync(path.join(root, 'Cargo.toml'))) found.push('Cargo.toml');
  for (const relative of [
    'apps/desktop/src-tauri/Cargo.toml',
    'packages/parser-cslmap/Cargo.toml',
  ]) {
    if (fs.existsSync(path.join(root, relative))) found.push(relative);
  }
  for (const entry of (() => {
    try {
      return fs.readdirSync(path.join(root, 'packages'), {
        withFileTypes: true,
      });
    } catch {
      return [];
    }
  })()) {
    if (!entry.isDirectory()) continue;
    const relative = path.join('packages', entry.name, 'Cargo.toml');
    if (fs.existsSync(path.join(root, relative)) && !found.includes(relative)) {
      found.push(relative);
    }
  }
  return found;
}

function isProductionSource(filePath) {
  const base = path.basename(filePath);
  // A `.js`/`.mjs` file under a production `src/` ships just the same.
  if (!/\.(?:tsx?|m?jsx?|cjs)$/.test(base)) return false;
  if (/\.(?:test|spec)\.(?:tsx?|m?jsx?|cjs)$/.test(base)) return false;
  if (base === 'test-setup.ts') return false;
  // `testing/` barrels exist to be imported by tests; `__mocks__`/`__tests__`
  // are the other two conventions in this repo.
  const segments = filePath.split(path.sep);
  return !segments.some(
    (segment) =>
      segment === 'testing' ||
      segment === '__mocks__' ||
      segment === '__tests__' ||
      segment === 'test',
  );
}

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') return [];
      return walk(full);
    }
    return [full];
  });
}

/**
 * Blanks out comment text so a comment describing the policy cannot trip it.
 *
 * @remarks
 * A naive `line.replace(/\/\/.*$/, '')` hides real code the moment a string
 * literal contains `//` — `const u = 'a//b'; fetch(x)` lost its `fetch(`.
 * So the line is walked once, tracking quotes, and only a `//` found outside a
 * string ends the code portion.
 */
export function stripComments(line) {
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '/' && line[i + 1] === '/') return line.slice(0, i);
    if (ch === '/' && line[i + 1] === '*') {
      const end = line.indexOf('*/', i + 2);
      return end === -1
        ? line.slice(0, i)
        : stripComments(line.slice(0, i) + line.slice(end + 2));
    }
  }
  // A continuation line of a block comment (` * text`) is never code.
  return /^\s*\*/.test(line) ? '' : line;
}

/**
 * True when the matching line, or the contiguous comment block directly above
 * it, carries {@link ALLOW_MARKER}.
 *
 * @remarks
 * The whole block is scanned rather than just the previous line: prettier
 * wraps a reason worth writing across several lines, and a marker that only
 * survives on one-line reasons would reward terse ones.
 */
function hasAllowMarker(lines, index) {
  if ((lines[index] ?? '').includes(ALLOW_MARKER)) return true;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const line = (lines[cursor] ?? '').trim();
    // A blank line between the reason and the call is formatting, not intent —
    // prettier inserts them, and dropping the annotation there would make the
    // guardrail fail on code nobody changed.
    if (line === '') continue;
    const isComment =
      line.startsWith('//') || line.startsWith('*') || line.startsWith('/*');
    if (!isComment) return false;
    if (line.includes(ALLOW_MARKER)) return true;
  }
  return false;
}

/** Pass 1 — browser networking and telemetry in shipped frontend code. */
function checkFrontendSources(root) {
  const violations = [];
  for (const relativeRoot of productionSourceRoots(root)) {
    const absoluteRoot = path.join(root, relativeRoot);
    for (const file of walk(absoluteRoot)) {
      const relative = path.relative(root, file);
      if (!isProductionSource(relative)) continue;
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        const code = stripComments(line);
        for (const { name, regex } of FRONTEND_PATTERNS) {
          if (!regex.test(code)) continue;
          if (hasAllowMarker(lines, index)) continue;
          violations.push({
            file: relative,
            line: index + 1,
            rule: 'frontend-network-api',
            detail: `"${name}" is forbidden in production frontend code. Vellum opens no sockets from the WebView. If this is provably not a network call, annotate it with "${ALLOW_MARKER} <reason>".`,
          });
        }
      });
    }
  }
  return violations;
}

/** Pass 2 — direct HTTP/shell/websocket crates in the cargo workspace. */
function checkRustManifests(root) {
  const violations = [];
  for (const relative of rustManifests(root)) {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) continue;
    const manifest = fs.readFileSync(absolute, 'utf8');
    for (const line of manifest.split('\n')) {
      const code = line.replace(/#.*$/, '').trim();
      // Two spellings of the same dependency: `reqwest = "0.12"` and the table
      // header `[dependencies.reqwest]`. Only the first was ever checked.
      const crate =
        code.match(/^([A-Za-z0-9_-]+)\s*(?:\.[^=]*)?=/)?.[1] ??
        code.match(
          /^\[(?:[A-Za-z0-9_.-]+\.)?dependencies\.([A-Za-z0-9_-]+)\]$/,
        )?.[1];
      if (!crate) continue;
      if (FORBIDDEN_RUST_DEPS.includes(crate)) {
        violations.push({
          file: relative,
          rule: 'rust-network-dependency',
          detail: `"${crate}" is a direct dependency. The desktop shell's only network capability is tauri-plugin-updater.`,
        });
      }
    }
  }
  return violations;
}

/**
 * Parses JSON, reporting malformed content as a violation instead of throwing.
 *
 * @remarks
 * A capability file with a stray comma used to crash the guardrail with a
 * stack trace, which reads as "the tool is broken" rather than "the surface
 * you must not change is unreadable".
 */
function readJson(absolute, relative, violations) {
  try {
    return JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch (error) {
    violations.push({
      file: relative,
      rule: 'declared-surface',
      detail: `Could not be parsed as JSON: ${error.message}`,
    });
    return null;
  }
}

/** Pass 3 — the declared surface: CSP, capabilities, updater endpoint. */
function checkDeclaredSurface(root) {
  const violations = [];
  const configPath = 'apps/desktop/src-tauri/tauri.conf.json';
  const absoluteConfig = path.join(root, configPath);
  if (!fs.existsSync(absoluteConfig)) {
    return [
      {
        file: configPath,
        rule: 'declared-surface',
        detail: 'tauri.conf.json is missing.',
      },
    ];
  }

  const config = readJson(absoluteConfig, configPath, violations);
  if (config === null) return violations;
  const csp = config.app?.security?.csp;
  if (typeof csp !== 'string' || csp.trim() === '') {
    violations.push({
      file: configPath,
      rule: 'csp-present',
      detail:
        'app.security.csp must be an explicit policy string. A null CSP lets the WebView load and connect anywhere.',
    });
  } else {
    if (csp.includes('unsafe-eval')) {
      violations.push({
        file: configPath,
        rule: 'csp-no-unsafe-eval',
        detail: "'unsafe-eval' is never allowed in Vellum's CSP.",
      });
    }
    // Directive *names* are not the guarantee — values are. Checking only that
    // "connect-src" still appears let `img-src *` or a deleted `script-src`
    // through, which is exactly the widening this pass exists to catch.
    const directives = new Map(
      csp
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const [name, ...values] = part.split(/\s+/);
          return [name, values];
        }),
    );

    for (const directive of [
      'default-src',
      'script-src',
      'style-src',
      'img-src',
      'font-src',
      'connect-src',
      'worker-src',
      'object-src',
      'frame-src',
      'base-uri',
      'form-action',
    ]) {
      if (!directives.has(directive)) {
        violations.push({
          file: configPath,
          rule: 'csp-directive-missing',
          detail: `CSP no longer declares "${directive}".`,
        });
      }
    }

    if ((directives.get('script-src') ?? []).includes("'unsafe-inline'")) {
      violations.push({
        file: configPath,
        rule: 'csp-no-unsafe-inline-script',
        detail:
          "script-src must never allow 'unsafe-inline'. The style-src exception is forced by a transitive dependency and is documented; scripts have no such excuse.",
      });
    }

    // Every fetch directive, not just connect-src: a remote origin on img-src
    // or script-src is an exfiltration and execution path all the same.
    const REMOTE = /^(?:https?:|wss?:|\*$|\/\/)/;
    for (const [name, values] of directives) {
      if (name === 'devCsp') continue;
      const remote = values.filter((value) => REMOTE.test(value));
      if (remote.length > 0) {
        violations.push({
          file: configPath,
          rule: 'csp-remote-origin',
          detail: `"${name}" allows a remote origin (${remote.join(', ')}). Vellum's production CSP stays local.`,
        });
      }
    }
  }

  // The settings that neutralise the policy without touching the policy text.
  if (config.app?.security?.dangerousDisableAssetCspModification) {
    violations.push({
      file: configPath,
      rule: 'csp-present',
      detail:
        "dangerousDisableAssetCspModification strips Tauri's own CSP additions. It must stay absent.",
    });
  }
  if (config.app?.withGlobalTauri) {
    violations.push({
      file: configPath,
      rule: 'declared-surface',
      detail:
        'withGlobalTauri exposes the IPC bridge on window. Commands stay behind explicit imports.',
    });
  }

  const endpoints = config.plugins?.updater?.endpoints ?? [];
  if (endpoints.length !== 1 || endpoints[0] !== EXPECTED_UPDATER_ENDPOINT) {
    violations.push({
      file: configPath,
      rule: 'updater-endpoint',
      detail: `The updater must contact exactly ${EXPECTED_UPDATER_ENDPOINT}; found ${JSON.stringify(endpoints)}.`,
    });
  }

  const capabilitiesDir = path.join(
    root,
    'apps/desktop/src-tauri/capabilities',
  );
  const capabilityFiles = walk(capabilitiesDir).filter((file) =>
    file.endsWith('.json'),
  );
  // `walk` returns [] for a missing directory, so without this a renamed or
  // deleted capabilities directory reported a clean surface.
  if (capabilityFiles.length === 0) {
    violations.push({
      file: 'apps/desktop/src-tauri/capabilities',
      rule: 'declared-surface',
      detail:
        'No capability files found. The WebView permission set must stay declared and reviewable.',
    });
  }
  let openerScopes = null;
  for (const file of capabilityFiles) {
    const relative = path.relative(root, file);
    const capability = readJson(file, relative, violations);
    if (capability === null) continue;
    if (capability.remote?.urls?.length) {
      violations.push({
        file: relative,
        rule: 'capability-permission',
        detail: `"remote.urls" grants IPC access to remote origins (${capability.remote.urls.join(', ')}).`,
      });
    }
    for (const permission of capability.permissions ?? []) {
      const identifier =
        typeof permission === 'string' ? permission : permission?.identifier;
      if (typeof identifier !== 'string') continue;
      const forbidden = FORBIDDEN_PERMISSION_PREFIXES.find((prefix) =>
        identifier.startsWith(prefix),
      );
      if (forbidden) {
        violations.push({
          file: relative,
          rule: 'capability-permission',
          detail: `"${identifier}" grants the WebView a "${forbidden}" capability. File and network access stay behind explicit Rust commands.`,
        });
      }
      if (identifier === 'opener:default') {
        violations.push({
          file: relative,
          rule: 'capability-permission',
          detail:
            '"opener:default" lets the WebView open any URL. Use a scoped "opener:allow-open-url" instead.',
        });
      }
      if (identifier === 'opener:allow-open-url') {
        openerScopes = (permission.allow ?? [])
          .map((entry) => (typeof entry === 'string' ? entry : entry?.url))
          .filter((url) => typeof url === 'string');
        for (const url of openerScopes) {
          if (!url.startsWith(EXPECTED_OPENER_ORIGIN)) {
            violations.push({
              file: relative,
              rule: 'capability-permission',
              detail: `The opener scope allows "${url}", outside ${EXPECTED_OPENER_ORIGIN}. The WebView hands URLs to the system browser; the scope is what keeps that to Vellum's own repository.`,
            });
          }
        }
      }
    }
  }

  // Too narrow is a failure too: a denied openUrl only produces a console
  // warning, so a dead "view release notes" link would ship silently.
  if (openerScopes !== null) {
    for (const url of OPENED_URLS) {
      const covered = openerScopes.some((pattern) => matchesGlob(pattern, url));
      if (!covered) {
        violations.push({
          file: 'apps/desktop/src-tauri/capabilities',
          rule: 'capability-permission',
          detail: `The app opens "${url}", which no opener scope matches. That link would fail at runtime in the packaged app only.`,
        });
      }
    }
  }

  return violations;
}

/**
 * Matches a URL against one opener scope entry.
 *
 * @remarks
 * Mirrors `glob::Pattern::matches` with its default options, which is what
 * tauri-plugin-opener uses: `*` spans `/`, so `.../vellum/*` does cover
 * `.../vellum/releases/tag/v1.2.3`.
 */
function matchesGlob(pattern, value) {
  const expression = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${expression}$`).test(value);
}

/**
 * Runs every pass against a repository root.
 *
 * @param root - Absolute path to the repository root to inspect.
 * @returns Every violation found, in pass order. Empty means the surface is
 *   unchanged.
 */
export function verifyNetworkSurface(root) {
  return [
    ...checkFrontendSources(root),
    ...checkRustManifests(root),
    ...checkDeclaredSurface(root),
  ];
}

function main() {
  const root = process.cwd();
  const violations = verifyNetworkSurface(root);

  if (violations.length === 0) {
    console.log(
      'Network surface unchanged: no browser networking in production code, no HTTP crates, CSP and capabilities intact.',
    );
    return;
  }

  console.error(
    `Network surface regression — ${violations.length} finding(s):`,
  );
  for (const violation of violations) {
    const where = violation.line
      ? `${violation.file}:${violation.line}`
      : violation.file;
    console.error(`  [${violation.rule}] ${where}\n    ${violation.detail}`);
  }
  process.exitCode = 1;
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main();
}
