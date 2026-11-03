// Story 15.1: prueba ejecutable del draft de release y del smoke check del updater.
//
// Corre el bash literal de cuatro pasos de `publish-release.yml` (resolver el
// release, finalizarlo, validar `latest.json` y restaurar el draft si algo
// falla) contra un GitHub simulado: `gh`, `curl` y `sleep` falsos con el estado
// en un JSON. No hay red ni API real. Si el workflow cambia un paso cubierto
// (el `id` o nombre con que se ubica, su `if:`, su `shell`, una expresión jq o
// una `${{ }}` desconocida), el arnés falla cerrado en lugar de probar otra cosa.
//
// Modelo del GitHub simulado, inferido del incidente de la 1.0 (no verificado
// contra la API): solo el booleano JSON `true` deja un release en draft;
// cualquier otro valor lo publica. Así `-f draft=true` publicó v1.0.0
// (c6f8193) y la restauración, que leía el estado ya corrompido, lo dio por
// publicado a mano (1bc1812). `releases/latest` solo se mueve con
// `make_latest="true"` (9bcd01d), que la API define como texto.
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const WORKFLOW = readFileSync(
  resolve('.github/workflows/publish-release.yml'),
  'utf8',
).replace(/\r\n/g, '\n');
const REPO = 'acme/vellum';
const windows = process.platform === 'win32';
const directories = [];
const slash = (p) => p.replaceAll('\\', '/');

