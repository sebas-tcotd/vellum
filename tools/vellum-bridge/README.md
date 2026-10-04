# Vellum Bridge — el mod de Cities: Skylines 1 que exporta para Vellum

Mod en C#. Dentro del juego hace dos cosas, cada una con su botón en las opciones del mod: **Exportar para Vellum** escribe el documento de ciudad `.vellummap` que abre Vellum, y **Capturar Raw Snapshot** escribe la captura cruda de diagnóstico. Se publica en el Steam Workshop con Vellum v1.0; mientras tanto, se compila e instala a mano como se describe abajo.

## Compilar e instalar

1. Instalar una toolchain .NET con referencias de .NET Framework 3.5 y localizar la carpeta `Managed` de CS1 (`Cities_Data/Managed` en Windows; dentro de `Cities.app/Contents/Resources/Data/Managed` en macOS).
2. Definir `CS1_MANAGED_DIR` apuntando a esa carpeta y ejecutar `dotnet build tools/vellum-bridge/VellumBridge.csproj -c Release`.
3. Copiar solo `VellumBridge.dll` a `Addons/Mods/VellumBridge/` dentro de los datos locales del usuario de CS1. En Windows: `%LOCALAPPDATA%\Colossal Order\Cities_Skylines\Addons\Mods\`; macOS: `~/Library/Application Support/Colossal Order/Cities_Skylines/Addons/Mods/`; Linux: `~/.local/share/Colossal Order/Cities_Skylines/Addons/Mods/`.
4. Habilitar el mod en Content Manager, cargar una ciudad real y pulsar **Ctrl+Shift+V** (o el botón de captura en las opciones del mod). Abrir las opciones pausa el juego; el atajo permite capturar con la simulación corriendo, y `simulationPaused` registra en cuál de los dos estados se hizo. Con el juego en pausa (por ejemplo, desde el menú Esc) la captura ocurre en el acto; con la simulación corriendo se ejecuta en el siguiente tick. En ambos casos aparece una ventana con la ruta y el tamaño del archivo, o con el error. El detalle queda en el log del juego (`[VellumBridge]`). El archivo se escribe en `VellumBridge/Snapshots/` dentro de los datos locales de CS1.
5. **Recargar sin reiniciar el juego (Windows):** con CS1 abierto, ejecutar `powershell -ExecutionPolicy Bypass -File tools\vellum-bridge\install.ps1`. El script compila, borra `Mods\VellumBridge` y mueve dentro una carpeta ya completa preparada fuera de `Mods`. En el log del juego aparece `[VellumBridge] Mod desactivado: <versión vieja>` seguido de `Mod activado: <versión nueva> (ensamblado 1.0.x.y)`, y el nombre del mod en el Content Manager cambia en el acto, aunque esté abierto. Hacerlo en el menú principal: con una ciudad cargada, los atajos quedan apagados hasta volver a cargarla (la instancia vieja se desactiva y la nueva entra con la próxima carga). Por qué hace falta así, verificado en CS1 con el `PluginManager` descompilado y el log:
   - **Sobrescribir solo el DLL no recarga nada.** El vigilante de `*.dll` llama a `OnPluginAdded` con la ruta del archivo, que empieza con `Directory.Exists(ruta)` y por eso no hace nada. Solo recarga el vigilante de carpetas de `Mods` (crear, borrar o cambiar la carpeta del mod), que hace `OnDisabled` en la instancia vieja y `Assembly.Load(byte[])` del DLL nuevo.
   - **La versión de ensamblado debe cambiar en cada compilación** (`AssemblyVersion 1.0.*` en el csproj). Con la misma versión, Mono devuelve el ensamblado ya cargado aunque los bytes sean otros. El log registra la carga, pero sigue activa la versión vieja.

La captura actual extrae:

- Segmentos de red con nombre visible (`GetSegmentName`: personalizado o generado desde `nameSeed`), ancho y direcciones de inicio/fin. Con las posiciones de `roadNodes`, esas direcciones definen la curva Bézier de cada segmento.
- Nodos de red.
- Líneas de tránsito con nombre visible (`GetLineName`), color crudo (`color`, solo significativo con el flag `CustomColor`) y color visible (`displayColor`, `GetLineColor`, desde Bridge 0.5.0), IDs de paradas y el segmento de calle donde está cada parada (`stopRoadSegments`). CS1 base no permite nombrar paradas: `stopCustomNames` solo tiene valor si un mod lo asignó, pero con `stopRoadSegments` y los nombres de calles se les puede asignar uno. Además, cada tramo entre paradas (`legs`) incluye el camino crudo del pathfinder: segmento, carril y offset de cada posición de sus `PathUnit`.
- Edificios con `service`, `subService` y `level`. También el nombre visible (`GetBuildingName`) de los edificios únicos (monumentos, maravillas, landmarks) y de los que el jugador renombró.
- Distritos y parques. Los parques incluyen `parkType`. Desde Bridge 0.7.0, cada uno trae además `raw`: todos los campos de su struct del juego (`District`, `DistrictPark`) volcados por reflexión, sin interpretar. Los enums van por nombre (las políticas en bitmask quedan como `"Smoke, Recycling"`), los structs anidados (`m_populationData`, `m_residentialData`, …) se expanden dos niveles y los arreglos solo con su largo. Sirve para descubrir qué datos de distrito expone CS1 (especialización, población, políticas, RICO) antes de fijar un contrato; un campo que no exista simplemente no aparece.
- Árboles (`vegetation`).
- Alturas crudas del terreno (`terrain`): 1081×1081 muestras uint16 little-endian en base64. Altura en metros = valor × `heightScale`, con celdas de `cellSize` metros.
- Agua (`water`, desde Bridge 0.2.0): profundidad cruda por celda (`depth`, `Cell.m_height` del buffer estable de `WaterSimulation`), en la misma grilla y unidades que `terrain` (superficie = altura + profundidad), y las fuentes de agua (`sources`: tipo, posiciones, caudales, `target`). Velocidad y contaminación se omiten a propósito. `simulationPaused` indica si la simulación estaba detenida al capturar. `m_waterBuffers` es privado: se lee por reflexión y un cambio del juego aparece como error `water:` en `diagnostics.errors`.
- Diagnóstico de capas de alturas (`terrainLayers`, desde Bridge 0.3.0): celdas en las que `RawHeights2` y `BlockHeights` difieren de `RawHeights`, en forma dispersa (`indices`, `values`). Sirve para averiguar qué capa exporta `.cslmap` donde no coincide con `RawHeights`.
- Grilla de recursos naturales (`resourceGrid`, desde Bridge 0.4.0): 512×512 celdas de 33,75 m con `m_forest` y `m_tree`, más `treeBufferLength`. Sirven para contrastar `<Forest>` de `.cslmap` y detectar un buffer de árboles lleno o reemplazado por un mod.
- Grillas crudas de distritos y parques (`districtGrid`, `parkGrid`): 512×512 celdas con hasta 4 IDs y sus pesos por celda. Los polígonos se derivan fuera del bridge.

DLCs y mods figuran explícitamente en `diagnostics.unsupported`. El reporte compara la ruta cruda de cada línea con la secuencia de segmentos que exporta `.cslmap`: si es la misma secuencia y cuánto se solapan sus segmentos. Por eso el documento se marca parcial. No usarlo como formato público ni como prueba de ausencia de esos datos en la API. La compilación y la carga en CS1 aún requieren verificación manual en una máquina con el juego.

## Exportar para Vellum

**Exportar para Vellum** (botón en las opciones del mod) o **Ctrl+Shift+E** escribe un `.vellummap`, el documento que describe [`docs/es/vellummap-format.md`](../../docs/es/vellummap-format.md). Es una acción explícita: el mod no exporta nada por su cuenta y no usa la red. En el save solo guarda la identidad de la ciudad (ver abajo), con la serialización de mods del juego.

- **Ubicación:** `<Documentos>/Vellum Bridge/<ciudad>/<ciudad> <fecha y hora locales>.vellummap` (p. ej. `Vellum Bridge/San Rico/San Rico 2026-10-01 020217.vellummap`). La carpeta de la ciudad se crea si no existe y usa el mismo nombre saneado que el archivo (caracteres no válidos → `_`, nombres reservados de Windows como `con` → `con_`, sin nombre → `Ciudad`). La hora del nombre es la local del equipo; el manifest (`exportedAtUtc`) y la fecha interna del zip siguen en UTC, y Vellum no deduce orden ni fecha del nombre del archivo. Si el nombre ya existe en la carpeta de la ciudad se añade ` (2)`, ` (3)`, … sin sobrescribir. **Límites:** una ciudad renombrada en el juego estrena carpeta con el nombre nuevo y la anterior no se toca (el historial reunirá ambas por `city.id`); las exportaciones sueltas de versiones anteriores en `Vellum Bridge/` no se mueven ni se renombran. La carpeta de documentos depende de la plataforma:
  - Windows: la carpeta Documentos del usuario (`%USERPROFILE%\Documents\Vellum Bridge\`, o donde la haya movido el usuario).
  - macOS: `~/Documents/Vellum Bridge/`.
  - Linux: `~/Documents/Vellum Bridge/` si existe `~/Documents`; si no, `~/Vellum Bridge/`. Mono devuelve `$HOME` como carpeta de documentos, así que no se sigue una carpeta XDG localizada (p. ej. `~/Documentos`).
  - Si el sistema no devuelve una carpeta de documentos absoluta, la exportación se cancela con ese motivo y no se escribe nada.
- **Temporales huérfanos:** antes de cada exportación se borran los `*.vellummap.part` de la carpeta de la ciudad y de `Vellum Bridge/` (donde los dejaban las versiones anteriores). Solo quedan si el juego se cerró a mitad de una escritura.
- **Flujo:** con el juego en marcha aparece la ventana «Capturando tu ciudad…»: desde Bridge 0.9, los datos se copian en el hilo de simulación con la simulación en pausa, y Bridge la reanuda al terminar la copia, también si falla. Con el juego ya en pausa (por el jugador o forzada) aparece «Exportando para Vellum…», la copia ocurre en el acto y el juego sigue en pausa: Bridge solo reanuda lo que pausó él. Serializar, comprimir y escribir ocurre en un hilo aparte, con el juego ya reanudado. Al terminar, la ventana muestra la ruta, el tamaño, los conteos, los módulos con su codec y los límites. Cada fase queda en el log con el prefijo `[VellumBridge] Exportación:`.
- **Publicación atómica:** el archivo se escribe como `.part` en la misma carpeta y luego se renombra. Ante cualquier error el `.part` se borra. Si empieza un guardado, la exportación se descarta y hay que repetirla.
- **Qué se exporta:** solo elementos con el flag `Created`, sin las líneas `Temporary`. Las redes no viales (tuberías, rutas de avión y barco, conexiones) y las estructuras `Untouchable` se exportan clasificadas por `itemClass`. Las paradas se nombran por su calle (`<calle>` o `<calle> N` por `sourceId`), salvo que un mod les haya dado nombre. Las paradas de un edificio de estación se nombran por estación (regla desde 0.9.1; la 0.9.0 la cambió a mitad de versión, así que sus archivos pueden traer cualquiera de las dos) y llevan `stationId` (módulo `transit` 1.1): el `sourceId` del edificio, el mismo para todas sus paradas aunque sean de líneas o modos distintos. Desde el módulo `transit` 1.2 cada línea lleva además `classLevel`, el nivel de clase de su prefab (`ItemClass.Level` como entero, `0` = `Level1`): con él Vellum separa el barco de pasajeros del ferry, el avión del dirigible y el bus interurbano del bus, que el juego exporta con el mismo `transportType`.
- **Datos de lugar (desde Bridge 0.8.0, módulos `buildings` y `districts` 1.1):** cada distrito lleva `population`, `homes`, `jobs` (`commercial`, `industrial`, `office`) y `specializations`, siempre presentes (un distrito recién creado escribe ceros y `[]`). Cada edificio lleva su prefab en `prefab` y, en `name`, el nombre visible (`GetBuildingName`) solo de los que el jugador renombró y de los únicos (servicio `Monument`: monumentos, maravillas, landmarks, sin sus sub-edificios; regla desde 0.8.2, la 0.8.0 exportaba también los no RICO). Para el resto el juego solo daría el título del tipo («Police Station», «Boulder #4») o un nombre aleatorio (RICO), así que no se exporta y Vellum muestra la categoría; `customName` e `historical` se escriben solo cuando son `true`. Un nombre que no se puede leer no aborta la exportación: el edificio sale sin nombre y se cuenta en los límites. Políticas, felicidad, crimen, consumo, valor del suelo, edades, educación y superficie no se exportan: son mecánicas del juego, no datos de atlas.
- **Compatibilidad:** los archivos de Bridge 0.9 (manifest `1.1` con `city.id`) solo los abre un Vellum Desktop con la regla del minor, es decir, la versión siguiente a 0.12.0 o posterior. Un Desktop 0.12.0 o anterior los rechaza por el campo desconocido.
- **Identidad (desde Bridge 0.9, manifest `1.1`):** cada exportación lleva un `city.id` (un UUID; para el formato es un string opaco no vacío). Bridge lo guarda en la partida (clave `VellumBridge.Identity`) junto con la `snapshotId` del último archivo publicado, y una identidad guardada siempre prevalece. Desde 0.9.1, una partida sin identidad guardada deriva su `city.id` de `m_gameInstanceIdentifier` (UUIDv5), en vez de estrenar uno al azar, así que conserva el mismo aunque no guardes después de exportar. Cada exportación lleva como `parentSnapshotId` la `snapshotId` de la anterior: la que conoce el guardado o, si no la conoce, la del índice local `Vellum Bridge/.lineage/<city.id>.txt`. La `snapshotId` solo se registra si el archivo se publicó y la ciudad no cambió entretanto. Cada exportación sigue siendo un `.vellummap` nuevo e inmutable. Al recargar un guardado anterior que sí tenía identidad, el historial se ramifica desde la última exportación que ese guardado conoce. Una entrada ausente o ilegible cuenta como partida sin identidad. **Límite:** dos copias de la misma partida (por ejemplo, un save compartido) tienen el mismo `m_gameInstanceIdentifier` y, por tanto, el mismo `city.id`.
- **Codec:** deflate por módulo. Si `DeflateStream` falla en el Mono del juego (o no reproduce los bytes), ese módulo se guarda `stored` y el manifest lo declara.

Un módulo obligatorio que falla (terreno, agua, vegetación, calles, tránsito, edificios, distritos o parques) cancela la exportación: no se escribe ningún archivo y la ventana dice qué falló. Lo parcial que no bloquea se cuenta y aparece en la lista de **límites**, nunca en silencio:

- Profundidad del agua omitida porque la simulación estaba en marcha (la máscara de agua sí se exporta). Desde Bridge 0.9 la captura pausa la simulación, y con una pausa forzada (`ForcedSimulationPaused`) también se captura en pausa, así que en ninguno de los dos casos aparece. Solo aparece si la simulación sigue marcada en marcha al copiar los datos, es decir, si la pausa de Bridge no llegó a aplicarse (revisa el log `[VellumBridge]`).
- Pausa del jugador durante la captura: si el jugador pausa justo mientras dura la extracción que Bridge pausó (cientos de ms), Bridge reanuda igualmente al terminar. Vuelve a pausar si hace falta.
- Tramos de línea sin ruta calculada: la ruta de esa línea queda incompleta.
- Paradas sin calle con nombre: quedan sin nombre.
- Segmentos, edificios o líneas sin prefab cargado: se omiten.
- Edificios cuyo nombre visible no se pudo leer: salen sin `name`.
- Grilla de distritos o parques de 512² (vanilla) centrada con ceros en 900², u omitida si tiene otra resolución.
- DLC y mods activos: no forman parte del documento.

### Validar una exportación

```bash
cargo run -p parser-cslmap --example validate_vellummap -- "$HOME/Documents/Vellum Bridge/<ciudad>/<archivo>.vellummap"
```

Abre el archivo con el lector de Vellum e imprime el `cityId`, los conteos, cada módulo con su codec y, para el agua, si trae profundidad y con qué `simulationPaused`. Si el archivo no es válido, sale con el error.

### Harness del escritor

El código del mod se organiza en tres partes: los callbacks de CS1 en `src/Bridge*.cs`, la exportación pública en `src/Export/` y la captura de diagnóstico en `src/Capture/`. `src/UI/` presenta resultados y formatea el resumen de exportación. Los coordinadores `BridgeExport` y `BridgeCapture` conservan el estado de sus operaciones; los extractores leen el juego y los escritores reciben datos ya copiados. La versión compartida está en `BridgeInfo.Version`.

El harness también enlaza el modelo, el escritor y los serializadores del Raw Snapshot, sin dependencias del juego. Comprueba la distinción entre secciones fallidas y vacías, escapes JSON, números no finitos, datos por reflexión, diagnósticos y publicación con limpieza de temporales ante errores. Los campos del modelo que solo asigna el extractor del juego pueden producir advertencias CS0649 en este harness.

El escritor (`src/Export/VellumWriter.cs`) y el modelo (`src/Export/VellumModel.cs`) no dependen del juego. `tests/` los enlaza en un programa de .NET moderno con C# 7.3, el mismo lenguaje del mod, que comprueba la matriz de la story (nombres de parada, relleno 512→900, `stored` forzado, fallos de IO sin `.part`, pausa frente a simulación corriendo, `city.id` y `parentSnapshotId` en el manifest `1.1` y su omisión cuando faltan, `stationId` en `transit` 1.1, `classLevel` en `transit` 1.2, carpeta por ciudad con hora local y ` (2)` dentro de ella), las grillas y rutas del manifest contra la tabla del formato y el filtrado de registros inválidos (nodos inexistentes o con NaN, ids repetidos). Escribe cuatro documentos sintéticos (`stations.vellummap` trae las estaciones con `stationId`):

```bash
dotnet run --project tools/vellum-bridge/tests -- $TMPDIR/vb
cargo run -p parser-cslmap --example validate_vellummap -- $TMPDIR/vb/deflate.vellummap
cargo run -p parser-cslmap --example validate_vellummap -- $TMPDIR/vb/stored.vellummap
cargo run -p parser-cslmap --example validate_vellummap -- $TMPDIR/vb/filtered.vellummap
cargo run -p parser-cslmap --example validate_vellummap -- $TMPDIR/vb/stations.vellummap
```

Los conteos que imprime el harness (`expected …`) deben coincidir con los del validador. El harness no compila contra .NET 3.5: el escritor solo debe usar APIs de .NET 3.5, y eso se confirma al compilar el mod.

## Corpus y comparación

El manifest está en `research/vellum-bridge/corpus.manifest.json`. Mantiene todos los fixtures del repositorio. Las seis ciudades reales esperan su snapshot; añade cada ruta a `snapshot` de la entrada correspondiente solo después de comprobar la identidad de la ciudad. Los archivos externos del Escritorio se agregan como nuevas entradas con `origin`, `cslmap` y estado. No se copian automáticamente.

El arnés deriva los polígonos de distritos y parques a partir de las grillas crudas (`scripts/vellum-bridge/grid.mjs`). Cada celda pertenece al ID con mayor peso, igual que `DistrictManager.GetDistrict`. El reporte verifica por ID que la etiqueta exportada por `.cslmap` caiga dentro del área. Además, `analyze` escribe `<id>.areas.geojson` en metros de CS1 para inspección visual. La grilla vanilla mide 512×512 y cubre los 25 tiles centrales (±4915 m). 81 Tiles 2 la reemplaza por una de 900×900 que cubre los 81 tiles, con el mismo tamaño de celda. El bridge acepta cualquier resolución cuadrada. Si un área no tiene celdas y su etiqueta queda fuera de la grilla capturada, el reporte la marca como "fuera de la grilla".

Todas las áreas de DLC (parques, industrias, campus, aeropuertos, zonas peatonales, zoológicos, reservas naturales) son `DistrictPark`. Comparten `parks`, `parkGrid` y se distinguen por `parkType`. El XML de `.cslmap` conserva el tipo original (p. ej. `NatureReserve`), pero `park_type_from_xml` del parser de Vellum solo distingue Generic, University, TradeSchool, Industry y Forestry. El resto lo reduce a `None`.

Los pares sincronizados (`.cslmap` y Raw Snapshot exportados en la misma sesión) viven en `research/vellum-bridge/cslmap/` y `research/vellum-bridge/snapshots/`. Esas carpetas están en `.gitignore` porque juntas pesan cientos de MB. Entre máquinas se comparten por fuera de Git (p. ej. iCloud), copiando las dos carpetas a la misma ruta. Sus entradas del manifest llevan `"storage": "local"`: si faltan los archivos, `validate` pasa y `analyze` las marca `not-comparable`. En una máquina sin las capturas, no regeneres ni commitees los reportes, porque perderían las comparaciones.

`pnpm vellum-bridge:validate` valida el manifest. `pnpm vellum-bridge:analyze` genera `research/vellum-bridge/reports/comparison.json` y `.md`; si aún no hay snapshots, el reporte muestra las capturas pendientes. Un par disponible se procesa con el parser Rust existente. El reporte estructural marca coincidencias de presencia como `unresolved` hasta revisión humana. Su sección "Resumen del corpus" agrega la evidencia por dominio; la revisión humana (categoría, confianza y decisiones) vive en `research/vellum-bridge/findings.md`.

## Checklist manual

Exportación `.vellummap`:

- Compilar el mod y exportar una ciudad real **en pausa** (botón en opciones) y **en marcha** (Ctrl+Shift+E sin pausar). Validar ambos archivos con `validate_vellummap`. En marcha: se ve «Capturando tu ciudad…», el juego se reanuda solo y el archivo trae `water-depth.bin` con `simulationPaused: true`. En pausa: el juego sigue en pausa al terminar.
- Identidad: exportar dos veces, guardar la partida, recargarla y exportar otra vez. Las tres exportaciones comparten `city.id` (lo imprime `validate_vellummap` como `cityId=`) y cada una tiene como `parentSnapshotId` la `snapshotId` de la anterior (`unzip -p <archivo> manifest.json`). Repetirlo **sin** guardar: tras recargar, la exportación conserva el mismo `city.id` y su padre es la última exportación (índice `.lineage`).
- Comprobar que la ventana final muestra la ruta, el tamaño y los límites.
- En la misma sesión, capturar también un Raw Snapshot (Ctrl+Shift+V) y elegir una línea con varias paradas. Comparar su `route` en `transit.json` con los `pathSegments` de sus `legs` en el snapshot: misma secuencia, sin segmentos repetidos seguidos. Comparar los nombres de parada con `stopRoadSegments` y el nombre de esas calles: `<calle>` o `<calle> N` por `sourceId`, y sin nombre si la calle no tiene nombre.
- Pulsar Ctrl+Shift+E durante un guardado o autoguardado: no debe quedar archivo ni `.part`.
- Forzar un fallo (por ejemplo, quitar el permiso de escritura a `Documentos/Vellum Bridge/`) y confirmar que no queda archivo ni `.part` y que el save no cambia.
- Carpeta por ciudad (con Documentos en OneDrive si es posible): la exportación crea `Vellum Bridge/<ciudad>/`, el archivo lleva la hora local, Vellum Desktop lo abre y no quedan `.part`. Una estación de metro y tren comparte `stationId` en las paradas de ambas líneas (`unzip -p <archivo> transit.json`).
- Niveles de clase (`transit` 1.2): en una ciudad con puerto, aeropuerto, ferry, dirigible y bus interurbano, anotar el `classLevel` de cada línea `Ship`, `Airplane` y `Bus` (`unzip -p <archivo> transit.json`). Vellum espera `Ship` 0 = barco de pasajeros y 1 = ferry, `Airplane` 0 = avión y 1 = dirigible, y `Bus` 2 = bus interurbano; si el juego escribe otros valores, se corrige el mapeo en `parse_transit_mode` (`packages/parser-cslmap`).

Raw Snapshot:

- Confirmar que el mod aparece y se habilita sin error.
- Probar una ciudad real y registrar versión del juego, DLC, mods y nombre del archivo generado.
- Verificar que el botón durante guardado/autoguardado no produce snapshot final.
- Forzar un fallo controlado de extracción/escritura y confirmar que el save no cambia.
- Copiar el snapshot a un lugar de investigación local, enlazarlo en el manifest y ejecutar el análisis.

La captura Raw Snapshot no registra datos dentro del save. La exportación solo guarda ahí la identidad de la ciudad, con la serialización de mods del juego (`SerializableDataExtensionBase`). La verificación de estabilidad del save tras fallos es manual y obligatoria antes de cerrar la story.

Referencias de implementación: [guía de modding de CS1](https://skylines-modding-docs.readthedocs.io/en/latest/modding/Getting-Started/index.html), [assemblies del juego](https://citiesskylinesmoddingguide.readthedocs.io/en/latest/modding/Workflow/Assemblies.html), [target net35 usado por TMPE](https://github.com/CitiesSkylinesMods/TMPE/blob/master/TLM/TLM/TLM.csproj), [ejemplo de acceso a líneas de tránsito](https://github.com/ccc012/ImprovedPublicTransport4/blob/master/Util/TransportLineUtil.cs) y [ejemplo de nombres de líneas y distritos](https://github.com/Sleepy334/TransferManagerCE/blob/main/Source/TransferManagerCE%202.0/Util/CitiesUtils.cs).
