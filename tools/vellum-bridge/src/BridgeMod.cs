using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Text;
using System.Threading;
using ICities;
using ColossalFramework;
using UnityEngine;
using VellumBridge.Export;

namespace VellumBridge
{
    public sealed class BridgeMod : IUserMod
    {
        public string Name { get { return "Vellum Bridge (experimental)"; } }
        public string Description { get { return "Captura diagnóstica local de la ciudad para Vellum."; } }

        public void OnSettingsUI(UIHelperBase helper)
        {
            helper.AddButton("Capturar Raw Snapshot", delegate { BridgeCapture.Request(); });
            helper.AddButton("Exportar para Vellum", delegate { BridgeExport.Request(); });
        }
    }

    public sealed class BridgeLoading : LoadingExtensionBase
    {
        public override void OnLevelLoaded(LoadMode mode)
        {
            BridgeCapture.SetLoaded(true);
            BridgeExport.SetLoaded(true);
            Debug.Log("[VellumBridge] Ciudad cargada; captura con Ctrl+Shift+V y exportación para Vellum con Ctrl+Shift+E, o desde las opciones del mod.");
        }

        public override void OnLevelUnloading()
        {
            BridgeCapture.SetLoaded(false);
            BridgeExport.SetLoaded(false);
        }
    }

    public sealed class BridgeThreading : ThreadingExtensionBase
    {
        // OnUpdate corre en el hilo principal cada frame, también con la simulación en pausa.
        public override void OnUpdate(float realTimeDelta, float simulationTimeDelta)
        {
            // Ctrl+Shift+V captura sin abrir el menú, que pausa el juego: así se puede
            // capturar con la simulación corriendo. Con la ciudad en pausa, igual que el botón.
            bool ctrl = Input.GetKey(KeyCode.LeftControl) || Input.GetKey(KeyCode.RightControl);
            bool shift = Input.GetKey(KeyCode.LeftShift) || Input.GetKey(KeyCode.RightShift);
            if (ctrl && shift && Input.GetKeyDown(KeyCode.V)) BridgeCapture.Request();
            if (ctrl && shift && Input.GetKeyDown(KeyCode.E)) BridgeExport.Request();
            BridgeCapture.ShowPendingResult();
            BridgeExport.ShowPendingResult();
        }
    }

    // Exportación «Exportar para Vellum»: el documento .vellummap (docs/es/vellummap-format.md).
    // La copia de buffers ocurre en el hilo de simulación (o aquí mismo con el juego en pausa); la
    // serialización, compresión y escritura, en un hilo aparte para no frenar la simulación. El
    // resultado vuelve por pendingResult a OnUpdate, como en la captura.
    internal static class BridgeExport
    {
        // Transiciones de estado bajo `gate`. `generation` cambia con cada carga o descarga de
        // ciudad: el resultado de una exportación solo se publica si su generación sigue vigente,
        // así el de la ciudad anterior nunca aparece en la nueva.
        private static readonly object gate = new object();
        private static bool loaded;
        private static int generation;
        private static bool exporting;
        private static bool writing;          // hilo de escritura vivo
        private static volatile string pendingResult;

        internal static void SetLoaded(bool value)
        {
            lock (gate)
            {
                loaded = value;
                generation++;
                pendingResult = null;
                // Con un hilo de escritura vivo, `exporting` lo libera ese hilo al terminar: así no
                // hay dos exportaciones simultáneas.
                if (!writing) exporting = false;
            }
        }

        internal static void Request()
        {
            int ticket;
            lock (gate)
            {
                if (!loaded) { BridgeCapture.ShowResult("Carga una ciudad antes de exportar para Vellum. Inténtalo de nuevo."); return; }
                if (exporting) { BridgeCapture.ShowResult("Ya hay una exportación en curso."); return; }
                if (SavePanel.isSaving) { BridgeCapture.ShowResult("Hay un guardado en curso. Inténtalo de nuevo cuando termine."); return; }
                exporting = true;
                ticket = generation;
            }
            BridgeCapture.ShowResult("Exportando para Vellum…\n\nLa ventana mostrará el resultado al terminar.");
            Debug.Log("[VellumBridge] Exportación: solicitada.");
            var simulation = Singleton<SimulationManager>.instance;
            if (simulation.SimulationPaused || simulation.ForcedSimulationPaused) Extract(ticket);
            else simulation.AddAction(delegate { Extract(ticket); });
        }

        internal static void ShowPendingResult()
        {
            string message = pendingResult;
            if (message == null) return;
            pendingResult = null;
            BridgeCapture.ShowResult(message);
        }

        // Termina la operación dueña de `exporting`. El mensaje solo se publica si la ciudad no cambió.
        private static void Finish(int ticket, string message)
        {
            lock (gate)
            {
                exporting = false;
                writing = false;
                if (ticket == generation) pendingResult = message;
                else Debug.Log("[VellumBridge] Exportación: resultado descartado porque la ciudad cambió: " + message);
            }
        }

        private static void Extract(int ticket)
        {
            VellumModel model;
            try
            {
                bool cityLoaded;
                lock (gate)
                {
                    cityLoaded = loaded;
                    // La ciudad cambió mientras la acción esperaba en la cola: SetLoaded ya liberó
                    // `exporting` y puede haber otra exportación en marcha, así que no se toca.
                    if (ticket != generation)
                    {
                        Debug.LogWarning("[VellumBridge] Exportación descartada: la ciudad cambió antes de extraer.");
                        return;
                    }
                }
                if (!cityLoaded || SavePanel.isSaving)
                {
                    Debug.LogWarning("[VellumBridge] Exportación rechazada: ciudad no cargada o guardado en curso.");
                    Finish(ticket, "Exportación cancelada: no hay ciudad cargada o hay un guardado en curso. No se escribió nada. Inténtalo de nuevo.");
                    return;
                }
                var watch = System.Diagnostics.Stopwatch.StartNew();
                Debug.Log("[VellumBridge] Exportación: extracción iniciada.");
                model = VellumExtractor.Extract(BridgeCapture.Version);
                Debug.Log("[VellumBridge] Exportación: extracción terminada en " + watch.ElapsedMilliseconds + " ms ("
                    + model.nodes.Count + " nodos, " + model.segments.Count + " segmentos, " + model.lines.Count + " líneas, "
                    + model.buildings.Count + " edificios; simulación " + (model.simulationPaused ? "en pausa" : "en marcha") + ").");
            }
            catch (Exception error)
            {
                Debug.LogError("[VellumBridge] Exportación: extracción fallida: " + error);
                Finish(ticket, "Exportación cancelada: " + error.Message + (error is ExportFailedException ? "" : " No se escribió ningún archivo."));
                return;
            }

            try
            {
                lock (gate)
                {
                    if (ticket != generation)
                    {
                        // SetLoaded ya liberó `exporting` (no había escritura viva): no se toca.
                        Debug.LogWarning("[VellumBridge] Exportación descartada: la ciudad cambió durante la extracción.");
                        return;
                    }
                    writing = true;
                }
                var thread = new Thread(delegate () { Write(ticket, model); });
                thread.IsBackground = true;
                thread.Name = "VellumBridge export";
                thread.Start();
            }
            catch (Exception error)
            {
                Debug.LogError("[VellumBridge] Exportación: no se pudo iniciar la escritura: " + error);
                Finish(ticket, "Exportación cancelada: no se pudo iniciar la escritura (" + error.Message + "). No se escribió ningún archivo.");
            }
        }