// En Windows, `bash` del PATH puede ser el de WSL: usar el de Git for Windows.
function findBash() {
  if (!windows)
    return spawnSync('bash', ['--version']).status === 0 ? 'bash' : null;
  const r = spawnSync('git', ['--exec-path'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const candidate = resolve(r.stdout.trim(), '../../../bin/bash.exe');
  return existsSync(candidate) ? candidate : null;
}
const bash = findBash();

// Pasos cubiertos y el `if:` que el arnés reproduce para cada uno.
const STEPS = {
  resolve: { key: 'resolve-release', if: undefined },
  finalize: { key: 'finalize-release', if: undefined },
  smoke: {
    key: 'updater-smoke-check',
    if: "steps.finalize-release.outputs.is_draft != 'true'",
  },
  restore: {
    key: 'Keep release as draft if finalization fails',
    if: 'failure()',
  },
};

const harnessError = (msg) =>
  new Error(
    `${msg}. Actualiza el arnés de scripts/publish-release-draft.test.mjs.`,
  );

// Devuelve { if, env, run } del único paso cuyo `id:` o `name:` es `key`.
function step(workflow, key) {
  const lines = workflow.split('\n');
  const found = [];
  for (let s = 0; s < lines.length; s++) {
    if (!/^\s*- name: /.test(lines[s])) continue;
    const indent = lines[s].indexOf('-');
    let e = s + 1;
    while (
      e < lines.length &&
      (lines[e].trim() === '' || lines[e].search(/\S/) > indent)
    )
      e++;
    const body = [lines[s].replace('- ', '  '), ...lines.slice(s + 1, e)];
    const props = {};
    for (let i = 0; i < body.length; i++) {
      const m = /^(\s*)([a-z-]+):(?: (.*))?$/.exec(body[i]);
      if (!m || m[1].length !== indent + 2) continue;
      const nested = [];
      while (
        i + 1 < body.length &&
        (body[i + 1].trim() === '' || body[i + 1].search(/\S/) > indent + 2)
      )
        nested.push(body[++i]);
      props[m[2]] = { value: m[3], nested };
    }
    if (props.name?.value !== key && props.id?.value !== key) continue;
    if (props.shell && props.shell.value !== 'bash')
      throw harnessError(
        `'${key}' ya no corre en bash (shell: ${props.shell.value})`,
      );
    if (props.run?.value !== '|')
      throw harnessError(`'${key}' ya no es un bloque run: |`);
    const runLines = props.run.nested;
    const margin = Math.min(
      ...runLines.filter((l) => l.trim()).map((l) => l.search(/\S/)),
    );
    const env = {};
    for (const l of props.env?.nested ?? []) {
      const m = /^\s*([A-Z_]+): (.*)$/.exec(l);
      if (m) env[m[1]] = m[2];
    }
    found.push({
      key,
      if: props.if?.value,
      env,
      run: runLines.map((l) => l.slice(margin)).join('\n') + '\n',
    });
  }
  if (found.length !== 1)
    throw harnessError(
      `El workflow tiene ${found.length} pasos '${key}' (se esperaba 1)`,
    );
  return found[0];
}

// Sustituye las expresiones `${{ }}` conocidas; cualquier otra rompe la prueba.
function expand(text, ctx, where) {
  return text.replace(/\$\{\{\s*(.+?)\s*\}\}/g, (_, expr) => {
    if (ctx[expr] === undefined)
      throw harnessError(`Expresión desconocida '${expr}' en '${where}'`);
    return ctx[expr];
  });
}

// GitHub simulado: solo `gh api` con los endpoints y jq que usa el workflow.
const fakeGh = `
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
const stateFile = process.env.FAKE_STATE;
const state = JSON.parse(readFileSync(stateFile, 'utf8'));
const args = process.argv.slice(2);
const fail = (msg, code = 1) => { process.stderr.write(msg + '\\n'); process.exit(code); };
if (args[0] !== 'api') fail('gh simulado: solo implementa gh api, recibió: ' + args.join(' '));
let method = 'GET', endpoint, jq;
const fields = {};
for (let i = 1; i < args.length; i++) {
  const a = args[i];
  if (a === '--paginate' || a === '--slurp') continue;
  if (a === '-X' || a === '--method') method = args[++i];
  else if (a === '--jq' || a === '-q') jq = args[++i];
  else if (a === '-f' || a === '--raw-field' || a === '-F' || a === '--field') {
    const [k, ...rest] = args[++i].split('=');
    let value = rest.join('=');
    // -F convierte true, false, null y enteros, como el gh real.
    if (a === '-F' || a === '--field') {
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (value === 'null') value = null;
      else if (/^-?\\d+$/.test(value)) value = Number(value);
    }
    fields[k] = value;
  } else if (a.startsWith('-')) fail('gh simulado: opción no soportada ' + a);
  else endpoint = a;
}
appendFileSync(process.env.FAKE_LOG, JSON.stringify({ gh: method, endpoint, fields }) + '\\n');
const prefix = 'repos/' + state.repo + '/releases';
let body;
if (method === 'GET' && endpoint.startsWith(prefix + '?')) body = state.releases;
else {
  const m = /\\/releases\\/(\\d+)$/.exec(endpoint);
  const release = endpoint.startsWith(prefix + '/') && m && state.releases.find((r) => r.id === Number(m[1]));
  if (!release) fail('gh: Not Found (HTTP 404) ' + endpoint);
  if (method === 'GET') body = release;
  else if (method === 'PATCH') {
    if ('make_latest' in fields && typeof fields.make_latest !== 'string')
      fail('gh: Validation Failed (HTTP 422): make_latest debe ser texto');
    if ('tag_name' in fields) release.tag_name = String(fields.tag_name);
    if ('draft' in fields) {
      release.draft = fields.draft === true;
      // Falla inyectada: la retención deja el release público una vez.
      if (release.draft && state.holdPublishesOnce) {
        release.draft = false;
        state.holdPublishesOnce = false;
      }
    }
    if (!release.draft && fields.make_latest === 'true') state.latest = release.id;
    writeFileSync(stateFile, JSON.stringify(state));
    body = release;
  } else fail('gh simulado: método no soportado ' + method);
}
const out = (s) => process.stdout.write(s + '\\n');
if (jq === undefined) out(JSON.stringify(body));
else if (jq === '.[] | select(.tag_name == env.GITHUB_REF_NAME) | .id') {
  for (const r of body) if (r.tag_name === process.env.GITHUB_REF_NAME) out(String(r.id));
} else if (jq === '.draft') out(String(body.draft));
else if (jq === '.tag_name') out(body.tag_name);
else if (jq === '[.tag_name, .draft] | @tsv') out(body.tag_name + '\\t' + body.draft);
else fail('gh simulado: expresión jq no soportada: ' + jq, 2);
`;

// Sirve releases/latest/download/latest.json del último release público.
const fakeCurl = `
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
const state = JSON.parse(readFileSync(process.env.FAKE_STATE, 'utf8'));
const args = process.argv.slice(2);
const url = args.find((a) => /^https?:/.test(a));
const file = args[args.indexOf('-o') + 1];
appendFileSync(process.env.FAKE_LOG, JSON.stringify({ curl: url }) + '\\n');
const fail = (msg) => { process.stderr.write(msg + '\\n'); process.exit(22); };
if (url !== 'https://github.com/' + state.repo + '/releases/latest/download/latest.json')
  fail('curl simulado: URL no esperada ' + url);
const latest = state.releases.find((r) => r.id === state.latest && !r.draft);
if (!latest) fail('curl: (22) The requested URL returned error: 404');
// Falla inyectada: el manifiesto publicado no corresponde a ese release.
const version = state.staleManifest ? '0.9.0' : latest.tag_name.slice(1);
const base = 'https://github.com/' + state.repo + '/releases/download/' + latest.tag_name + '/';
writeFileSync(file, JSON.stringify({
  version,
  platforms: { 'windows-x86_64': { url: base + 'Vellum_' + version + '_x64-setup.exe', signature: 'firma' } },
}));
`;

function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'vellum-release-draft-'));
  // El workflow usa /tmp/latest.json sin comillas: una ruta con espacios lo rompería.
  if (/\s/.test(dir))
    throw harnessError(
      `El directorio temporal tiene espacios (${dir}); usa TMPDIR/TEMP sin espacios`,
    );
  directories.push(dir);
  const fakes = join(dir, 'bin');
  mkdirSync(fakes);
  writeFileSync(join(fakes, 'gh.mjs'), fakeGh);
  writeFileSync(join(fakes, 'curl.mjs'), fakeCurl);
  for (const [name, body] of [
    ['gh', 'exec "$FAKE_NODE" "$FAKE_BIN/gh.mjs" "$@"'],
    ['curl', 'exec "$FAKE_NODE" "$FAKE_BIN/curl.mjs" "$@"'],
    ['sleep', 'exit 0'],
  ]) {
    writeFileSync(join(fakes, name), `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(join(fakes, name), 0o755);
  }
  return { dir, fakes, steps: 0 };
}

function runStep(ws, s, ctx, tag) {
  const n = ++ws.steps;
  // El bash de Git for Windows antepone /mingw64/bin y /usr/bin al PATH, con
  // su curl y su sleep reales: los falsos se anteponen dentro del script.
  const bin = windows
    ? slash(ws.fakes).replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`)
    : ws.fakes;
  const script =
    `export PATH="${bin}:$PATH"\n` +
    expand(s.run, ctx, s.key).replaceAll('/tmp/', `${slash(ws.dir)}/`);
  const stepEnv = Object.fromEntries(
    Object.entries(s.env).map(([k, v]) => [k, expand(v, ctx, s.key)]),
  );
  const file = join(ws.dir, `step-${n}.sh`);
  const output = join(ws.dir, `output-${n}`);
  writeFileSync(file, script);
  writeFileSync(output, '');
  const r = spawnSync(
    bash,
    ['--noprofile', '--norc', '-eo', 'pipefail', slash(file)],
    {
      encoding: 'utf8',
      timeout: 120_000,
      env: {
        ...process.env,
        ...stepEnv,
        FAKE_NODE: slash(process.execPath),
        FAKE_BIN: slash(ws.fakes),
        FAKE_STATE: join(ws.dir, 'state.json'),
        FAKE_LOG: join(ws.dir, 'calls.log'),
        GITHUB_REF_NAME: tag,
        GITHUB_REPOSITORY: REPO,
        GITHUB_OUTPUT: slash(output),
        GITHUB_STEP_SUMMARY: slash(join(ws.dir, 'summary.md')),
      },
    },
  );
  const outputs = Object.fromEntries(
    readFileSync(output, 'utf8')
      .split('\n')
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
  return {
    ok: r.status === 0,
    outputs,
    log: `$ ${s.key} (exit ${r.status}${r.error ? `, ${r.error.message}` : ''})\n${r.stdout}${r.stderr}`,
  };
}

// Simula la parte del workflow que decide el estado del release: el job
// `preflight` y los pasos finales de `finalize-release`. Los pasos anteriores
// (assets, evidencia de firma) se dan por buenos.
function publish(workflow, { tag, releases, latest = null, faults = {} }) {
  const s = Object.fromEntries(
    Object.entries(STEPS).map(([name, { key, if: expected }]) => {
      const found = step(workflow, key);
      if (found.if !== expected)
        throw harnessError(
          `El paso '${key}' tiene if: ${found.if} (se esperaba ${expected})`,
        );
      return [name, found];
    }),
  );
  const ws = workspace();
  writeFileSync(
    join(ws.dir, 'state.json'),
    JSON.stringify({ repo: REPO, releases, latest, ...faults }),
  );
  writeFileSync(join(ws.dir, 'calls.log'), '');
  const ctx = {
    'github.repository': REPO,
    'github.ref_name': tag,
    'secrets.GITHUB_TOKEN': 'token-simulado',
  };
  const ran = {};
  const go = (name) => (ran[name] = runStep(ws, s[name], ctx, tag)).ok;

  let failed = !go('resolve');
  if (!failed) {
    ctx['needs.preflight.outputs.release-id'] =
      ran.resolve.outputs['release-id'];
    ctx['needs.preflight.outputs.release-draft'] =
      ran.resolve.outputs['release-draft'];
    failed = !go('finalize');
    if (!failed && ran.finalize.outputs.is_draft !== 'true')
      failed = !go('smoke');
    if (failed) go('restore');
  }

  const state = JSON.parse(readFileSync(join(ws.dir, 'state.json'), 'utf8'));
  const calls = readFileSync(join(ws.dir, 'calls.log'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  return {
    failed,
    ran,
    state,
    calls,
    release: (t) => state.releases.find((r) => r.tag_name === t),
    log: Object.values(ran)
      .map((r) => r.log)
      .join('\n'),
  };
}

const draftPatches = (r) =>
  r.calls.filter((c) => c.gh === 'PATCH' && 'draft' in c.fields);

const textDrafts = (r) =>
  draftPatches(r)
    .filter((c) => typeof c.fields.draft !== 'boolean')
    .map((c) => `${c.endpoint} draft=${JSON.stringify(c.fields.draft)}`);

// Lista de lo que no se cumplió; con la salida de los pasos si hay algo.
function problems(r, checks) {
  const failed = checks.filter(([ok]) => !ok).map(([, msg]) => msg);
  return failed.length ? [...failed, `salida de los pasos:\n${r.log}`] : [];
}

const v100 = (draft) => ({ id: 100, tag_name: 'v1.0.0', draft });
const v110 = (draft) => ({ id: 110, tag_name: 'v1.1.0', draft });

const CASES = {
  posterior: {
    title:
      'tag posterior a v1.0.0: se publica, pasa a latest y valida latest.json',
    run(wf) {
      const r = publish(wf, {
        tag: 'v1.1.0',
        releases: [v100(false), v110(true)],
        latest: 100,
      });
      return problems(r, [
        [!r.failed, 'el job falló'],
        [r.release('v1.1.0').draft === false, 'v1.1.0 siguió en draft'],
        [
          r.state.latest === 110,
          'releases/latest no apunta a v1.1.0 (falta make_latest, 9bcd01d)',
        ],
        [
          r.ran.smoke?.ok === true,
          'el smoke check no corrió o no validó latest.json',
        ],
        [!r.ran.restore, 'corrió la restauración del draft'],
      ]);
    },
  },
  posteriorSmokeFalla: {
    title:
      'tag posterior con latest.json inválido: el job falla y el release vuelve a draft',
    run(wf) {
      const r = publish(wf, {
        tag: 'v1.1.0',
        releases: [v100(false), v110(true)],
        latest: 100,
        faults: { staleManifest: true },
      });
      return problems(r, [
        [r.failed, 'el job no falló con un latest.json inválido'],
        [
          r.ran.smoke?.ok === false,
          'el smoke check no detectó el latest.json inválido',
        ],
        [
          r.ran.restore?.ok === true,
          'la restauración del draft no corrió o falló',
        ],
        [
          r.release('v1.1.0').draft === true,
          'v1.1.0 quedó público tras un smoke check fallido',
        ],
      ]);
    },
  },
  v100: {
    title: 'v1.0.0: se queda en draft para la Store y no corre el smoke check',
    run(wf) {
      const r = publish(wf, { tag: 'v1.0.0', releases: [v100(true)] });
      return problems(r, [
        [!r.failed, 'el job falló'],
        [r.release('v1.0.0').draft === true, 'v1.0.0 quedó público'],
        [r.state.latest === null, 'releases/latest cambió con v1.0.0 en draft'],
        [
          r.ran.finalize?.outputs.is_draft === 'true',
          'finalize-release no informó is_draft=true',
        ],
        [!r.ran.smoke, 'el smoke check corrió sobre un draft'],
        [!r.ran.restore, 'corrió la restauración del draft'],
      ]);
    },
  },
  rerunManual: {
    title:
      'rerun de v1.0.0 después de publicarlo a mano: sigue público y valida latest.json',
    run(wf) {
      const r = publish(wf, {
        tag: 'v1.0.0',
        releases: [v100(false)],
        latest: 100,
      });
      return problems(r, [
        [!r.failed, 'el job falló'],
        [r.release('v1.0.0').draft === false, 'v1.0.0 volvió a draft'],
        [
          r.ran.smoke?.ok === true,
          'el smoke check no corrió o no validó latest.json',
        ],
        [
          !r.calls.some((c) => c.gh === 'PATCH'),
          'el rerun modificó el release publicado',
        ],
      ]);
    },
  },
  rerunManualSmokeFalla: {
    title:
      'rerun de v1.0.0 publicado a mano con latest.json inválido: el job falla y sigue público',
    run(wf) {
      const r = publish(wf, {
        tag: 'v1.0.0',
        releases: [v100(false)],
        latest: 100,
        faults: { staleManifest: true },
      });
      return problems(r, [
        [r.failed, 'el job no falló con un latest.json inválido'],
        [
          r.ran.restore?.ok === true,
          'la restauración del draft no corrió o falló',
        ],
        [
          r.release('v1.0.0').draft === false,
          'v1.0.0 volvió a draft tras el rerun',
        ],
        [
          draftPatches(r).length === 0,
          'se envió draft al release publicado a mano',
        ],
      ]);
    },
  },
  c6f8193: {
    title:
      'c6f8193: draft se envía como booleano al retener, publicar y restaurar',
    run(wf) {
      const hold = publish(wf, { tag: 'v1.0.0', releases: [v100(true)] });
      const restore = publish(wf, {
        tag: 'v1.1.0',
        releases: [v100(false), v110(true)],
        latest: 100,
        faults: { staleManifest: true },
      });
      const sent = [...draftPatches(hold), ...draftPatches(restore)];
      const text = [...textDrafts(hold), ...textDrafts(restore)];
      return [
        ...problems(hold, [
          [!hold.failed, 'el job de v1.0.0 falló'],
          [hold.release('v1.0.0').draft === true, 'v1.0.0 quedó público'],
        ]),
        ...problems(restore, [
          [
            restore.release('v1.1.0').draft === true,
            'v1.1.0 no volvió a draft',
          ],
        ]),
        ...(sent.length < 3
          ? ['no se enviaron los tres PATCH de draft esperados']
          : []),
        ...text.map((t) => `draft enviado como texto: ${t}`),
      ];
    },
  },
  '1bc1812': {
    title:
      '1bc1812: si la finalización deja v1.0.0 público y falla, vuelve a draft',
    run(wf) {
      const r = publish(wf, {
        tag: 'v1.0.0',
        releases: [v100(true)],
        faults: { holdPublishesOnce: true },
      });
      return problems(r, [
        [r.failed, 'el job no falló al quedar v1.0.0 público'],
        [
          r.ran.restore?.ok === true,
          'la restauración del draft no corrió o falló',
        ],
        [
          r.release('v1.0.0').draft === true,
          'v1.0.0 quedó público tras la finalización fallida',
        ],
      ]);
    },
  },
  sinRelease: {
    title: 'tag sin release de Release Please: preflight falla y no toca nada',
    run(wf) {
      const r = publish(wf, { tag: 'v1.2.0', releases: [v100(false)] });
      return problems(r, [
        [r.failed, 'el job no falló sin release para el tag'],
        [r.ran.resolve?.ok === false, 'resolve-release no falló'],
        [
          !r.ran.finalize && !r.ran.restore,
          'corrieron pasos tras el preflight',
        ],
        [!r.calls.some((c) => c.gh === 'PATCH'), 'se modificó algún release'],
      ]);
    },
  },
};

// Reintroduce un fallo de la 1.0 sobre el texto del workflow.
function revert(workflow, from, to) {
  if (!workflow.includes(from))
    throw harnessError(`No se encontró el fix a revertir: ${from.trim()}`);
  return workflow.replaceAll(from, to);
}

// Commit del fix → caso que debe detectar su reversión.
const REVERTS = {
  c6f8193: {
    caso: 'c6f8193',
    mutate: (wf) => revert(wf, '-F draft=', '-f draft='),
  },
  '1bc1812': {
    caso: '1bc1812',
    mutate: (wf) =>
      revert(
        wf,
        `INITIAL_DRAFT='\${{ needs.preflight.outputs.release-draft }}'
            if [ "$INITIAL_DRAFT" = 'false' ]; then`,
        `CURRENT_DRAFT=$(gh api "repos/\${{ github.repository }}/releases/\${{ needs.preflight.outputs.release-id }}" --jq '.draft')
            if [ "$CURRENT_DRAFT" = 'false' ]; then`,
      ),
  },
  '9bcd01d': {
    caso: 'posterior',
    mutate: (wf) => revert(wf, '              -f make_latest=true \\\n', ''),
  },
};

afterAll(() => {
  for (const dir of directories) rmSync(dir, { recursive: true, force: true });
});

// En CI la suite no se puede saltar en silencio por falta de bash.
it.runIf(process.env.CI)('CI tiene bash para correr la suite del draft', () => {
  expect(
    bash,
    'no se encontró bash: la suite del draft se saltaría',
  ).toBeTruthy();
});

describe.skipIf(!bash)(
  'publish-release.yml: draft de release y updater',
  () => {
    for (const c of Object.values(CASES)) {
      it(`caso ${c.title}`, { timeout: 180_000 }, () => {
        expect(c.run(WORKFLOW), `caso «${c.title}»`).toEqual([]);
      });
    }

    for (const [commit, { caso, mutate }] of Object.entries(REVERTS)) {
      it(
        `detecta el fallo si se revierte ${commit}`,
        { timeout: 180_000 },
        () => {
          expect(
            CASES[caso].run(mutate(WORKFLOW)).length,
            `el caso «${CASES[caso].title}» no detecta la reversión de ${commit}`,
          ).toBeGreaterThan(0);
        },
      );
    }

    it('falla cerrado si cambia un paso cubierto o una expresión', () => {
      const run = (wf) => () =>
        publish(wf, { tag: 'v1.0.0', releases: [v100(true)] });
      expect(
        run(WORKFLOW.replace('id: updater-smoke-check', 'id: otro')),
      ).toThrow("pasos 'updater-smoke-check'");
      expect(run(WORKFLOW.replace('if: failure()', 'if: always()'))).toThrow(
        'if: always()',
      );
      expect(
        run(
          WORKFLOW.replace(
            '        id: resolve-release\n',
            '        id: resolve-release\n        shell: pwsh\n',
          ),
        ),
      ).toThrow('shell: pwsh');
      expect(
        run(
          WORKFLOW.replace(
            '"repos/${{ github.repository }}/releases?per_page=100"',
            '"repos/${{ github.event.repository.full_name }}/releases?per_page=100"',
          ),
        ),
      ).toThrow("Expresión desconocida 'github.event.repository.full_name'");
    });
  },
);
