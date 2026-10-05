# Spike: componentes reales de la app en Declarative Shadow DOM

Paso 4 del rediseño de la landing (decisión C2 de `docs/es/landing-v1-backlog.md`).

## Veredicto: **viable**

Las 6 comparaciones (2 componentes × 3 variantes) dan **0,0000 %** de píxeles distintos frente a la referencia, con el comparador y el umbral de los goldens (delta RGB exclusivo 2, máx. 0,5 % de píxeles, alfa exacto). Las dos pruebas de fuga también dan 0 %. El paso 5 usa los componentes reales; las capturas T37/T35 no hacen falta.

| Componente                                 | Variante     | Diferencia      | Tamaño  |
| ------------------------------------------ | ------------ | --------------- | ------- |
| AdvancedOptionsPanel (roads, vellummap)    | linux claro  | 0,0000 % (0 px) | 272×192 |
| AdvancedOptionsPanel                       | macos claro  | 0,0000 % (0 px) | 272×192 |
| AdvancedOptionsPanel                       | linux oscuro | 0,0000 % (0 px) | 272×192 |
| PlaceCard (distrito: hechos, filas, barra) | linux claro  | 0,0000 % (0 px) | 352×491 |
| PlaceCard                                  | macos claro  | 0,0000 % (0 px) | 352×540 |
| PlaceCard                                  | linux oscuro | 0,0000 % (0 px) | 352×491 |
| Panel bajo página hostil                   | linux claro  | 0,0000 %        | 272×192 |
| Tarjeta bajo página hostil                 | linux claro  | 0,0000 %        | 352×491 |

Medido el 2026-10-05, Windows 11, Chromium de Playwright headless, `deviceScaleFactor` 1, inglés.

## Cómo se mide

- `spike:build` compila `spike/` en `target/landing-spike` (no toca `dist/`, `astro.config.mjs` ni los workflows); `prespike:build` compila antes `@vellum/core`.
- `/embed/<v>/`: CSS de la landing en el documento y cada componente en `<template shadowrootmode="open">`. `/reference/<v>/`: los mismos componentes en el DOM normal con el `globals.css` completo y `data-platform`/`data-appearance` en `<html>`. En los dos lados el marco hereda `font-family: var(--font-shell)`, como los componentes de la app desde `.desktop-shell`.
- `test:spike` captura el marco de cada uno, compara con `compareRgbaPixels`/`decodePngToRgba`, aplica el umbral de `manifest.json` y, si difieren, escribe `embed.png`, `reference.png` y `diff.png` en `target/landing-spike-results/`.
- Fugas: `body` conserva `min-width: 320px` y `overflow: visible`; un `.place-card` fuera del shadow root sigue `static`; `:root` no recibe tokens de la app; una página que fija en `body` color, fuente, interlineado, espaciado, mayúsculas, sangría, sombra de texto y `--color-bg`/`--shell-surface`/`--tw-shadow`, y además reglas que alcanzan al propio host (`*` y `vellum-app-embed`, estas con `!important`: color, interlineado, espaciado, tamaño, estilo y grosor de fuente, mayúsculas), no altera el componente.
- Tokens de perfil: en cada variante, `--shell-separator`, `--shell-text-primary` y `--shell-solid-surface` calculados en el marco dentro del shadow root son iguales a los calculados en el `<html>` de la referencia (este test sí falla con el error del hallazgo 2, que la comparación de píxeles deja pasar).
- HTML sin JS: dos `<template shadowrootmode="open">`, sin `<script>` ni `astro-island`, hosts con `inert` y `aria-hidden`; con JS desactivado los shadow roots se adjuntan.
- Control negativo: sin subir los `@property` al documento, el panel da 7,11 % / 7,11 % / 4,75 % / 6,37 % (hostil); el test falla y escribe el diff. Un test fijo (embed claro contra referencia oscura) comprueba que una diferencia real falla y deja el `diff.png`.