        private static void Write(int ticket, VellumModel model)
        {
            ExportSummary summary = null;
            bool published = false;
            try
            {
                var watch = System.Diagnostics.Stopwatch.StartNew();
                string folder = ExportFolder();
                DeleteOrphanParts(folder);
                Debug.Log("[VellumBridge] Exportación: escritura iniciada en " + folder + ".");
                var options = new WriterOptions();
                options.isSaving = delegate { return SavePanel.isSaving; };
                summary = VellumWriter.Export(model, folder, options);
                published = true;
                Debug.Log("[VellumBridge] Exportación: publicada " + summary.path + " (" + summary.bytes + " bytes) en "
                    + watch.ElapsedMilliseconds + " ms. Módulos: " + string.Join(", ", summary.modules.ToArray())
                    + ". Límites: " + summary.limits.Count + ".");
                foreach (string limit in summary.limits) Debug.Log("[VellumBridge] Exportación: límite: " + limit);
                Finish(ticket, Describe(summary));
            }
            catch (Exception error)
            {
                if (published)
                {
                    Debug.LogError("[VellumBridge] Exportación: publicada, pero falló el resumen: " + error);
                    Finish(ticket, "El archivo sí se escribió:\n" + summary.path
                        + "\n\nNo se pudo preparar el resumen (" + error.Message + "). Revisa el log [VellumBridge].");
                    return;
                }
                Debug.LogError("[VellumBridge] Exportación: escritura fallida: " + error);
                Finish(ticket, "Exportación cancelada: " + (error is ExportFailedException ? error.Message
                    : "error inesperado al escribir (" + error.Message + "). No se escribió ningún archivo."));
            }
        }

        // Un cierre del juego a mitad de escritura deja un .part (el hilo es background). Como solo
        // hay una exportación a la vez, cualquier .part de la carpeta es huérfano.
        private static void DeleteOrphanParts(string folder)
        {
            if (!Directory.Exists(folder)) return;
            foreach (string part in Directory.GetFiles(folder, "*" + VellumWriter.FileExtension + ".part"))
            {
                try
                {
                    File.Delete(part);
                    Debug.Log("[VellumBridge] Exportación: borrado el temporal huérfano " + part + ".");
                }
                catch (Exception error) { Debug.LogWarning("[VellumBridge] Exportación: no se pudo borrar " + part + ": " + error.Message); }
            }
        }

        private static string Describe(ExportSummary summary)
        {
            var text = new StringBuilder();
            text.Append("Exportado para Vellum:\n").Append(summary.path).Append("\n");
            if (summary.bytes < 0) text.Append("tamaño desconocido");
            else if (summary.bytes < 1024 * 1024)
                text.Append((summary.bytes / 1024.0).ToString("0.0", CultureInfo.InvariantCulture)).Append(" KB");
            else text.Append((summary.bytes / (1024.0 * 1024.0)).ToString("0.0", CultureInfo.InvariantCulture)).Append(" MB");
            text.Append("\n\n");
            text.Append(summary.nodes).Append(" nodos, ").Append(summary.segments).Append(" segmentos, ")
                .Append(summary.lines).Append(" líneas, ").Append(summary.stops).Append(" paradas, ")
                .Append(summary.buildings).Append(" edificios, ").Append(summary.districts).Append(" distritos, ")
                .Append(summary.parks).Append(" parques.\n\n");
            text.Append("Módulos: ").Append(string.Join(", ", summary.modules.ToArray())).Append("\n");
            if (summary.limits.Count > 0)
            {
                text.Append("\nLímites:\n");
                foreach (string limit in summary.limits) text.Append("• ").Append(limit).Append("\n");
            }
            return text.ToString();
        }

        // Documentos/Vellum Bridge. Mono en macOS y Linux devuelve $HOME como MyDocuments: se usa
        // $HOME/Documents si existe y, si no, $HOME/Vellum Bridge.
        private static string ExportFolder()
        {
            string documents = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
            if (string.IsNullOrEmpty(documents) || !Path.IsPathRooted(documents))
                throw new ExportFailedException("No se encontró la carpeta Documentos del usuario (el sistema devolvió «"
                    + documents + "»). No se escribió ningún archivo.");
            if (Path.DirectorySeparatorChar == '/')
            {
                string nested = Path.Combine(documents, "Documents");
                if (Directory.Exists(nested)) documents = nested;
            }
            return Path.Combine(documents, "Vellum Bridge");
        }
    }

    internal static class BridgeCapture
    {
        internal const string Version = "0.6.0-experimental";

        private static bool loaded;
        private static volatile bool capturing;
        private static volatile string pendingResult;

        internal static void SetLoaded(bool value) { loaded = value; capturing = false; pendingResult = null; }

        // Se invoca desde el botón de opciones, en el hilo principal.
        internal static void Request()
        {
            if (!loaded) { ShowResult("Carga una ciudad antes de capturar."); return; }
            if (capturing) return;
            capturing = true;
            var simulation = Singleton<SimulationManager>.instance;
            // En pausa (p. ej. con el menú Esc abierto) el hilo de simulación no avanza ticks,
            // así que se captura aquí mismo. Con la simulación corriendo, la lectura se encola
            // a ese hilo para no leer los buffers mientras se modifican.
            if (simulation.SimulationPaused || simulation.ForcedSimulationPaused) Run();
            else simulation.AddAction(Run);
        }

