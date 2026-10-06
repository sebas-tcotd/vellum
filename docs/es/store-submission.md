# Paquete de envío a Microsoft Store

- [English](../en/store-submission.md)
- [Volver al índice en español](index.md)

Todo lo que Partner Center pide para el primer envío de Vellum, listo para copiar.
Es el material de la Story 6.3. El paquete técnico está en [MSIX de Microsoft Store](msix.md).

Este documento propone textos y respuestas; **no envía nada**. Cada respuesta del
cuestionario de edad y cada categoría debe confirmarla quien envía en Partner Center.

## Verificado antes de redactar

| Comprobación                                                                                    | Estado                                                                                                                                              |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://sebas-tcotd.github.io/vellum/privacy/` responde, con canonical y `data-page="privacy"` | Verificado el 2026-10-06.                                                                                                                           |
| La política no carga Google Analytics                                                           | Verificado: sin recursos de Google, sin `gtag` y sin cookies.                                                                                       |
| La landing no carga Analytics antes de elegir                                                   | Verificado: sin recursos de Google, `dataLayer` ausente y sin cookies mientras el banner está visible.                                              |
| La landing no carga Analytics tras «Rechazar analítica»                                         | Verificado: sigue sin recursos de Google ni cookies; solo guarda la elección en `localStorage`.                                                     |
| «Aceptar analítica» envía eventos solo tras aceptar                                             | **No probado** a propósito, para no enviar eventos a la propiedad GA4 real. Los indicadores de consentimiento de GA4 se revisan tras el despliegue. |

URL de privacidad para Partner Center: `https://sebas-tcotd.github.io/vellum/privacy/`

## Datos del envío

