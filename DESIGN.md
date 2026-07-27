# Vellum — identidad visual de marca

> Documento de dirección de marca para Vellum. Define cómo debe verse y sentirse la marca sin cambiar los flujos, la jerarquía ni las decisiones de interacción descritas en `_bmad-output/planning-artifacts/ux-design-specification.md`.

**Estado:** dirección aprobada para v1 · **Actualizado:** 2026-07-27 · **Responsable:** Vellum

### Fuentes de verdad de los assets

- **Figma:** [Vellum — nodo Logotipo](https://www.figma.com/design/NA8p6Rt2fkmgrdztzCM8jD/Vellum?node-id=20-3) — fuente visual editable del wordmark y del sistema de marca compartido.
- **Figma — Brand foundations:** [lámina de identidad](https://www.figma.com/design/NA8p6Rt2fkmgrdztzCM8jD/Vellum?node-id=24-2) — resumen visual de isotipo, motivo, emblema, paleta y reglas de uso.
- **App icon Liquid Glass:** `/Users/tcotd/Desktop/Vellum.icon` — paquete de Icon Composer con `V_light.svg`, `brujula_light.svg` y especializaciones de apariencia.
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

## 2. Logotipo e isotipo

### Wordmark

El wordmark principal es **Vellum** en Cormorant Garamond, con peso regular o semibold según tamaño. Debe conservar una sensación de pieza editorial: serif refinada, ritmo amplio y contraste moderado.

Reglas:

- Escribir `Vellum` con V mayúscula y el resto en minúsculas.
- No usar mayúsculas completas, cursiva ni tracking excesivo.
- No añadir “Map Viewer”, “CS1” ni un descriptor dentro del logotipo principal.
- El wordmark se usa en el empty state y en superficies de marca; la UI operativa usa `var(--font-ui)` salvo el nombre de ciudad o una cabecera explícitamente de marca.

### Isotipo

El isotipo confirmado es la **V** monumental de Vellum: serif de alto contraste, proporciones verticales y una silueta muy reconocible incluso sin wordmark. Su fuerza viene de la claridad tipográfica, por lo que no necesita textura ni una interpretación literal de un mapa para funcionar.

La lectura cartográfica se amplía mediante la brújula: una rosa de los vientos detallada, con letras cardinales, anillos, marcas y aguja. La brújula es un **motivo secundario de navegación y cartografía**, no el isotipo primario.

La composición `V + brújula` es el emblema enriquecido de Vellum. La V aporta la firma; la brújula aporta territorio, orientación y oficio. Debe reservarse para superficies donde el detalle sobreviva: app icon, portada, watermark amplio, splash breve o piezas editoriales.

Debe funcionar en una tinta, sin depender de textura, transparencia o texto. El isotipo es la unidad para:

- icono de aplicación y favicons;
- watermark discreto en exportaciones;
- avatar de repositorio y perfiles comunitarios;
- estados compactos donde el wordmark no cabe.

Los assets de Figma son la referencia visual aprobada. El SVG existente del renderer se conserva porque ya participa en la aplicación, pero debe tratarse como derivado de implementación hasta que se exporten desde la fuente maestra las variantes definitivas.

### Lockups y variantes

| Variante             | Composición                              | Uso                                                   | Restricción                                 |
| -------------------- | ---------------------------------------- | ----------------------------------------------------- | ------------------------------------------- |
| Principal            | Isotipo + wordmark horizontal            | README, web, releases, cabecera amplia                | Preferida cuando haya espacio               |
| Vertical             | Isotipo sobre wordmark                   | Splash, portada, materiales editoriales               | No usar en controles pequeños               |
| Isotipo              | `V` sola                                 | Favicon, avatar, watermark pequeño, estados compactos | Debe seguir siendo reconocible a 16–24 px   |
| Emblema cartográfico | `V` + brújula                            | App icon, splash breve, portada, watermark amplio     | No reducir cuando la brújula pierda detalle |
| Wordmark             | `Vellum` solo                            | Empty state, título de ventana, menciones inline      | No sustituye al icono de app                |
| Monocroma            | Cualquiera de las anteriores a una tinta | Grabado, impresión, fondos complejos, accesibilidad   | Sin degradados ni opacidades internas       |

Área de protección: dejar alrededor del lockup un espacio mínimo equivalente a la altura de la `V` del wordmark. En el isotipo, usar como mínimo un margen de `1/4` de su lado.

Tamaños mínimos recomendados: lockup horizontal 120 px de ancho en pantalla, 25 mm en impresión; `V` sola 20 px en pantalla, 8 mm en impresión; emblema `V + brújula` 48 px en pantalla, 14 mm en impresión. Si el tamaño es menor, usar solo la V.

### Usos incorrectos

No deformar, rotar, inclinar, sombrear, contornear, recolorear con tonos de tránsito, colocar sobre imágenes sin zona de protección ni reconstruir el logo escribiendo una fuente similar. No usar la brújula como marca principal ni el emblema como decoración repetitiva dentro del mapa.

La brújula puede perder contraste u opacidad en una composición — como en la variante clara observada en Figma — siempre que la V siga siendo el elemento dominante y exista una versión de alto contraste para tamaños pequeños.

## 3. Paleta de marca

La paleta de marca es cálida y mineral. La paleta cartográfica de cada tema sigue siendo un sistema independiente: Day, Transit y los temas de terceros pueden cambiar el mapa sin cambiar la identidad base de Vellum.

### Colores de marca

| Token            | Hex       | Rol                                                      |
| ---------------- | --------- | -------------------------------------------------------- |
| `vellum-ink`     | `#4A4035` | Wordmark, isotipo principal, acciones primarias          |
| `vellum-paper`   | `#F7F6F1` | Fondo de marca, superficies claras, reverso de logo      |
| `vellum-warm`    | `#F2EFE9` | Superficie secundaria y exportaciones claras             |
| `vellum-stone`   | `#D9D3C8` | Divisores, hover, fondos de apoyo                        |
| `vellum-muted`   | `#807060` | Isotipo secundario, texto auxiliar, aplicación monocroma |
| `vellum-water`   | `#6DB8B7` | Acento cartográfico y enlaces visuales puntuales         |
| `vellum-transit` | `#1A1A2E` | Fondo del tema Transit, no color universal de marca      |

El marrón tinta (`#4A4035`) y el papel (`#F7F6F1`) son la pareja distintiva. El turquesa se reserva para señales cartográficas o de estado; no debe convertirse en el color dominante del producto.

### Reglas de color

- Logo oscuro sobre `vellum-paper` o fondos claros equivalentes.
- Logo claro/blanco únicamente sobre `vellum-ink` o `vellum-transit` con contraste suficiente.
- No colocar el logo sobre gradientes de elevación, rutas de tránsito o texturas sin una placa de protección.
- Los colores de las líneas de transporte pertenecen al mapa/archivo y nunca deben usarse para recolorear la marca.
- Todo texto funcional debe respetar la verificación WCAG 2.1 AA ya definida para la UI. El color por sí solo nunca comunica el estado de una capa.

## 4. Tipografía

| Rol      | Familia                                                    | Aplicación                                                             |
| -------- | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| Marca    | Cormorant Garamond                                         | Wordmark, nombre de ciudad destacado, empty state y piezas editoriales |
| Interfaz | `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` | Botones, labels, panel de capas, menús, toasts y ayudas                |
| Datos    | DM Mono                                                    | Coordenadas, nombres de líneas, IDs y datos cartográficos              |

Estas decisiones ya existen en `packages/ui/src/globals.css` como `--font-wordmark`, `--font-ui` y `--font-mono`. Este documento las formaliza como identidad; no propone reemplazarlas.

Escala de referencia:

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

`/Users/tcotd/Desktop/Vellum.icon` es una entrega específica para Icon Composer. Su estructura confirma dos capas:

- `V_light.svg`: la V de marca, que debe permanecer como ancla.
- `brujula_light.svg`: la brújula cartográfica, que funciona como profundidad, contexto y materialidad.

La variante Liquid Glass puede usar gradientes, translucencia, sombra neutral y especializaciones `dark`/`tinted` propias del sistema. Estas propiedades no deben trasladarse al logo de marketing ni a la UI de escritorio como efectos globales. Liquid Glass es una **adaptación de plataforma** del emblema, no una nueva paleta de marca.

## 6. Movimiento y expresión

La marca se expresa mediante una transición de **revelación**, no mediante efectos llamativos. El fade-in del mapa después de la carga permanece como interacción definitoria. La identidad solo debe reforzarlo con una entrada limpia del wordmark/isotipo.

- Curvas suaves y cortas: 150–300 ms para chrome; 300 ms para cambio de tema.
- Sin rebote, parallax, partículas ni animaciones permanentes.
- El isotipo puede aparecer con una máscara o fade sutil en splash/empty state, pero nunca retrasar la carga ni bloquear la interacción.
- El modo limpio (`Tab`) sigue ocultando el chrome: la marca no debe reaparecer como watermark invasivo.

## 7. Aplicaciones prioritarias

| Superficie               | Aplicación recomendada                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------- |
| Empty state              | Wordmark centrado; emblema opcional como gesto de entrada sin desplazar la zona de drop |
| Ventana de la app        | Emblema Liquid Glass como icono del sistema; título textual `Vellum`                    |
| Panel flotante           | Wordmark pequeño en Cormorant; controles en fuente UI                                   |
| Watermark de exportación | Isotipo monocromo, baja opacidad y fuera del área de lectura principal                  |
| README/web/release       | Lockup principal sobre papel; versión monocroma para fondos oscuros                     |
| Comunidad                | Isotipo para avatar; lockup horizontal para banners y previews                          |

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

Para el repositorio actual, la migración mínima será conservar el SVG definitivo como asset vectorial, derivar los iconos Tauri desde el isotipo y reemplazar gradualmente el SVG provisional embebido en `vellum-logo.ts`. No se debe copiar el SVG completo dentro de TypeScript una vez que exista un asset fuente estable.

Convención de nombres: minúsculas, guiones, nombre de marca primero, variante después, fondo al final (`vellum-isotype-white-on-ink.svg`). No usar nombres como `final-final.svg` ni ocultar variantes en carpetas ambiguas.

## 9. Entregables pendientes de integración

La dirección visual ya está definida. Lo pendiente es convertir las fuentes maestras en una distribución técnica consistente:

- exportar desde Figma las variantes horizontal, vertical, wordmark, V sola y emblema;
- exportar versiones claras, oscuras y monocromas con área de protección documentada;
- derivar los iconos Tauri desde el paquete `Vellum.icon`, sin redibujarlos a mano;
- reemplazar gradualmente el SVG embebido en `vellum-logo.ts` por un asset vectorial estable;
- revisar el watermark para usar la V sola o el emblema según tamaño, fondo y contraste.

No se cambiarán los flujos de carga, panel, modo limpio, temas ni jerarquía de la UX. La marca se integra en puntos ya previstos: empty state, icono de aplicación, panel, exportación y materiales de comunidad.

## 10. Decisiones no tomadas

- No se fija todavía un eslogan: Vellum funciona mejor cuando la marca deja hablar al mapa.
- No se define un color exclusivo para tránsito: las líneas pertenecen al contenido de la ciudad.
- No se crea una fuente UI propia: la pila nativa es deliberada y ya forma parte de la experiencia.
- No se convierte esta guía en un nuevo sistema de design tokens de runtime: los tokens cartográficos y los temas `.vellumstyle` siguen siendo responsabilidad del sistema existente.