        internal static void ShowPendingResult()
        {
            string message = pendingResult;
            if (message == null) return;
            pendingResult = null;
            ShowResult(message);
        }

        internal static void ShowResult(string message)
        {
            try
            {
                ColossalFramework.UI.UIView.library.ShowModal<ExceptionPanel>("ExceptionPanel")
                    .SetMessage("Vellum Bridge", message, false);
            }
            catch (Exception error) { Debug.LogWarning("[VellumBridge] No se pudo mostrar el resultado: " + error); }
        }

        private static void Run()
        {
            try { pendingResult = Capture(); }
            catch (Exception error)
            {
                Debug.LogError("[VellumBridge] Captura fallida: " + error);
                pendingResult = "Captura fallida: " + error.Message;
            }
            finally { capturing = false; }
        }

        private static string Capture()
        {
            if (!loaded || SavePanel.isSaving)
            {
                Debug.LogWarning("[VellumBridge] Captura rechazada: ciudad no cargada o guardado en curso.");
                return "Captura rechazada: ciudad no cargada o guardado en curso. Inténtalo de nuevo.";
            }

            var document = new Snapshot();
            document.kind = "vellum-bridge-raw-snapshot";
            document.snapshotVersion = 1;
            document.bridgeVersion = Version;
            document.capturedAt = DateTime.UtcNow.ToString("o");
            document.cityName = Singleton<SimulationManager>.instance.m_metaData != null
                ? Singleton<SimulationManager>.instance.m_metaData.m_CityName : null;
            // Application.version devuelve "1.0" en CS1; la versión real del juego está en BuildConfig.
            document.gameVersion = BuildConfig.applicationVersion;
            // El agua se simula: la captura es un instante y depende de si la simulación corría.
            document.simulationPaused = Singleton<SimulationManager>.instance.SimulationPaused
                || Singleton<SimulationManager>.instance.ForcedSimulationPaused;
            document.diagnostics = new Diagnostics();
            document.payload = new Payload();

            try { document.payload.roads = CaptureRoads(document.diagnostics); }
            catch (Exception error) { document.diagnostics.errors.Add("roads: " + error); }
            try { document.payload.roadNodes = CaptureRoadNodes(); }
            catch (Exception error) { document.diagnostics.errors.Add("roadNodes: " + error); }
            try { document.payload.transit = CaptureTransit(document.diagnostics); }
            catch (Exception error) { document.diagnostics.errors.Add("transit: " + error); }
            try { document.payload.buildings = CaptureBuildings(document.diagnostics); }
            catch (Exception error) { document.diagnostics.errors.Add("buildings: " + error); }
            try { document.payload.districts = CaptureDistricts(); }
            catch (Exception error) { document.diagnostics.errors.Add("districts: " + error); }
            try { document.payload.parks = CaptureParks(); }
            catch (Exception error) { document.diagnostics.errors.Add("parks: " + error); }
            try { document.payload.vegetation = CaptureTrees(); }
            catch (Exception error) { document.diagnostics.errors.Add("vegetation: " + error); }
            try { document.payload.terrain = CaptureTerrain(); }
            catch (Exception error) { document.diagnostics.errors.Add("terrain: " + error); }
            try { document.payload.resourceGrid = CaptureResourceGrid(); }
            catch (Exception error) { document.diagnostics.errors.Add("resourceGrid: " + error); }
            // 262 143 árboles en San Rico = buffer vanilla lleno; con esto se distingue un truncado.
            try { document.payload.treeBufferLength = Singleton<TreeManager>.instance.m_trees.m_buffer.Length; }
            catch (Exception error) { document.diagnostics.errors.Add("treeBufferLength: " + error); }
            try { document.payload.terrainLayers = CaptureTerrainLayers(); }
            catch (Exception error) { document.diagnostics.errors.Add("terrainLayers: " + error); }
            try { document.payload.water = CaptureWater(); }
            catch (Exception error) { document.diagnostics.errors.Add("water: " + error); }
            try { document.payload.districtGrid = CaptureGrid(Singleton<DistrictManager>.instance.m_districtGrid); }
            catch (Exception error) { document.diagnostics.errors.Add("districtGrid: " + error); }
            try { document.payload.parkGrid = CaptureGrid(Singleton<DistrictManager>.instance.m_parkGrid); }
            catch (Exception error) { document.diagnostics.errors.Add("parkGrid: " + error); }

            // Una sección sin extractor no se representa como arreglo vacío.
            document.diagnostics.unsupported.AddRange(new[] { "dlcs", "mods" });
            document.diagnostics.complete = document.diagnostics.errors.Count == 0
                && document.diagnostics.unsupported.Count == 0;

            if (SavePanel.isSaving)
            {
                Debug.LogWarning("[VellumBridge] Captura descartada: comenzó un guardado.");
                return "Captura descartada: comenzó un guardado. Inténtalo de nuevo.";
            }

            try
            {
                string folder = Path.Combine(Path.Combine(ColossalFramework.IO.DataLocation.localApplicationData,
                    "VellumBridge"), "Snapshots");
                Directory.CreateDirectory(folder);
                string id = DateTime.UtcNow.ToString("yyyyMMddTHHmmssfffZ");
                string target = Path.Combine(folder, "snapshot-" + id + ".json");
                string temporary = target + ".part";
                try
                {
                    File.WriteAllText(temporary, Json.Write(document), new UTF8Encoding(false));
                    File.Move(temporary, target);
                }
                finally { if (File.Exists(temporary)) File.Delete(temporary); }
                string summary = "Snapshot " + (document.diagnostics.complete ? "completo" : "parcial")
                    + ": " + target + " (" + new FileInfo(target).Length + " bytes)";
                Debug.Log("[VellumBridge] " + summary);
                return summary + "\n\nErrores de extracción: " + document.diagnostics.errors.Count;
            }
            catch (Exception error)
            {
                Debug.LogError("[VellumBridge] Escritura fallida: " + error);
                return "Escritura fallida: " + error.Message;
            }
        }

