namespace VellumBridge
{
    // Todo lo que ve el jugador, en inglés y español. Puro (sin referencias al juego) para que el
    // harness lo enlace con el escritor. El idioma lo fija BridgeLocale desde el LocaleManager de
    // CS1: "es" es español y cualquier otro, inglés. Los logs [VellumBridge] son para nosotros y no
    // pasan por aquí.
    internal static class Strings
    {
        internal static volatile bool Spanish;

        private static string T(string en, string es) { return Spanish ? es : en; }

        // ─── Mod y panel de opciones ────────────────────────────────────────────────────────

        internal static string ModDescription { get { return T("Export your city as a .vellummap and open it in Vellum Desktop.", "Exporta tu ciudad a .vellummap para abrirla en Vellum Desktop."); } }
        internal static string Tagline { get { return "Cities: Skylines → Vellum"; } }
        internal static string StatusNoCity { get { return T("Load a city to export", "Carga una ciudad para exportar"); } }
        internal static string StatusReady { get { return T("Ready to export", "Lista para exportar"); } }
        internal static string StatusExporting { get { return T("Exporting…", "Exportando…"); } }

        internal static string ExportTitle { get { return T("Export city", "Exportar ciudad"); } }
        internal static string ExportBody { get { return T("Saves this city as a .vellummap you can open in Vellum.", "Guarda esta ciudad como un .vellummap que puedes abrir en Vellum."); } }
        internal static string ExportButton { get { return T("Export city", "Exportar ciudad"); } }
        internal static string ExportShortcut { get { return T("or Ctrl+Shift+E in game", "o Ctrl+Shift+E en la partida"); } }
        internal static string LastExport(string city, string when, string size) { return T("Last export: ", "Última exportación: ") + city + " · " + when + " · " + size; }
        internal static string OpenFolder { get { return T("Open exports folder", "Abrir carpeta de exportaciones"); } }
        internal static string SavedIn(string folder) { return T("Exports go to " + folder + ". Bridge never connects to the internet.", "Las exportaciones se guardan en " + folder + ". Bridge nunca se conecta a internet."); }

        internal static string DesktopTitle { get { return "Vellum Desktop"; } }
        internal static string DesktopBody { get { return T("The free map viewer for Windows, macOS and Linux.", "El visor de mapas gratuito para Windows, macOS y Linux."); } }
        internal static string GetDesktop { get { return T("Get Vellum Desktop", "Descargar Vellum Desktop"); } }
        internal static string OtherPlatforms { get { return T("Other platforms and installers", "Otras plataformas e instaladores"); } }

        internal static string DiagnosticsTitle { get { return T("Diagnostics", "Diagnóstico"); } }
        internal static string DiagnosticsBody { get { return T("Only needed if you're reporting a bug.", "Solo hace falta si vas a reportar un error."); } }
        internal static string CaptureButton { get { return T("Capture Raw Snapshot", "Capturar Raw Snapshot"); } }

        // ─── Exportación ────────────────────────────────────────────────────────────────────

        internal static string NeedCityToExport { get { return T("Load a city before exporting for Vellum.", "Carga una ciudad antes de exportar para Vellum."); } }
        internal static string ExportAlreadyRunning { get { return T("An export is already in progress.", "Ya hay una exportación en curso."); } }
        internal static string SaveInProgress { get { return T("A save is in progress. Try again when it finishes.", "Hay un guardado en curso. Inténtalo de nuevo cuando termine."); } }
        internal static string ExportingTitle { get { return T("Exporting for Vellum…", "Exportando para Vellum…"); } }
        internal static string ExportingBody { get { return T("Writing your city to a .vellummap.", "Guardando tu ciudad en un .vellummap."); } }
        internal static string CapturingTitle { get { return T("Capturing your city…", "Capturando tu ciudad…"); } }
        internal static string CapturingBody { get { return T("The game pauses for a moment and resumes on its own.", "El juego se pausa un momento y sigue solo."); } }
        internal static string CantExportTitle { get { return T("Can't export yet", "Aún no se puede exportar"); } }
        internal static string ExportCancelledTitle { get { return T("Export cancelled", "Exportación cancelada"); } }
        internal static string CancelledNoCity { get { return T("No city is loaded or a save is in progress. Nothing was written. Try again.", "No hay ciudad cargada o hay un guardado en curso. No se escribió nada. Inténtalo de nuevo."); } }
        internal static string NothingWritten { get { return T(" No file was written.", " No se escribió ningún archivo."); } }
        internal static string CouldNotStartWriting(string reason) { return T("Couldn't start writing (" + reason + ").", "No se pudo iniciar la escritura (" + reason + ")."); }
        internal static string UnexpectedWriteError(string reason) { return T("Unexpected error while writing (" + reason + ").", "Error inesperado al escribir (" + reason + ")."); }
        internal static string FileWrittenTitle { get { return T("File written", "Archivo escrito"); } }
        internal static string SummaryFailed(string reason) { return T("The summary couldn't be prepared (" + reason + "). Check the [VellumBridge] log.", "No se pudo preparar el resumen (" + reason + "). Revisa el log [VellumBridge]."); }

