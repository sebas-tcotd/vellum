# Vellum — Guía de Desarrollo

> Generado: 2026-04-04 | Escaneo: Rápido

---

## Prerrequisitos

| Herramienta | Versión requerida | Verificar con |
|-------------|------------------|---------------|
| Node.js | LTS (≥18 recomendado) | `node --version` |
| pnpm | 10.33.0 | `pnpm --version` |
| Rust | stable (Edition 2021) | `rustc --version` |
| Tauri CLI | ^2.x (vía pnpm) | `pnpm tauri --version` |

> **Nota:** Tauri 2 requiere dependencias del sistema operativo para compilar el shell nativo. Consultar la documentación oficial de Tauri para Windows/macOS/Linux.

---

## Instalación

```bash
# Clonar el repositorio
git clone <repo-url>
cd Vellum

# Instalar todas las dependencias del monorepo
pnpm install
```

pnpm instalará automáticamente las dependencias de todos los workspaces (`apps/*` y `packages/*`) y creará los symlinks necesarios entre paquetes internos.

---

## Desarrollo Local

### Iniciar la app de escritorio (modo dev)

```bash
# Desde la raíz del monorepo
pnpm dev
# equivalente a: turbo dev
```

Esto ejecuta en orden:
1. Construye los paquetes dependientes (`core`, `parser-cslmap`, `renderer-canvas`, `theme-engine`, `ui`)
2. Inicia el servidor de desarrollo Vite en `http://localhost:1420`
3. Lanza el proceso Tauri con hot-reload del frontend

### Solo el servidor Vite (sin Tauri)

```bash
cd apps/desktop
pnpm dev:vite
```

---

## Compilación

### Build completo del monorepo

```bash
pnpm build
# equivalente a: turbo build
```

Turborepo construye en orden topológico: `core` → `theme-engine` + `parser-cslmap` → `renderer-canvas` → `ui` → `desktop`.

### Build solo frontend (sin empaquetar Tauri)

```bash
cd apps/desktop
pnpm build:vite   # tsc + vite build → genera apps/desktop/dist/
```

### Build completo de la app de escritorio

```bash
cd apps/desktop
pnpm build        # tauri build (incluye compilación Rust + empaquetado)
```

---

## TypeScript

```bash
# Verificar tipos en todo el monorepo
pnpm lint
# equivalente a: turbo lint (ejecuta tsc --noEmit en cada paquete)

# Build con verificación de tipos
pnpm build
```

Los path aliases del `tsconfig.json` raíz permiten que el IDE resuelva `@vellum/*` directamente desde los fuentes:

```json
"paths": {
  "@vellum/core":             ["./packages/core/src/index.ts"],
  "@vellum/ui":               ["./packages/ui/src/index.ts"],
  "@vellum/renderer-canvas":  ["./packages/renderer-canvas/src/index.ts"],
  "@vellum/theme-engine":     ["./packages/theme-engine/src/index.ts"],
  "@vellum/parser-cslmap":    ["./packages/parser-cslmap/src/index.ts"]
}
```

---

## Testing

> ⚠️ **No configurado** — El monorepo tiene la tarea `test` en Turborepo (`turbo test`) pero no existe framework de testing aún. Los paquetes no tienen archivos de prueba.

```bash
# Cuando se configure:
pnpm test
```

---

## Agregar un Nuevo Paquete

1. Crear directorio en `packages/<nombre>/`
2. Crear `package.json` con `"name": "@vellum/<nombre>"` y `"main": "./src/index.ts"`
3. Crear `tsconfig.json` (copiar de paquete existente)
4. Crear `src/index.ts`
5. Agregar el path alias en `tsconfig.json` raíz
6. Ejecutar `pnpm install` desde la raíz

---

## Agregar Comandos IPC a Tauri

Los comandos IPC permiten al frontend React invocar funciones Rust:

```rust
// En apps/desktop/src-tauri/src/lib.rs
#[tauri::command]
fn mi_comando(arg: String) -> String {
    format!("Respuesta: {}", arg)
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![mi_comando])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

```typescript
// En el frontend
import { invoke } from '@tauri-apps/api/core';
const respuesta = await invoke<string>('mi_comando', { arg: 'hola' });
```

---

## Estructura de Scripts del Monorepo

| Script | Comando real | Descripción |
|--------|-------------|-------------|
| `pnpm dev` | `turbo dev` | Inicia app desktop en modo dev |
| `pnpm build` | `turbo build` | Compila todo el monorepo |
| `pnpm test` | `turbo test` | Ejecuta pruebas (no configurado aún) |
| `pnpm lint` | `turbo lint` | Verifica tipos TypeScript |