        private static Road[] CaptureRoads(Diagnostics diagnostics)
        {
            var buffer = Singleton<NetManager>.instance.m_segments.m_buffer;
            var roads = new List<Road>();
            int nameErrors = 0;
            string firstNameError = null;
            for (int i = 1; i < buffer.Length; i++)
            {
                if (buffer[i].m_flags == NetSegment.Flags.None) continue;
                var segment = buffer[i];
                var info = segment.Info;
                var road = new Road();
                road.id = i;
                road.startNode = segment.m_startNode;
                road.endNode = segment.m_endNode;
                road.flags = segment.m_flags.ToString();
                road.prefab = info != null ? info.name : null;
                road.halfWidth = info != null ? info.m_halfWidth : float.NaN;
                // Con las posiciones de roadNodes, las direcciones definen la curva Bézier del segmento.
                road.startDirection = Vector(segment.m_startDirection);
                road.endDirection = Vector(segment.m_endDirection);
                road.nameSeed = segment.m_nameSeed;
                // Nombre visible en el juego: el personalizado (flag CustomName) o el generado desde nameSeed.
                // Un fallo aquí no invalida la geometría, así que se aísla por segmento.
                try { road.name = Singleton<NetManager>.instance.GetSegmentName((ushort)i); }
                catch (Exception error)
                {
                    if (nameErrors++ == 0) firstNameError = "segmento " + i + ": " + error.Message;
                }
                roads.Add(road);
            }
            if (nameErrors > 0)
                diagnostics.errors.Add("roadNames: " + nameErrors + " segmentos sin nombre por error; " + firstNameError);
            return roads.ToArray();
        }

        private static float[] Vector(Vector3 value)
        {
            return new[] { value.x, value.y, value.z };
        }

        private static TreeRecord[] CaptureTrees()
        {
            var buffer = Singleton<TreeManager>.instance.m_trees.m_buffer;
            var trees = new List<TreeRecord>();
            for (int i = 1; i < buffer.Length; i++)
            {
                if (buffer[i].m_flags == 0) continue;
                var tree = buffer[i];
                var info = tree.Info;
                var position = tree.Position;
                var record = new TreeRecord();
                record.id = i;
                record.x = position.x;
                record.y = position.y;
                record.z = position.z;
                record.flags = ((TreeInstance.Flags)tree.m_flags).ToString();
                record.prefab = info != null ? info.name : null;
                trees.Add(record);
            }
            return trees.ToArray();
        }

        // Alturas crudas del terreno, sin muestreo ni suavizado: uint16 little-endian en base64.
        private static TerrainRecord CaptureTerrain()
        {
            ushort[] heights = Singleton<TerrainManager>.instance.RawHeights;
            var bytes = new byte[heights.Length * 2];
            for (int i = 0; i < heights.Length; i++)
            {
                bytes[i * 2] = (byte)heights[i];
                bytes[i * 2 + 1] = (byte)(heights[i] >> 8);
            }
            var record = new TerrainRecord();
            record.resolution = TerrainManager.RAW_RESOLUTION + 1;
            if (heights.Length != record.resolution * record.resolution)
                throw new InvalidOperationException("RawHeights tiene " + heights.Length + " muestras; se esperaban "
                    + record.resolution * record.resolution);
            record.cellSize = 16f;
            record.heightScale = 1f / 64f;
            record.encoding = "uint16-le-base64";
            record.data = Convert.ToBase64String(bytes);
            return record;
        }

        // Grilla de recursos naturales 512×512 (33,75 m): m_forest y m_tree por celda, que el juego
        // recalcula a partir de los árboles vivos. Diagnóstico para saber si <Forest> de .cslmap es
        // m_forest (Westdale: 61 760 celdas de bosque con 541 árboles).
        private static GridRecord CaptureResourceGrid()
        {
            var cells = Singleton<NaturalResourceManager>.instance.m_naturalResources;
            int resolution = (int)Math.Round(Math.Sqrt(cells.Length));
            if (resolution * resolution != cells.Length)
                throw new InvalidOperationException("La grilla tiene " + cells.Length + " celdas; no es cuadrada");
            var bytes = new byte[cells.Length * 2];
            for (int i = 0; i < cells.Length; i++)
            {
                bytes[i * 2] = cells[i].m_forest;
                bytes[i * 2 + 1] = cells[i].m_tree;
            }
            var record = new GridRecord();
            record.resolution = resolution;
            record.cellSize = 33.75f;
            record.encoding = "cell-u8x2-base64";
            record.layout = "forest,tree";
            record.data = Convert.ToBase64String(bytes);
            return record;
        }

        // Diagnóstico: celdas donde otras capas de alturas de TerrainManager difieren de RawHeights.
        // .cslmap difiere de RawHeights en 813 celdas de island-hopping y su exportador no es
        // público; esto muestra si alguna de estas capas es la que exporta. Disperso para no
        // duplicar la grilla completa.
        private static TerrainLayerRecord[] CaptureTerrainLayers()
        {
            var terrain = Singleton<TerrainManager>.instance;
            ushort[] raw = terrain.RawHeights;
            var layers = new List<TerrainLayerRecord>();
            foreach (var pair in new[]
            {
                new KeyValuePair<string, ushort[]>("RawHeights2", terrain.RawHeights2),
                new KeyValuePair<string, ushort[]>("BlockHeights", terrain.BlockHeights),
            })
            {
                if (pair.Value.Length != raw.Length)
                    throw new InvalidOperationException(pair.Key + " tiene " + pair.Value.Length + " muestras");
                var indices = new List<int>();
                var values = new List<int>();
                for (int i = 0; i < raw.Length; i++)
                {
                    if (pair.Value[i] == raw[i]) continue;
                    indices.Add(i);
                    values.Add(pair.Value[i]);
                }
                var record = new TerrainLayerRecord();
                record.name = pair.Key;
                record.indices = indices.ToArray();
                record.values = values.ToArray();
                layers.Add(record);
            }
            return layers.ToArray();
        }

