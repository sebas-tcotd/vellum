/**
 * The shape rules of the feedback decision register (Story 3.1).
 *
 * `docs/es/feedback-decisions.md` and `docs/en/feedback-decisions.md` are a
 * product contract, not prose: an entry that drops its evidence, names no
 * destination, or drifts out of parity with the other language turns the
 * register back into the thing it replaced — a pile of opinions.
 *
 * The parser and the rules live here rather than inside the test so anything
 * outside Vitest can import them, matching `detect-ci-changes.mjs` and its
 * test. `verify-feedback-decisions.test.mjs` exercises every row of the spec's
 * I/O matrix against synthetic documents, because a guardrail nobody has seen
 * fail is indistinguishable from one that matches nothing.
 */

import fs from 'node:fs';
import path from 'node:path';

/** Canonical status ids, and how each language spells them. */
export const STATUS_BY_LANGUAGE = {
  es: {
    adoptada: 'adopted',
    diferida: 'deferred',
    descartada: 'discarded',
    'bloqueada por datos': 'data-blocked',
  },
  en: {
    adopted: 'adopted',
    deferred: 'deferred',
    discarded: 'discarded',
    'data-blocked': 'data-blocked',
  },
};

/** Canonical field ids, and how each language labels them. */
export const FIELD_BY_LANGUAGE = {
  es: {
    Estado: 'status',
    Origen: 'source',
    Razón: 'reason',
    Necesidad: 'need',
    Dato: 'data',
    Prueba: 'test',
    Destino: 'destination',
  },
  en: {
    Status: 'status',
    Source: 'source',
    Reason: 'reason',
    Need: 'need',
    Data: 'data',
    Test: 'test',
    Destination: 'destination',
  },
};

/**
 * A revision line supersedes rather than rewrites; it is not a field.
 *
 * `[oó]` is deliberate, not a typo: one register writes "Revisión" and the
 * other "Revision", and both trees are parsed by the same rule. Keeping a
 * single pattern is what lets a revision added in one language be recognised
 * when it is mirrored into the other.
 */
export const REVISION_LABEL = /^Revisi[oó]n\s+\d{4}-\d{2}-\d{2}$/;

const ALWAYS_REQUIRED = ['status', 'source', 'reason'];

const EXTRA_REQUIRED_BY_STATUS = {
  adopted: ['need', 'data', 'test'],
  deferred: ['destination'],
  'data-blocked': ['destination'],
  discarded: [],
};

const ENTRY_HEADING = /^###\s+(FD-\d{3})\b\s*(?:[—–-]\s*(.*))?$/;
const FIELD_LINE = /^-\s+\*\*([^*]+?):\*\*\s*(.*)$/;

/**
 * An inline-code token that claims to be a path in this repository.
 *
 * Planning artifacts (the epic plan, `Reddit reception evidence, August 2026`,
 * `deferred-work.md`) live outside the repo and are cited by name, so they
 * never match these prefixes.
 */
const REPO_PATH_TOKEN = /`((?:packages|apps|scripts|docs)\/[^`\s]+)`/g;

/** Trailing `:92` or `:212-235` line anchors are not part of the path. */
const LINE_ANCHOR = /:\d+(?:-\d+)?$/;

/**
 * Parses one register into `{ id, title, status, fields }` entries.
 *
 * Fenced code blocks are skipped: the supersession rule documents its own
 * example entry inside one, and a parser that read it would validate prose.
 */
export function parseFeedbackDecisions(markdown, language) {
  const fieldLabels = FIELD_BY_LANGUAGE[language];
  const entries = [];
  let current = null;
  let lastField = null;
  let inFence = false;

  for (const rawLine of markdown.split('\n')) {
    if (/^\s*```/.test(rawLine)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const heading = ENTRY_HEADING.exec(rawLine);
    if (heading) {
      current = {
        id: heading[1],
        title: (heading[2] ?? '').trim(),
        fields: {},
        unknownLabels: [],
        revisions: [],
      };
      lastField = null;
      entries.push(current);
      continue;
    }

    // Any other heading closes the current entry.
    if (/^#{1,6}\s/.test(rawLine)) {
      current = null;
      lastField = null;
      continue;
    }
    if (!current) continue;

    const field = FIELD_LINE.exec(rawLine);
    if (field) {
      const label = field[1].trim();
      const value = field[2].trim();
      if (REVISION_LABEL.test(label)) {
        current.revisions.push({ label, value });
        lastField = null;
        continue;
      }
      const canonical = fieldLabels[label];
      if (!canonical) {
        current.unknownLabels.push(label);
        lastField = null;
        continue;
      }
      current.fields[canonical] = value;
      lastField = canonical;
      continue;
    }

    // Continuation of the previous field: an indented, non-empty line.
    if (lastField && /^\s+\S/.test(rawLine)) {
      current.fields[lastField] =
        `${current.fields[lastField]} ${rawLine.trim()}`.trim();
      continue;
    }
    if (rawLine.trim() === '') lastField = null;
  }

  return entries.map((entry) => ({
    ...entry,
    status: STATUS_BY_LANGUAGE[language][entry.fields.status ?? ''] ?? null,
  }));
}

