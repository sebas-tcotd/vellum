import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const script = readFileSync('tools/vellum-bridge/publish-bridge.ps1', 'utf8');
const install = readFileSync('tools/vellum-bridge/install.ps1', 'utf8');
const windows = process.platform === 'win32';
const directories = [];

const defaultManaged = (text) =>
  /\[string\]\$ManagedDir\s*=\s*"([^"]+)"/.exec(text)?.[1];

// Fake `gh`: a tiny GitHub that keeps its state in a JSON file and logs every call.
const fakeGh = `
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
const stateFile = process.env.FAKE_STATE;
const state = JSON.parse(readFileSync(stateFile, 'utf8'));
const args = process.argv.slice(2);
appendFileSync(process.env.FAKE_LOG, 'gh ' + args.join(' ') + '\\n');
const save = () => writeFileSync(stateFile, JSON.stringify(state));
const out = (v) => process.stdout.write(typeof v === 'string' ? v : JSON.stringify(v));
if (args[0] === 'repo') out('acme/vellum\\n');
else if (args[0] === 'api') {
  const method = args[1] === '-X' ? args[2] : 'GET';
  const endpoint = args[1] === '-X' ? args[3] : args[1];
  const release = (id) => state.releases.find((r) => r.id === id);
  if (method === 'GET' && endpoint.startsWith('repos/acme/vellum/releases/latest')) {
    out({ tag_name: state.latest });
  } else if (method === 'GET') out(state.releases);
  else if (method === 'DELETE') {
    const assetId = Number(endpoint.split('/').pop());
    for (const r of state.releases) r.assets = r.assets.filter((a) => a.id !== assetId);
    save();
  } else if (method === 'POST') {
    const m = /releases\\/(\\d+)\\/assets\\?name=(.+)$/.exec(endpoint);
    const file = args[args.indexOf('--input') + 1];
    writeFileSync(state.uploadCopy, readFileSync(file));
    release(Number(m[1])).assets.push({ id: state.nextAsset++, name: m[2] });
    save();
    out({});
  } else if (method === 'PATCH') {
    const r = release(Number(endpoint.split('/').pop()));
    r.draft = false;
    const makeLatest = args.includes('make_latest=false');
    if (!makeLatest) state.latest = r.tag_name;
    if (state.latestOnPublish) state.latest = state.latestOnPublish;
    save();
    out({});
  }
}
`;
const fakeDotnet = `
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
appendFileSync(process.env.FAKE_LOG, 'dotnet ' + process.argv.slice(2).join(' ') + '\\n');
const dir = join(dirname(process.argv[3]), 'bin', 'Release', 'net35');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'VellumBridge.dll'), 'fake dll ' + process.env.CS1_MANAGED_DIR);
`;

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}

function fixture({
  codeVersion = '1.0.0',
  tag = '1.0.0',
  release = true,
  assets = [],
  latest = 'v1.2.3',
  latestOnPublish,
  target = 'main',
  makeTag = true,
} = {}) {
  mkdirSync('target', { recursive: true });
  const root = mkdtempSync(resolve('target/publish-bridge-test-'));
  directories.push(root);
  const bridge = join(root, 'tools/vellum-bridge');
  mkdirSync(join(bridge, 'src'), { recursive: true });
  cpSync(
    'tools/vellum-bridge/publish-bridge.ps1',
    join(bridge, 'publish-bridge.ps1'),
  );
  writeFileSync(join(bridge, 'VellumBridge.csproj'), '<Project />\n');
  writeFileSync(
    join(bridge, 'src/BridgeInfo.cs'),
    `class BridgeInfo { internal const string Version = "${codeVersion}"; // x-release-please-version\n}\n`,
  );
  writeFileSync(join(root, '.gitignore'), 'bin/\nobj/\n');
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 't@example.com');
  git(root, 'config', 'user.name', 't');
  git(root, 'config', 'core.autocrlf', 'false');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  if (makeTag) git(root, 'tag', `bridge-v${tag}`);

  const fakes = join(root, 'fakes');
  mkdirSync(fakes);
  writeFileSync(join(fakes, 'gh.mjs'), fakeGh);
  writeFileSync(join(fakes, 'dotnet.mjs'), fakeDotnet);
  for (const name of ['gh', 'dotnet'])
    writeFileSync(
      join(fakes, `${name}.cmd`),
      `@echo off\r\nnode "%~dp0${name}.mjs" %*\r\n`,
    );
  const state = join(root, 'state.json');
  writeFileSync(
    state,
    JSON.stringify({
      releases: release
        ? [
            {
              id: 7,
              tag_name: `bridge-v${tag}`,
              draft: true,
              target_commitish: target,
              assets,
            },
            { id: 3, tag_name: 'v1.2.3', draft: false, assets: [] },
          ]
        : [{ id: 3, tag_name: 'v1.2.3', draft: false, assets: [] }],
      latest,
      latestOnPublish,
      nextAsset: 100,
      uploadCopy: join(root, 'uploaded.zip'),
    }),
  );
  mkdirSync(join(root, 'Managed'));
  const log = join(root, 'calls.log');
  writeFileSync(log, '');
  return { root, bridge, state, log, fakes };
}

