# Vellum — identidad visual de marca

> Documento público de dirección de marca para Vellum. Define cómo debe verse y sentirse la marca sin cambiar los flujos, la jerarquía ni las decisiones de interacción del producto.

**Estado:** dirección aprobada para v1 · **Actualizado:** 2026-10-05 · **Responsable:** Vellum

### Fuentes de verdad de los assets

- **Figma:** [Vellum — nodo Logotipo](https://www.figma.com/design/NA8p6Rt2fkmgrdztzCM8jD/Vellum?node-id=20-3) — fuente visual editable del wordmark y del sistema de marca compartido.
- **Figma — Brand foundations:** [lámina de identidad](https://www.figma.com/design/NA8p6Rt2fkmgrdztzCM8jD/Vellum?node-id=24-2) — resumen visual del logo (V + rosa náutica), la V sola, la paleta y las reglas de uso.
- **App icon Liquid Glass:** fuente maestra privada de Icon Composer con `V_light.svg`, `brujula_light.svg` y especializaciones de apariencia. Sus derivados de distribución sí viven en el repositorio.
- **Repositorio actual:** `packages/renderer-webgl/src/assets/vellum-logo.svg` y `vellum-logo.ts` — derivados/provisional técnico ya usados por la aplicación; no son la fuente maestra de diseño.

## 1. Esencia de marca

Vellum convierte una ciudad virtual en un artefacto cartográfico digno de conservar. La marca debe comunicar tres ideas en el primer vistazo:

- **Cartografía:** precisión, capas, territorio y orientación.
- **Oficio:** una herramienta hecha con cuidado, no un exportador técnico improvisado.
- **Contemplación:** el resultado merece ser observado y compartido.

La personalidad es **serena, editorial y precisa**. Vellum puede tener carácter, pero nunca parecer una herramienta GIS corporativa, un videojuego estridente ni una interfaz ornamental que compita con el mapa.

### Principio rector

**La marca enmarca el mapa; no le roba protagonismo.**

La identidad vive con más fuerza en el empty state, el wordmark, la app icon, los estados de carga, la exportación y los materiales de comunidad. Durante la exploración del mapa, el chrome permanece ligero y funcional.

### Núcleo de marca y deltas por superficie

Vellum tiene dos superficies propias: la **app** de escritorio y la **landing** pública. Las dos comparten un núcleo de marca común; cada una añade un delta propio que no se traslada a la otra.

| Capa          | Contenido                                                                                                                                                                                                                                          | Dónde se detalla                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Núcleo        | Papel, papel cálido, piedra, tinta sepia `#4A4035` (también como color de texto), agua, coral, muted del logo y oscuro cálido de marca; Cormorant Garamond, Source Serif 4 y DM Mono; el logo V + rosa náutica; la voz serena, editorial y precisa | Este documento (§2–§4)                                               |
| Delta app     | Materiales nativos por plataforma (Mica/Acrylic en Windows, Liquid Glass en macOS, papel opaco en Linux), UI en `system-ui` y un oscuro funcional ligado al tema del mapa                                                                          | Este documento (§3, §4, §5) y `packages/ui/src/styles/`              |
| Delta landing | Oscuro cálido de página, acento por modo (agua en claro, coral en oscuro), Source Serif 4 como cuerpo, notas al margen en DM Mono Italic y escala tipográfica editorial                                                                            | Este documento (§3, §4); escala y componentes junto a `apps/landing` |

El núcleo no se convierte en un paquete de tokens compartido: la app conserva sus variables CSS y la landing define las suyas a partir de este documento.

## 2. Logotipo

### Wordmark

El wordmark principal es **Vellum** en Cormorant Garamond, con peso regular o semibold según tamaño. Debe conservar una sensación de pieza editorial: serif refinada, ritmo amplio y contraste moderado.

Reglas:

- Escribir `Vellum` con V mayúscula y el resto en minúsculas.
- No usar mayúsculas completas, cursiva ni tracking excesivo.
- No añadir “Map Viewer”, “CS1” ni un descriptor dentro del logotipo principal.
- El wordmark se usa en el empty state y en superficies de marca; la UI operativa usa `var(--font-ui)` salvo el nombre de ciudad o una cabecera explícitamente de marca.

### Logo: V + rosa náutica

El logo principal de Vellum es la **V + rosa náutica**, juntas. La V monumental (serif de alto contraste, proporciones verticales) aporta la firma; la rosa náutica (rosa de los vientos con letras cardinales, anillos, marcas y aguja) aporta territorio, orientación y oficio. La V es siempre el elemento dominante; la rosa va detrás, en el tono muted de la marca.

Debe funcionar en una tinta, sin depender de textura, transparencia o texto. El logo es la unidad para:

- icono de aplicación y favicons de 48 px o más, donde la rosa se lee;
- avatar de repositorio y perfiles comunitarios;
- cabecera de la landing, README, portada, splash breve y piezas editoriales;
- watermark amplio en exportaciones.

### V sola: tamaños pequeños

Por debajo del tamaño en que la rosa pierde detalle, se usa **solo la V**. Su fuerza viene de la claridad tipográfica, así que sigue siendo reconocible sin la rosa. Es la unidad para los favicons y los huecos de icono del sistema por debajo de 48 px (16–32 px), el watermark pequeño y los estados compactos. La rosa sola nunca sustituye a la V.

Los assets de Figma son la referencia visual aprobada. El SVG existente del renderer se conserva porque ya participa en la aplicación, pero debe tratarse como derivado de implementación hasta que se exporten desde la fuente maestra las variantes definitivas. La landing usa provisionalmente `apps/landing/public/assets/vellum-isotype-rounded.svg` (V + rosa náutica en un disco, con variante oscura interna).

### Lockups y variantes

| Variante  | Composición                              | Uso                                                                         | Restricción                                                                        |
| --------- | ---------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Principal | Logo (V + rosa) + wordmark horizontal    | README, web, releases, cabecera amplia                                      | Preferida cuando haya espacio                                                      |
| Vertical  | Logo (V + rosa) sobre wordmark           | Splash, portada, materiales editoriales                                     | No usar en controles pequeños                                                      |
| Logo      | V + rosa náutica                         | App icon, favicon ≥ 48 px, avatar, watermark amplio, nav de la landing      | Mínimo 48 px; excepción provisional de la landing a 24–30 px (ver tamaños mínimos) |
| V sola    | `V`                                      | Favicons e iconos del sistema < 48 px, watermark pequeño, estados compactos | Solo cuando el logo no cabe; reconocible a 16–24 px                                |
| Wordmark  | `Vellum` solo                            | Empty state, título de ventana, menciones inline                            | No sustituye al icono de app                                                       |
| Monocroma | Cualquiera de las anteriores a una tinta | Grabado, impresión, fondos complejos, accesibilidad                         | Sin degradados ni opacidades internas                                              |

Área de protección: dejar alrededor del lockup un espacio mínimo equivalente a la altura de la `V` del wordmark. En el logo y en la V sola, usar como mínimo un margen de `1/4` de su lado.

Tamaños mínimos de referencia: lockup horizontal 120 px de ancho en pantalla, 25 mm en impresión; logo con la rosa completa 48 px en pantalla, 14 mm en impresión; `V` sola 20 px en pantalla, 8 mm en impresión. **Pendiente de revisión de marca:** el sistema de tamaños exacto y un logo pequeño con la rosa simplificada (p. ej., reducida a los cuatro puntos cardinales). Hasta entonces, la versión en disco de la landing se usa a 24–30 px en la navegación y como favicon, como excepción provisional.

### Usos incorrectos

No deformar, rotar, inclinar, sombrear, contornear, recolorear con tonos de tránsito, colocar sobre imágenes sin zona de protección ni reconstruir el logo escribiendo una fuente similar. No usar la rosa náutica sola como marca ni el logo como decoración repetitiva dentro del mapa.

La rosa puede perder contraste u opacidad en una composición — como en la variante clara observada en Figma — siempre que la V siga siendo el elemento dominante y exista una versión de alto contraste para tamaños pequeños.

## 3. Paleta de marca

La paleta de marca es cálida y mineral. La paleta cartográfica de cada tema sigue siendo un sistema independiente: Day, Transit y los temas de terceros pueden cambiar el mapa sin cambiar la identidad base de Vellum.

### Colores de marca

| Token            | Hex       | Rol                                                       |
| ---------------- | --------- | --------------------------------------------------------- |
| `vellum-ink`     | `#4A4035` | Wordmark, V del logo, acciones primarias y tinta de texto |
| `vellum-paper`   | `#F7F6F1` | Fondo de marca, superficies claras, reverso de logo       |
| `vellum-warm`    | `#F2EFE9` | Superficie secundaria y exportaciones claras              |
| `vellum-stone`   | `#D9D3C8` | Divisores, hover, fondos de apoyo                         |
| `vellum-muted`   | `#807060` | Rosa náutica del logo, aplicación monocroma               |
| `vellum-water`   | `#6DB8B7` | Acento cartográfico y enlaces visuales puntuales          |
| `vellum-coral`   | `#D2938E` | Filetes y acento cálido; ver sus reglas de contraste      |
| `vellum-dark`    | `#1F1B17` | Oscuro cálido de marca (marrón tinta)                     |
| `vellum-transit` | `#1A1A2E` | Fondo del tema Transit, no color universal de marca       |

El marrón tinta (`#4A4035`) y el papel (`#F7F6F1`) son la pareja distintiva. El turquesa se reserva para señales cartográficas o de estado; no debe convertirse en el color dominante del producto.

**Tinta de texto.** `#4A4035` es también el color de texto de marca (9,35:1 sobre papel): nunca `#333333` ni negros neutros. La app pinta hoy su texto y su wordmark en `#333333`; alinearla es un cambio de producto pendiente, con su propia regresión visual (ver [`docs/es/landing-v1-backlog.md`](docs/es/landing-v1-backlog.md), B1).

### Reglas de color

- Logo oscuro sobre `vellum-paper` o fondos claros equivalentes.
- Logo claro/blanco únicamente sobre `vellum-ink`, `vellum-dark` o `vellum-transit` con contraste suficiente.
- No colocar el logo sobre gradientes de elevación, rutas de tránsito o texturas sin una placa de protección.
- Los colores de las líneas de transporte pertenecen al mapa/archivo y nunca deben usarse para recolorear la marca.
- Todo texto funcional debe respetar la verificación WCAG 2.1 AA ya definida para la UI. El color por sí solo nunca comunica el estado de una capa.
- **Coral.** Da 2,34:1 sobre papel: **nunca** como texto ni como foco sobre fondos claros, solo como filete o decoración. Sobre el oscuro cálido `#1F1B17` da 6,77:1 y sí sirve para texto, foco y UI.
- **Agua.** Da 2,11:1 sobre papel: sobre fondos claros es decorativa. Para texto y foco se usan tonos oscurecidos (en la landing, `#1F4C4C` para enlaces, 8,84:1, y `#2A6F6D` para foco, 5,40:1).
- **`vellum-muted`** da 4,41:1 sobre papel: no alcanza AA para texto pequeño; queda para el logo y la aplicación monocroma. Para texto auxiliar sobre papel se usa un muted más oscuro, `#6B5F52` (5,74:1), el mismo en papel, papel cálido y bandas.

### Oscuro de marca y oscuro funcional

Vellum tiene dos oscuros que no se mezclan:

- **Oscuro de marca, cálido** (familia `#1F1B17`, marrón tinta): el de las superficies de marca, empezando por la landing. Texto principal `#F1ECE3` (14,54:1). Los escalones de superficie (elevada, banda) y los textos secundarios los define cada superficie; los ratios de este documento se calculan sobre la base `#1F1B17`.
- **Oscuro funcional de la app**, azul-violeta (`#16161F`): lo activa el tema del mapa (Transit y los temas oscuros), no el sistema operativo, para que el chrome acompañe al mapa. Es un delta de la app, no un color de marca.

### Acento por superficie

- **App:** agua y coral como acentos puntuales del chrome (`--ui-accent-water`, `--ui-accent-rule`); el resto del color pertenece al mapa.
- **Landing:** el acento cambia con el modo. En claro, agua (decorativa) con sus tonos oscurecidos para enlaces y foco; el coral solo aparece como línea de margen decorativa. En oscuro cálido, coral para filetes, navegación activa, foco y enlaces (`#E2AAA4`, 8,57:1).

## 4. Tipografía

| Rol       | Familia                                                    | Superficie | Aplicación                                                                        |
| --------- | ---------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------- |
| Marca     | Cormorant Garamond                                         | Núcleo     | Wordmark, nombre de ciudad destacado, empty state, titulares y piezas editoriales |
| Lectura   | Source Serif 4                                             | Núcleo     | Lectura editorial larga: cuerpo de la landing, manifiesto y piezas web            |
| Datos     | DM Mono                                                    | Núcleo     | Coordenadas, nombres de líneas, IDs, datos cartográficos y marginalia del export  |
| Interfaz  | `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` | App        | Botones, labels, panel de capas, menús, toasts y ayudas                           |
| Anotación | DM Mono Italic                                             | Landing    | Notas al margen de la página: la voz de cuaderno de campo                         |

DM Mono es la misma familia en las dos superficies: la marginalia del export la usa en redonda, y la cursiva queda **solo para la landing**, como voz de las notas al margen. Source Serif 4 es familia de núcleo porque sirve a cualquier pieza de lectura larga de la marca, pero hoy solo la usa la landing: no entra en la UI de la app, que sigue en `system-ui`.

**Reservada:** IM Fell English queda registrada para usos futuros (p. ej., un timelapse de la ciudad). No se usa hoy en ninguna superficie.

Las familias de la app ya existen en `packages/ui/src/styles/01-settings.css` como `--font-wordmark`, `--font-ui` y `--font-mono`. Este documento las formaliza como identidad; no propone reemplazarlas.

Escala de referencia de la app (la landing tiene su propia escala editorial, definida junto a `apps/landing`):

- Wordmark en empty state: 32–48 px, según ventana.
- Wordmark en panel o cabecera: 24–32 px.
- Texto de UI: 12–14 px.
- Datos y captions: 11–12 px.

La Cormorant es una voz de marca, no una fuente de interfaz general. La interfaz debe seguir sintiéndose nativa, legible y rápida.

## 5. Iconografía

El sistema de iconos debe ser lineal, geométrico y sobrio: stroke de 1.5–2 px, terminaciones redondeadas, sin rellenos decorativos salvo estados de selección o marcadores cartográficos.

Familias:

1. **Acción:** abrir, exportar, cerrar, contraer, ajustes y navegación. Iconos simples y reconocibles; tooltip y etiqueta accesible cuando el control no tenga texto.
2. **Capas:** terreno, agua, vías, tránsito, edificios, bosques y distritos. Deben conservar una silueta propia y acompañarse siempre de label; el color dot no es el único canal.
3. **Servicios:** usar los SVG y colores ya definidos por `ServiceGroup` en `renderer-webgl/service-icons.ts`, sin crear una segunda interpretación visual en la UI.
4. **Cartografía:** norte, escala, grilla, elevación y minimapa. Pueden tener más detalle que los iconos de acción, pero deben mantener la misma retícula y peso de trazo.

No usar emojis como iconos de producto, iconos multicolor de sistema, metáforas de edición CAD ni símbolos excesivamente finos que desaparezcan al exportar o en pantallas de alta densidad.

### App icon y Liquid Glass

La entrega de Icon Composer es específica para la plataforma. Su estructura confirma dos capas:

- `V_light.svg`: la V de marca, que debe permanecer como ancla.
- `brujula_light.svg`: la rosa náutica, que funciona como profundidad, contexto y materialidad.

La variante Liquid Glass puede usar gradientes, translucencia, sombra neutral y especializaciones `dark`/`tinted` propias del sistema. Estas propiedades no deben trasladarse al logo de marketing ni a la UI de escritorio como efectos globales. Liquid Glass es una **adaptación de plataforma** del logo, no una nueva paleta de marca.

### Chrome por plataforma (delta app)

El chrome de la app adopta el material nativo de cada sistema, sin cambiar la marca:

- **Windows:** Mica/Acrylic, con una variante Fluent del icono.
- **macOS:** Liquid Glass, con el icono de Icon Composer.
- **Linux y plataformas sin material nativo:** papel opaco de Vellum.

Estos materiales son del delta de la app: la landing los **muestra** (como capturas del shell por sistema operativo), pero no los usa como estilo de página.

## 6. Movimiento y expresión

La marca se expresa mediante una transición de **revelación**, no mediante efectos llamativos. El fade-in del mapa después de la carga permanece como interacción definitoria. La identidad solo debe reforzarlo con una entrada limpia del wordmark o el logo.

- Curvas suaves y cortas: 150–300 ms para chrome; 300 ms para cambio de tema.
- Sin rebote, parallax, partículas ni animaciones permanentes.
- El logo puede aparecer con una máscara o fade sutil en splash/empty state, pero nunca retrasar la carga ni bloquear la interacción.
- El modo limpio (`Tab`) sigue ocultando el chrome: la marca no debe reaparecer como watermark invasivo.

## 7. Aplicaciones prioritarias

| Superficie               | Aplicación recomendada                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------- |
| Empty state              | Wordmark centrado; logo opcional como gesto de entrada sin desplazar la zona de drop    |
| Ventana de la app        | Logo como icono del sistema (Liquid Glass en macOS, Fluent en Windows); título `Vellum` |
| Panel flotante           | Wordmark pequeño en Cormorant; controles en fuente UI                                   |
| Watermark de exportación | Logo o V sola según tamaño, monocromo, baja opacidad y fuera del área de lectura        |
| README/web/release       | Lockup principal sobre papel; versión monocroma para fondos oscuros                     |
| Comunidad                | Logo para avatar; lockup horizontal para banners y previews                             |

No introducir una barra de navegación, splash prolongado, badge promocional ni elemento de marca que reduzca el canvas. La identidad se aplica dentro de los puntos de contacto ya previstos por la UX.

## 8. Estructura de recursos de marca

Cuando se incorporen los assets definitivos, usar esta estructura. Los archivos fuente editables se conservan separados de los derivados para distribución:

```text
brand/
├── source/
│   ├── vellum-logo-master.svg
│   ├── vellum-logo-master.ai        # opcional
│   └── vellum-logo-master.fig       # opcional
├── logo/
│   ├── vellum-lockup-horizontal.svg
│   ├── vellum-lockup-vertical.svg
│   ├── vellum-wordmark.svg
│   ├── vellum-isotype.svg
│   └── vellum-isotype-simplified.svg
├── raster/
│   ├── vellum-isotype-512.png
│   ├── vellum-isotype-1024.png
│   └── vellum-wordmark-2000.png
├── app-icons/
│   ├── macos/
│   ├── windows/
│   └── linux/
├── social/
│   ├── avatar-1024.png
│   └── banner-*.png
├── tokens/
│   └── brand-tokens.json
└── README.md
```

Para el repositorio actual, la migración mínima será conservar el SVG definitivo como asset vectorial, derivar los iconos Tauri desde el logo y reemplazar gradualmente el SVG provisional embebido en `vellum-logo.ts`. No se debe copiar el SVG completo dentro de TypeScript una vez que exista un asset fuente estable.

Convención de nombres: minúsculas, guiones, nombre de marca primero, variante después, fondo al final (`vellum-isotype-white-on-ink.svg`). No usar nombres como `final-final.svg` ni ocultar variantes en carpetas ambiguas. En los nombres de archivo, `isotype` designa el logo (V + rosa náutica); la V sola lleva `v-only` (`vellum-v-only.svg`).

## 9. Entregables pendientes de integración

La dirección visual ya está definida. Lo pendiente es convertir las fuentes maestras en una distribución técnica consistente:

- exportar desde Figma las variantes horizontal, vertical, wordmark, logo (V + rosa náutica) y V sola;
- exportar versiones claras, oscuras y monocromas con área de protección documentada;
- derivar los iconos Tauri desde el paquete `Vellum.icon`, sin redibujarlos a mano;
- reemplazar gradualmente el SVG embebido en `vellum-logo.ts` por un asset vectorial estable;
- revisar el watermark para usar el logo o la V sola según tamaño, fondo y contraste.

No se cambiarán los flujos de carga, panel, modo limpio, temas ni jerarquía de la UX. La marca se integra en puntos ya previstos: empty state, icono de aplicación, panel, exportación y materiales de comunidad.

## 10. Decisiones no tomadas

- No se fija todavía un eslogan: Vellum funciona mejor cuando la marca deja hablar al mapa.
- No se define un color exclusivo para tránsito: las líneas pertenecen al contenido de la ciudad.
- No se crea una fuente UI propia: la pila nativa es deliberada y ya forma parte de la experiencia.
- No se convierte esta guía en un nuevo sistema de design tokens de runtime: los tokens cartográficos y los temas `.vellumstyle` siguen siendo responsabilidad del sistema existente.