/** How an unusable status reads in a violation: never a bare empty string. */
function describeStatus(raw) {
  if (raw === undefined) return '(missing)';
  if (raw === '') return '(empty)';
  return raw;
}

/** Verifies one register in isolation. Returns a list of violations. */
export function verifyRegister(markdown, language) {
  const violations = [];
  const entries = parseFeedbackDecisions(markdown, language);

  if (entries.length === 0) {
    violations.push({
      rule: 'no-entries',
      language,
      detail: 'the register declares no FD-### entry',
    });
  }

  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.id)) {
      violations.push({ rule: 'duplicate-id', language, id: entry.id });
    }
    seen.add(entry.id);

    for (const label of entry.unknownLabels) {
      violations.push({
        rule: 'unknown-field',
        language,
        id: entry.id,
        detail: label,
      });
    }

    if (entry.status === null) {
      violations.push({
        rule: 'unknown-status',
        language,
        id: entry.id,
        detail: describeStatus(entry.fields.status),
      });
      continue; // Required-field rules depend on a known status.
    }

    const required = [
      ...ALWAYS_REQUIRED,
      ...EXTRA_REQUIRED_BY_STATUS[entry.status],
    ];
    for (const field of required) {
      const value = entry.fields[field];
      if (value === undefined || value === '') {
        violations.push({
          rule: 'missing-field',
          language,
          id: entry.id,
          detail: field,
        });
      }
    }
  }

  return violations;
}

/**
 * Every repository path cited inside an entry's fields, line anchors stripped.
 *
 * Returned as `{ id, citedPath }` pairs so a violation can name the entry that
 * carries the dead citation.
 */
export function collectEvidencePaths(entries) {
  const cited = [];
  for (const entry of entries) {
    for (const value of Object.values(entry.fields)) {
      for (const match of value.matchAll(REPO_PATH_TOKEN)) {
        cited.push({
          id: entry.id,
          citedPath: match[1].replace(LINE_ANCHOR, ''),
        });
      }
    }
  }
  return cited;
}

/**
 * Checks that the evidence an entry cites can actually be opened.
 *
 * The register's central promise is evidence openable from the text itself, so
 * a field that merely exists is not enough: a path that moved in a refactor
 * leaves a decision that nobody can audit. Existence only — line ranges drift
 * harmlessly and pinning them would make every unrelated edit a failure.
 */
export function verifyEvidencePaths(markdown, language, repoRoot) {
  const entries = parseFeedbackDecisions(markdown, language);
  return collectEvidencePaths(entries)
    .filter(({ citedPath }) => !fs.existsSync(path.join(repoRoot, citedPath)))
    .map(({ id, citedPath }) => ({
      rule: 'unopenable-evidence',
      language,
      id,
      detail: citedPath,
    }));
}

/** Verifies both registers plus the parity contract between them. */
export function verifyFeedbackDecisions(spanish, english) {
  const violations = [
    ...verifyRegister(spanish, 'es'),
    ...verifyRegister(english, 'en'),
  ];

  const byId = (markdown, language) =>
    new Map(
      parseFeedbackDecisions(markdown, language).map((entry) => [
        entry.id,
        STATUS_BY_LANGUAGE[language][entry.fields.status ?? ''] ?? null,
      ]),
    );

  const es = byId(spanish, 'es');
  const en = byId(english, 'en');

  for (const id of new Set([...es.keys(), ...en.keys()])) {
    if (!es.has(id) || !en.has(id)) {
      violations.push({
        rule: 'language-parity',
        id,
        detail: es.has(id) ? 'missing in docs/en' : 'missing in docs/es',
      });
      continue;
    }
    if (es.get(id) !== en.get(id)) {
      violations.push({
        rule: 'language-parity',
        id,
        detail: `docs/es says "${es.get(id)}", docs/en says "${en.get(id)}"`,
      });
    }
  }

  return violations;
}
