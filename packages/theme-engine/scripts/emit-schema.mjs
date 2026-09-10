// Emits packages/theme-engine/vellumstyle.schema.json from the derived schema builder.
// Run via `pnpm --filter @vellum/theme-engine schema:emit` (which builds `dist/` first).
//
// `dist/` is bundler-targeted output: `tsc` keeps the extensionless relative specifiers
// from the sources (`./validators/color`), which Node's ESM resolver rejects. The hook
// below re-adds the extension so this script can consume the same `dist/index.js` the app
// does, without a TS runner or a second build config.
import * as nodeModule from 'node:module';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';

// `module.registerHooks` es síncrono y solo existe desde Node 22.15 / 23.5. Sin este
// chequeo, una versión anterior revienta con un `TypeError: registerHooks is not a
// function` que no dice nada sobre qué hay que instalar.
if (typeof nodeModule.registerHooks !== 'function') {
  console.error(
    `Este script necesita \`module.registerHooks\` (Node >= 22.15); estás en ${process.version}. Actualiza Node y vuelve a correr \`pnpm --filter @vellum/theme-engine schema:emit\`.`,
  );
  process.exit(1);
}

nodeModule.registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      // Solo el "no encuentro el módulo" justifica reintentar con extensión. Cualquier
      // otro fallo de resolución (un specifier inválido, un `exports` mal formado) es un
      // problema real que hay que ver tal cual, no enmascarar con un segundo intento.
      if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
      if (!specifier.startsWith('.') || !context.parentURL) throw error;
      for (const candidate of [`${specifier}.js`, `${specifier}/index.js`]) {
        const url = new URL(candidate, context.parentURL);
        if (existsSync(fileURLToPath(url))) {
          return { url: url.href, shortCircuit: true };
        }
      }
      throw error;
    }
  },
});

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, '..', 'vellumstyle.schema.json');
const entry = resolve(here, '..', 'dist', 'index.js');

// Sin `dist/` el hook de arriba relanza un ERR_MODULE_NOT_FOUND que apunta al specifier
// interno y esconde la causa real: nadie compiló el paquete.
if (!existsSync(entry)) {
  console.error(
    `No existe ${entry}: corre \`tsc -b\` primero (o usa \`pnpm --filter @vellum/theme-engine schema:emit\`, que ya lo hace).`,
  );
  process.exit(1);
}

const { buildVellumStyleSchema } = await import('../dist/index.js');

// Format with the repo's own Prettier config so the committed artifact stays clean under
// `pnpm format:check` — otherwise re-emitting would always dirty the working tree.
const raw = JSON.stringify(buildVellumStyleSchema(), null, 2);
const options = (await prettier.resolveConfig(target)) ?? {};
const formatted = await prettier.format(raw, { ...options, parser: 'json' });

writeFileSync(target, formatted);
console.log(`wrote ${target}`);
