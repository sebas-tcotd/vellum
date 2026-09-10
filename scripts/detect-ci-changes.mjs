import { appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const CI_CATEGORIES = [
  'js',
  'rust',
  'frontend',
  'e2e',
  'compile',
  'landing',
  'dependencies',
];

const ROOT_WIDE_FILES = new Set([
  '.prettierignore',
  'Cargo.lock',
  'Cargo.toml',
  'deny.toml',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'release-please-config.json',
  'rust-toolchain.toml',
  'tsconfig.json',
  'turbo.json',
  'vitest.scripts.config.mjs',
]);

const DOCUMENTATION_PATHS =
  /^(?:docs\/|README(?:\.|$)|CHANGELOG\.md$|LICENSE$)/;

function flagsWith(value) {
  return Object.fromEntries(CI_CATEGORIES.map((category) => [category, value]));
}

function enable(flags, ...categories) {
  for (const category of categories) flags[category] = true;
}

export function classifyPaths(inputPaths) {
  const flags = flagsWith(false);

  for (const rawPath of inputPaths) {
    const file = rawPath.replaceAll('\\', '/').replace(/^\.\//, '');
    if (!file) continue;

    if (file.startsWith('.github/') || ROOT_WIDE_FILES.has(file)) {
      Object.assign(flags, flagsWith(true));
      continue;
    }

    if (DOCUMENTATION_PATHS.test(file) || file.startsWith('brand/')) continue;

    if (file.startsWith('apps/landing/')) {
      flags.landing = true;
      if (/(?:^|\/)package\.json$/.test(file)) flags.dependencies = true;
      continue;
    }

    // ADR-0003: installer-bootstrap declares its own empty [workspace] and is
    // dormant — not part of the root Cargo workspace, not built by any
    // release path today. Nothing in rust-quality, build-frontend, e2e or
    // compile-matrix touches it, so routing changes here into any of them
    // would only burn CI minutes on jobs that check nothing new.
    if (file.startsWith('apps/desktop/src-tauri/installer-bootstrap/')) {
      continue;
    }

    if (file.startsWith('apps/desktop/src-tauri/')) {
      enable(flags, 'rust', 'frontend', 'e2e', 'compile');
      if (/(?:Cargo\.toml|Cargo\.lock)$/.test(file)) flags.dependencies = true;
      continue;
    }

    if (file.startsWith('apps/desktop/')) {
      enable(flags, 'js', 'frontend', 'e2e');
      if (/(?:^|\/)package\.json$/.test(file)) flags.dependencies = true;
      continue;
    }

    if (file.startsWith('packages/parser-cslmap/')) {
      enable(flags, 'rust', 'frontend', 'e2e', 'compile');
      if (/\.(?:js|mjs|cjs|ts|tsx|json)$/.test(file)) flags.js = true;
      if (/(?:Cargo\.toml|package\.json)$/.test(file))
        flags.dependencies = true;
      continue;
    }

    if (file.startsWith('packages/')) {
      enable(flags, 'js', 'frontend', 'e2e');
      if (/(?:^|\/)package\.json$/.test(file)) flags.dependencies = true;
      continue;
    }

    if (file.startsWith('scripts/') || file.startsWith('eslint.config.')) {
      flags.js = true;
      if (file === 'scripts/audit-deps.mjs') flags.dependencies = true;
      continue;
    }

    if (
      /^(?:\.gitignore|\.gitattributes|commitlint\.config\.|\.husky\/)/.test(
        file,
      )
    ) {
      continue;
    }

    // Un archivo nuevo fuera de las superficies conocidas no debe reducir
    // cobertura por accidente. El coste de ejecutar todo es menor que un verde
    // falso mientras el router aprende una categoría nueva.
    Object.assign(flags, flagsWith(true));
  }

  return flags;
}

function invalidRevision(revision) {
  return !revision || /^0+$/.test(revision);
}

export function parseNameStatus(output) {
  if (!output) return [];

  const fields = output.split('\0');
  if (fields.at(-1) === '') fields.pop();
  const paths = [];

  for (let index = 0; index < fields.length; ) {
    const status = fields[index++];
    const pathCount = /^[RC]/.test(status) ? 2 : 1;
    if (!/^[ACDMRTUXB][0-9]*$/.test(status)) {
      throw new Error(`estado de diff inválido: ${status || '<vacío>'}`);
    }
    if (index + pathCount > fields.length) {
      throw new Error(`diff truncado después de ${status}`);
    }
    paths.push(...fields.slice(index, index + pathCount));
    index += pathCount;
  }

  return paths;
}

export function resolveClassification({
  base,
  head,
  mode,
  runGit = spawnSync,
}) {
  if (invalidRevision(base) || invalidRevision(head)) {
    return {
      flags: flagsWith(true),
      fallbackReason: 'revisión base o head ausente/inválida',
      paths: [],
    };
  }

  const separator = mode === 'pull_request' ? '...' : '..';
  const result = runGit(
    'git',
    [
      'diff',
      '--name-status',
      '-z',
      '--diff-filter=ACDMRTUXB',
      `${base}${separator}${head}`,
    ],
    { encoding: 'utf8' },
  );

  if (result.status !== 0) {
    return {
      flags: flagsWith(true),
      fallbackReason: `git diff falló: ${(result.stderr || 'sin detalle').trim()}`,
      paths: [],
    };
  }

  try {
    const paths = parseNameStatus(result.stdout);
    return { flags: classifyPaths(paths), fallbackReason: '', paths };
  } catch (error) {
    return {
      flags: flagsWith(true),
      fallbackReason: `no se pudo interpretar git diff: ${error.message}`,
      paths: [],
    };
  }
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

function main() {
  const classification = resolveClassification({
    base: argumentValue('--base'),
    head: argumentValue('--head'),
    mode: argumentValue('--mode'),
  });

  if (classification.fallbackReason) {
    console.log(
      `::warning title=CI change detection fallback::${classification.fallbackReason}; se ejecutarán todos los checks.`,
    );
  } else {
    console.log(`Archivos cambiados (${classification.paths.length}):`);
    for (const file of classification.paths) console.log(`- ${file}`);
  }

  const output = [
    ...CI_CATEGORIES.map(
      (category) => `${category}=${classification.flags[category]}`,
    ),
    `fallback=${Boolean(classification.fallbackReason)}`,
  ].join('\n');

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${output}\n`);
  } else {
    console.log(output);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
