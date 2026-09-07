/**
 * Contract parity between `@vellum/core`'s IPC declarations and the Rust sources.
 *
 * The TypeScript side is *imported* (real values, not text); the Rust side is
 * read from disk and scraped with narrow regexes over three known blocks. There
 * is deliberately no type generator here (ts-rs/specta/tauri-specta) and no Rust
 * parser — the whole point is a tripwire that fires the moment one side gains or
 * loses a symbol the other never heard about.
 *
 * Every assertion compares sets in BOTH directions: a check that only proves
 * "TS ⊆ Rust" never notices the command Rust gained and TS was never told about.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  IPC_COMMANDS,
  IPC_EVENTS,
  type ParseWarningsPayload,
  type ProgressPayload,
  type RawThemeFile,
  type UpdatePayload,
  type VellumError,
} from '@vellum/core';

/** Repo root, resolved from this file rather than from the CWD vitest happens to use. */
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

const LIB_RS = 'apps/desktop/src-tauri/src/lib.rs';
const ERRORS_RS = 'packages/parser-cslmap/src/errors.rs';
const DESKTOP_ERRORS_RS = 'apps/desktop/src-tauri/src/errors.rs';
const CONTRACT_TS = 'packages/core/src/ipc-contract.ts';

/**
 * Rust trees swept for `vellum://` literals. Discovered by walking, never by a
 * hand-kept file list: a tripwire that only looks where events live *today*
 * misses the very drift it exists to catch — the event emitted from a new file.
 */
const EVENT_ROOTS = [
  'apps/desktop/src-tauri/src',
  'packages/parser-cslmap/src',
];

/** Every `.rs` under `EVENT_ROOTS`, test modules excluded. */
function eventSources(): string[] {
  return EVENT_ROOTS.flatMap((root) =>
    readdirSync(path.join(REPO_ROOT, root), {
      recursive: true,
      encoding: 'utf8',
    })
      .filter((entry) => entry.endsWith('.rs') && !entry.endsWith('tests.rs'))
      .map((entry) => path.posix.join(root, entry.split(path.sep).join('/'))),
  );
}

/** Reads a Rust source as text — these files are data here, never modules. */
function readRust(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

/** Command names registered in `tauri::generate_handler![...]`, module prefix stripped. */
function scrapeRegisteredCommands(
  source: string = readRust(LIB_RS),
): Map<string, string> {
  const block = /generate_handler!\[([\s\S]*?)\n\s*\]/.exec(source);
  expect(
    block,
    `could not find the generate_handler![...] block in ${LIB_RS}`,
  ).not.toBeNull();

  const found = new Map<string, string>();
  for (const rawLine of (block?.[1] ?? '').split('\n')) {
    const line = rawLine.trim();
    // `#[cfg(desktop)]` guards two entries; comments and blanks are noise.
    if (!line || line.startsWith('#[') || line.startsWith('//')) continue;
    const entry =
      /^(?:([A-Za-z_][A-Za-z0-9_]*)::)?([a-z_][a-z0-9_]*)\s*,?$/.exec(line);
    expect(
      entry,
      `unparseable generate_handler! entry in ${LIB_RS}: ${line}`,
    ).not.toBeNull();
    if (entry) found.set(entry[2], entry[1] ?? '(root)');
  }
  return found;
}

/**
 * `"vellum://…"` string literals — quoted only, so the backticked names in doc
 * comments never count. The name pattern is deliberately permissive: a scraper
 * that only recognises the naming convention in use today would let a
 * `vellum://export_done` Rust gains slip past the very direction it guards.
 */
function scrapeEmittedEvents(
  sources: Array<[file: string, source: string]> = eventSources().map(
    (file) => [file, readRust(file)],
  ),
): Map<string, string> {
  const found = new Map<string, string>();
  for (const [file, source] of sources) {
    for (const match of source.matchAll(/"(vellum:\/\/[^"\s]+)"/g)) {
      if (!found.has(match[1])) found.set(match[1], file);
    }
  }
  return found;
}

