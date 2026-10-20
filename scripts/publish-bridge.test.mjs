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
else if (args[0] === 'release' && args[1] === 'download') {
  const r = state.releases.find((x) => x.tag_name === args[2]);
  const name = args[args.indexOf('--pattern') + 1];
  const dir = args[args.indexOf('--dir') + 1];
  const asset = r && r.assets.find((a) => a.name === name);
  if (!asset || !asset.file) {
    process.stderr.write('no assets match the file pattern\\n');
    process.exit(1);
  }
  writeFileSync(dir + '/' + name, readFileSync(asset.file));
} else if (args[0] === 'api') {
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
// Fake steamcmd: logs its arguments, keeps a copy of the VDF and of what its content folder held,
// and answers like steamcmd for the mode in the state file (ok, nosession, itemerror, nosuccess).
const fakeSteamCmd = `
import { readFileSync, writeFileSync, appendFileSync, readdirSync } from 'node:fs';
const state = JSON.parse(readFileSync(process.env.FAKE_STATE, 'utf8'));
const args = process.argv.slice(2);
appendFileSync(process.env.FAKE_LOG, 'steamcmd ' + args.join(' ') + '\\n');
const vdfPath = args[args.indexOf('+workshop_build_item') + 1];
const vdf = readFileSync(vdfPath, 'utf8');
writeFileSync(state.vdfCopy, vdf);
const folder = /"contentfolder"\\s+"((?:[^"\\\\]|\\\\.)*)"/.exec(vdf)[1].replace(/\\\\(.)/g, '$1');
const content = {};
for (const name of readdirSync(folder))
  content[name] = readFileSync(folder + '/' + name, 'utf8');
writeFileSync(state.contentCopy, JSON.stringify(content));
const user = args[args.indexOf('+login') + 1];
const mode = state.steam ?? 'ok';
if (mode === 'nosession') {
  console.log("Logging in user '" + user + "' [U:1:0] to Steam Public...FAILED (No cached credentials and @NoPromptForPassword is set)");
  process.exit(5);
}
console.log("Logging in user '" + user + "' [U:1:0] to Steam Public...OK");
console.log('Waiting for user info...OK');
if (mode === 'itemerror') {
  console.log('ERROR! Failed to update workshop item (Access Denied).');
  process.exit(0);
}
console.log('Uploading content...');
if (mode === 'ok' || mode === 'exitfail') console.log('Success.');
if (mode === 'exitfail') process.exit(6);
`;

// A stored (uncompressed) zip with the given entries, enough for ZipFile.OpenRead.
function storedZip(entries) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const data = Buffer.from(content);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

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
  draft = true,
  body = '',
  changelog,
  steam = 'ok',
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
  if (changelog !== undefined)
    writeFileSync(join(bridge, 'CHANGELOG.md'), changelog);
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
  writeFileSync(join(fakes, 'steamcmd.mjs'), fakeSteamCmd);
  for (const name of ['gh', 'dotnet', 'steamcmd'])
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
              draft,
              body,
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
      vdfCopy: join(root, 'item.vdf'),
      contentCopy: join(root, 'content.json'),
      steam,
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
// Both streams, without colors and with the console's line wrapping (and pwsh's "| " gutter) undone.
const output = (r) =>
  (r.stdout + r.stderr)
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\s*\n\s*(?:\|(?=\s))?\s*/g, ' ');

afterAll(() => {
  for (const path of directories)
    rmSync(path, { recursive: true, force: true });
});

