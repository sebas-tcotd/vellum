import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const script = readFileSync('scripts/package-msix.ps1', 'utf8');
const manifest = readFileSync('apps/desktop/msix/AppxManifest.xml', 'utf8');
const windows = process.platform === 'win32';
const directories = [];
let validPe;
function compileFixture(version) {
  mkdirSync('target', { recursive: true });
  const directory = mkdtempSync(resolve('target/msix-pe-fixture-'));
  directories.push(directory);
  const source = join(directory, 'fixture.cs');
  const exe = join(directory, 'fixture.exe');
  // A tiny x64 test program with consistent version resources, not Vellum.
  writeFileSync(
    source,
    `using System.Reflection;
[assembly: AssemblyProduct("Vellum")]
[assembly: AssemblyInformationalVersion("${version}")]
[assembly: AssemblyVersion("${version}.0")]
class Fixture { static void Main() {} }
`,
  );
  const compiler = join(
    process.env.SystemRoot,
    'Microsoft.NET/Framework64/v4.0.30319/csc.exe',
  );
  const result = spawnSync(
    compiler,
    ['/nologo', '/platform:x64', '/target:exe', `/out:${exe}`, source],
    { encoding: 'utf8' },
  );
  if (result.status !== 0)
    throw new Error(
      `x64 PE test fixture compilation failed: ${result.error ?? result.stdout + result.stderr}`,
    );
  return exe;
}
function fixture() {
  mkdirSync('target', { recursive: true });
  const root = mkdtempSync(resolve('target/msix-test-'));
  directories.push(root);
  mkdirSync(join(root, 'scripts'));
  cpSync('scripts/package-msix.ps1', join(root, 'scripts/package-msix.ps1'));
  cpSync('apps/desktop/msix', join(root, 'apps/desktop/msix'), {
    recursive: true,
  });
  const tauri = join(root, 'apps/desktop/src-tauri');
  mkdirSync(tauri, { recursive: true });
  for (const name of ['tauri.conf.json', 'resources', 'icons', 'installer']) {
    cpSync(join('apps/desktop/src-tauri', name), join(tauri, name), {
      recursive: true,
    });
  }
  const exe = join(root, 'input.exe');
  validPe ??= compileFixture(
    JSON.parse(readFileSync('apps/desktop/src-tauri/tauri.conf.json', 'utf8'))
      .version,
  );
  cpSync(validPe, exe);
  return { root, exe, output: join(root, 'target/msix') };
}
function run(f, args = []) {
  return spawnSync(
    'pwsh',
    [
      '-NoProfile',
      '-File',
      join(f.root, 'scripts/package-msix.ps1'),
      '-Executable',
      f.exe,
      '-OutputDirectory',
      f.output,
      ...args,
    ],
    { encoding: 'utf8', timeout: 60000 },
  );
}
function failure(result, message) {
  expect(result.status).not.toBe(0);
  expect(result.stdout + result.stderr).toContain(message);
  expect(result.stdout).not.toContain('Unsigned MSIX:');
}
afterAll(() => {
  for (const path of directories)
    rmSync(path, { recursive: true, force: true });
});

describe('Store MSIX contracts', () => {
  it('keeps the Store identity, x64, minimum Windows and quoted associations', () => {
    expect(manifest).toContain('Name="SebastianVargasPizango.VellumCityMaps"');
    expect(manifest).toContain(
      'Publisher="CN=F93C1C62-364D-4C65-83BA-6DDD8A04B97F"',
    );
    expect(manifest).toContain('<DisplayName>Vellum City Maps</DisplayName>');
    expect(manifest).toContain(
      '<PublisherDisplayName>Sebastian Vargas Pizango</PublisherDisplayName>',
    );
    expect(manifest).toContain('ProcessorArchitecture="x64"');
    expect(manifest).toContain(
      'Name="Windows.Desktop" MinVersion="10.0.17763.0"',
    );
    expect(
      manifest.match(
        /<uap3:FileTypeAssociation .*Parameters="&quot;%1&quot;"/g,
      ),
    ).toHaveLength(2);
    expect(manifest).toContain('<uap:FileType>.cslmap</uap:FileType>');
    expect(manifest).toContain('<uap:FileType>.vellummap</uap:FileType>');
  });
  it('never rebuilds, signs, or recursively deletes caller paths', () => {
    expect(script).not.toMatch(
      /tauri build|cargo build|winapp|New-SelfSignedCertificate|signtool|Remove-Item/,
    );
    expect(script).toContain('$conf.bundle.resources');
    expect(script).toContain('Get-FileHash');
    expect(script).toContain('AppxSignature.p7x');
    expect(script).toContain('ReparsePoint');
  });
});

