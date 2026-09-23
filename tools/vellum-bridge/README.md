# Vellum Bridge — spike local para Cities: Skylines 1

Proyecto C# experimental. La captura ocurre dentro del juego, al pulsar **Capturar Raw Snapshot** en las opciones del mod. No se publica en Workshop.

## Compilar e instalar

1. Instalar una toolchain .NET con referencias de .NET Framework 3.5 y localizar la carpeta `Managed` de CS1 (`Cities_Data/Managed` en Windows; dentro de `Cities.app/Contents/Resources/Data/Managed` en macOS).
2. Definir `CS1_MANAGED_DIR` apuntando a esa carpeta y ejecutar `dotnet build tools/vellum-bridge/VellumBridge.csproj -c Release`.
3. Copiar solo `VellumBridge.dll` a `Addons/Mods/VellumBridge/` dentro de los datos locales del usuario de CS1. En Windows: `%LOCALAPPDATA%\Colossal Order\Cities_Skylines\Addons\Mods\`; macOS: `~/Library/Application Support/Colossal Order/Cities_Skylines/Addons/Mods/`; Linux: `~/.local/share/Colossal Order/Cities_Skylines/Addons/Mods/`.
4. Habilitar el mod en Content Manager, cargar una ciudad real, abrir las opciones del mod y pulsar el botón de captura. Con el juego en pausa (por ejemplo, desde el menú Esc) la captura ocurre en el acto; con la simulación corriendo se ejecuta en el siguiente tick. En ambos casos aparece una ventana con la ruta y el tamaño del archivo, o con el error. El detalle queda en el log del juego (`[VellumBridge]`). El archivo se escribe en `VellumBridge/Snapshots/` dentro de los datos locales de CS1.

La captura actual extrae:

- Segmentos de red con nombre visible (`GetSegmentName`: personalizado o generado desde `nameSeed`), ancho y direcciones de inicio/fin. Con las posiciones de `roadNodes`, esas direcciones definen la curva Bézier de cada segmento.
- Nodos de red.
- Líneas de tránsito con nombre visible (`GetLineName`), color, IDs de paradas y el segmento de calle donde está cada parada (`stopRoadSegments`). CS1 base no permite nombrar paradas: `stopCustomNames` solo tiene valor si un mod lo asignó, pero con `stopRoadSegments` y los nombres de calles se les puede asignar uno. Además, cada tramo entre paradas (`legs`) incluye el camino crudo del pathfinder: segmento, carril y offset de cada posición de sus `PathUnit`.
- Edificios con `service`, `subService` y `level`. También el nombre visible (`GetBuildingName`) de los que no son RICO (servicios, únicos, monumentos) y de los que el jugador renombró.
- Distritos y parques. Los parques incluyen `parkType`.
- Árboles (`vegetation`).
- Alturas crudas del terreno (`terrain`): 1081×1081 muestras uint16 little-endian en base64. Altura en metros = valor × `heightScale`, con celdas de `cellSize` metros.
- Grillas crudas de distritos y parques (`districtGrid`, `parkGrid`): 512×512 celdas con hasta 4 IDs y sus pesos por celda. Los polígonos se derivan fuera del bridge.

Agua, DLCs y mods figuran explícitamente en `diagnostics.unsupported`. El reporte compara la ruta cruda de cada línea con la secuencia de segmentos que exporta `.cslmap`: si es la misma secuencia y cuánto se solapan sus segmentos. Por eso el documento se marca parcial. No usarlo como formato público ni como prueba de ausencia de esos datos en la API. La compilación y la carga en CS1 aún requieren verificación manual en una máquina con el juego.

## Corpus y comparación

El manifest está en `research/vellum-bridge/corpus.manifest.json`. Mantiene todos los fixtures del repositorio. Las seis ciudades reales esperan su snapshot; añade cada ruta a `snapshot` de la entrada correspondiente solo después de comprobar la identidad de la ciudad. Los archivos externos del Escritorio se agregan como nuevas entradas con `origin`, `cslmap` y estado. No se copian automáticamente.

El arnés deriva los polígonos de distritos y parques a partir de las grillas crudas (`scripts/vellum-bridge/grid.mjs`). Cada celda pertenece al ID con mayor peso, igual que `DistrictManager.GetDistrict`. El reporte verifica por ID que la etiqueta exportada por `.cslmap` caiga dentro del área. Además, `analyze` escribe `<id>.areas.geojson` en metros de CS1 para inspección visual. La grilla vanilla mide 512×512 y cubre los 25 tiles centrales (±4915 m). 81 Tiles 2 la reemplaza por una de 900×900 que cubre los 81 tiles, con el mismo tamaño de celda. El bridge acepta cualquier resolución cuadrada. Si un área no tiene celdas y su etiqueta queda fuera de la grilla capturada, el reporte la marca como "fuera de la grilla".

Todas las áreas de DLC (parques, industrias, campus, aeropuertos, zonas peatonales, zoológicos, reservas naturales) son `DistrictPark`. Comparten `parks`, `parkGrid` y se distinguen por `parkType`. El XML de `.cslmap` conserva el tipo original (p. ej. `NatureReserve`), pero `park_type_from_xml` del parser de Vellum solo distingue Generic, University, TradeSchool, Industry y Forestry. El resto lo reduce a `None`.

Los pares sincronizados (`.cslmap` y Raw Snapshot exportados en la misma sesión) viven en `research/vellum-bridge/cslmap/` y `research/vellum-bridge/snapshots/`. Esas carpetas están en `.gitignore` porque juntas pesan cientos de MB. Entre máquinas se comparten por fuera de Git (p. ej. iCloud), copiando las dos carpetas a la misma ruta. Sus entradas del manifest llevan `"storage": "local"`: si faltan los archivos, `validate` pasa y `analyze` las marca `not-comparable`. En una máquina sin las capturas, no regeneres ni commitees los reportes, porque perderían las comparaciones.

`pnpm vellum-bridge:validate` valida el manifest. `pnpm vellum-bridge:analyze` genera `research/vellum-bridge/reports/comparison.json` y `.md`; si aún no hay snapshots, el reporte muestra las capturas pendientes. Un par disponible se procesa con el parser Rust existente. El reporte estructural marca coincidencias de presencia como `unresolved` hasta revisión humana. Su sección "Resumen del corpus" agrega la evidencia por dominio; la revisión humana (categoría, confianza y decisiones) vive en `research/vellum-bridge/findings.md`.

## Checklist manual

- Confirmar que el mod aparece y se habilita sin error.
- Probar una ciudad real y registrar versión del juego, DLC, mods y nombre del archivo generado.
- Verificar que el botón durante guardado/autoguardado no produce snapshot final.
- Forzar un fallo controlado de extracción/escritura y confirmar que el save no cambia.
- Copiar el snapshot a un lugar de investigación local, enlazarlo en el manifest y ejecutar el análisis.

El spike no registra datos dentro del save ni usa el pipeline de persistencia del juego. La verificación de estabilidad del save tras fallos es manual y obligatoria antes de cerrar la story.

Referencias de implementación: [guía de modding de CS1](https://skylines-modding-docs.readthedocs.io/en/latest/modding/Getting-Started/index.html), [assemblies del juego](https://citiesskylinesmoddingguide.readthedocs.io/en/latest/modding/Workflow/Assemblies.html), [target net35 usado por TMPE](https://github.com/CitiesSkylinesMods/TMPE/blob/master/TLM/TLM/TLM.csproj), [ejemplo de acceso a líneas de tránsito](https://github.com/ccc012/ImprovedPublicTransport4/blob/master/Util/TransportLineUtil.cs) y [ejemplo de nombres de líneas y distritos](https://github.com/Sleepy334/TransferManagerCE/blob/main/Source/TransferManagerCE%202.0/Util/CitiesUtils.cs).