describe('publish-bridge contracts', () => {
  it('never promotes the bridge release to latest', () => {
    expect(script).not.toMatch(/make_latest\s*=\s*true/i);
    expect(script).toContain('make_latest=false');
  });
  it('NFR17: no Steam credentials or examples of them in the script or README', () => {
    const readme = readFileSync('tools/vellum-bridge/README.md', 'utf8');
    for (const text of [script, readme]) {
      expect(text.replace(/NoPromptForPassword/g, '')).not.toMatch(
        /password|passwd/i,
      );
      expect(text).not.toMatch(/STEAM_/);
    }
    const logins = (text) =>
      [...text.matchAll(/\+login["']?[\s,]*([^\s'"`,)]+)/g)].map((m) => m[1]);
    expect(logins(script).length).toBeGreaterThan(0);
    for (const user of logins(script)) expect(user).toBe('$SteamUser');
    expect(logins(readme).length).toBeGreaterThan(0);
    for (const user of logins(readme)) expect(user).toBe('<tu-usuario>');
    expect(readme).toMatch(/-SteamUser <tu-usuario>/);
  });
  it('-Workshop never builds or writes to GitHub', () => {
    const workshop =
      /if \(\$Workshop\) \{\s*\$zipName[\s\S]*?\n {4}exit 0\n\}/.exec(
        script,
      )?.[0];
    expect(workshop).toBeTruthy();
    expect(workshop).not.toMatch(/dotnet|"-X"|previewfile|"title"|visibility/);
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

const releaseBody =
  'Primera descarga directa de [Vellum Bridge](https://example.com/bridge).';
const bridgeChangelog = `# Changelog

## [1.0.0](https://github.com/acme/vellum/compare/bridge-v0.9.0...bridge-v1.0.0) (2026-10-18)


### Features

* **bridge:** offer the "zip" ([#184](https://github.com/acme/vellum/issues/184)) ([e9de112](https://github.com/acme/vellum/commit/e9de112487a6fc85fc0e3bb35aef0063aba4cd34))

## [0.9.0](https://github.com/acme/vellum/compare/bridge-v0.8.0...bridge-v0.9.0) (2026-10-01)


### Bug Fixes

* older fix ([abc1234](https://github.com/acme/vellum/commit/abc1234))
`;

// A published bridge-v1.0.0 whose VellumBridge-1.0.0.zip holds `entries`.
function workshopFixture({
  entries = [['VellumBridge/VellumBridge.dll', 'published dll']],
  asset = true,
  ...options
} = {}) {
  const f = fixture({ draft: false, body: releaseBody, ...options });
  const zip = join(f.root, 'release.zip');
  writeFileSync(zip, storedZip(entries));
  if (asset) {
    const state = stateOf(f);
    state.releases[0].assets = [
      { id: 55, name: 'VellumBridge-1.0.0.zip', file: zip },
    ];
    writeFileSync(f.state, JSON.stringify(state));
  }
  return f;
}
const vdfOf = (f) => readFileSync(join(f.root, 'item.vdf'), 'utf8');
const expectNothingUploaded = (f) => {
  expect(calls(f)).not.toContain('steamcmd');
  expect(calls(f)).not.toContain('dotnet');
  expect(calls(f)).not.toMatch(/ -X (PATCH|POST|DELETE) /);
};

for (const shell of ['pwsh', 'powershell'])
  describe.skipIf(!windows)(
    `publish-bridge.ps1 -Workshop (${shell}) against a fake gh/steamcmd`,
    () => {
      const run = (f, args = []) =>
        runIn(f, ['-Workshop', '-SteamUser', 'fake-user', ...args], shell);

      it('uploads the published zip with the release body as the note', () => {
        const f = workshopFixture();
        const r = run(f);
        expect(r.status, output(r)).toBe(0);
        const vdf = vdfOf(f);
        expect(vdf).toContain('"appid"\t\t"255710"');
        expect(vdf).toContain('"publishedfileid"\t\t"3815903587"');
        expect(vdf).toMatch(
          /"contentfolder"\t\t"[^"]*\\\\content\\\\VellumBridge"/,
        );
        expect(vdf).toContain(
          '"changenote"\t\t"Primera descarga directa de Vellum Bridge."',
        );
        expect(vdf).not.toMatch(/previewfile|"title"|"description"|visibility/);
        expect(
          JSON.parse(readFileSync(join(f.root, 'content.json'), 'utf8')),
        ).toEqual({ 'VellumBridge.dll': 'published dll' });
        expect(calls(f)).toContain(
          'gh release download bridge-v1.0.0 --repo acme/vellum --pattern VellumBridge-1.0.0.zip',
        );
        expect(calls(f)).toContain(
          'steamcmd +@NoPromptForPassword 1 +login fake-user +workshop_build_item ',
        );
        expect(calls(f)).not.toContain('dotnet');
        expect(calls(f)).not.toMatch(/ -X (PATCH|POST|DELETE) /);
        expect(output(r)).toContain(
          'Updated Workshop item 3815903587 with VellumBridge-1.0.0.zip (bridge-v1.0.0)',
        );
      }, 60000);

      it('prefers the CHANGELOG section at the tag, as plain text', () => {
        const f = workshopFixture({ changelog: bridgeChangelog });
        const r = run(f);
        expect(r.status, output(r)).toBe(0);
        const note = /"changenote"\t\t"((?:[^"\\]|\\.)*)"/.exec(vdfOf(f))[1];
        expect(note).toBe('Features:\n\n* bridge: offer the \\"zip\\" (#184)');
        expect(output(r)).toContain('CHANGELOG.md at bridge-v1.0.0');
      }, 60000);

      it('reads the section when it is the last one in the CHANGELOG', () => {
        const f = workshopFixture({
          changelog: bridgeChangelog.slice(
            0,
            bridgeChangelog.indexOf('## [0.9.0]'),
          ),
        });
        const r = run(f);
        expect(r.status, output(r)).toBe(0);
        const note = /"changenote"\t\t"((?:[^"\\]|\\.)*)"/.exec(vdfOf(f))[1];
        expect(note).toBe('Features:\n\n* bridge: offer the \\"zip\\" (#184)');
        expect(output(r)).toContain(
          'Change note from tools/vellum-bridge/CHANGELOG.md at bridge-v1.0.0:',
        );
      }, 60000);

      it('keeps accents in the note from the CHANGELOG and from the body', () => {
        let f = workshopFixture({
          changelog: bridgeChangelog.replace(
            'offer the "zip"',
            'nueva versión con año y ñandú',
          ),
        });
        let r = run(f);
        expect(r.status, output(r)).toBe(0);
        expect(vdfOf(f)).toContain('nueva versión con año y ñandú (#184)');
        f = workshopFixture({ body: 'Primera versión: añade el diseño.' });
        r = run(f);
        expect(r.status, output(r)).toBe(0);
        expect(vdfOf(f)).toContain(
          '"changenote"\t\t"Primera versión: añade el diseño."',
        );
        expect(output(r)).toContain('Primera versión: añade el diseño.');
      }, 60000);

      it('defaults to the highest published release, skipping newer drafts', () => {
        const f = workshopFixture();
        const state = stateOf(f);
        state.releases.push({
          id: 9,
          tag_name: 'bridge-v1.1.0',
          draft: true,
          body: 'draft',
          target_commitish: 'main',
          assets: [],
        });
        writeFileSync(f.state, JSON.stringify(state));
        const r = run(f);
        expect(r.status, output(r)).toBe(0);
        expect(calls(f)).toContain('gh release download bridge-v1.0.0 ');
        expect(output(r)).toContain('(bridge-v1.0.0)');
      }, 60000);

      it('stops before steamcmd when the release is a draft', () => {
        const f = workshopFixture({ draft: true });
        let r = run(f, ['-Version', '1.0.0']);
        expect(r.status).not.toBe(0);
        expect(output(r)).toContain('is still a draft');
        expect(output(r)).toContain('without -Workshop');
        r = run(f);
        expect(r.status).not.toBe(0);
        expect(output(r)).toContain('No published bridge-v* release');
        expectNothingUploaded(f);
      }, 60000);

      it('stops before steamcmd when the release has no zip', () => {
        const f = workshopFixture({ asset: false });
        const r = run(f);
        expect(r.status).not.toBe(0);
        expect(output(r)).toContain('no VellumBridge-1.0.0.zip asset');
        expect(output(r)).toContain('without -Workshop');
        expectNothingUploaded(f);
      }, 60000);

      it('stops before steamcmd when the zip has other entries', () => {
        for (const entries of [
          [
            ['VellumBridge/VellumBridge.dll', 'dll'],
            ['VellumBridge/extra.txt', 'x'],
          ],
          [['VellumBridge.dll', 'dll']],
        ]) {
          const f = workshopFixture({ entries });
          const r = run(f);
          expect(r.status).not.toBe(0);
          for (const [name] of entries) expect(output(r)).toContain(name);
          expectNothingUploaded(f);
        }
      }, 60000);

      it('stops before steamcmd with no CHANGELOG section and an empty body', () => {
        const f = workshopFixture({
          body: '',
          changelog: bridgeChangelog.replace('[1.0.0]', '[0.9.9]'),
        });
        const r = run(f);
        expect(r.status).not.toBe(0);
        expect(output(r)).toContain('CHANGELOG.md');
        expect(output(r)).toContain('body of release bridge-v1.0.0');
        expectNothingUploaded(f);
      }, 60000);

      it('needs -SteamUser and a steamcmd it can find', () => {
        const f = workshopFixture();
        let r = runIn(f, ['-Workshop'], shell);
        expect(r.status).not.toBe(0);
        expect(output(r)).toContain('-SteamUser');
        r = run(f, ['-SteamCmd', 'no-such-steamcmd']);
        expect(r.status).not.toBe(0);
        expect(output(r)).toContain('steamcmd was not found');
        expectNothingUploaded(f);
      }, 60000);

      it('asks for a one-time manual login when there is no saved session', () => {
        const f = workshopFixture({ steam: 'nosession' });
        const r = run(f);
        expect(r.status).not.toBe(0);
        expect(output(r)).toContain("'steamcmd +login fake-user'");
        expect(output(r)).not.toContain('Content Manager');
      }, 60000);

      for (const steam of ['itemerror', 'nosuccess', 'exitfail'])
        it(`points to the Content Manager when the item update fails (${steam})`, () => {
          const f = workshopFixture({ steam });
          const r = run(f);
          expect(r.status).not.toBe(0);
          expect(output(r)).toContain('Content Manager');
          expect(output(r)).toContain('Actualizar el Workshop a mano');
          expect(output(r)).toContain('tools/vellum-bridge/README.md');
          expect(output(r)).not.toMatch(
            /CategoryInfo|FullyQualifiedErrorId|ScriptStackTrace/,
          );
          expect(output(r)).not.toContain('Updated Workshop item');
        }, 60000);
    },
  );