        // ─── Modal de resultado ─────────────────────────────────────────────────────────────

        internal static string Ok { get { return T("OK", "Aceptar"); } }
        internal static string OpenFolderShort { get { return T("Open folder", "Abrir carpeta"); } }
        internal static string CityExported(string city) { return T(city + " exported", city + " exportada"); }
        internal static string HumanCounts(int buildings, int lines, int stops, int districts)
        {
            return T(Number(buildings, ',') + " buildings · " + Number(lines, ',') + " lines · " + Number(stops, ',') + " stops · " + Number(districts, ',') + " districts",
                Number(buildings, '.') + " edificios · " + Number(lines, '.') + " líneas · " + Number(stops, '.') + " paradas · " + Number(districts, '.') + " distritos");
        }
        internal static string ShowLimits(int count) { return T(count + (count == 1 ? " limit" : " limits") + ", see details", count + (count == 1 ? " límite" : " límites") + ", ver detalles"); }
        internal static string HideLimits { get { return T("Hide details", "Ocultar detalles"); } }
        internal static string CopyDetails { get { return T("Copy details", "Copiar detalles"); } }
        internal static string Copied { get { return T("Copied", "Copiado"); } }

        // Separador de miles a mano: la cultura de Mono en CS1 no es confiable para esto.
        private static string Number(int value, char separator)
        {
            string digits = System.Math.Abs(value).ToString(System.Globalization.CultureInfo.InvariantCulture);
            var text = new System.Text.StringBuilder();
            for (int i = 0; i < digits.Length; i++)
            {
                if (i > 0 && (digits.Length - i) % 3 == 0) text.Append(separator);
                text.Append(digits[i]);
            }
            return (value < 0 ? "-" : "") + text;
        }

        internal static string ExportedHeader { get { return T("Exported for Vellum:", "Exportado para Vellum:"); } }
        internal static string UnknownSize { get { return T("unknown size", "tamaño desconocido"); } }
        internal static string Counts(int nodes, int segments, int lines, int stops, int buildings, int districts, int parks)
        {
            return T(nodes + " nodes, " + segments + " segments, " + lines + " lines, " + stops + " stops, " + buildings + " buildings, " + districts + " districts, " + parks + " parks.",
                nodes + " nodos, " + segments + " segmentos, " + lines + " líneas, " + stops + " paradas, " + buildings + " edificios, " + districts + " distritos, " + parks + " parques.");
        }
        internal static string Modules { get { return T("Modules: ", "Módulos: "); } }
        internal static string Limits { get { return T("Limits:", "Límites:"); } }

        // ─── Captura (diagnóstico) ──────────────────────────────────────────────────────────

        internal static string NeedCityToCapture { get { return T("Load a city before capturing.", "Carga una ciudad antes de capturar."); } }
        internal static string CantCaptureTitle { get { return T("Can't capture yet", "Aún no se puede capturar"); } }
        internal static string CaptureFailedTitle { get { return T("Capture failed", "Captura fallida"); } }
        internal static string CapturedTitle { get { return T("Raw Snapshot captured", "Raw Snapshot capturado"); } }
        internal static string CaptureRejected { get { return T("No city is loaded or a save is in progress. Try again.", "No hay ciudad cargada o hay un guardado en curso. Inténtalo de nuevo."); } }
        internal static string CaptureDiscarded { get { return T("A save started during the capture. Try again.", "Comenzó un guardado durante la captura. Inténtalo de nuevo."); } }
        internal static string ExtractionErrors(int count) { return T("Extraction errors: ", "Errores de extracción: ") + count; }
        internal static string SnapshotWritten(bool complete, string path, long bytes) { return T("Snapshot " + (complete ? "complete" : "partial"), "Snapshot " + (complete ? "completo" : "parcial")) + ": " + path + " (" + bytes + " bytes)"; }

        // ─── Errores que cancelan la exportación ────────────────────────────────────────────