function runIn(f, args = [], shell = 'pwsh') {
  return spawnSync(
    shell,
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      join(f.bridge, 'publish-bridge.ps1'),
      '-ManagedDir',
      join(f.root, 'Managed'),
      ...args,
    ],
    {
      encoding: 'utf8',
      timeout: 60000,
      env: {
        ...process.env,
        PATH: `${f.fakes};${process.env.PATH}`,
        FAKE_STATE: f.state,
        FAKE_LOG: f.log,
      },
    },
  );
}
const calls = (f) => readFileSync(f.log, 'utf8');
const stateOf = (f) => JSON.parse(readFileSync(f.state, 'utf8'));
const output = (r) => r.stdout + r.stderr;

afterAll(() => {
  for (const path of directories)
    rmSync(path, { recursive: true, force: true });
});

describe('publish-bridge contracts', () => {
  it('never promotes the bridge release to latest or touches Steam', () => {
    expect(script).not.toMatch(/make_latest\s*=\s*true/i);
    expect(script).toContain('make_latest=false');
    expect(script).not.toMatch(/steamcmd|STEAM_|steam_(user|pass)/i);
  });
  it('keeps the same -ManagedDir default as install.ps1', () => {
    expect(defaultManaged(script)).toBeTruthy();
    expect(defaultManaged(script)).toBe(defaultManaged(install));
  });
  it('NFR19: only v[0-9]* tags trigger workflows, never bridge-v*', () => {
    const workflows = readdirSync('.github/workflows').filter((n) =>
      /\.ya?ml$/.test(n),
    );
    const tagItems = [];
    for (const name of workflows) {
      const text = readFileSync(join('.github/workflows', name), 'utf8');
      expect(text).not.toMatch(/^\s*-\s*['"]?bridge-v/m);
      for (const block of text.matchAll(/^\s*tags:\s*\n((?:\s+-.*\n)+)/gm))
        for (const item of block[1].matchAll(/-\s*['"]?([^'"\s]+)/g))
          tagItems.push([name, item[1]]);
    }
    expect(tagItems).toContainEqual(['publish-release.yml', 'v[0-9]*']);
    expect(tagItems.filter(([, tag]) => tag !== 'v[0-9]*')).toEqual([]);
    expect(tagItems.every(([name]) => name === 'publish-release.yml')).toBe(
      true,
    );
  });
});

// The README runs it with Windows PowerShell 5.1 (`powershell`); CI also has `pwsh` 7.
for (const shell of ['pwsh', 'powershell'])
  describe.skipIf(!windows)(
    `publish-bridge.ps1 (${shell}) against a fake gh/dotnet`,
    () => {
      const run = (f, args) => runIn(f, args, shell);
      it('stops before building when the code version differs from the tag', () => {
        const f = fixture({ codeVersion: '1.0.1', tag: '1.0.0' });
        const r = run(f);
        expect(r.status).not.toBe(0);
        expect(output(r)).toContain('1.0.1');
        expect(output(r)).toContain('bridge-v1.0.0');
        expect(calls(f)).not.toContain('dotnet');
      }, 60000);

      it('stops before building on a dirty tree (tracked and untracked)', () => {
        const f = fixture();
        writeFileSync(join(f.bridge, 'src/New.cs'), 'class New {}\n');
        let r = run(f);
        expect(r.status).not.toBe(0);
        expect(output(r)).toContain(
          'uncommitted changes in tools/vellum-bridge',
        );
        rmSync(join(f.bridge, 'src/New.cs'));
        writeFileSync(
          join(f.bridge, 'VellumBridge.csproj'),
          '<Project>x</Project>',
        );
        r = run(f);
        expect(r.status).not.toBe(0);
        expect(output(r)).toContain(
          'uncommitted changes in tools/vellum-bridge',
        );
        expect(calls(f)).not.toContain('dotnet');
      }, 60000);

      it('stops before building when the release does not exist', () => {
        const f = fixture({ release: false });
        const r = run(f, ['-Version', '1.0.0']);
        expect(r.status).not.toBe(0);
        expect(output(r)).toContain('does not exist');
        expect(calls(f)).not.toContain('dotnet');
      }, 60000);

      it('stops before building when the code differs from the release tag', () => {
        const f = fixture();
        writeFileSync(join(f.bridge, 'src/Later.cs'), 'class Later {}\n');
        git(f.root, 'add', '-A');
        git(f.root, 'commit', '-q', '-m', 'later');
        const r = run(f);
        expect(r.status).not.toBe(0);
        expect(output(r)).toContain('differs from');
        expect(calls(f)).not.toContain('dotnet');
      }, 60000);

      it('publishes the zip with make_latest=false and VellumBridge/ entries', () => {
        const f = fixture();
        const r = run(f);
        expect(r.status, output(r)).toBe(0);
        expect(calls(f)).toContain('dotnet build');
        const state = stateOf(f);
        const release = state.releases.find(
          (x) => x.tag_name === 'bridge-v1.0.0',
        );
        expect(release.draft).toBe(false);
        expect(release.assets.map((a) => a.name)).toEqual([
          'VellumBridge-1.0.0.zip',
        ]);
        expect(state.latest).toBe('v1.2.3');
        expect(calls(f)).toContain('make_latest=false');
        const zip = readFileSync(join(f.root, 'uploaded.zip'));
        expect(zip.includes(Buffer.from('VellumBridge/VellumBridge.dll'))).toBe(
          true,
        );
        expect(
          zip.includes(Buffer.from('VellumBridge\\VellumBridge.dll')),
        ).toBe(false);
        // Exactly one entry: central directory signature appears once.
        expect(zip.toString('latin1').split('PK\x01\x02')).toHaveLength(2);
        expect(existsSync(join(f.bridge, 'bin'))).toBe(true);
      }, 60000);

      it('rerun replaces the existing asset without duplicating it', () => {
        const f = fixture({
          assets: [{ id: 55, name: 'VellumBridge-1.0.0.zip' }],
        });
        const state = stateOf(f);
        state.releases[0].draft = false;
        writeFileSync(f.state, JSON.stringify(state));
        const r = run(f);
        expect(r.status, output(r)).toBe(0);
        const release = stateOf(f).releases[0];
        expect(release.assets).toHaveLength(1);
        expect(release.assets[0].id).not.toBe(55);
        expect(calls(f)).toContain(
          'DELETE repos/acme/vellum/releases/assets/55',
        );
      }, 60000);

      it('fails with the current latest tag when latest moved off vX', () => {
        const f = fixture({ latestOnPublish: 'bridge-v1.0.0' });
        const r = run(f);
        expect(r.status).not.toBe(0);
        expect(output(r)).toContain("'bridge-v1.0.0'");
      }, 60000);

      it('publishes a draft with no tag when its target resolves locally', () => {
        const f = fixture({ makeTag: false, target: 'HEAD' });
        const r = run(f);
        expect(r.status, output(r)).toBe(0);
      }, 60000);

      it('stops before building when neither tag nor target resolves', () => {
        const f = fixture({ makeTag: false, target: 'no-such-branch' });
        const r = run(f);
        expect(r.status).not.toBe(0);
        expect(output(r)).toContain('Cannot resolve');
        expect(calls(f)).not.toContain('dotnet');
      }, 60000);

      it('aborts before building when latest is already not a vX release', () => {
        const f = fixture({ latest: 'bridge-v0.9.0' });
        const r = run(f);
        expect(r.status).not.toBe(0);
        expect(output(r)).toContain('bridge-v0.9.0');
        expect(calls(f)).not.toContain('dotnet');
      }, 60000);

      it('stops before building when ManagedDir does not exist', () => {
        const f = fixture();
        const r = run(f, ['-ManagedDir', join(f.root, 'missing')]);
        expect(r.status).not.toBe(0);
        expect(output(r)).toContain('ManagedDir');
        expect(calls(f)).not.toContain('dotnet');
      }, 60000);

      it('defaults to the numerically highest bridge-v* release', () => {
        const f = fixture({ codeVersion: '1.0.10', tag: '1.0.10' });
        const state = stateOf(f);
        state.releases.push({
          id: 8,
          tag_name: 'bridge-v1.0.9',
          draft: false,
          target_commitish: 'main',
          assets: [],
        });
        writeFileSync(f.state, JSON.stringify(state));
        const r = run(f);
        expect(r.status, output(r)).toBe(0);
        expect(output(r)).toContain('bridge-v1.0.10');
      }, 60000);
    },
  );
