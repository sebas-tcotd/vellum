/**
 * Dependency vulnerability audit for both halves of Vellum (Story 1.8, AC2).
 *
 * Runs `pnpm audit` over `pnpm-lock.yaml` and `cargo deny check advisories`
 * over `Cargo.lock`, and prints one markdown report.
 *
 * **This script always exits 0.** That is the decision, not an accident: the
 * advisory database changes without anyone touching this repository, so a
 * blocking check would fail pull requests that changed nothing. The findings
 * are made loud instead — the CI job writes this report into the run summary
 * and the release pipeline attaches it to `signing-evidence.md`.
 *
 * Usage:
 *   node scripts/audit-deps.mjs [--out <file>]
 *
 * `--out` writes the same markdown to a file. When `GITHUB_STEP_SUMMARY` is
 * set the report is appended there too.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Severities loud enough to call out at the top of the report. */
const LOUD = new Set(['high', 'critical']);

const SEVERITY_ORDER = ['critical', 'high', 'moderate', 'low', 'info'];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === 'win32',
    ...options,
  });
  return {
    ok: !result.error,
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  };
}

/**
 * Audits the JavaScript dependency graph.
 *
 * @remarks
 * `pnpm audit` exits non-zero whenever it finds anything, so its status is
 * read as "advisories exist", never as "the tool failed". A genuine failure —
 * no network, an unparseable body — is reported as `unavailable` so the report
 * can say so out loud instead of printing a reassuring empty table.
 */