        // Profundidad cruda del agua por celda (Cell.m_height, misma grilla y unidades que RawHeights)
        // y fuentes de agua. Velocidad y contaminación se omiten: no sirven a un mapa.
        // m_waterBuffers y m_waterFrameIndex son privados; el índice del buffer estable es el mismo
        // que usa BuildingSpawnPoints (MacSergey) al leerlo fuera de la simulación.
        private static WaterRecord CaptureWater()
        {
            var simulation = Singleton<TerrainManager>.instance.WaterSimulation;
            const BindingFlags flags = BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public;
            var buffers = (WaterSimulation.Cell[][])typeof(WaterSimulation).GetField("m_waterBuffers", flags).GetValue(simulation);
            uint frame = (uint)typeof(WaterSimulation).GetField("m_waterFrameIndex", flags).GetValue(simulation);
            var cells = buffers[~(frame >> 6) & 1u];
            var record = new WaterRecord();
            record.resolution = TerrainManager.RAW_RESOLUTION + 1;
            if (cells.Length != record.resolution * record.resolution)
                throw new InvalidOperationException("El buffer de agua tiene " + cells.Length + " celdas; se esperaban "
                    + record.resolution * record.resolution);
            var bytes = new byte[cells.Length * 2];
            for (int i = 0; i < cells.Length; i++)
            {
                bytes[i * 2] = (byte)cells[i].m_height;
                bytes[i * 2 + 1] = (byte)(cells[i].m_height >> 8);
            }
            record.cellSize = 16f;
            record.heightScale = 1f / 64f;
            record.encoding = "uint16-le-base64";
            record.frameIndex = frame;
            record.depth = Convert.ToBase64String(bytes);

            var list = simulation.m_waterSources;
            var sources = new List<WaterSourceRecord>();
            for (int i = 0; i < list.m_size; i++)
            {
                var source = list.m_buffer[i];
                if (source.m_type == 0) continue; // entrada libre de la FastList
                var item = new WaterSourceRecord();
                item.id = i + 1; // Building.m_waterSource guarda índice + 1
                item.type = source.m_type;
                item.inputPosition = Vector(source.m_inputPosition);
                item.outputPosition = Vector(source.m_outputPosition);
                item.inputRate = source.m_inputRate;
                item.outputRate = source.m_outputRate;
                item.target = source.m_target;
                item.flow = source.m_flow;
                item.water = source.m_water;
                sources.Add(item);
            }
            record.sources = sources.ToArray();
            return record;
        }

        // Celdas crudas de distrito/parque: hasta 4 IDs con su peso (alpha) por celda. Los polígonos
        // se derivan fuera del bridge para no transformar datos dentro del snapshot.
        // Vanilla usa 512×512 (25 tiles centrales); mods como 81 Tiles 2 reemplazan el arreglo por
        // uno mayor (900×900 para 81 tiles) con el mismo tamaño de celda, centrado en el origen.
        private static GridRecord CaptureGrid(DistrictManager.Cell[] cells)
        {
            int resolution = (int)Math.Round(Math.Sqrt(cells.Length));
            if (resolution * resolution != cells.Length)
                throw new InvalidOperationException("La grilla tiene " + cells.Length + " celdas; no es cuadrada");
            var bytes = new byte[cells.Length * 8];
            for (int i = 0; i < cells.Length; i++)
            {
                int o = i * 8;
                bytes[o] = cells[i].m_district1;
                bytes[o + 1] = cells[i].m_district2;
                bytes[o + 2] = cells[i].m_district3;
                bytes[o + 3] = cells[i].m_district4;
                bytes[o + 4] = cells[i].m_alpha1;
                bytes[o + 5] = cells[i].m_alpha2;
                bytes[o + 6] = cells[i].m_alpha3;
                bytes[o + 7] = cells[i].m_alpha4;
            }
            var record = new GridRecord();
            record.resolution = resolution;
            record.cellSize = DistrictManager.DISTRICTGRID_CELL_SIZE;
            record.encoding = "cell-u8x8-base64";
            record.layout = "id1,id2,id3,id4,alpha1,alpha2,alpha3,alpha4";
            record.data = Convert.ToBase64String(bytes);
            return record;
        }

        private static NodeRecord[] CaptureRoadNodes()
        {
            var buffer = Singleton<NetManager>.instance.m_nodes.m_buffer;
            var nodes = new List<NodeRecord>();
            for (int i = 1; i < buffer.Length; i++)
            {
                if (buffer[i].m_flags == NetNode.Flags.None) continue;
                var node = new NodeRecord();
                node.id = i;
                node.x = buffer[i].m_position.x;
                node.y = buffer[i].m_position.y;
                node.z = buffer[i].m_position.z;
                node.flags = buffer[i].m_flags.ToString();
                nodes.Add(node);
            }
            return nodes.ToArray();
        }

        private static TransitRecord[] CaptureTransit(Diagnostics diagnostics)
        {
            var lines = Singleton<TransportManager>.instance.m_lines.m_buffer;
            var nodes = Singleton<NetManager>.instance.m_nodes.m_buffer;
            var lanes = Singleton<NetManager>.instance.m_lanes.m_buffer;
            var result = new List<TransitRecord>();
            for (int i = 1; i < lines.Length; i++)
            {
                if (lines[i].m_flags == TransportLine.Flags.None) continue;
                var line = lines[i];
                var record = new TransitRecord();
                record.id = i;
                record.flags = line.m_flags.ToString();
                record.lineNumber = line.m_lineNumber;
                record.transportType = line.Info != null ? line.Info.m_transportType.ToString() : null;
                record.customName = (line.m_flags & TransportLine.Flags.CustomName) != 0
                    ? Singleton<InstanceManager>.instance.GetName(new InstanceID { TransportLine = (ushort)i }) : null;
                // Nombre visible: el personalizado o el generado ("Bus Line 2").
                record.name = Singleton<TransportManager>.instance.GetLineName((ushort)i);
                record.color = "#" + line.m_color.r.ToString("x2") + line.m_color.g.ToString("x2")
                    + line.m_color.b.ToString("x2");
                // m_color solo vale con el flag CustomColor; sin él el juego pinta el color por
                // defecto del modo. .cslmap exporta este color visible.
                Color32 shown = Singleton<TransportManager>.instance.GetLineColor((ushort)i);
                record.displayColor = "#" + shown.r.ToString("x2") + shown.g.ToString("x2") + shown.b.ToString("x2");
                var stops = new List<int>();
                var stopNames = new List<string>();
                var stopRoads = new List<int>();
                ushort first = line.m_stops;
                ushort stop = first;
                int guard = 0;
                for (; stop != 0 && guard < 32768; guard++)
                {
                    stops.Add(stop);
                    // CS1 base no permite nombrar paradas; solo hay nombre si un mod lo asignó.
                    stopNames.Add(Singleton<InstanceManager>.instance.GetName(new InstanceID { NetNode = stop }));
                    // La parada cuelga de un carril; su segmento es la calle donde está.
                    uint lane = nodes[stop].m_lane;
                    stopRoads.Add(lane != 0 ? lanes[lane].m_segment : 0);
                    stop = TransportLine.GetNextStop(stop);
                    if (stop == first) break;
                }
                if (guard >= 32768) throw new InvalidOperationException("Lista de paradas cíclica o corrupta en línea " + i);
                record.stopNodeIds = stops.ToArray();
                record.stopCustomNames = stopNames.ToArray();
                record.stopRoadSegments = stopRoads.ToArray();
                // Una ruta ilegible no invalida la línea: legs queda null y el error se declara.
                try { record.legs = CaptureLegs(record.stopNodeIds); }
                catch (Exception error) { diagnostics.errors.Add("transitRoutes: línea " + i + ": " + error); }
                result.Add(record);
            }
            return result.ToArray();
        }