describe.skipIf(!windows)('PowerShell packaging validation', () => {
  it('rejects unrelated executables and mismatched embedded ProductVersion', () => {
    const f = fixture();
    cpSync(join(process.env.SystemRoot, 'System32/where.exe'), f.exe);
    failure(run(f), 'ProductName must be Vellum');
    cpSync(compileFixture('9.8.7'), f.exe);
    failure(run(f), "ProductVersion '9.8.7' differs from Tauri");
    expect(existsSync(f.output)).toBe(false);
    // Cold C# compilation and two PowerShell starts can exceed 5s on hosted Windows.
  }, 60000);
  it.each([
    '1.2.3-beta.1',
    '1.2',
    '1.2.3+build',
    '01.2.3',
    '65536.1.0',
    '99999999999999999999999999999.0.0',
    '-1.0.0',
  ])('rejects invalid release version %s without changing input', (version) => {
    const f = fixture();
    const before = readFileSync(f.exe);
    failure(
      run(f, ['-Version', version]),
      version.startsWith('65536') || version.startsWith('99999')
        ? 'range'
        : 'stable X.Y.Z',
    );
    expect(readFileSync(f.exe)).toEqual(before);
    expect(existsSync(f.output)).toBe(false);
  });
  it('rejects absent and non-PE input', () => {
    const f = fixture();
    rmSync(f.exe);
    failure(run(f), 'does not exist');
    writeFileSync(f.exe, 'not a PE');
    failure(run(f), 'not a PE');
  });
  it('rejects output ancestor of input and missing SDK tools', () => {
    const f = fixture();
    failure(run({ ...f, output: f.root }), 'inside this repository target');
    failure(
      run(f, ['-SdkBin', join(f.root, 'missing-sdk')]),
      'Windows SDK x64 tool missing',
    );
    expect(existsSync(f.exe)).toBe(true);
    mkdirSync(f.output, { recursive: true });
    const contained = join(f.output, 'input.exe');
    cpSync(f.exe, contained);
    failure(run({ ...f, exe: contained }), 'cannot contain the input');
    expect(existsSync(contained)).toBe(true);
  });
  it('rejects release version mismatch', () => {
    const f = fixture();
    failure(run(f, ['-Version', '1.2.3']), 'differs from Tauri');
  });
});

const sdkRoot = windows
  ? join(process.env['ProgramFiles(x86)'] ?? '', 'Windows Kits/10/bin')
  : '';
const sdk =
  windows && existsSync(sdkRoot)
    ? readdirSync(sdkRoot)
        .map((v) => join(sdkRoot, v, 'x64'))
        .find(
          (p) =>
            existsSync(join(p, 'makeappx.exe')) &&
            existsSync(join(p, 'makepri.exe')),
        )
    : undefined;
if (process.env.REQUIRE_MSIX_SDK === '1' && (!windows || !sdk)) {
  throw new Error(
    'Required MSIX test job needs Windows and x64 makepri/makeappx SDK tools; refusing to skip.',
  );
}
describe.skipIf(!sdk)(
  'real Windows SDK fixture (not a Vellum release binary)',
  () => {
    it('produces an unsigned package containing unchanged PE, manifest, logos and all resources', () => {
      const f = fixture();
      const result = run(f, ['-SdkBin', sdk]);
      expect(result.status, result.stderr + result.stdout).toBe(0);
      const stage = readdirSync(f.output).find((p) => !p.endsWith('.msix'));
      const unpacked = join(f.output, stage, 'unpacked');
      expect(
        createHash('sha256')
          .update(readFileSync(join(unpacked, 'vellum.exe')))
          .digest('hex'),
      ).toBe(createHash('sha256').update(readFileSync(f.exe)).digest('hex'));
      expect(existsSync(join(unpacked, 'AppxSignature.p7x'))).toBe(false);
      expect(
        readFileSync(join(unpacked, 'AppxManifest.xml'), 'utf8'),
      ).toContain(
        `Version="${JSON.parse(readFileSync('apps/desktop/src-tauri/tauri.conf.json', 'utf8')).version}.0"`,
      );
      for (const logo of [
        'Square44x44Logo.scale-100.png',
        'Square44x44Logo.targetsize-16_altform-unplated.png',
        'Square44x44Logo.targetsize-16_altform-lightunplated.png',
        'Square150x150Logo.scale-200.png',
        'StoreLogo.scale-400.png',
      ])
        expect(existsSync(join(unpacked, 'Assets', logo))).toBe(true);
      expect(existsSync(join(unpacked, 'resources.pri'))).toBe(true);
      // One PRI: split scale PRIs never load outside an .msixbundle.
      expect(
        readdirSync(unpacked).filter((name) => name.endsWith('.pri')),
      ).toEqual(['resources.pri']);
      expect(readdirSync(join(unpacked, 'themes'))).toHaveLength(5);
      expect(readdirSync(join(unpacked, 'resources/themes'))).toHaveLength(5);
      expect(existsSync(join(unpacked, 'installer/vellum-splash.bmp'))).toBe(
        true,
      );
      expect(existsSync(join(unpacked, 'installer/nsis-header.bmp'))).toBe(
        true,
      );
      expect(existsSync(join(unpacked, 'installer-bootstrap'))).toBe(false);
    }, 60000);
    it('fails before output when a declared runtime resource is missing', () => {
      const f = fixture();
      rmSync(
        join(f.root, 'apps/desktop/src-tauri/installer/vellum-splash.bmp'),
      );
      const result = run(f, ['-SdkBin', sdk]);
      expect(result.status).not.toBe(0);
      expect(existsSync(f.output)).toBe(false);
      expect(existsSync(f.exe)).toBe(true);
    });
    it('propagates SDK validation failure without reporting success', () => {
      const f = fixture();
      const path = join(f.root, 'apps/desktop/msix/AppxManifest.xml');
      writeFileSync(
        path,
        manifest.replace(/<Properties>[\s\S]*?<\/Properties>/, ''),
      );
      const result = run(f, ['-SdkBin', sdk]);
      expect(result.status).not.toBe(0);
      expect(result.stdout).not.toContain('Unsigned MSIX:');
      expect(existsSync(f.exe)).toBe(true);
    }, 60000);
  },
);