| Campo                 | Valor                                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nombre reservado      | Vellum City Maps                                                                                                                                         |
| Identidad del paquete | `SebastianVargasPizango.VellumCityMaps`                                                                                                                  |
| Publisher             | `CN=F93C1C62-364D-4C65-83BA-6DDD8A04B97F`                                                                                                                |
| Nombre del publicador | Sebastian Vargas Pizango                                                                                                                                 |
| Arquitectura          | Solo x64                                                                                                                                                 |
| Windows mínimo        | `10.0.17763.0`                                                                                                                                           |
| Idiomas de la ficha   | Inglés (en-us) y español (es-es), los mismos que declara el manifiesto                                                                                   |
| Categoría             | A confirmar en Partner Center. Candidatas: «Utilidades y herramientas» o «Fotografía y vídeo». No elegir una categoría de juegos: Vellum no es un juego. |
| Precio                | Gratis                                                                                                                                                   |
| Publicación           | Marcar **«No publicar este envío hasta que seleccione Publicar ahora»** (Don't publish this submission until I select Publish now).                      |
| Sitio web y soporte   | `https://sebas-tcotd.github.io/vellum/` y `https://github.com/sebas-tcotd/vellum/issues`                                                                 |
| Licencia del producto | MIT, repositorio abierto                                                                                                                                 |

## Ficha en inglés

**Subtítulo corto (Short description)**

> Turn your Cities: Skylines city into a map worth keeping.

**Descripción (Description)**

```text
Vellum turns a Cities: Skylines city into an interactive, printable map. It draws
terrain, water, roads, transit lines, buildings, forests and districts as clean,
layered cartography that you can explore, restyle and export.

Everything happens on your computer. Vellum needs no account, makes no network
requests of its own and never uploads your cities.

WHAT YOU CAN DO
• Open a city and explore it as a real map: pan, zoom and switch layers on and off.
• Open the included sample city, Costa Tijuca, to try Vellum without any file of your own.
• Inspect a place on a side card: districts, specialized areas and buildings.
• Read the transit network, and switch to a separate schematic view of the lines.
• Choose a built-in theme or create your own, and choose how forests look.
• Export the map as PNG or SVG.
• Open .vellummap files exported with Vellum Bridge, or existing .cslmap files.

OPENING YOUR OWN CITY
Export your city from the game with Vellum Bridge, then double-click the file or
open it from Vellum.

NOTES
• If you already used the standalone Vellum installer, your preferences and custom
  themes are not carried over: the Microsoft Store edition keeps its data separately.
  Copy your themes before uninstalling anything.
• Updates are delivered by Microsoft Store.
• Vellum is open source (MIT).

Vellum is an independent open-source project and is not affiliated with or endorsed
by Colossal Order or Paradox Interactive.
```

**Novedades de la versión (What's new)**

```text
First release on Microsoft Store.
```

**Palabras clave (Search terms)**: `city map`, `map viewer`, `map export`, `SVG map`, `PNG map`, `transit map`, `cartography`.
No incluir «Cities: Skylines», «Colossal Order» ni «Paradox» como palabra clave.

## Ficha en español

**Subtítulo corto**

> Convierte tu ciudad de Cities: Skylines en un mapa que vale la pena conservar.

**Descripción**

```text
Vellum convierte una ciudad de Cities: Skylines en un mapa interactivo e imprimible.
Dibuja terreno, agua, vías, líneas de tránsito, edificios, bosques y distritos como
cartografía limpia y en capas que puedes explorar, restilizar y exportar.

Todo ocurre en tu equipo. Vellum no necesita cuenta, no hace solicitudes de red por
sí mismo y nunca sube tus ciudades.

QUÉ PUEDES HACER
• Abrir una ciudad y explorarla como un mapa real: desplazarte, acercar y activar o
  apagar capas.
• Abrir la ciudad de muestra incluida, Costa Tijuca, para probar Vellum sin ningún
  archivo propio.
• Inspeccionar un lugar en una tarjeta lateral: distritos, áreas especializadas y
  edificios.
• Leer la red de tránsito y pasar a una vista esquemática separada de las líneas.
• Elegir un tema incluido o crear el tuyo, y elegir cómo se ven los bosques.
• Exportar el mapa como PNG o SVG.
• Abrir archivos .vellummap exportados con Vellum Bridge, o archivos .cslmap existentes.

ABRIR TU PROPIA CIUDAD
Exporta tu ciudad desde el juego con Vellum Bridge y haz doble clic en el archivo o
ábrelo desde Vellum.

NOTAS
• Si ya usabas el instalador independiente de Vellum, tus preferencias y temas
  personalizados no se trasladan: la edición de Microsoft Store guarda sus datos
  aparte. Copia tus temas antes de desinstalar nada.
• Las actualizaciones las entrega Microsoft Store.
• Vellum es de código abierto (MIT).

Vellum es un proyecto independiente de código abierto y no está afiliado ni
respaldado por Colossal Order ni Paradox Interactive.
```

**Novedades de la versión**

```text
Primera versión en Microsoft Store.
```

**Palabras clave**: `mapa de ciudad`, `visor de mapas`, `exportar mapa`, `mapa SVG`, `mapa PNG`, `mapa de tránsito`, `cartografía`.

## Reglas que cumple esta ficha

- Describe solo lo que tiene la versión enviada. Antes de enviar, repasar cada viñeta
  contra la versión empaquetada, sobre todo «áreas especializadas» y los nombres de
  los temas, que deben coincidir con lo que muestra la app.
- «Cities: Skylines» aparece solo en la descripción, junto con el aviso de no afiliación.
- No usa logos de Paradox ni de Colossal Order.
- No dice que Vellum compruebe actualizaciones: en la Store no lo hace. La
  `longDescription` de `tauri.conf.json` sigue siendo cierta para la edición
  independiente y no se reutiliza aquí.
- Avisa de que preferencias y temas no se trasladan desde la edición independiente.

Dos puntos del paquete fuera de la ficha, por si Partner Center o la revisión los muestran:
el campo `Description` del manifiesto MSIX es «Turn Cities: Skylines saves into
printable maps.» (no es palabra clave, pero menciona el juego fuera de la descripción
de la ficha), y la `shortDescription` de `tauri.conf.json` dice lo mismo. Decidir si se
reformulan antes del envío.

## Capturas y material gráfico

Capturar sobre el paquete final, con la muestra Costa Tijuca y las vistas ya limpias.
La Store pide al menos una captura de escritorio; conviene entre 4 y 8.

- [ ] Vista general del mapa con la muestra, tema por defecto.
- [ ] Panel de capas abierto y varias capas activas.
- [ ] Tarjeta lateral de un lugar (PlaceCard).
- [ ] Vista esquemática de la red de tránsito.
- [ ] Un segundo tema incluido sobre la misma ciudad.
- [ ] Diálogo de exportación PNG/SVG.
- [ ] Sin datos personales, nombres de usuario ni rutas privadas visibles.
- [ ] Sin logos de Paradox ni de Colossal Order.

Los iconos del paquete ya existen en `apps/desktop/src-tauri/icons/windows`.

## Cuestionario de clasificación por edad (IARC)

Propuesta de respuestas, para confirmar en Partner Center. Vellum es una herramienta
que dibuja mapas: sin cuentas, sin contenido generado por usuarios en línea, sin compras
ni anuncios, sin ubicación y sin red.

| Pregunta                                                 | Respuesta propuesta             |
| -------------------------------------------------------- | ------------------------------- |
| Categoría de la app                                      | Utilidad / referencia, no juego |
| Violencia, sangre, lenguaje soez, contenido sexual       | No                              |
| Drogas, alcohol, tabaco, juego de azar                   | No                              |
| Interacción entre usuarios o contenido generado en línea | No                              |
| Comparte la ubicación del usuario                        | No                              |
| Compras dentro de la app o anuncios                      | No                              |
| Acceso sin restricciones a Internet                      | No                              |
| Recoge información personal                              | No                              |

La clasificación esperada es apta para todas las edades. Si Partner Center pregunta por
el acceso a Internet, la edición de la Store no hace solicitudes de red propias; el
runtime de WebView2 de Microsoft sí puede conectarse por su cuenta (ver el registro de
validación en [MSIX](msix.md)).

## Notas de certificación

Texto para el campo «Notes for certification» de Partner Center:

```text
Vellum is an offline desktop app. No account, sign-in or network connection is needed
to test it.

1. Launch Vellum. The welcome screen offers a bundled sample city, Costa Tijuca.
   Click it to open the map.
2. Pan and zoom the map.
3. Open the layers panel and toggle several layers on and off.
4. Click a place on the map to open its side card.
5. Open the schematic view of the transit network and return to the map.
6. Export the map as PNG: choose an export destination in the dialog and confirm
   the file is written. The bundled sample is never modified.

The app declares the runFullTrust capability because it is a Tauri (WebView2) desktop
application packaged as MSIX. It uses the Microsoft Edge WebView2 Runtime. On Windows 10
without that runtime, the app shows a native notice with a download link instead of
closing silently.

File associations: .cslmap and .vellummap (double-click opens the file in Vellum).
Privacy policy: https://sebas-tcotd.github.io/vellum/privacy/
```

## Antes de pulsar «Enviar»

- [ ] Story 6.2 cerrada: validación en Windows 10 y 11 limpios, ver [MSIX](msix.md).
- [ ] Paquete final generado desde el release 1.0.0 y su hash registrado.
- [ ] Atribución y permiso de redistribución de Costa Tijuca registrados en [Ciudad de muestra](sample-city.md).
- [ ] Capturas sacadas del paquete final.
- [ ] Cuestionario IARC respondido por quien envía.
- [ ] Opción «No publicar hasta que seleccione Publicar ahora» marcada.
- [ ] `/privacy` sigue respondiendo en la URL entregada.

## Después del envío

Un primer envío puede rebotar: dejar margen antes del anuncio. Si el rechazo es solo de
ficha o certificación, se corrige en Partner Center y se reenvía el mismo paquete. Si
exige cambiar el paquete, hace falta una versión nueva (1.0.1) porque la Store no acepta
dos paquetes con la misma versión.
