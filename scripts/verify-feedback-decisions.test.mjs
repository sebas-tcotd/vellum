/**
 * Pins the shape of the feedback decision register (Story 3.1).
 *
 * The rules live in `verify-feedback-decisions.mjs`; this file exercises every
 * row of the spec's I/O matrix against synthetic documents plus the two real
 * registers, because a guardrail nobody has seen fail is indistinguishable
 * from one that matches nothing.
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  FIELD_BY_LANGUAGE,
  collectEvidencePaths,
  parseFeedbackDecisions,
  verifyEvidencePaths,
  verifyFeedbackDecisions,
  verifyRegister,
} from './verify-feedback-decisions.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const DOC_RELATIVE_PATH = 'feedback-decisions.md';

function readDoc(language) {
  return fs.readFileSync(
    path.join(REPO_ROOT, 'docs', language, DOC_RELATIVE_PATH),
    'utf8',
  );
}

/** A synthetic register whose shape is exactly the real contract. */
function register(language, entries) {
  const labels = Object.fromEntries(
    Object.entries(FIELD_BY_LANGUAGE[language]).map(([label, canonical]) => [
      canonical,
      label,
    ]),
  );
  const body = entries
    .map((entry) => {
      const lines = [`### ${entry.id} — Synthetic entry`, ''];
      for (const [canonical, value] of Object.entries(entry.fields)) {
        lines.push(`- **${labels[canonical] ?? canonical}:** ${value}`);
      }
      return `${lines.join('\n')}\n`;
    })
    .join('\n');
  return `# Register\n\n## Entries\n\n${body}`;
}

const WELL_FORMED_ADOPTED = {
  es: {
    id: 'FD-001',
    fields: {
      status: 'adoptada',
      source: 'recepción pública de agosto 2026',
      reason: '`packages/core/src/road-classification.ts:92`',
      need: 'leer la jerarquía vial',
      data: '`RoadSegment.item_class`',
      test: '`packages/parser-cslmap/fixtures/altavento.cslmap`',
    },
  },
  en: {
    id: 'FD-001',
    fields: {
      status: 'adopted',
      source: 'the public reception of August 2026',
      reason: '`packages/core/src/road-classification.ts:92`',
      need: 'read the road hierarchy',
      data: '`RoadSegment.item_class`',
      test: '`packages/parser-cslmap/fixtures/altavento.cslmap`',
    },
  },
};

function rules(violations) {
  return violations.map((violation) => violation.rule);
}

