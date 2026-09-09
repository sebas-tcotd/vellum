import { pathToFileURL } from 'node:url';

export function gateFailures({ required, routed }) {
  const failures = [];

  for (const { name, result } of required) {
    if (result !== 'success') {
      failures.push(`${name} terminó con resultado '${result}'.`);
    }
  }

  for (const { name, expected, result } of routed) {
    if (expected !== 'true' && expected !== 'false') {
      failures.push(
        `${name} recibió un valor esperado inválido '${expected}'.`,
      );
      continue;
    }
    const wanted = expected === 'true' ? 'success' : 'skipped';
    if (result !== wanted) {
      failures.push(
        `${name} debía terminar '${wanted}' y terminó '${result}'.`,
      );
    }
  }

  return failures;
}

function main() {
  const failures = gateFailures({
    required: [
      { name: 'Detect changes', result: process.env.DETECT_RESULT },
      { name: 'Repository checks', result: process.env.REPOSITORY_RESULT },
    ],
    routed: [
      {
        name: 'JavaScript quality',
        expected: process.env.JS_EXPECTED,
        result: process.env.JS_RESULT,
      },
      {
        name: 'Rust quality',
        expected: process.env.RUST_EXPECTED,
        result: process.env.RUST_RESULT,
      },
      {
        name: 'Build frontend',
        expected: process.env.FRONTEND_EXPECTED,
        result: process.env.FRONTEND_RESULT,
      },
      {
        name: 'E2E Golden Flow',
        expected: process.env.E2E_EXPECTED,
        result: process.env.E2E_RESULT,
      },
      {
        name: 'Compile matrix',
        expected: process.env.COMPILE_EXPECTED,
        result: process.env.COMPILE_RESULT,
      },
    ],
  });

  for (const failure of failures) console.log(`::error::${failure}`);
  if (failures.length > 0) process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
