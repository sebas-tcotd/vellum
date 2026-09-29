# Interacciones por defecto de MapLibre

Referencia de lo que MapLibre GL JS (v6.9) ya trae de fábrica y de lo que Vellum
hace con cada cosa. Sirve para no reinventar la rueda cuando llegue una feature
nueva (por ejemplo, la vista 3D): antes de programar un gesto o una tecla, mira
si MapLibre ya lo tiene y solo hay que encenderlo.

Todos se configuran en el constructor de `maplibregl.Map`
(`packages/renderer-webgl/src/map-libre-renderer.ts`) o en tiempo de ejecución
con `map.<handler>.enable()` / `.disable()`.

## Teclado (`keyboard`) — apagado en Vellum

El shell es dueño del teclado: todas las teclas viven en `SHORTCUTS`
(`packages/ui/src/shell/shortcuts.ts`), salen en la hoja de atajos (`?`) y no se
disparan dos veces. El manejador de MapLibre solo actúa con el canvas enfocado y
ofrecía esto:

| Tecla           | Efecto en MapLibre    | En Vellum                             |
| --------------- | --------------------- | ------------------------------------- |
| `=` / `+`       | zoom +1               | `+` (con o sin ⌘/Ctrl) en `SHORTCUTS` |
| `⇧` + `=` / `+` | zoom +2               | no                                    |
| `-`             | zoom −1               | `-` (con o sin ⌘/Ctrl) en `SHORTCUTS` |
| `⇧` + `-`       | zoom −2               | no                                    |
| Flechas         | desplazar 100 px      | flechas en `SHORTCUTS` (mismo paso)   |
| `⇧` + `←` / `→` | girar ±15°            | `⇧` + `←` / `→` en `SHORTCUTS`        |
| `⇧` + `↑` / `↓` | inclinar ±10° (pitch) | **no**: se reactiva con la épica 3D   |

Pasos por defecto: `panStep 100`, `bearingStep 15`, `pitchStep 10`.

## Ratón y trackpad

| Handler           | Qué hace                                             | En Vellum                                                        |
| ----------------- | ---------------------------------------------------- | ---------------------------------------------------------------- |
| `scrollZoom`      | rueda / pellizco del trackpad = zoom hacia el cursor | encendido; al alejarse más allá del encuadre, vuelve a la ciudad |
| `boxZoom`         | `⇧` + arrastrar = zoom al rectángulo                 | encendido; listado en la hoja como gesto                         |
| `dragPan`         | arrastrar = desplazar, con inercia                   | encendido                                                        |
| `doubleClickZoom` | doble clic = zoom +1 (`⇧` + doble clic = −1)         | encendido                                                        |
| `dragRotate`      | clic derecho o `Ctrl` + arrastrar = girar e inclinar | **apagado**                                                      |
| `pitchWithRotate` | que `dragRotate` también incline                     | **apagado**                                                      |

## Táctil

| Handler               | Qué hace                                       | En Vellum                                         |
| --------------------- | ---------------------------------------------- | ------------------------------------------------- |
| `touchZoomRotate`     | pellizcar = zoom, girar con dos dedos          | por defecto                                       |
| `touchPitch`          | arrastrar con dos dedos en vertical = inclinar | por defecto (sin pantalla táctil no aplica)       |
| `cooperativeGestures` | exige ⌘/Ctrl + rueda para hacer zoom           | apagado (es para mapas incrustados en una página) |

## Para la épica 3D

La inclinación ya existe en MapLibre por tres vías: `⇧` + `↑`/`↓` en el teclado,
`dragRotate` con `pitchWithRotate` y `touchPitch`. Para encenderla:

1. Agregar a `SHORTCUTS` las entradas `⇧` + `↑`/`↓` (pitch ±10°) con su comando.
2. Decidir si `dragRotate` y `pitchWithRotate` vuelven a `true`.
3. Revisar qué hacen el export, el minimapa y el esquemático con el mapa inclinado.
