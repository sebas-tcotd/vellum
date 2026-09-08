/**
 * Pins the network guardrail (Story 1.8).
 *
 * Every row of the spec's "Regresión de red" and "Superficie declarada
 * alterada" scenarios gets a synthetic repository root: a guardrail nobody has
 * ever seen fail is indistinguishable from one that matches nothing.
 */

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  EXPECTED_UPDATER_ENDPOINT,
  verifyNetworkSurface,
} from './verify-network-surface.mjs';

const CLEAN_CSP =
  "default-src 'self'; script-src 'self' blob:; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; font-src 'self'; " +
  "connect-src 'self' data: ipc: http://ipc.localhost; " +
  "worker-src 'self' blob:; child-src 'self' blob:; object-src 'none'; " +
  "frame-src 'none'; base-uri 'self'; form-action 'none'";

const roots = [];

afterEach(() => {
  while (roots.length > 0) {
    fs.rmSync(roots.pop(), { recursive: true, force: true });
  }
});

function write(root, relative, contents) {
  const absolute = path.join(root, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, contents);
}

/** A synthetic repository whose network surface is exactly the real one. */
function cleanRoot(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vellum-network-'));
  roots.push(root);

  write(
    root,
    'apps/desktop/src-tauri/tauri.conf.json',
    JSON.stringify(
      {
        // `in`, not `??`: `{ csp: null }` is the regression under test.
        app: {
          security: { csp: 'csp' in overrides ? overrides.csp : CLEAN_CSP },
        },
        plugins: {
          updater: {
            endpoints: overrides.endpoints ?? [EXPECTED_UPDATER_ENDPOINT],
          },
        },
      },
      null,
      2,
    ),
  );

  write(
    root,
    'apps/desktop/src-tauri/capabilities/default.json',
    JSON.stringify(
      {
        identifier: 'default',
        permissions: overrides.permissions ?? [
          'core:default',
          'dialog:default',
          'store:default',
          {
            identifier: 'opener:allow-open-url',
            allow: overrides.openerAllow ?? [
              { url: 'https://github.com/sebas-tcotd/vellum' },
              { url: 'https://github.com/sebas-tcotd/vellum/*' },
            ],
          },
          'os:allow-platform',
        ],
      },
      null,
      2,
    ),
  );

  write(
    root,
    'apps/desktop/src-tauri/Cargo.toml',
    [
      '[package]',
      'name = "vellum"',
      '',
      '[dependencies]',
      'tauri = { version = "2" }',
      'tauri-plugin-updater = "2"',
      ...(overrides.rustDeps ?? []),
      '',
    ].join('\n'),
  );

  write(root, 'apps/desktop/src/main.tsx', 'export const app = 1;\n');

  return root;
}

function rules(violations) {
  return violations.map((violation) => violation.rule);
}

