# Vellum — Inventario de Componentes UI

> Generado: 2026-04-04 | Escaneo: Rápido | Parte: `desktop` + `ui`

---

## Estado Actual

> ⚠️ **Mínimo viable** — El paquete `@vellum/ui` contiene únicamente el scaffolding inicial. Los componentes se implementarán en las historias de usuario del Sprint 1 en adelante.

---

## Componentes Existentes

### `@vellum/ui`

| Componente | Archivo                   | Estado      | Descripción                                                                                  |
| ---------- | ------------------------- | ----------- | -------------------------------------------------------------------------------------------- |
| `App`      | `packages/ui/src/App.tsx` | Placeholder | Componente raíz. Actualmente devuelve `<div />`. Story 2.1 implementará el empty state real. |

**Exportaciones públicas:**

```typescript
// packages/ui/src/index.ts
export { App } from './App.tsx';
```

---

## Componentes Pendientes de Diseño

Según los artefactos de planificación en `_bmad-output/planning-artifacts/`, la interfaz de Vellum incluirá los siguientes tipos de componentes (ver `ux-design-specification.md` y `prd.md` para detalle):

| Categoría    | Componentes esperados                    | Fuente                       |
| ------------ | ---------------------------------------- | ---------------------------- |
| Layout       | Shell principal, paneles, sidebars       | `architecture.md`            |
| Canvas       | Área de renderizado del documento CSLMap | `renderer-canvas`            |
| Controles    | Toolbar, paleta de herramientas          | `prd.md`                     |
| Overlays     | Modales, tooltips, notificaciones        | `ux-design-specification.md` |
| Empty states | Estado inicial sin documento             | Story 2.1                    |

---

## Dependencias del Sistema de Diseño

| Paquete                   | Rol en el sistema de diseño                      |
| ------------------------- | ------------------------------------------------ |
| `@vellum/theme-engine`    | Tokens de diseño: colores, tipografía, espaciado |
| `@vellum/renderer-canvas` | Renderizado de contenido en Canvas 2D            |
| `@vellum/core`            | Tipos compartidos (Document, Element, etc.)      |

---

## Notas para Implementación

- Los componentes React deben importarse desde `@vellum/ui` — no directamente desde los paquetes de más bajo nivel
- El paquete `@vellum/ui` es el único con dependencia directa de `react` y `react-dom` entre los packages
- El `desktop` también declara `react`/`react-dom` como dependencias para el HMR de Vite
- El diseño de componentes está especificado en `_bmad-output/planning-artifacts/ux-design-specification.md`