        internal static string NoUserFolder(string returned) { return T("Couldn't find your user folder (the system returned «" + returned + "»). No file was written.", "No se encontró tu carpeta de usuario (el sistema devolvió «" + returned + "»). No se escribió ningún archivo."); }
        internal static string ModuleReadFailed(string module, string reason) { return T("Couldn't read `" + module + "` (" + reason + "). It's a required module: no file was written. Check the [VellumBridge] log.", "No se pudo leer `" + module + "` (" + reason + "). Es un módulo obligatorio: no se escribió ningún archivo. Revisa el log [VellumBridge]."); }
        internal static string MissingExportDate { get { return T("manifest: the export date is missing (exportedAtUtc).", "manifest: falta la fecha de exportación (exportedAtUtc)."); } }
        internal static string MissingSnapshotId { get { return T("manifest: snapshotId is missing.", "manifest: falta snapshotId."); } }
        internal static string SeaLevelNotFinite { get { return T("water: the sea level isn't a finite number.", "water: el nivel del mar no es un número finito."); } }
        internal static string SampleCount(string module, int expected, string found) { return T(module + ": expected " + expected + " samples, found " + found + ". The module is required; the export was cancelled without writing anything.", module + ": se esperaban " + expected + " muestras y hay " + found + ". El módulo es obligatorio; la exportación se canceló sin escribir nada."); }
        internal static string None { get { return T("none", "ninguna"); } }
        internal static string NonFiniteValue { get { return T("Non-finite numeric value in the document.", "Valor numérico no finito en el documento."); } }
        internal static string CityFolderFailed(string folder, string reason) { return T("Couldn't prepare the folder " + folder + ": " + reason + ". Check that it exists and that you can write to it.", "No se pudo preparar la carpeta " + folder + ": " + reason + ". Comprueba que existe y que tienes permiso de escritura."); }
        internal static string SaveStartedDuringExport { get { return T("A save started during the export, so it was discarded. Try again when it finishes.", "Comenzó un guardado durante la exportación: se descartó. Inténtalo de nuevo cuando termine."); } }
        internal static string WriteFailed(string target, string reason) { return T("Couldn't write " + target + ": " + reason + ". Check the free space and the folder permissions.", "No se pudo escribir " + target + ": " + reason + ". Comprueba el espacio libre y los permisos de la carpeta."); }

        // ─── Límites (lo parcial que no bloquea) ────────────────────────────────────────────

        internal static string DeflateUnavailable(string reason, string modules) { return T("deflate unavailable: " + reason + "; uncompressed modules: " + modules + ".", "deflate no disponible: " + reason + "; módulos sin comprimir: " + modules + "."); }
        internal static string OnlyManifest { get { return T("only manifest.json", "solo manifest.json"); } }
        internal static string WaterDepthSkipped { get { return T("Water depth skipped: the simulation was running (the water mask was exported). Pause the game and export again to include it.", "Profundidad del agua omitida: la simulación estaba en marcha (la máscara de agua sí se exportó). Pausa el juego y exporta de nuevo para incluirla."); } }
        internal static string DlcAndMods { get { return T("DLC and mods: not exported (the list of active DLC and mods isn't part of the document).", "DLC y mods: no se exportan (la lista de DLC y mods activos no forma parte del documento)."); } }

        internal static string SegmentsWithoutPrefab(int n) { return T(n + " segments skipped because their prefab isn't loaded.", n + " segmentos omitidos por no tener prefab cargado."); }
        internal static string SegmentNameErrors(int n) { return T(n + " segments without a name because their street name couldn't be read.", n + " segmentos sin nombre porque no se pudo leer el nombre de su calle."); }
        internal static string LinesWithoutPrefab(int n) { return T(n + " lines skipped because their prefab isn't loaded.", n + " líneas omitidas por no tener prefab cargado."); }
        internal static string MissingLegs(int n) { return T(n + " line legs without a calculated route: those lines' routes are incomplete.", n + " tramos de línea sin ruta calculada: la ruta de esas líneas queda incompleta."); }
        internal static string StopNameErrors(int n) { return T(n + " stops without a name because their street name couldn't be read.", n + " paradas sin nombre porque no se pudo leer el nombre de su calle."); }
        internal static string StopOwnerMissing(int n) { return T(n + " stops on a building's lanes with no owner found: they follow the street rule.", n + " paradas en vías de un edificio sin dueño encontrado: siguen la regla de calle."); }
        internal static string StopOwnerErrors(int n) { return T(n + " stops without a station because looking up their building failed: they follow the street rule.", n + " paradas sin estación porque falló la búsqueda de su edificio: siguen la regla de calle."); }
        internal static string CorruptLines(int n, string ids) { return T(n + " lines skipped because of a cyclic or corrupt stop list (ids: " + ids + ").", n + " líneas omitidas por una lista de paradas cíclica o corrupta (ids: " + ids + ")."); }
        internal static string BuildingsWithoutPrefab(int n) { return T(n + " buildings skipped because their prefab isn't loaded.", n + " edificios omitidos por no tener prefab cargado."); }
        internal static string BuildingNameErrors(int n, string first) { return T(n + " buildings without a visible name because reading it failed (" + first + ").", n + " edificios sin nombre visible por un error al leerlo (" + first + ")."); }