/** Variants of the canonical `VellumError` enum with their named fields. */
function scrapeErrorVariants(
  source: string = readRust(ERRORS_RS),
): Map<string, Record<string, string>> {
  const block = /pub enum VellumError \{([\s\S]*?)\n\}/.exec(source);
  expect(
    block,
    `could not find the VellumError enum in ${ERRORS_RS}`,
  ).not.toBeNull();

  const found = new Map<string, Record<string, string>>();
  for (const rawLine of (block?.[1] ?? '').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('#[')) continue;
    const variant = /^([A-Za-z][A-Za-z0-9]*)\s*\{(.*)\}\s*,?$/.exec(line);
    expect(
      variant,
      `unparseable VellumError variant in ${ERRORS_RS}: ${line}`,
    ).not.toBeNull();
    if (!variant) continue;
    const fields: Record<string, string> = {};
    for (const field of variant[2].split(',').map((f) => f.trim())) {
      if (!field) continue;
      const [name, ...type] = field.split(':');
      fields[name.trim()] = type.join(':').trim();
    }
    found.set(variant[1], fields);
  }
  return found;
}

/**
 * Rust types that may cross the boundary, and what they must be on the TS side.
 * An unmapped type fails loudly rather than silently comparing as unknown — the
 * point is that a widened or narrowed field cannot pass unnoticed.
 */
const RUST_TO_TS: Record<string, string> = {
  String: 'string',
  'Vec<String>': 'string[]',
  f32: 'number',
  u32: 'number',
};

/**
 * The TS `VellumError` union projected into runtime values.
 *
 * The mapped type is what ties this table to the real union: a variant that
 * disappears from (or is misspelled in) `VellumError` fails to compile here,
 * and so does a field name that is not part of its variant.
 */
type VellumErrorFieldTable = {
  [K in VellumError['type']]: Record<
    Exclude<keyof Extract<VellumError, { type: K }>, 'type'>,
    string
  >;
};

const TS_ERROR_FIELDS: VellumErrorFieldTable = {
  InvalidFile: { reason: 'string' },
  UnsupportedVersion: { found: 'string' },
  PartialParse: { warnings: 'string[]' },
  ExportFailed: { reason: 'string' },
  IoError: { reason: 'string' },
};

// ─── Event and command payload structs ───────────────────────────────────────

/**
 * Payload structs Rust and TypeScript must mirror field-for-field, keyed by the
 * Rust struct name. Each value is typed as `Record<keyof <TsInterface>, true>`,
 * so the compiler — not a hand-kept list — decides what belongs here: a field
 * added to or removed from the TS interface fails to build.
 *
 * Deliberately excluded: the export-session structs (`BeginExport`,
 * `ExportSessionResponse`, ...). Their Rust side takes a documented *subset* of
 * the TS request and lets serde ignore the rest, so a bijection check would
 * report that intended asymmetry as drift.
 */
const TS_PAYLOAD_FIELDS = {
  ProgressPayload: { currentStep: true, percent: true } satisfies Record<
    keyof ProgressPayload,
    true
  >,
  ParseWarningsPayload: { warnings: true } satisfies Record<
    keyof ParseWarningsPayload,
    true
  >,
  UpdatePayload: { version: true, url: true } satisfies Record<
    keyof UpdatePayload,
    true
  >,
  RawThemeFile: { id: true, source: true, rawJson: true } satisfies Record<
    keyof RawThemeFile,
    true
  >,
} as const;