        // Cada tramo entre paradas es un segmento de la red de transporte que parte de la parada
        // (igual que TransportLine.GetNextStop); su m_path apunta a la ruta calculada por el
        // pathfinder: una cadena de PathUnits con posiciones (segmento, carril, offset).
        private static LegRecord[] CaptureLegs(int[] stops)
        {
            var nodes = Singleton<NetManager>.instance.m_nodes.m_buffer;
            var segments = Singleton<NetManager>.instance.m_segments.m_buffer;
            var units = Singleton<PathManager>.instance.m_pathUnits.m_buffer;
            var legs = new List<LegRecord>();
            foreach (int stop in stops)
            {
                ushort legSegment = 0;
                for (int k = 0; k < 8; k++)
                {
                    ushort candidate = nodes[stop].GetSegment(k);
                    if (candidate != 0 && segments[candidate].m_startNode == stop) { legSegment = candidate; break; }
                }
                if (legSegment == 0) continue;
                var leg = new LegRecord();
                leg.fromStop = stop;
                leg.toStop = segments[legSegment].m_endNode;
                leg.segment = legSegment;
                uint unit = segments[legSegment].m_path;
                leg.pathUnit = (long)unit;
                var pathSegments = new List<int>();
                var pathLanes = new List<int>();
                var pathOffsets = new List<int>();
                if (unit != 0)
                {
                    leg.pathReady = (units[unit].m_pathFindFlags & PathUnit.FLAG_READY) != 0;
                    int guard = 0;
                    while (unit != 0)
                    {
                        if (++guard > 65536)
                            throw new InvalidOperationException("Cadena de PathUnits cíclica en tramo " + legSegment);
                        int count = units[unit].m_positionCount;
                        for (int p = 0; p < count; p++)
                        {
                            PathUnit.Position position;
                            if (!units[unit].GetPosition(p, out position)) break;
                            pathSegments.Add(position.m_segment);
                            pathLanes.Add(position.m_lane);
                            pathOffsets.Add(position.m_offset);
                        }
                        unit = units[unit].m_nextPathUnit;
                    }
                }
                leg.pathSegments = pathSegments.ToArray();
                leg.pathLanes = pathLanes.ToArray();
                leg.pathOffsets = pathOffsets.ToArray();
                legs.Add(leg);
            }
            return legs.ToArray();
        }

        private static AreaRecord[] CaptureDistricts()
        {
            var buffer = Singleton<DistrictManager>.instance.m_districts.m_buffer;
            var result = new List<AreaRecord>();
            for (int i = 1; i < buffer.Length; i++)
            {
                if ((int)buffer[i].m_flags == 0) continue;
                result.Add(new AreaRecord { id = i, name = Singleton<DistrictManager>.instance.GetDistrictName((byte)i), flags = buffer[i].m_flags.ToString() });
            }
            return result.ToArray();
        }

        private static AreaRecord[] CaptureParks()
        {
            var buffer = Singleton<DistrictManager>.instance.m_parks.m_buffer;
            var result = new List<AreaRecord>();
            for (int i = 1; i < buffer.Length; i++)
            {
                if ((int)buffer[i].m_flags == 0) continue;
                result.Add(new AreaRecord
                {
                    id = i,
                    name = Singleton<DistrictManager>.instance.GetParkName((byte)i),
                    flags = buffer[i].m_flags.ToString(),
                    parkType = buffer[i].m_parkType.ToString()
                });
            }
            return result.ToArray();
        }

        private static BuildingRecord[] CaptureBuildings(Diagnostics diagnostics)
        {
            var buffer = Singleton<BuildingManager>.instance.m_buildings.m_buffer;
            var buildings = new List<BuildingRecord>();
            int nameErrors = 0;
            string firstNameError = null;
            for (int i = 1; i < buffer.Length; i++)
            {
                if (buffer[i].m_flags == Building.Flags.None) continue;
                var building = buffer[i];
                var info = building.Info;
                var record = new BuildingRecord();
                record.id = i;
                record.x = building.m_position.x;
                record.y = building.m_position.y;
                record.z = building.m_position.z;
                record.flags = building.m_flags.ToString();
                record.prefab = info != null ? info.name : null;
                if (info != null && info.m_class != null)
                {
                    record.service = info.m_class.m_service.ToString();
                    record.subService = info.m_class.m_subService.ToString();
                    record.level = info.m_class.m_level.ToString();
                }
                // Nombre visible solo para edificios que no son RICO (servicios, únicos, monumentos...)
                // o los que el jugador renombró; el de un RICO es aleatorio y no aporta.
                bool rico = info != null && info.m_buildingAI is PrivateBuildingAI;
                if (!rico || (building.m_flags & Building.Flags.CustomName) != 0)
                {
                    try { record.name = Singleton<BuildingManager>.instance.GetBuildingName((ushort)i, InstanceID.Empty); }
                    catch (Exception error)
                    {
                        if (nameErrors++ == 0) firstNameError = "edificio " + i + ": " + error.Message;
                    }
                }
                buildings.Add(record);
            }
            if (nameErrors > 0)
                diagnostics.errors.Add("buildingNames: " + nameErrors + " edificios sin nombre por error; " + firstNameError);
            return buildings.ToArray();
        }
    }