## Hallazgos

1. Los `@property` de Tailwind v4 tienen que ir al documento (Chromium los ignora en shadow roots). El envoltorio los extrae con una regex; si Tailwind cambia su forma y la regex no extrae todos, el build falla con un error explícito.
2. Tokens definidos con `var()` se resolvían en `:host`: con `:root` → `:host` a secas, `--shell-separator`, `--shell-text-primary`… llegaban al `div` `macos` ya resueltos con los valores por defecto, y la tarjeta macOS clara daba 0,1505 % (286 px). Se arregló aplicando el bloque por defecto de `02-themes.css` a los cuatro perfiles (en la app no cambia nada). Esa diferencia estaba **por debajo del umbral**: el paso 5 debe vigilar el número absoluto de píxeles (hoy 0).
3. El CSS compilado de la app solo difiere en selectores (`:root, :host` y los dos perfiles añadidos); mismo orden y declaraciones. `globals.css` intacto.
4. `all: initial` en `:host` corta la herencia de lo que la página fija en sus propios elementos; las custom properties de la página que la app también declara quedan tapadas. Una que la app use sin declararla (p. ej. `--shell-mica-highway`) sí entraría; no afecta a estos componentes.
5. Astro sigue los `paths` del tsconfig raíz hasta las fuentes de `@vellum/core`, que no se empaquetan; el spike lo apunta a `dist` (requiere core compilado).
6. Tipos en el paso 5: al pasar el envoltorio a `src/`, el tsconfig de la landing necesita `lib` ES2022 y `paths` propios para `@vellum/*`, o `lint` fallará en las fuentes de core.
7. Peso: 68 KB de CSS en línea por componente (página con dos: 151 KB, 27,6 KB gzip). Opciones: acotar `@source`, o `<link rel="stylesheet">` dentro del shadow root.
8. Fuentes: estos componentes usan fuentes del sistema (`--font-shell`); el perfil `macos` se verá con la fuente de sustitución del visitante en Windows (inherente).
9. La sombra de la tarjeta sale del marco y no se compara.
10. Sin probar: Safari, Firefox, HiDPI, perfil `windows`, español.
11. **Reglas de la página que alcanzan al host.** Una regla del documento que selecciona al propio host (`*`, `vellum-app-embed`, con o sin `!important`) gana a `:host { all: initial }` (el contexto exterior gana en la cascada) y su valor se hereda hacia dentro: sin más, el panel daba 3,67 % y la tarjeta cambiaba de alto. Se resuelve dentro de `embed.css`: el elemento con `data-platform` vuelve a `all: initial` y retoma lo que el `<html>` y el `<body>` de la app le dan (`line-height: 1.5`, `tab-size`, `text-size-adjust`, color y fuente). Con eso, la página hostil da 0 %. Lo que queda fuera de su alcance son las custom properties que la app no declara (hallazgo 4) y el tamaño de la raíz (hallazgo 12).
12. **Los `rem` siguen al `<html>` del documento.** Dentro del shadow root, `rem` se calcula con el `font-size` de la raíz del documento, y ningún CSS del shadow root lo puede bloquear (`text-xs` pasaba a 14,25 px con `* { font-size: 19px }`). El paso 5 tiene que mantener el `font-size` raíz de la landing en el valor por defecto (16 px), sin `html { font-size: … }` ni escalados tipográficos sobre `:root`. La página hostil aplica su tamaño a `body *` y no a `<html>` por esto.
13. **Cormorant Garamond 400 se declara dos veces** en la página de embed: la de `@fontsource` de la landing (`font-display: swap`, varios `unicode-range`) y la de `embed-fonts.css` (`block`, solo latín). Funciona, pero el paso 5 debería compartir una sola declaración (p. ej. que la página use solo la de `embed-fonts.css`, o que `embed-fonts.css` traiga solo DM Mono cuando la landing ya carga Cormorant).