/** `snake_case` Rust field → the `camelCase` serde emits for it. */
function toCamelCase(field: string): string {
  return field.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Every `#[serde(rename_all = "camelCase")]` struct in the Rust trees, as
 * `name → camelCased field names`. Returned as a list rather than a map because
 * a payload is sometimes declared more than once (`ProgressPayload` exists both
 * in `src-tauri/src/ipc_contract.rs` and in the parser's `events.rs`) — every
 * copy has to agree with the TS interface, or the copies drift apart.
 */
function scrapeCamelCaseStructs(
  sources: Array<[file: string, source: string]> = eventSources().map(
    (file) => [file, readRust(file)],
  ),
): Array<{ name: string; file: string; fields: string[] }> {
  const found: Array<{ name: string; file: string; fields: string[] }> = [];
  const pattern =
    /#\[serde\(rename_all = "camelCase"\)\]\s*(?:pub(?:\(crate\))?\s+)?struct\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\n\}/g;
  for (const [file, source] of sources) {
    for (const match of source.matchAll(pattern)) {
      const fields = match[2]
        .split('\n')
        .map((line) => line.trim())
        .filter(
          (line) => line && !line.startsWith('//') && !line.startsWith('#['),
        )
        .map((line) =>
          line
            .replace(/^pub(?:\(crate\))?\s+/, '')
            .split(':')[0]
            .trim(),
        )
        .filter(Boolean);
      found.push({ name: match[1], file, fields: fields.map(toCamelCase) });
    }
  }
  return found;
}

function describeMissing(
  symbols: string[],
  where: string,
  file: string,
): string {
  return `${symbols.join(', ')} — declared in ${where}, absent from ${file}`;
}

describe('IPC contract parity: TypeScript ↔ Rust', () => {
  it('registra en generate_handler! exactamente los comandos de IPC_COMMANDS', () => {
    const rustCommands = scrapeRegisteredCommands();
    const tsCommands = new Set<string>(Object.values(IPC_COMMANDS));

    expect(
      rustCommands.size,
      'no commands scraped — the regex went stale',
    ).toBeGreaterThan(0);

    const missingInRust = [...tsCommands].filter((c) => !rustCommands.has(c));
    expect(
      missingInRust,
      describeMissing(missingInRust, 'IPC_COMMANDS', LIB_RS),
    ).toEqual([]);

    const missingInTs = [...rustCommands.keys()].filter(
      (c) => !tsCommands.has(c),
    );
    expect(
      missingInTs,
      describeMissing(
        missingInTs.map((c) => `${rustCommands.get(c)}::${c}`),
        `generate_handler! (${LIB_RS})`,
        CONTRACT_TS,
      ),
    ).toEqual([]);
  });

  it('emite desde Rust exactamente los eventos de IPC_EVENTS', () => {
    const rustEvents = scrapeEmittedEvents();
    const tsEvents = new Set<string>(Object.values(IPC_EVENTS));

    expect(rustEvents.size, 'no vellum:// literals scraped').toBeGreaterThan(0);

    const missingInRust = [...tsEvents].filter((e) => !rustEvents.has(e));
    expect(
      missingInRust,
      describeMissing(missingInRust, 'IPC_EVENTS', EVENT_ROOTS.join(', ')),
    ).toEqual([]);

    const missingInTs = [...rustEvents.keys()].filter((e) => !tsEvents.has(e));
    expect(
      missingInTs,
      describeMissing(
        missingInTs.map((e) => `${e} (${rustEvents.get(e)})`),
        'Rust',
        CONTRACT_TS,
      ),
    ).toEqual([]);
  });

  it('espeja variantes y campos de VellumError en ambos lados', () => {
    const rustVariants = scrapeErrorVariants();
    const tsVariants = new Map<string, Record<string, string>>(
      Object.entries(TS_ERROR_FIELDS),
    );

    expect(rustVariants.size, 'no VellumError variants scraped').toBe(
      tsVariants.size,
    );

    const missingInRust = [...tsVariants.keys()].filter(
      (v) => !rustVariants.has(v),
    );
    expect(
      missingInRust,
      describeMissing(missingInRust, 'the TS VellumError union', ERRORS_RS),
    ).toEqual([]);

    const missingInTs = [...rustVariants.keys()].filter(
      (v) => !tsVariants.has(v),
    );
    expect(
      missingInTs,
      describeMissing(missingInTs, ERRORS_RS, CONTRACT_TS),
    ).toEqual([]);

    for (const [variant, rustFields] of rustVariants) {
      const asTs: Record<string, string> = {};
      for (const [field, rustType] of Object.entries(rustFields)) {
        expect(
          RUST_TO_TS[rustType],
          `VellumError::${variant}.${field} is \`${rustType}\` in ${ERRORS_RS}, a type this ` +
            'test does not know how to compare — extend RUST_TO_TS',
        ).toBeDefined();
        asTs[field] = RUST_TO_TS[rustType];
      }
      expect(
        tsVariants.get(variant),
        `VellumError::${variant} diverges — ${ERRORS_RS} maps to ${JSON.stringify(
          asTs,
        )}, ${CONTRACT_TS} declares ${JSON.stringify(tsVariants.get(variant))}`,
      ).toEqual(asTs);
    }
  });

  // The discriminated union only exists because of this attribute: without it
  // serde emits an externally tagged shape and every `error.type` switch in the
  // UI silently stops matching, with all the symbol comparisons above still green.
  it('mantiene el tagging serde del que depende la unión discriminada', () => {
    expect(
      /#\[serde\(tag = "type"\)\]\s*pub enum VellumError\b/.test(
        readRust(ERRORS_RS),
      ),
      `${ERRORS_RS} must keep #[serde(tag = "type")] directly on VellumError — ` +
        `the TS union in ${CONTRACT_TS} is internally tagged and cannot survive ` +
        'a change to that representation',
    ).toBe(true);
  });

  it('espeja campo a campo cada struct de payload compartido', () => {
    const declared = scrapeCamelCaseStructs().filter(
      (struct) => struct.name in TS_PAYLOAD_FIELDS,
    );

    for (const name of Object.keys(TS_PAYLOAD_FIELDS)) {
      expect(
        declared.filter((struct) => struct.name === name).length,
        `${name} is declared in ${CONTRACT_TS} but no #[serde(rename_all = "camelCase")] ` +
          `struct by that name was found in ${EVENT_ROOTS.join(', ')}`,
      ).toBeGreaterThan(0);
    }

    // Every copy is checked, so two Rust declarations of the same payload can
    // neither drift from TypeScript nor from each other.
    for (const struct of declared) {
      const expected = Object.keys(
        TS_PAYLOAD_FIELDS[struct.name as keyof typeof TS_PAYLOAD_FIELDS],
      ).sort();
      expect(
        [...struct.fields].sort(),
        `${struct.name} in ${struct.file} serializes [${[...struct.fields]
          .sort()
          .join(', ')}], ${CONTRACT_TS} declares [${expected.join(', ')}]`,
      ).toEqual(expected);
    }
  });

  // The tripwire's own regression test: the three assertions above only ever run
  // against a repo that is currently in sync, so they would keep passing even if
  // the scrapers silently stopped seeing anything. Here the Rust sources are
  // perturbed in memory — nothing on disk changes — and the drift must surface.
  it('detecta divergencia introducida en las fuentes Rust', () => {
    const tsCommands = new Set<string>(Object.values(IPC_COMMANDS));

    const gained = scrapeRegisteredCommands(
      readRust(LIB_RS).replace(
        'commands::parse_cslmap,',
        'commands::parse_cslmap,\n            commands::brand_new_command,',
      ),
    );
    expect(
      [...gained.keys()].filter((c) => !tsCommands.has(c)),
      'a command added on the Rust side must surface as absent from the TS contract',
    ).toEqual(['brand_new_command']);

    const lost = scrapeRegisteredCommands(
      readRust(LIB_RS).replace('commands::export_png,\n', ''),
    );
    expect(
      [...tsCommands].filter((c) => !lost.has(c)),
      'a command dropped on the Rust side must surface as declared-only in TS',
    ).toEqual(['export_png']);

    const droppedVariant = scrapeErrorVariants(
      readRust(ERRORS_RS).replace(
        '    PartialParse { warnings: Vec<String> },\n',
        '',
      ),
    );
    expect(
      [...Object.keys(TS_ERROR_FIELDS)].filter((v) => !droppedVariant.has(v)),
      'a VellumError variant removed on the Rust side must surface as TS-only',
    ).toEqual(['PartialParse']);

    const narrowedField = scrapeErrorVariants(
      readRust(ERRORS_RS).replace(
        'PartialParse { warnings: Vec<String> }',
        'PartialParse { warnings: String }',
      ),
    );
    expect(
      narrowedField.get('PartialParse'),
      'a narrowed field type must surface as a different Rust type',
    ).toEqual({ warnings: 'String' });

    const strayEvent = scrapeEmittedEvents([
      ['fake.rs', 'app.emit("vellum://not-in-the-contract", ());'],
    ]);
    expect(
      [...strayEvent.keys()].filter(
        (e) => !new Set<string>(Object.values(IPC_EVENTS)).has(e),
      ),
      'an event emitted from a file the contract never mentions must surface',
    ).toEqual(['vellum://not-in-the-contract']);
  });

  it('mantiene el enum de errores del desktop como un re-export del canónico', () => {
    expect(
      /pub use\s+parser_cslmap::errors::VellumError/.test(
        readRust(DESKTOP_ERRORS_RS),
      ),
      `${DESKTOP_ERRORS_RS} must re-export the canonical VellumError from ` +
        `${ERRORS_RS}, not redeclare it — a second enum would silently drift ` +
        'from the TS union this test compares against',
    ).toBe(true);
  });
});