    // JsonUtility en CS1 omite los objetos anidados (payload, diagnostics) y solo
    // emite los campos primitivos de la raíz, así que el JSON se escribe a mano.
    internal static class Json
    {
        internal static string Write(Snapshot s)
        {
            var w = new StringBuilder();
            w.Append('{');
            Field(w, "kind", s.kind, true);
            Field(w, "snapshotVersion", s.snapshotVersion);
            Field(w, "bridgeVersion", s.bridgeVersion);
            Field(w, "gameVersion", s.gameVersion);
            Field(w, "capturedAt", s.capturedAt);
            Field(w, "cityName", s.cityName);
            Key(w, "simulationPaused", false);
            w.Append(s.simulationPaused ? "true" : "false");
            Key(w, "payload", false);
            w.Append('{');
            Array(w, "roads", s.payload.roads, WriteRoad, true);
            Array(w, "roadNodes", s.payload.roadNodes, WriteNode);
            Array(w, "transit", s.payload.transit, WriteTransit);
            Array(w, "buildings", s.payload.buildings, WriteBuilding);
            Array(w, "districts", s.payload.districts, WriteArea);
            Array(w, "parks", s.payload.parks, WriteArea);
            Array(w, "vegetation", s.payload.vegetation, WriteTree);
            Key(w, "terrain", false);
            WriteTerrain(w, s.payload.terrain);
            Array(w, "terrainLayers", s.payload.terrainLayers, WriteTerrainLayer);
            Key(w, "resourceGrid", false);
            WriteGrid(w, s.payload.resourceGrid);
            Field(w, "treeBufferLength", s.payload.treeBufferLength);
            Key(w, "water", false);
            WriteWater(w, s.payload.water);
            Key(w, "districtGrid", false);
            WriteGrid(w, s.payload.districtGrid);
            Key(w, "parkGrid", false);
            WriteGrid(w, s.payload.parkGrid);
            w.Append('}');
            Key(w, "diagnostics", false);
            w.Append('{');
            Key(w, "complete", true);
            w.Append(s.diagnostics.complete ? "true" : "false");
            Array(w, "errors", s.diagnostics.errors.ToArray(), String);
            Array(w, "unsupported", s.diagnostics.unsupported.ToArray(), String);
            w.Append("}}\n");
            return w.ToString();
        }

        private static void WriteRoad(StringBuilder w, Road r)
        {
            w.Append('{');
            Field(w, "id", r.id, true);
            Field(w, "startNode", r.startNode);
            Field(w, "endNode", r.endNode);
            Field(w, "flags", r.flags);
            Field(w, "prefab", r.prefab);
            Field(w, "name", r.name);
            Field(w, "nameSeed", r.nameSeed);
            Field(w, "halfWidth", r.halfWidth);
            Array(w, "startDirection", r.startDirection, Float);
            Array(w, "endDirection", r.endDirection, Float);
            w.Append('}');
        }

        private static void WriteTree(StringBuilder w, TreeRecord t)
        {
            w.Append('{');
            Field(w, "id", t.id, true);
            Field(w, "x", t.x);
            Field(w, "y", t.y);
            Field(w, "z", t.z);
            Field(w, "flags", t.flags);
            Field(w, "prefab", t.prefab);
            w.Append('}');
        }

        private static void WriteTerrain(StringBuilder w, TerrainRecord t)
        {
            if (t == null) { w.Append("null"); return; }
            w.Append('{');
            Field(w, "resolution", t.resolution, true);
            Field(w, "cellSize", t.cellSize);
            Field(w, "heightScale", t.heightScale);
            Field(w, "encoding", t.encoding);
            Field(w, "data", t.data);
            w.Append('}');
        }

        private static void WriteTerrainLayer(StringBuilder w, TerrainLayerRecord l)
        {
            w.Append('{');
            Field(w, "name", l.name, true);
            Array(w, "indices", l.indices, Int);
            Array(w, "values", l.values, Int);
            w.Append('}');
        }

        private static void WriteWater(StringBuilder w, WaterRecord t)
        {
            if (t == null) { w.Append("null"); return; }
            w.Append('{');
            Field(w, "resolution", t.resolution, true);
            Field(w, "cellSize", t.cellSize);
            Field(w, "heightScale", t.heightScale);
            Field(w, "encoding", t.encoding);
            Field(w, "frameIndex", (long)t.frameIndex);
            Field(w, "depth", t.depth);
            Array(w, "sources", t.sources, WriteWaterSource);
            w.Append('}');
        }

        private static void WriteWaterSource(StringBuilder w, WaterSourceRecord s)
        {
            w.Append('{');
            Field(w, "id", s.id, true);
            Field(w, "type", s.type);
            Array(w, "inputPosition", s.inputPosition, Float);
            Array(w, "outputPosition", s.outputPosition, Float);
            Field(w, "inputRate", s.inputRate);
            Field(w, "outputRate", s.outputRate);
            Field(w, "target", s.target);
            Field(w, "flow", s.flow);
            Field(w, "water", s.water);
            w.Append('}');
        }

        private static void WriteGrid(StringBuilder w, GridRecord g)
        {
            if (g == null) { w.Append("null"); return; }
            w.Append('{');
            Field(w, "resolution", g.resolution, true);
            Field(w, "cellSize", g.cellSize);
            Field(w, "encoding", g.encoding);
            Field(w, "layout", g.layout);
            Field(w, "data", g.data);
            w.Append('}');
        }

        private static void WriteNode(StringBuilder w, NodeRecord n)
        {
            w.Append('{');
            Field(w, "id", n.id, true);
            Field(w, "x", n.x);
            Field(w, "y", n.y);
            Field(w, "z", n.z);
            Field(w, "flags", n.flags);
            w.Append('}');
        }

        private static void WriteBuilding(StringBuilder w, BuildingRecord b)
        {
            w.Append('{');
            Field(w, "id", b.id, true);
            Field(w, "x", b.x);
            Field(w, "y", b.y);
            Field(w, "z", b.z);
            Field(w, "flags", b.flags);
            Field(w, "prefab", b.prefab);
            Field(w, "service", b.service);
            Field(w, "subService", b.subService);
            Field(w, "level", b.level);
            Field(w, "name", b.name);
            w.Append('}');
        }

        private static void WriteTransit(StringBuilder w, TransitRecord t)
        {
            w.Append('{');
            Field(w, "id", t.id, true);
            Field(w, "lineNumber", t.lineNumber);
            Field(w, "flags", t.flags);
            Field(w, "transportType", t.transportType);
            Field(w, "customName", t.customName);
            Field(w, "name", t.name);
            Field(w, "color", t.color);
            Field(w, "displayColor", t.displayColor);
            Array(w, "stopNodeIds", t.stopNodeIds, Int);
            Array(w, "stopCustomNames", t.stopCustomNames, String);
            Array(w, "stopRoadSegments", t.stopRoadSegments, Int);
            Array(w, "legs", t.legs, WriteLeg);
            w.Append('}');
        }