        internal static string InvalidNodes(int n) { return T(n + " nodes skipped because of a non-finite position or a repeated id.", n + " nodos omitidos por posición no finita o id repetido."); }
        internal static string OrphanSegments(int n) { return T(n + " segments skipped because their start or end node wasn't exported.", n + " segmentos omitidos porque su nodo de inicio o fin no se exportó."); }
        internal static string InvalidSegments(int n) { return T(n + " segments skipped because of invalid data (no itemClass, non-finite width or curve, repeated id).", n + " segmentos omitidos por datos no válidos (sin itemClass, ancho o curva no finitos, id repetido)."); }
        internal static string UnnamedStops(int n) { return T(n + " stops without a named street: exported without a name.", n + " paradas sin calle con nombre: se exportan sin nombre."); }
        internal static string InvalidStops(int n) { return T(n + " stops skipped because of a non-finite position.", n + " paradas omitidas por posición no finita."); }
        internal static string InvalidLines(int n) { return T(n + " lines skipped because of an unknown transport type or a repeated id.", n + " líneas omitidas por tipo de transporte desconocido o id repetido."); }
        internal static string UnnamedStations(int n, string radius, string buildings) { return T(n + " stations without a name: no landmark, service, area or named street within " + radius + " m (buildings: " + buildings + ").", n + " estaciones sin nombre: sin landmark, servicio, área ni calle con nombre a " + radius + " m (edificios: " + buildings + ")."); }
        internal static string InvalidBuildings(int n) { return T(n + " buildings skipped because of an empty prefab, a non-finite position or angle, or a repeated id.", n + " edificios omitidos por prefab vacío, posición o ángulo no finitos o id repetido."); }
        internal static string InvalidAreas(int n, string module) { return T(n + " " + module + " skipped because of a non-finite label or a repeated id.", n + " " + module + " omitidos por etiqueta no finita o id repetido."); }

        // `districts` es la grilla de distritos y cualquier otra, la de parques.
        internal static string GridName(bool districts) { return districts ? T("districts", "distritos") : T("parks", "parques"); }
        internal static string GridUnreadable(string what) { return T("The " + what + " grid was skipped: it couldn't be read.", "Grilla de " + what + " omitida: no se pudo leer."); }
        internal static string GridSizeMismatch(string what, int resolution) { return T("The " + what + " grid was skipped: its size doesn't match " + resolution + "².", "Grilla de " + what + " omitida: su tamaño no corresponde a " + resolution + "²."); }
        internal static string GridResolution(string what, int resolution) { return T("The " + what + " grid was skipped: resolution " + resolution + "² isn't supported (expected 512² or 900²).", "Grilla de " + what + " omitida: resolución " + resolution + "² no soportada (se esperaba 512² o 900²)."); }
        internal static string GridIdTooLarge(string what, int id) { return T("The " + what + " grid was skipped: area " + id + " doesn't fit in a byte (1–255).", "Grilla de " + what + " omitida: el área " + id + " no cabe en un byte (1–255)."); }
        internal static string GridUnknownArea(string what, int cell, int id) { return T("The " + what + " grid was skipped: cell " + cell + " gives weight to area " + id + ", which wasn't exported.", "Grilla de " + what + " omitida: la celda " + cell + " nombra con peso el área " + id + ", que no se exportó."); }
        internal static string GridSlotsCleared(string what, int cleared) { return T("The " + what + " grid: " + cleared + " weightless slots with ids of missing areas were written as 0.", "Grilla de " + what + ": " + cleared + " ranuras sin peso con ids de áreas inexistentes se escribieron como 0."); }
        internal static string GridPadded(string what) { return T("The " + what + " grid was padded from 512² (vanilla) to 900²: outside the 25 central tiles there are no areas.", "Grilla de " + what + " rellenada desde 512² (vanilla) a 900²: fuera de los 25 tiles centrales no hay áreas."); }
    }
}