describe('verify-network-surface', () => {
  it('passes on a repository whose surface is unchanged', () => {
    expect(verifyNetworkSurface(cleanRoot())).toEqual([]);
  });

  it('passes on the real repository', () => {
    const repoRoot = path.resolve(import.meta.dirname, '..');
    expect(verifyNetworkSurface(repoRoot)).toEqual([]);
  });

  describe('network regressions in production code', () => {
    for (const [label, source] of [
      ['fetch(', 'export const go = () => fetch("https://x.test");'],
      ['XMLHttpRequest', 'export const go = () => new XMLHttpRequest();'],
      ['WebSocket', 'export const go = () => new WebSocket("wss://x.test");'],
      ['EventSource', 'export const go = () => new EventSource("/stream");'],
      ['sendBeacon', 'export const go = () => navigator.sendBeacon("/x");'],
      ['axios', 'import axios from "axios";\nexport const go = axios;'],
      ['analytics SDK', 'export const go = () => window.gtag("event", "x");'],
      [
        'analytics SDK',
        'import posthog from "posthog-js";\nexport const p = posthog;',
      ],
      [
        'crash reporting SDK',
        'import * as S from "@sentry/browser";\nexport const s = S;',
      ],
      [
        'tauri http plugin',
        'import { fetch as f } from "@tauri-apps/plugin-http";\nexport const f2 = f;',
      ],
    ]) {
      it(`fails on ${label}`, () => {
        const root = cleanRoot();
        write(root, 'packages/ui/src/telemetry.ts', `${source}\n`);
        const violations = verifyNetworkSurface(root);
        expect(rules(violations)).toContain('frontend-network-api');
        expect(violations[0].file).toBe(
          path.join('packages', 'ui', 'src', 'telemetry.ts'),
        );
      });
    }

    it('ignores test files', () => {
      const root = cleanRoot();
      write(
        root,
        'packages/ui/src/telemetry.test.ts',
        'it("stubs", () => fetch("https://x.test"));\n',
      );
      expect(verifyNetworkSurface(root)).toEqual([]);
    });

    it('ignores apps/landing, where Google Analytics legitimately lives', () => {
      const root = cleanRoot();
      write(
        root,
        'apps/landing/src/analytics.ts',
        'export const go = () => window.gtag("event", "x");\n',
      );
      expect(verifyNetworkSurface(root)).toEqual([]);
    });

    it('accepts an annotated exception in the comment block above the call', () => {
      const root = cleanRoot();
      write(
        root,
        'packages/renderer-webgl/src/dem.ts',
        [
          '// vellum-allow-network: the argument is always a `data:` URI built',
          '// in this module, so no socket is opened.',
          'export const decode = (uri: string) => fetch(uri);',
          '',
        ].join('\n'),
      );
      expect(verifyNetworkSurface(root)).toEqual([]);
    });

    it('still fails when a second, unannotated call follows an annotated one', () => {
      const root = cleanRoot();
      write(
        root,
        'packages/renderer-webgl/src/dem.ts',
        [
          '// vellum-allow-network: data: URI only.',
          'export const decode = (uri: string) => fetch(uri);',
          'export const phone = () => fetch("https://x.test");',
          '',
        ].join('\n'),
      );
      expect(rules(verifyNetworkSurface(root))).toEqual([
        'frontend-network-api',
      ]);
    });
  });

  describe('rust manifests', () => {
    for (const dependency of [
      'reqwest = "0.12"',
      'ureq = "2"',
      'tauri-plugin-http = "2"',
      'tauri-plugin-shell = "2"',
      'tauri-plugin-websocket = "2"',
    ]) {
      it(`fails on a direct ${dependency.split(' ')[0]} dependency`, () => {
        const root = cleanRoot({ rustDeps: [dependency] });
        expect(rules(verifyNetworkSurface(root))).toEqual([
          'rust-network-dependency',
        ]);
      });
    }
  });

  describe('more places a network crate can hide', () => {
    it('fails on a table-form dependency', () => {
      const root = cleanRoot();
      fs.appendFileSync(
        path.join(root, 'apps/desktop/src-tauri/Cargo.toml'),
        '\n[dependencies.reqwest]\nversion = "0.12"\n',
      );
      expect(rules(verifyNetworkSurface(root))).toContain(
        'rust-network-dependency',
      );
    });

    it('scans the workspace root manifest, where a shared dependency would live', () => {
      const root = cleanRoot();
      write(root, 'Cargo.toml', '[workspace.dependencies]\nreqwest = "0.12"\n');
      expect(rules(verifyNetworkSurface(root))).toContain(
        'rust-network-dependency',
      );
    });

    it('scans a package added after this guardrail was written', () => {
      const root = cleanRoot();
      write(
        root,
        'packages/brand-new/src/client.ts',
        'export const go = () => fetch("https://x.test");\n',
      );
      expect(rules(verifyNetworkSurface(root))).toContain(
        'frontend-network-api',
      );
    });

    it('scans production JavaScript, not only TypeScript', () => {
      const root = cleanRoot();
      write(
        root,
        'apps/desktop/src/legacy.mjs',
        'export const go = () => fetch("https://x.test");\n',
      );
      expect(rules(verifyNetworkSurface(root))).toContain(
        'frontend-network-api',
      );
    });

    it('does not lose a call hidden behind a string containing //', () => {
      const root = cleanRoot();
      write(
        root,
        'apps/desktop/src/sneaky.ts',
        "const base = 'https://x.test'; export const go = () => fetch(base);\n",
      );
      expect(rules(verifyNetworkSurface(root))).toContain(
        'frontend-network-api',
      );
    });

    it('keeps an annotation valid across a blank line', () => {
      const root = cleanRoot();
      write(
        root,
        'apps/desktop/src/annotated.ts',
        [
          '// vellum-allow-network: decodes an in-memory data: URI, never a socket.',
          '',
          'export const go = () => fetch(dataUri);',
          '',
        ].join('\n'),
      );
      expect(verifyNetworkSurface(root)).toEqual([]);
    });
  });

  describe('declared surface', () => {
    it('fails when the CSP goes back to null', () => {
      const root = cleanRoot({ csp: null });
      expect(rules(verifyNetworkSurface(root))).toContain('csp-present');
    });

    it("fails when 'unsafe-eval' appears", () => {
      const root = cleanRoot({
        csp: `${CLEAN_CSP}; script-src 'self' 'unsafe-eval'`,
      });
      expect(rules(verifyNetworkSurface(root))).toContain('csp-no-unsafe-eval');
    });

    it('fails when connect-src opens a remote origin', () => {
      const root = cleanRoot({
        csp: CLEAN_CSP.replace(
          "connect-src 'self' data:",
          "connect-src 'self' data: https://telemetry.test",
        ),
      });
      expect(rules(verifyNetworkSurface(root))).toContain('csp-remote-origin');
    });

    it('fails when connect-src drops the Tauri IPC bridge', () => {
      const root = cleanRoot({
        csp: CLEAN_CSP.replace(' ipc: http://ipc.localhost', ''),
      });
      expect(rules(verifyNetworkSurface(root))).toContain(
        'csp-ipc-origin-missing',
      );
    });

    // The likelier regression than dropping both: `http://ipc.localhost` reads
    // as a remote origin to anyone tightening the policy, and deleting it
    // breaks Windows only — a platform this suite never exercises.
    it('fails when only one platform IPC origin survives', () => {
      const root = cleanRoot({
        csp: CLEAN_CSP.replace(' http://ipc.localhost', ''),
      });
      expect(rules(verifyNetworkSurface(root))).toContain(
        'csp-ipc-origin-missing',
      );
    });

    it('still rejects an origin that only looks like the IPC bridge', () => {
      const root = cleanRoot({
        csp: CLEAN_CSP.replace(
          "connect-src 'self' data:",
          "connect-src 'self' data: http://ipc.localhost.evil.test",
        ),
      });
      expect(rules(verifyNetworkSurface(root))).toContain('csp-remote-origin');
    });

    it('fails when a directive disappears', () => {
      const root = cleanRoot({
        csp: CLEAN_CSP.replace("; object-src 'none'", ''),
      });
      expect(rules(verifyNetworkSurface(root))).toContain(
        'csp-directive-missing',
      );
    });

    it('fails on an fs: capability permission', () => {
      const root = cleanRoot({
        permissions: ['core:default', 'fs:allow-read-text-file'],
      });
      expect(rules(verifyNetworkSurface(root))).toContain(
        'capability-permission',
      );
    });

    it('fails on an http: capability permission', () => {
      const root = cleanRoot({
        permissions: ['core:default', { identifier: 'http:default' }],
      });
      expect(rules(verifyNetworkSurface(root))).toContain(
        'capability-permission',
      );
    });

    it('fails on the unscoped opener default', () => {
      const root = cleanRoot({
        permissions: ['core:default', 'opener:default'],
      });
      expect(rules(verifyNetworkSurface(root))).toContain(
        'capability-permission',
      );
    });

    it("fails when script-src gains 'unsafe-inline'", () => {
      const root = cleanRoot({
        csp: CLEAN_CSP.replace(
          "script-src 'self' blob:",
          "script-src 'self' blob: 'unsafe-inline'",
        ),
      });
      expect(rules(verifyNetworkSurface(root))).toContain(
        'csp-no-unsafe-inline-script',
      );
    });

    it('fails when any other fetch directive opens a remote origin', () => {
      const root = cleanRoot({
        csp: CLEAN_CSP.replace(
          "img-src 'self' data: blob:",
          "img-src 'self' https://cdn.test",
        ),
      });
      expect(rules(verifyNetworkSurface(root))).toContain('csp-remote-origin');
    });

    it('fails when a directive is widened to a bare wildcard', () => {
      const root = cleanRoot({
        csp: CLEAN_CSP.replace("default-src 'self'", 'default-src *'),
      });
      expect(rules(verifyNetworkSurface(root))).toContain('csp-remote-origin');
    });

    it('reports malformed JSON as a violation instead of crashing', () => {
      const root = cleanRoot();
      write(
        root,
        'apps/desktop/src-tauri/capabilities/default.json',
        '{ "permissions": [ }',
      );
      expect(() => verifyNetworkSurface(root)).not.toThrow();
      expect(rules(verifyNetworkSurface(root))).toContain('declared-surface');
    });

    it('fails when the capabilities directory disappears', () => {
      const root = cleanRoot();
      fs.rmSync(path.join(root, 'apps/desktop/src-tauri/capabilities'), {
        recursive: true,
        force: true,
      });
      expect(rules(verifyNetworkSurface(root))).toContain('declared-surface');
    });

    it('fails when the opener scope is widened past the Vellum repository', () => {
      const root = cleanRoot({ openerAllow: [{ url: 'https://*' }] });
      expect(rules(verifyNetworkSurface(root))).toContain(
        'capability-permission',
      );
    });

    it('fails when the opener scope is narrowed below what the app opens', () => {
      // Too narrow ships a dead link: a denied openUrl only logs a warning.
      const root = cleanRoot({
        openerAllow: [{ url: 'https://github.com/sebas-tcotd/vellum' }],
      });
      expect(rules(verifyNetworkSurface(root))).toContain(
        'capability-permission',
      );
    });

    it('fails when a capability grants IPC to remote origins', () => {
      const root = cleanRoot();
      const file = path.join(
        root,
        'apps/desktop/src-tauri/capabilities/default.json',
      );
      const capability = JSON.parse(fs.readFileSync(file, 'utf8'));
      capability.remote = { urls: ['https://plugin.test'] };
      fs.writeFileSync(file, JSON.stringify(capability));
      expect(rules(verifyNetworkSurface(root))).toContain(
        'capability-permission',
      );
    });

    it('fails when the updater host changes', () => {
      const root = cleanRoot({
        endpoints: ['https://updates.example.com/latest.json'],
      });
      expect(rules(verifyNetworkSurface(root))).toContain('updater-endpoint');
    });

    it('fails when a second updater endpoint is added', () => {
      const root = cleanRoot({
        endpoints: [
          EXPECTED_UPDATER_ENDPOINT,
          'https://mirror.example.com/latest.json',
        ],
      });
      expect(rules(verifyNetworkSurface(root))).toContain('updater-endpoint');
    });
  });
});
