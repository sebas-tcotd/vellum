import { describe, expect, it } from 'vitest';

import { gateFailures } from './verify-ci-gate.mjs';

const required = [
  { name: 'Detect changes', result: 'success' },
  { name: 'Repository checks', result: 'success' },
];

describe('gate agregado de CI', () => {
  it('acepta success para jobs aplicables y skipped para los irrelevantes', () => {
    expect(
      gateFailures({
        required,
        routed: [
          { name: 'JS', expected: 'true', result: 'success' },
          { name: 'Rust', expected: 'false', result: 'skipped' },
        ],
      }),
    ).toEqual([]);
  });

  it.each(['failure', 'cancelled', 'skipped'])(
    'rechaza %s en un job aplicable',
    (result) => {
      expect(
        gateFailures({
          required,
          routed: [{ name: 'E2E', expected: 'true', result }],
        }),
      ).toHaveLength(1);
    },
  );

  it('rechaza un job ejecutado cuando el router esperaba un skip', () => {
    expect(
      gateFailures({
        required,
        routed: [{ name: 'Rust', expected: 'false', result: 'success' }],
      }),
    ).toHaveLength(1);
  });

  it.each([undefined, '', 'TRUE', 'yes'])(
    'rechaza el output malformado %s del router',
    (expected) => {
      expect(
        gateFailures({
          required,
          routed: [{ name: 'Rust', expected, result: 'skipped' }],
        }),
      ).toHaveLength(1);
    },
  );

  it.each(['failure', 'cancelled', 'skipped'])(
    'rechaza %s en un job siempre obligatorio',
    (result) => {
      expect(
        gateFailures({
          required: [{ name: 'Detect changes', result }],
          routed: [],
        }),
      ).toHaveLength(1);
    },
  );
});