describe('verify-feedback-decisions', () => {
  describe('the registers in the repository', () => {
    it('passes on both real documents', () => {
      expect(verifyFeedbackDecisions(readDoc('es'), readDoc('en'))).toEqual([]);
    });

    it('records the six proposals of the August 2026 reception', () => {
      const ids = parseFeedbackDecisions(readDoc('es'), 'es').map((e) => e.id);
      expect(ids).toEqual([
        'FD-001',
        'FD-002',
        'FD-003',
        'FD-004',
        'FD-005',
        'FD-006',
      ]);
    });

    it('gives every entry a title in both languages', () => {
      for (const language of ['es', 'en']) {
        for (const entry of parseFeedbackDecisions(readDoc(language), language))
          expect(entry.title, `${entry.id} (${language})`).not.toBe('');
      }
    });

    it('never promises the current map where the data is missing', () => {
      // The destination of a blocked entry is the whole point: without it the
      // entry reads as a promise nobody can keep from `.cslmap`.
      const blocked = parseFeedbackDecisions(readDoc('en'), 'en').filter(
        (entry) => entry.status === 'data-blocked',
      );
      expect(blocked.length).toBeGreaterThan(0);
      for (const entry of blocked)
        expect(entry.fields.destination, entry.id).toMatch(
          /Vellum Bridge|CS1 spike|spike CS1/,
        );
    });

    it('cites only evidence that can actually be opened', () => {
      for (const language of ['es', 'en'])
        expect(
          verifyEvidencePaths(readDoc(language), language, REPO_ROOT),
          language,
        ).toEqual([]);
    });

    it('cites repository evidence in every entry of both registers', () => {
      // A register whose citations all vanished would pass the rule above by
      // finding nothing to check.
      for (const language of ['es', 'en']) {
        const entries = parseFeedbackDecisions(readDoc(language), language);
        const cited = collectEvidencePaths(entries);
        expect(new Set(cited.map((c) => c.id)).size, language).toBe(
          entries.length,
        );
      }
    });

    it('is reachable from both documentation indexes', () => {
      for (const language of ['es', 'en']) {
        const index = fs.readFileSync(
          path.join(REPO_ROOT, 'docs', language, 'index.md'),
          'utf8',
        );
        expect(index, language).toContain(`(${DOC_RELATIVE_PATH})`);
      }
    });
  });

  describe('a well-formed entry', () => {
    for (const language of ['es', 'en']) {
      it(`passes with all three evidence links (${language})`, () => {
        const doc = register(language, [WELL_FORMED_ADOPTED[language]]);
        expect(verifyRegister(doc, language)).toEqual([]);
      });
    }

    it('accepts a revision line without treating it as an unknown field', () => {
      const doc = `${register('es', [WELL_FORMED_ADOPTED.es])}- **Revisión 2026-11-04:** antes «diferida»; cambió porque llegó el fixture.\n`;
      expect(verifyRegister(doc, 'es')).toEqual([]);
      expect(parseFeedbackDecisions(doc, 'es')[0].revisions).toHaveLength(1);
    });

    it('accepts an English revision line as well as a Spanish one', () => {
      // `REVISION_LABEL` spells both on purpose; only Spanish was covered.
      const doc = `${register('en', [WELL_FORMED_ADOPTED.en])}- **Revision 2026-11-04:** previously "deferred"; the fixture landed.\n`;
      expect(verifyRegister(doc, 'en')).toEqual([]);
      expect(parseFeedbackDecisions(doc, 'en')[0].revisions).toHaveLength(1);
    });

    it('reads a field whose value wraps onto continuation lines', () => {
      const doc = [
        '### FD-001 — Synthetic entry',
        '',
        '- **Status:** discarded',
        '- **Source:** the public reception of August 2026',
        '- **Reason:** the platform owns the shell, never the map;',
        '  see `packages/ui/src/shell/platform-parity.test.ts`.',
        '',
      ].join('\n');
      expect(verifyRegister(doc, 'en')).toEqual([]);
      expect(parseFeedbackDecisions(doc, 'en')[0].fields.reason).toContain(
        'platform-parity.test.ts',
      );
    });
  });

  describe('an adopted entry missing evidence', () => {
    for (const field of ['need', 'data', 'test']) {
      it(`fails naming the id and the absent \`${field}\``, () => {
        const fields = { ...WELL_FORMED_ADOPTED.en.fields };
        delete fields[field];
        const doc = register('en', [{ id: 'FD-007', fields }]);
        const violations = verifyRegister(doc, 'en');
        expect(violations).toEqual([
          {
            rule: 'missing-field',
            language: 'en',
            id: 'FD-007',
            detail: field,
          },
        ]);
      });
    }

    it('treats an empty value as absent', () => {
      const doc = register('en', [
        {
          id: 'FD-007',
          fields: { ...WELL_FORMED_ADOPTED.en.fields, data: '' },
        },
      ]);
      expect(verifyRegister(doc, 'en')).toEqual([
        { rule: 'missing-field', language: 'en', id: 'FD-007', detail: 'data' },
      ]);
    });

    it('fails when an always-required field is absent', () => {
      const doc = register('en', [
        { id: 'FD-007', fields: { status: 'discarded' } },
      ]);
      expect(verifyRegister(doc, 'en')).toEqual([
        {
          rule: 'missing-field',
          language: 'en',
          id: 'FD-007',
          detail: 'source',
        },
        {
          rule: 'missing-field',
          language: 'en',
          id: 'FD-007',
          detail: 'reason',
        },
      ]);
    });
  });

  describe('a deferred entry without a destination', () => {
    for (const [language, status] of [
      ['es', 'diferida'],
      ['es', 'bloqueada por datos'],
      ['en', 'deferred'],
      ['en', 'data-blocked'],
    ]) {
      it(`fails naming the id (${language}: ${status})`, () => {
        const doc = register(language, [
          {
            id: 'FD-007',
            fields: {
              status,
              source: 'August 2026',
              reason: '`packages/parser-cslmap/src/city_data.rs`',
            },
          },
        ]);
        expect(verifyRegister(doc, language)).toEqual([
          {
            rule: 'missing-field',
            language,
            id: 'FD-007',
            detail: 'destination',
          },
        ]);
      });
    }

    it('does not demand a destination from a discarded entry', () => {
      const doc = register('en', [
        {
          id: 'FD-007',
          fields: {
            status: 'discarded',
            source: 'August 2026',
            reason: '`packages/ui/src/shell/platform-parity.test.ts`',
          },
        },
      ]);
      expect(verifyRegister(doc, 'en')).toEqual([]);
    });
  });

  describe('an unknown status', () => {
    for (const status of ['wontfix', 'adopted-ish', 'adoptada', '']) {
      it(`fails naming the id and the status read ("${status}")`, () => {
        const doc = register('en', [
          {
            id: 'FD-007',
            fields: { status, source: 'August 2026', reason: 'because' },
          },
        ]);
        expect(verifyRegister(doc, 'en')).toEqual([
          {
            rule: 'unknown-status',
            language: 'en',
            id: 'FD-007',
            detail: status === '' ? '(empty)' : status,
          },
        ]);
      });
    }

    it('reports a status the other language spells correctly', () => {
      // A translated register that keeps the Spanish word is the likeliest
      // drift, and it would silently satisfy a lenient parser.
      const doc = register('es', [
        {
          id: 'FD-007',
          fields: {
            status: 'adopted',
            source: 'agosto 2026',
            reason: 'porque',
          },
        },
      ]);
      expect(rules(verifyRegister(doc, 'es'))).toEqual(['unknown-status']);
    });

    it('fails on an entry that declares no status at all', () => {
      const doc = register('en', [
        { id: 'FD-007', fields: { source: 'August 2026', reason: 'because' } },
      ]);
      expect(verifyRegister(doc, 'en')).toEqual([
        {
          rule: 'unknown-status',
          language: 'en',
          id: 'FD-007',
          detail: '(missing)',
        },
      ]);
    });
  });

  describe('language divergence', () => {
    it('fails naming an id present only in docs/es', () => {
      const spanish = register('es', [
        WELL_FORMED_ADOPTED.es,
        { ...WELL_FORMED_ADOPTED.es, id: 'FD-002' },
      ]);
      const english = register('en', [WELL_FORMED_ADOPTED.en]);
      expect(verifyFeedbackDecisions(spanish, english)).toEqual([
        { rule: 'language-parity', id: 'FD-002', detail: 'missing in docs/en' },
      ]);
    });

    it('fails naming an id present only in docs/en', () => {
      const spanish = register('es', [WELL_FORMED_ADOPTED.es]);
      const english = register('en', [
        WELL_FORMED_ADOPTED.en,
        { ...WELL_FORMED_ADOPTED.en, id: 'FD-002' },
      ]);
      expect(verifyFeedbackDecisions(spanish, english)).toEqual([
        { rule: 'language-parity', id: 'FD-002', detail: 'missing in docs/es' },
      ]);
    });

    it('fails when the same id carries different statuses', () => {
      const spanish = register('es', [WELL_FORMED_ADOPTED.es]);
      const english = register('en', [
        {
          id: 'FD-001',
          fields: {
            status: 'data-blocked',
            source: 'the public reception of August 2026',
            reason: '`packages/parser-cslmap/src/city_data.rs`',
            destination: 'Vellum Bridge / CS1 spike (Epic 5)',
          },
        },
      ]);
      expect(verifyFeedbackDecisions(spanish, english)).toEqual([
        {
          rule: 'language-parity',
          id: 'FD-001',
          detail: 'docs/es says "adopted", docs/en says "data-blocked"',
        },
      ]);
    });

    it('accepts the same decision spelled in each language', () => {
      expect(
        verifyFeedbackDecisions(
          register('es', [WELL_FORMED_ADOPTED.es]),
          register('en', [WELL_FORMED_ADOPTED.en]),
        ),
      ).toEqual([]);
    });
  });

  describe('parser edge cases', () => {
    it('ignores an example entry inside a fenced code block', () => {
      const doc = [
        '# Register',
        '',
        '## Supersession rule',
        '',
        '```markdown',
        '### FD-999 — Example only',
        '',
        '- **Status:** made-up',
        '```',
        '',
        '## Entries',
        '',
        register('en', [WELL_FORMED_ADOPTED.en]).split('## Entries\n\n')[1],
      ].join('\n');
      expect(verifyRegister(doc, 'en')).toEqual([]);
      expect(parseFeedbackDecisions(doc, 'en').map((e) => e.id)).toEqual([
        'FD-001',
      ]);
    });

    it('fails on a field label outside the fixed format', () => {
      const doc = `${register('en', [WELL_FORMED_ADOPTED.en])}- **Vibes:** good\n`;
      expect(verifyRegister(doc, 'en')).toEqual([
        {
          rule: 'unknown-field',
          language: 'en',
          id: 'FD-001',
          detail: 'Vibes',
        },
      ]);
    });

    it('fails on a cited repository path that does not exist', () => {
      const doc = register('en', [
        {
          id: 'FD-007',
          fields: {
            ...WELL_FORMED_ADOPTED.en.fields,
            data: '`packages/core/src/does-not-exist.ts:12`',
          },
        },
      ]);
      expect(verifyEvidencePaths(doc, 'en', REPO_ROOT)).toEqual([
        {
          rule: 'unopenable-evidence',
          language: 'en',
          id: 'FD-007',
          detail: 'packages/core/src/does-not-exist.ts',
        },
      ]);
    });

    it('does not treat a planning artifact cited by name as a repo path', () => {
      const doc = register('en', [
        {
          id: 'FD-007',
          fields: {
            ...WELL_FORMED_ADOPTED.en.fields,
            source:
              'the input document `Reddit reception evidence, August 2026`',
          },
        },
      ]);
      expect(verifyEvidencePaths(doc, 'en', REPO_ROOT)).toEqual([]);
    });

    it('fails on a duplicated id', () => {
      const doc = register('en', [
        WELL_FORMED_ADOPTED.en,
        WELL_FORMED_ADOPTED.en,
      ]);
      expect(rules(verifyRegister(doc, 'en'))).toEqual(['duplicate-id']);
    });

    it('fails on a register with no entries at all', () => {
      expect(
        rules(verifyRegister('# Register\n\nNothing here.\n', 'en')),
      ).toEqual(['no-entries']);
    });

    it('does not let a later heading absorb fields into the last entry', () => {
      const doc = [
        register('en', [WELL_FORMED_ADOPTED.en]),
        '## History',
        '',
        '- **Vibes:** good',
        '',
      ].join('\n');
      expect(verifyRegister(doc, 'en')).toEqual([]);
    });
  });
});