function auditJavaScript() {
  const result = run('pnpm', ['audit', '--json']);
  if (!result.ok) {
    return {
      name: 'JavaScript (pnpm-lock.yaml)',
      unavailable: `pnpm could not be executed: ${result.error?.message ?? 'unknown error'}`,
      findings: [],
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return {
      name: 'JavaScript (pnpm-lock.yaml)',
      unavailable:
        'pnpm audit did not return parseable JSON (offline, or the registry advisory endpoint failed).',
      findings: [],
    };
  }

  const advisories = Object.values(parsed.advisories ?? {});
  const findings = advisories.map((advisory) => ({
    severity: String(advisory.severity ?? 'info').toLowerCase(),
    package: advisory.module_name ?? 'unknown',
    title: advisory.title ?? '',
    vulnerable: advisory.vulnerable_versions ?? '',
    patched: advisory.patched_versions ?? '',
    url: advisory.url ?? '',
  }));

  return { name: 'JavaScript (pnpm-lock.yaml)', findings };
}

/**
 * Maps a cargo-deny diagnostic code to the severity vocabulary the JS half
 * already uses, so one table can hold both.
 */
function rustSeverity(code, severity) {
  if (code === 'vulnerability') return 'high';
  if (code === 'unsound') return 'moderate';
  if (severity === 'error') return 'high';
  return 'low';
}

/** Audits the Rust dependency graph via cargo-deny. */
function auditRust() {
  const probe = run('cargo', ['deny', '--version']);
  if (!probe.ok || probe.status !== 0) {
    return {
      name: 'Rust (Cargo.lock)',
      unavailable:
        'cargo-deny is not installed. Install it with `cargo install cargo-deny --locked` (CI installs it automatically).',
      findings: [],
    };
  }

  const result = run('cargo', [
    'deny',
    '--format',
    'json',
    'check',
    'advisories',
  ]);
  if (!result.ok) {
    return {
      name: 'Rust (Cargo.lock)',
      unavailable: `cargo deny could not be executed: ${result.error?.message ?? 'unknown error'}`,
      findings: [],
    };
  }

  // cargo-deny streams NDJSON diagnostics on stderr; anything unparseable is a
  // progress line, not a finding.
  const findings = [];
  let sawDiagnostic = false;
  for (const line of `${result.stdout}\n${result.stderr}`.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    let entry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (entry.type !== 'diagnostic') continue;
    sawDiagnostic = true;
    const fields = entry.fields ?? {};
    if (fields.severity === 'note' || fields.severity === 'help') continue;
    const krate = fields.graphs?.[0]?.Krate ?? {};
    findings.push({
      severity: rustSeverity(fields.code, fields.severity),
      package: krate.name
        ? `${krate.name}${krate.version ? ` ${krate.version}` : ''}`
        : (fields.code ?? 'unknown'),
      title: fields.message ?? '',
      vulnerable: '',
      patched: '',
      url: fields.labels?.[0]?.message ?? '',
    });
  }

  if (!sawDiagnostic && result.status !== 0) {
    return {
      name: 'Rust (Cargo.lock)',
      unavailable: `cargo deny exited ${result.status} without diagnostics — the advisory database may be unreachable.\n\n\`\`\`\n${result.stderr.trim().slice(0, 2000)}\n\`\`\``,
      findings: [],
    };
  }

  return { name: 'Rust (Cargo.lock)', findings };
}

export function countBySeverity(findings) {
  const counts = Object.fromEntries(
    SEVERITY_ORDER.map((severity) => [severity, 0]),
  );
  for (const finding of findings) {
    if (counts[finding.severity] === undefined) counts[finding.severity] = 0;
    counts[finding.severity] += 1;
  }
  return counts;
}

export function renderSection(section) {
  const lines = [`### ${section.name}`, ''];

  if (section.unavailable) {
    lines.push(
      `> [!WARNING]`,
      `> Audit unavailable: ${section.unavailable}`,
      '',
    );
    return lines;
  }

  if (section.findings.length === 0) {
    lines.push('No advisories apply.', '');
    return lines;
  }

  const counts = countBySeverity(section.findings);
  lines.push(
    SEVERITY_ORDER.filter((severity) => counts[severity] > 0)
      .map((severity) => `**${severity}**: ${counts[severity]}`)
      .join(' · '),
    '',
    '| Severity | Package | Advisory | Fixed in |',
    '| --- | --- | --- | --- |',
  );

  // `indexOf` returns -1 for an unrecognised severity, which sorted it above
  // `critical` while `LOUD` still excluded it — the table and the banner
  // disagreed. Unknown ranks last, where an unclassified finding belongs.
  const rank = (severity) => {
    const index = SEVERITY_ORDER.indexOf(severity);
    return index === -1 ? SEVERITY_ORDER.length : index;
  };
  const sorted = [...section.findings].sort(
    (a, b) =>
      rank(a.severity) - rank(b.severity) || a.package.localeCompare(b.package),
  );
  // npm `patched_versions` routinely look like `>=1.2.3 || >=2.0.1`, and an
  // unescaped pipe splits the Markdown row into nonsense cells.
  const cell = (value) => String(value).replace(/\|/g, '\\|');
  for (const finding of sorted) {
    const advisory = finding.url
      ? `[${finding.title || finding.url}](${finding.url})`
      : finding.title || '—';
    lines.push(
      `| ${cell(finding.severity)} | \`${cell(finding.package)}\` | ${cell(advisory)} | ${cell(finding.patched || '—')} |`,
    );
  }
  lines.push('');
  return lines;
}

export function buildReport(sections) {
  const all = sections.flatMap((section) => section.findings);
  const loud = all.filter((finding) => LOUD.has(finding.severity));
  const unavailable = sections.filter((section) => section.unavailable);

  const lines = ['## Dependency audit', ''];

  if (loud.length > 0) {
    const packages = [...new Set(loud.map((finding) => finding.package))];
    lines.push(
      '> [!IMPORTANT]',
      `> ${loud.length} high/critical advisory(ies) across ${packages.length} package(s): ${packages
        .slice(0, 12)
        .map((name) => `\`${name}\``)
        .join(', ')}${packages.length > 12 ? ', …' : ''}`,
      '',
    );
  } else if (unavailable.length === 0) {
    lines.push('No high or critical advisories.', '');
  }

  lines.push(
    'This audit is **informative**: it never fails CI. The advisory database',
    'changes independently of this repository, so a red check here would mean',
    '"an advisory was published", not "this change broke something". Findings',
    'are triaged by a human against what actually ships — most JavaScript',
    'advisories below affect build tooling that never reaches the desktop',
    'binary.',
    '',
  );

  for (const section of sections) {
    lines.push(...renderSection(section));
  }

  return lines.join('\n');
}

function main() {
  const outIndex = process.argv.indexOf('--out');
  const outFile = outIndex === -1 ? null : process.argv[outIndex + 1];

  const sections = [auditJavaScript(), auditRust()];
  const report = buildReport(sections);

  console.log(report);

  // Every write is best-effort: this script promises exit 0, and an unwritable
  // path must not turn an informative audit into a failing step.
  if (outIndex !== -1 && !outFile) {
    console.error('--out needs a path; the report was not written to a file.');
  } else if (outFile) {
    try {
      fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
      fs.writeFileSync(outFile, `${report}\n`);
    } catch (error) {
      console.error(`Could not write ${outFile}: ${error.message}`);
    }
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
    } catch (error) {
      console.error(`Could not append to the step summary: ${error.message}`);
    }
  }

  // Deliberate: informative by decision (AC2). Never propagate a failure.
  process.exitCode = 0;
}

// Importable for tests without running the audit: only the CLI entry point
// spawns `pnpm audit` and `cargo deny`.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
