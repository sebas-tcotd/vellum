import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { gateFailures } from './verify-ci-gate.mjs';

const required = [
  { name: 'Detect changes', result: 'success' },
  { name: 'Repository checks', result: 'success' },
];

describe('gate agregado de CI', () => {
  it('el CLI bloquea y diagnostica un fallo de landing aplicable', () => {
    const result = spawnSync(
      process.execPath,
      [resolve('scripts/verify-ci-gate.mjs')],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          DETECT_RESULT: 'success',
          REPOSITORY_RESULT: 'success',
          JS_EXPECTED: 'false',
          JS_RESULT: 'skipped',
          RUST_EXPECTED: 'false',
          RUST_RESULT: 'skipped',
          FRONTEND_EXPECTED: 'false',
          FRONTEND_RESULT: 'skipped',
          E2E_EXPECTED: 'false',
          E2E_RESULT: 'skipped',
          COMPILE_EXPECTED: 'false',
          COMPILE_RESULT: 'skipped',
          LANDING_EXPECTED: 'true',
          LANDING_RESULT: 'failure',
        },
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain(
      "::error::Landing quality debía terminar 'success' y terminó 'failure'.",
    );
  });

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

  it('acepta landing exitosa cuando el router la marca como aplicable', () => {
    expect(
      gateFailures({
        required,
        routed: [
          { name: 'Landing quality', expected: 'true', result: 'success' },
        ],
      }),
    ).toEqual([]);
  });

  it('acepta landing omitida sólo cuando el router la marca como irrelevante', () => {
    expect(
      gateFailures({
        required,
        routed: [
          { name: 'Landing quality', expected: 'false', result: 'skipped' },
        ],
      }),
    ).toEqual([]);
  });

  it.each(['failure', 'cancelled', 'skipped'])(
    'rechaza %s en landing cuando es aplicable',
    (result) => {
      expect(
        gateFailures({
          required,
          routed: [{ name: 'Landing quality', expected: 'true', result }],
        }),
      ).toHaveLength(1);
    },
  );

  it.each([undefined, '', 'TRUE', 'yes'])(
    'rechaza el output malformado %s para landing',
    (expected) => {
      expect(
        gateFailures({
          required,
          routed: [{ name: 'Landing quality', expected, result: 'skipped' }],
        }),
      ).toHaveLength(1);
    },
  );

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