        private static void WriteLeg(StringBuilder w, LegRecord l)
        {
            w.Append('{');
            Field(w, "fromStop", l.fromStop, true);
            Field(w, "toStop", l.toStop);
            Field(w, "segment", l.segment);
            Key(w, "pathUnit", false);
            w.Append(l.pathUnit.ToString(CultureInfo.InvariantCulture));
            Key(w, "pathReady", false);
            w.Append(l.pathReady ? "true" : "false");
            Array(w, "pathSegments", l.pathSegments, Int);
            Array(w, "pathLanes", l.pathLanes, Int);
            Array(w, "pathOffsets", l.pathOffsets, Int);
            w.Append('}');
        }

        private static void WriteArea(StringBuilder w, AreaRecord a)
        {
            w.Append('{');
            Field(w, "id", a.id, true);
            Field(w, "name", a.name);
            Field(w, "flags", a.flags);
            // Solo los parques tienen tipo; en distritos se omite en vez de emitir null.
            if (a.parkType != null) Field(w, "parkType", a.parkType);
            w.Append('}');
        }

        // Un arreglo null (extractor con error) se emite como null, no como [].
        private static void Array<T>(StringBuilder w, string name, T[] items, Action<StringBuilder, T> write, bool first = false)
        {
            Key(w, name, first);
            if (items == null) { w.Append("null"); return; }
            w.Append('[');
            for (int i = 0; i < items.Length; i++)
            {
                if (i > 0) w.Append(',');
                w.Append('\n');
                write(w, items[i]);
            }
            w.Append(']');
        }

        private static void Key(StringBuilder w, string name, bool first)
        {
            if (!first) w.Append(',');
            w.Append('\n');
            String(w, name);
            w.Append(':');
        }

        private static void Field(StringBuilder w, string name, string value, bool first = false)
        {
            Key(w, name, first);
            String(w, value);
        }

        private static void Field(StringBuilder w, string name, int value, bool first = false)
        {
            Key(w, name, first);
            Int(w, value);
        }

        private static void Field(StringBuilder w, string name, long value)
        {
            Key(w, name, false);
            w.Append(value.ToString(CultureInfo.InvariantCulture));
        }

        private static void Field(StringBuilder w, string name, float value)
        {
            Key(w, name, false);
            Float(w, value);
        }

        private static void Float(StringBuilder w, float value)
        {
            if (float.IsNaN(value) || float.IsInfinity(value)) w.Append("null");
            else w.Append(value.ToString("R", CultureInfo.InvariantCulture));
        }

        private static void Int(StringBuilder w, int value)
        {
            w.Append(value.ToString(CultureInfo.InvariantCulture));
        }

        private static void String(StringBuilder w, string value)
        {
            if (value == null) { w.Append("null"); return; }
            w.Append('"');
            foreach (char c in value)
            {
                switch (c)
                {
                    case '"': w.Append("\\\""); break;
                    case '\\': w.Append("\\\\"); break;
                    case '\n': w.Append("\\n"); break;
                    case '\r': w.Append("\\r"); break;
                    case '\t': w.Append("\\t"); break;
                    default:
                        if (c < 0x20) w.Append("\\u").Append(((int)c).ToString("x4"));
                        else w.Append(c);
                        break;
                }
            }
            w.Append('"');
        }
    }

    [Serializable] internal sealed class Snapshot
    {
        public string kind, bridgeVersion, gameVersion, capturedAt, cityName;
        public int snapshotVersion;
        public bool simulationPaused;
        public Payload payload;
        public Diagnostics diagnostics;
    }
    [Serializable] internal sealed class Diagnostics
    {
        public bool complete;
        public List<string> errors = new List<string>();
        public List<string> unsupported = new List<string>();
    }
    [Serializable] internal sealed class Payload
    {
        public Road[] roads;
        public NodeRecord[] roadNodes;
        public TransitRecord[] transit;
        public BuildingRecord[] buildings;
        public AreaRecord[] districts;
        public AreaRecord[] parks;
        public TreeRecord[] vegetation;
        public TerrainRecord terrain;
        public WaterRecord water;
        public TerrainLayerRecord[] terrainLayers;
        public GridRecord resourceGrid;
        public int treeBufferLength;
        public GridRecord districtGrid, parkGrid;
    }
    [Serializable] internal sealed class Road
    {
        public int id, startNode, endNode, nameSeed;
        public string flags, prefab, name;
        public float halfWidth;
        public float[] startDirection, endDirection;
    }
    [Serializable] internal sealed class TreeRecord
    {
        public int id;
        public float x, y, z;
        public string flags, prefab;
    }
    [Serializable] internal sealed class TerrainRecord
    {
        public int resolution;
        public float cellSize, heightScale;
        public string encoding, data;
    }
    [Serializable] internal sealed class TerrainLayerRecord
    {
        public string name;
        public int[] indices, values;
    }
    [Serializable] internal sealed class WaterRecord
    {
        public int resolution;
        public float cellSize, heightScale;
        public uint frameIndex;
        public string encoding, depth;
        public WaterSourceRecord[] sources;
    }
    [Serializable] internal sealed class WaterSourceRecord
    {
        public int id, type;
        public float[] inputPosition, outputPosition;
        public long inputRate, outputRate, target, flow, water;
    }
    [Serializable] internal sealed class GridRecord
    {
        public int resolution;
        public float cellSize;
        public string encoding, layout, data;
    }
    [Serializable] internal sealed class BuildingRecord
    {
        public int id;
        public float x, y, z;
        public string flags, prefab, service, subService, level, name;
    }
    [Serializable] internal sealed class NodeRecord
    {
        public int id;
        public float x, y, z;
        public string flags;
    }
    [Serializable] internal sealed class TransitRecord
    {
        public int id, lineNumber;
        public string flags, transportType, customName, name, color, displayColor;
        public int[] stopNodeIds, stopRoadSegments;
        public string[] stopCustomNames;
        public LegRecord[] legs;
    }
    [Serializable] internal sealed class LegRecord
    {
        public int fromStop, toStop, segment;
        public long pathUnit;
        public bool pathReady;
        public int[] pathSegments, pathLanes, pathOffsets;
    }
    [Serializable] internal sealed class AreaRecord
    {
        public int id;
        public string name, flags, parkType;
    }
}
