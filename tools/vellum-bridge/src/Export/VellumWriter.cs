using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;

// Escritor de .vellummap sin dependencias del juego (docs/es/vellummap-format.md). Corre en un
// hilo aparte con un VellumModel ya copiado; compila en net35/C# 7.3 (mod) y en .NET moderno
// (harness en tools/vellum-bridge/tests), así que solo usa APIs de .NET 3.5.
namespace VellumBridge.Export
{
    // Motivo accionable de una exportación abortada. No se escribe ningún archivo final.
    internal sealed class ExportFailedException : Exception
    {
        public ExportFailedException(string message) : base(message) { }
        public ExportFailedException(string message, Exception inner) : base(message, inner) { }
    }

    internal sealed class WriterOptions
    {
        // Compresor deflate crudo. null = DeflateStream. Si lanza, el módulo va `stored`.
        // Solo el harness lo asigna; el inicializador explícito evita CS0649 en el mod.
        public Func<byte[], byte[]> compress = null;
        // true si el juego está guardando: la exportación se descarta. null = nunca.
        public Func<bool> isSaving;
    }

    internal sealed class ExportSummary
    {
        public string path;
        public long bytes;                                   // -1 si no se pudo medir tras publicar
        public List<string> modules = new List<string>();   // "terrain (deflate)", …
        public List<string> limits = new List<string>();
        public int nodes, segments, lines, stops, buildings, districts, parks;
    }

    internal static class VellumWriter
    {
        public const string ProducerName = "Vellum Bridge";
        public const string FileExtension = ".vellummap";

        private const int TerrainResolution = 1081;
        private const int VegetationResolution = 512;
        private const int AreaResolution = 900;
        private const int VanillaAreaResolution = 512;
        private const int WetDepth = 16;                // mojado = profundidad > 16 (25 cm)
        private const float PointSpacing = 25f;         // metros entre puntos de la curva

        // Una entrada del zip ya preparada: bytes descomprimidos, hash y codec real.
        private sealed class Entry
        {
            public string id, path, grid;               // grid: JSON del objeto `grid` o null
            public byte[] raw, stored;
            public bool deflated;
            public uint crc;
            public string sha256;
        }

        // Exporta el modelo a `folder`. Devuelve el resumen o lanza ExportFailedException.
        public static ExportSummary Export(VellumModel model, string folder, WriterOptions options)
        {
            if (options == null) options = new WriterOptions();
            var summary = new ExportSummary();
            if (IsSaving(options))
                throw new ExportFailedException("Hay un guardado en curso. Inténtalo de nuevo cuando termine.");
            if (model.exportedAtUtc == default(DateTime))
                throw new ExportFailedException("manifest: falta la fecha de exportación (exportedAtUtc).");

            List<Entry> entries = BuildEntries(model, summary);
            string deflateFailure = null;
            var storedModules = new List<string>();
            foreach (Entry entry in entries)
            {
                string reason = Pack(entry, options);
                if (reason == null) continue;
                if (deflateFailure == null) deflateFailure = reason;
                storedModules.Add(entry.id);
            }
            byte[] manifest = Utf8(Manifest(model, entries));
            var manifestEntry = new Entry { id = "manifest", path = "manifest.json", raw = manifest };
            string manifestReason = Pack(manifestEntry, options);
            if (deflateFailure == null) deflateFailure = manifestReason;
            entries.Insert(0, manifestEntry);
            foreach (Entry entry in entries)
                if (entry != manifestEntry) summary.modules.Add(entry.id + " (" + (entry.deflated ? "deflate" : "stored") + ")");
            // El motivo se declara una sola vez, no por módulo.
            if (deflateFailure != null)
                summary.limits.Add("deflate no disponible: " + deflateFailure + "; módulos sin comprimir: "
                    + (storedModules.Count > 0 ? string.Join(", ", storedModules.ToArray()) : "solo manifest.json") + ".");

            Publish(entries, folder, model, options, summary);
            return summary;
        }

        private static bool IsSaving(WriterOptions options)
        {
            return options.isSaving != null && options.isSaving();
        }

        // ─── Módulos ────────────────────────────────────────────────────────────

        private static List<Entry> BuildEntries(VellumModel model, ExportSummary summary)
        {
            var entries = new List<Entry>();
            var limits = summary.limits;
            limits.AddRange(model.limits);

            // Terreno y agua: obligatorios.
            RequireLength("terrain", model.terrain == null ? -1 : model.terrain.Length, TerrainResolution * TerrainResolution);
            RequireLength("water", model.waterDepth == null ? -1 : model.waterDepth.Length, TerrainResolution * TerrainResolution);
            if (!IsFinite(model.seaLevel)) throw new ExportFailedException("water: el nivel del mar no es un número finito.");
            entries.Add(Grid("terrain", "terrain.bin", U16(model.terrain), HeightGrid()));

            var water = new Json();
            water.Open('{').Key("seaLevel").Number(model.seaLevel);
            if (model.simulationPaused)
            {
                water.Key("depth").Open('{').Key("simulationPaused").Bool(true);
                if (model.hasWaterFrameIndex) water.Key("frameIndex").Int(model.waterFrameIndex);
                water.Close('}');
            }
            water.Close('}');
            entries.Add(JsonEntry("water", "water.json", water));

            var mask = new byte[model.waterDepth.Length];
            for (int i = 0; i < mask.Length; i++) mask[i] = model.waterDepth[i] > WetDepth ? (byte)1 : (byte)0;
            entries.Add(Grid("water-mask", "water-mask.bin", mask, GridJson(TerrainResolution, "16", "u8", null)));

            if (model.simulationPaused)
                entries.Add(Grid("water-depth", "water-depth.bin", U16(model.waterDepth), HeightGrid()));
            else
                limits.Add("Profundidad del agua omitida: la simulación estaba en marcha (la máscara de agua sí se exportó). Pausa el juego y exporta de nuevo para incluirla.");

            RequireLength("vegetation", model.vegetation == null ? -1 : model.vegetation.Length, VegetationResolution * VegetationResolution);
            entries.Add(Grid("vegetation", "vegetation.bin", model.vegetation, GridJson(VegetationResolution, "33.75", "u8", null)));

            entries.Add(JsonEntry("roads", "roads.json", Roads(model, summary)));
            entries.Add(JsonEntry("transit", "transit.json", Transit(model, summary)));
            entries.Add(JsonEntry("buildings", "buildings.json", Buildings(model, summary)));
            var districtIds = new Dictionary<int, bool>();
            var parkIds = new Dictionary<int, bool>();
            entries.Add(JsonEntry("districts", "districts.json", Areas("districts", model.districts, districtIds, summary)));
            entries.Add(JsonEntry("parks", "parks.json", Areas("parks", model.parks, parkIds, summary)));
            summary.districts = districtIds.Count;
            summary.parks = parkIds.Count;

            byte[] districtGrid = AreaGridBytes("distritos", model.districtGrid, districtIds, limits);
            if (districtGrid != null)
                entries.Add(Grid("district-grid", "districts.bin", districtGrid, GridJson(AreaResolution, "19.2", "u8x8", null)));
            byte[] parkGrid = AreaGridBytes("parques", model.parkGrid, parkIds, limits);
            if (parkGrid != null)
                entries.Add(Grid("park-grid", "parks.bin", parkGrid, GridJson(AreaResolution, "19.2", "u8x8", null)));

            limits.Add("DLC y mods: no se exportan (la lista de DLC y mods activos no forma parte del documento).");
            return entries;
        }

        private static void RequireLength(string module, int found, int expected)
        {
            if (found == expected) return;
            throw new ExportFailedException(module + ": se esperaban " + expected + " muestras y hay "
                + (found < 0 ? "ninguna" : found.ToString(CultureInfo.InvariantCulture))
                + ". El módulo es obligatorio; la exportación se canceló sin escribir nada.");
        }

        private static string HeightGrid() { return GridJson(TerrainResolution, "16", "u16le", "0.015625"); }

        private static string GridJson(int resolution, string cellSize, string sample, string scale)
        {
            return "{\"resolution\":" + resolution.ToString(CultureInfo.InvariantCulture) + ",\"cellSize\":" + cellSize
                + ",\"sample\":\"" + sample + "\"" + (scale != null ? ",\"scale\":" + scale : "") + "}";
        }

        private static Entry Grid(string id, string path, byte[] raw, string grid)
        {
            return new Entry { id = id, path = path, raw = raw, grid = grid };
        }

        private static Entry JsonEntry(string id, string path, Json json)
        {
            return new Entry { id = id, path = path, raw = Utf8(json.ToString()) };
        }

        private static byte[] U16(ushort[] values)
        {
            var bytes = new byte[values.Length * 2];
            for (int i = 0; i < values.Length; i++)
            {
                bytes[i * 2] = (byte)values[i];
                bytes[i * 2 + 1] = (byte)(values[i] >> 8);
            }
            return bytes;
        }

        private static Json Roads(VellumModel model, ExportSummary summary)
        {
            var json = new Json();
            var declared = new Dictionary<int, bool>();
            int invalidNodes = 0;
            json.Open('{').Key("nodes").Open('[');
            foreach (NodeModel node in model.nodes)
            {
                if (!IsFinite(node.position) || declared.ContainsKey(node.sourceId)) { invalidNodes++; continue; }
                declared[node.sourceId] = true;
                json.Open('{').Key("sourceId").Int(node.sourceId).Key("position").Position(node.position)
                    .Key("elevation").Int(node.elevation).Key("underground").Bool(node.underground).Close('}');
            }
            json.Close(']').Key("segments").Open('[');
            int orphans = 0, invalidSegments = 0;
            var seen = new Dictionary<int, bool>();
            foreach (SegmentModel segment in model.segments)
            {
                if (!declared.ContainsKey(segment.startNode) || !declared.ContainsKey(segment.endNode)) { orphans++; continue; }
                if (seen.ContainsKey(segment.sourceId) || string.IsNullOrEmpty(segment.itemClass)
                    || !IsFinite(segment.width) || segment.width < 0
                    || !IsFinite(segment.a) || !IsFinite(segment.b) || !IsFinite(segment.c) || !IsFinite(segment.d))
                {
                    invalidSegments++;
                    continue;
                }
                seen[segment.sourceId] = true;
                json.Open('{').Key("sourceId").Int(segment.sourceId)
                    .Key("startNodeSourceId").Int(segment.startNode).Key("endNodeSourceId").Int(segment.endNode)
                    .Key("itemClass").String(segment.itemClass).Key("width").Number(segment.width);
                if (!string.IsNullOrEmpty(segment.name)) json.Key("name").String(segment.name);
                json.Key("points").Open('[');
                foreach (Vec3 point in SampleBezier(segment.a, segment.b, segment.c, segment.d)) json.Position(point);
                json.Close(']').Close('}');
            }
            json.Close(']').Close('}');
            summary.nodes = declared.Count;
            summary.segments = seen.Count;
            if (invalidNodes > 0) summary.limits.Add(invalidNodes + " nodos omitidos por posición no finita o id repetido.");
            if (orphans > 0) summary.limits.Add(orphans + " segmentos omitidos porque su nodo de inicio o fin no se exportó.");
            if (invalidSegments > 0) summary.limits.Add(invalidSegments + " segmentos omitidos por datos no válidos (sin itemClass, ancho o curva no finitos, id repetido).");
            return json;
        }

        // Bézier cúbica muestreada cada ~25 m; mínimo 2 puntos, inicio y fin exactos.
        internal static List<Vec3> SampleBezier(Vec3 a, Vec3 b, Vec3 c, Vec3 d)
        {
            const int probe = 16;
            float length = 0;
            Vec3 previous = a;
            for (int i = 1; i <= probe; i++)
            {
                Vec3 next = Bezier(a, b, c, d, i / (float)probe);
                length += Distance(previous, next);
                previous = next;
            }
            // Tope de 4096 pasos: una curva degenerada no puede inflar el documento.
            int steps = Math.Max(1, (int)Math.Min(4096.0, Math.Ceiling(length / PointSpacing)));
            var points = new List<Vec3>(steps + 1);
            points.Add(a);
            for (int i = 1; i < steps; i++) points.Add(Bezier(a, b, c, d, i / (float)steps));
            points.Add(d);
            return points;
        }

        private static Vec3 Bezier(Vec3 a, Vec3 b, Vec3 c, Vec3 d, float t)
        {
            float u = 1 - t;
            float wa = u * u * u, wb = 3 * u * u * t, wc = 3 * u * t * t, wd = t * t * t;
            return new Vec3(wa * a.x + wb * b.x + wc * c.x + wd * d.x,
                wa * a.y + wb * b.y + wc * c.y + wd * d.y,
                wa * a.z + wb * b.z + wc * c.z + wd * d.z);
        }

        private static float Distance(Vec3 p, Vec3 q)
        {
            float dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z;
            return (float)Math.Sqrt(dx * dx + dy * dy + dz * dz);
        }

        private static Json Transit(VellumModel model, ExportSummary summary)
        {
            // Primero se decide qué se emite: líneas con tipo y sin id repetido, y paradas con
            // posición finita. Solo esas cuentan para numerar, así no quedan huecos («Main St 1,
            // Main St 3») por paradas que luego se descartan.
            var emitted = new List<LineModel>();
            var seen = new Dictionary<int, bool>();
            int invalidLines = 0, invalidStops = 0;
            foreach (LineModel line in model.lines)
            {
                if (seen.ContainsKey(line.sourceId) || string.IsNullOrEmpty(line.transportType)) { invalidLines++; continue; }
                seen[line.sourceId] = true;
                emitted.Add(line);
                foreach (StopModel stop in line.stops)
                    if (!IsFinite(stop.position)) invalidStops++;
            }

            // Regla de nombres (vellummap-format.md, «Nombres de parada»): se agrupan todas las
            // paradas emitidas sin nombre de mod por nombre exacto de calle; varias en la misma
            // calle se numeran desde 1 por sourceId ascendente del nodo.
            var byStreet = new Dictionary<string, List<int>>(StringComparer.Ordinal);
            foreach (LineModel line in emitted)
                foreach (StopModel stop in line.stops)
                {
                    if (!IsFinite(stop.position) || !string.IsNullOrEmpty(stop.customName) || string.IsNullOrEmpty(stop.streetName)) continue;
                    List<int> ids;
                    if (!byStreet.TryGetValue(stop.streetName, out ids)) byStreet[stop.streetName] = ids = new List<int>();
                    if (!ids.Contains(stop.sourceId)) ids.Add(stop.sourceId);
                }
            foreach (List<int> ids in byStreet.Values) ids.Sort();

            var json = new Json();
            int unnamed = 0;
            json.Open('{').Key("lines").Open('[');
            foreach (LineModel line in emitted)
            {
                json.Open('{').Key("sourceId").Int(line.sourceId).Key("name").String(line.name ?? "")
                    .Key("transportType").String(line.transportType)
                    .Key("color").String("#" + Hex(line.r) + Hex(line.g) + Hex(line.b) + Hex(line.alpha))
                    .Key("stops").Open('[');
                foreach (StopModel stop in line.stops)
                {
                    if (!IsFinite(stop.position)) continue;
                    summary.stops++;
                    json.Open('{').Key("sourceId").Int(stop.sourceId).Key("position").Position(stop.position);
                    if (!string.IsNullOrEmpty(stop.customName))
                        json.Key("name").String(stop.customName).Key("nameDerived").Bool(false);
                    else if (!string.IsNullOrEmpty(stop.streetName))
                    {
                        List<int> ids = byStreet[stop.streetName];
                        string name = ids.Count == 1 ? stop.streetName
                            : stop.streetName + " " + (ids.IndexOf(stop.sourceId) + 1).ToString(CultureInfo.InvariantCulture);
                        json.Key("name").String(name).Key("nameDerived").Bool(true);
                    }
                    else unnamed++;
                    json.Close('}');
                }
                json.Close(']').Key("route").Open('[');
                foreach (int segment in line.route) json.Int(segment);
                json.Close(']').Close('}');
            }
            json.Close(']').Close('}');
            summary.lines = emitted.Count;
            if (unnamed > 0) summary.limits.Add(unnamed + " paradas sin calle con nombre: se exportan sin nombre.");
            if (invalidStops > 0) summary.limits.Add(invalidStops + " paradas omitidas por posición no finita.");
            if (invalidLines > 0) summary.limits.Add(invalidLines + " líneas omitidas por tipo de transporte desconocido o id repetido.");
            return json;
        }

        private static string Hex(byte value) { return value.ToString("X2", CultureInfo.InvariantCulture); }

        private static Json Buildings(VellumModel model, ExportSummary summary)
        {
            var json = new Json();
            var seen = new Dictionary<int, bool>();
            int invalid = 0;
            json.Open('{').Key("buildings").Open('[');
            foreach (BuildingModel building in model.buildings)
            {
                if (seen.ContainsKey(building.sourceId) || !IsFinite(building.position) || !IsFinite(building.angle))
                {
                    invalid++;
                    continue;
                }
                seen[building.sourceId] = true;
                json.Open('{').Key("sourceId").Int(building.sourceId).Key("name").String(building.name ?? "")
                    .Key("itemClass").String(building.itemClass ?? "").Key("serviceType").String(building.serviceType ?? "")
                    .Key("footprint").Open('[');
                foreach (Vec3 corner in Footprint(building.position, building.angle, building.width, building.length))
                    json.Position(corner);
                json.Close(']').Close('}');
            }
            json.Close(']').Close('}');
            summary.buildings = seen.Count;
            if (invalid > 0) summary.limits.Add(invalid + " edificios omitidos por posición o ángulo no finitos o id repetido.");
            return json;
        }

        // Convención de CS1: a = (cos θ, 0, sin θ)·8, b = (a.z, 0, −a.x); esquinas p ± a·w/2 ± b·l/2,
        // empezando por p − a·w/2 − b·l/2 (el ancla).
        internal static Vec3[] Footprint(Vec3 p, float angle, int width, int length)
        {
            float ax = (float)Math.Cos(angle) * 8f, az = (float)Math.Sin(angle) * 8f;
            float bx = az, bz = -ax;
            float hw = width * 0.5f, hl = length * 0.5f;
            return new[]
            {
                new Vec3(p.x - ax * hw - bx * hl, p.y, p.z - az * hw - bz * hl),
                new Vec3(p.x + ax * hw - bx * hl, p.y, p.z + az * hw - bz * hl),
                new Vec3(p.x + ax * hw + bx * hl, p.y, p.z + az * hw + bz * hl),
                new Vec3(p.x - ax * hw + bx * hl, p.y, p.z - az * hw + bz * hl),
            };
        }

        private static Json Areas(string module, List<AreaModel> areas, Dictionary<int, bool> ids, ExportSummary summary)
        {
            var json = new Json();
            int invalid = 0;
            json.Open('{').Key(module).Open('[');
            foreach (AreaModel area in areas)
            {
                if (ids.ContainsKey(area.sourceId) || !IsFinite(area.labelPosition)) { invalid++; continue; }
                ids[area.sourceId] = true;
                json.Open('{').Key("sourceId").Int(area.sourceId).Key("name").String(area.name ?? "")
                    .Key("labelPosition").Position(area.labelPosition);
                if (!string.IsNullOrEmpty(area.parkType)) json.Key("parkType").String(area.parkType);
                json.Close('}');
            }
            json.Close(']').Close('}');
            if (invalid > 0) summary.limits.Add(invalid + " " + module + " omitidos por etiqueta no finita o id repetido.");
            return json;
        }

        // Grilla de áreas a 900² (la del documento). La vanilla de 512² se centra con ceros; otra
        // resolución, o ids que el módulo JSON no declara, dejan el módulo fuera con su límite.
        internal static byte[] AreaGridBytes(string what, AreaGrid grid, Dictionary<int, bool> ids, List<string> limits)
        {
            if (grid == null || grid.cells == null)
            {
                limits.Add("Grilla de " + what + " omitida: no se pudo leer.");
                return null;
            }
            if (grid.cells.Length != grid.resolution * grid.resolution * 8)
            {
                limits.Add("Grilla de " + what + " omitida: su tamaño no corresponde a " + grid.resolution + "².");
                return null;
            }
            if (grid.resolution != AreaResolution && grid.resolution != VanillaAreaResolution)
            {
                limits.Add("Grilla de " + what + " omitida: resolución " + grid.resolution + "² no soportada (se esperaba 512² o 900²).");
                return null;
            }
            foreach (int id in ids.Keys)
                if (id < 1 || id > 255)
                {
                    limits.Add("Grilla de " + what + " omitida: el área " + id + " no cabe en un byte (1–255).");
                    return null;
                }
            // CS1 deja en las ranuras sin peso el id de áreas ya borradas (Costa Tijuca: ids 1–3 en
            // ~800 000 celdas, todas con alpha 0). El contrato pide 0 en las ranuras sin uso, así que
            // esas se limpian; un id desconocido con peso sí deja la grilla fuera.
            byte[] cells = (byte[])grid.cells.Clone();
            int cleared = 0;
            for (int i = 0; i < cells.Length; i += 8)
                for (int k = 0; k < 4; k++)
                {
                    byte id = cells[i + k];
                    if (id == 0 || ids.ContainsKey(id)) continue;
                    if (cells[i + 4 + k] != 0)
                    {
                        limits.Add("Grilla de " + what + " omitida: la celda " + (i / 8) + " nombra con peso el área " + id + ", que no se exportó.");
                        return null;
                    }
                    cells[i + k] = 0;
                    cleared++;
                }
            if (cleared > 0)
                limits.Add("Grilla de " + what + ": " + cleared + " ranuras sin peso con ids de áreas inexistentes se escribieron como 0.");

            if (grid.resolution == AreaResolution) return cells;
            // Mismo tamaño de celda (19,2 m) y ambas centradas en el origen: la de 512² ocupa las
            // celdas 194..705 de la de 900².
            const int offset = (AreaResolution - VanillaAreaResolution) / 2;
            var padded = new byte[AreaResolution * AreaResolution * 8];
            for (int row = 0; row < VanillaAreaResolution; row++)
                Buffer.BlockCopy(cells, row * VanillaAreaResolution * 8, padded,
                    ((row + offset) * AreaResolution + offset) * 8, VanillaAreaResolution * 8);
            limits.Add("Grilla de " + what + " rellenada desde 512² (vanilla) a 900²: fuera de los 25 tiles centrales no hay áreas.");
            return padded;
        }

        // ─── Manifest ───────────────────────────────────────────────────────────

        private static string Manifest(VellumModel model, List<Entry> entries)
        {
            if (string.IsNullOrEmpty(model.snapshotId)) throw new ExportFailedException("manifest: falta snapshotId.");
            var json = new Json();
            json.Open('{').Key("format").String("vellummap").Key("exportSchemaVersion").String("1.0")
                .Key("snapshotId").String(model.snapshotId)
                .Key("exportedAtUtc").String(Utc(model.exportedAtUtc).ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture));
            if (!string.IsNullOrEmpty(model.gameTime)) json.Key("gameTime").String(model.gameTime);
            json.Key("game").Open('{').Key("version").String(string.IsNullOrEmpty(model.gameVersion) ? "unknown" : model.gameVersion);
            if (!string.IsNullOrEmpty(model.gameInstanceId)) json.Key("instanceId").String(model.gameInstanceId);
            json.Close('}')
                .Key("producer").Open('{').Key("name").String(ProducerName)
                .Key("version").String(string.IsNullOrEmpty(model.producerVersion) ? "unknown" : model.producerVersion).Close('}')
                .Key("city").Open('{').Key("name").String(string.IsNullOrEmpty(model.cityName) ? "Sin nombre" : model.cityName).Close('}')
                .Key("modules").Open('[');
            foreach (Entry entry in entries)
            {
                json.Open('{').Key("id").String(entry.id).Key("path").String(entry.path).Key("version").String("1.0")
                    .Key("codec").String(entry.deflated ? "deflate" : "stored").Key("sha256").String(entry.sha256);
                if (entry.grid != null) json.Key("grid").Raw(entry.grid);
                json.Close('}');
            }
            json.Close(']').Close('}');
            return json.ToString();
        }

        // ─── Codec, hash y zip ─────────────────────────────────────────────────

        // Devuelve null si el módulo quedó en deflate, o el motivo por el que va `stored`.
        private static string Pack(Entry entry, WriterOptions options)
        {
            entry.crc = Crc32(entry.raw);
            entry.sha256 = Sha256Hex(entry.raw);
            entry.stored = entry.raw;
            entry.deflated = false;
            try
            {
                byte[] compressed = options.compress != null ? options.compress(entry.raw) : Deflate(entry.raw);
                // El Mono de CS1 puede no traer zlib: si DeflateStream lanza o no reproduce los
                // bytes, el módulo se guarda sin comprimir y el manifest lo declara `stored`.
                if (compressed == null || !Inflates(compressed, entry.raw))
                    return "el deflate no reproduce los bytes originales";
                entry.stored = compressed;
                entry.deflated = true;
                return null;
            }
            catch (Exception error) { return error.GetType().Name + ": " + Reason(error); }
        }

        private static byte[] Deflate(byte[] raw)
        {
            using (var buffer = new MemoryStream())
            {
                using (var deflate = new DeflateStream(buffer, CompressionMode.Compress, true))
                    deflate.Write(raw, 0, raw.Length);
                return buffer.ToArray();
            }
        }

        private static bool Inflates(byte[] compressed, byte[] expected)
        {
            using (var input = new MemoryStream(compressed))
            using (var inflate = new DeflateStream(input, CompressionMode.Decompress))
            {
                var chunk = new byte[64 * 1024];
                int at = 0;
                int read;
                while ((read = inflate.Read(chunk, 0, chunk.Length)) > 0)
                {
                    if (at + read > expected.Length) return false;
                    for (int i = 0; i < read; i++)
                        if (chunk[i] != expected[at + i]) return false;
                    at += read;
                }
                return at == expected.Length;
            }
        }

        private static void Publish(List<Entry> entries, string folder, VellumModel model, WriterOptions options, ExportSummary summary)
        {
            string target, part;
            try
            {
                Directory.CreateDirectory(folder);
                target = UniqueTarget(folder, model);
            }
            catch (Exception error)
            {
                throw new ExportFailedException("No se pudo preparar la carpeta " + folder + ": " + Reason(error)
                    + ". Comprueba que existe y que tienes permiso de escritura.", error);
            }
            part = target + ".part";
            try
            {
                using (var stream = new FileStream(part, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                    WriteZip(stream, entries, model.exportedAtUtc);
                if (IsSaving(options))
                    throw new ExportFailedException("Comenzó un guardado durante la exportación: se descartó. Inténtalo de nuevo cuando termine.");
                File.Move(part, target);
            }
            catch (ExportFailedException) { throw; }
            catch (Exception error)
            {
                throw new ExportFailedException("No se pudo escribir " + target + ": " + Reason(error)
                    + ". Comprueba el espacio libre y los permisos de la carpeta.", error);
            }
            finally
            {
                try { if (File.Exists(part)) File.Delete(part); }
                catch (Exception) { }
            }
            // Publicado: la ruta se fija antes de cualquier otra cosa que pueda fallar.
            summary.path = target;
            try { summary.bytes = new FileInfo(target).Length; }
            catch (Exception) { summary.bytes = -1; }
        }

        private static string Reason(Exception error) { return error.Message.TrimEnd('.', ' '); }

        private static string UniqueTarget(string folder, VellumModel model)
        {
            string stem = SafeFileName(model.cityName) + " " + Utc(model.exportedAtUtc)
                .ToString("yyyy-MM-dd HHmmss", CultureInfo.InvariantCulture);
            string target = Path.Combine(folder, stem + FileExtension);
            for (int n = 2; File.Exists(target) || File.Exists(target + ".part") || Directory.Exists(target); n++)
                target = Path.Combine(folder, stem + " (" + n.ToString(CultureInfo.InvariantCulture) + ")" + FileExtension);
            return target;
        }

        internal static string SafeFileName(string name)
        {
            var result = new StringBuilder();
            if (name != null)
                foreach (char c in name)
                    result.Append(c < 0x20 || "<>:\"/\\|?*".IndexOf(c) >= 0 ? '_' : c);
            string clean = result.ToString().Trim().TrimEnd('.');
            if (clean.Length > 80)
            {
                // Sin partir un par sustituto (emoji, CJK extendido) en el corte.
                int cut = char.IsHighSurrogate(clean[79]) ? 79 : 80;
                clean = clean.Substring(0, cut).Trim().TrimEnd('.');
            }
            if (clean.Length == 0) return "Ciudad";
            return IsReservedWindowsName(clean) ? clean + "_" : clean;
        }

        // CON, PRN, AUX, NUL, COM1–9 y LPT1–9 están reservados en Windows, con o sin extensión.
        private static bool IsReservedWindowsName(string name)
        {
            int dot = name.IndexOf('.');
            string stem = (dot >= 0 ? name.Substring(0, dot) : name).TrimEnd(' ').ToUpperInvariant();
            if (stem == "CON" || stem == "PRN" || stem == "AUX" || stem == "NUL") return true;
            return stem.Length == 4 && (stem.StartsWith("COM", StringComparison.Ordinal) || stem.StartsWith("LPT", StringComparison.Ordinal))
                && stem[3] >= '1' && stem[3] <= '9';
        }

        private static void WriteZip(Stream stream, List<Entry> entries, DateTime when)
        {
            DateTime utc = Utc(when);
            ushort dosTime = (ushort)((utc.Hour << 11) | (utc.Minute << 5) | (utc.Second / 2));
            // La fecha DOS solo representa 1980–2107.
            ushort dosDate = (ushort)(((Math.Min(Math.Max(utc.Year, 1980), 2107) - 1980) << 9) | (utc.Month << 5) | utc.Day);
            var writer = new BinaryWriter(stream);
            var offsets = new long[entries.Count];
            for (int i = 0; i < entries.Count; i++)
            {
                Entry e = entries[i];
                offsets[i] = stream.Position;
                byte[] name = Encoding.ASCII.GetBytes(e.path);
                writer.Write(0x04034b50u);
                writer.Write((ushort)20);                    // versión necesaria
                writer.Write((ushort)0);                     // flags
                writer.Write((ushort)(e.deflated ? 8 : 0));  // método
                writer.Write(dosTime);
                writer.Write(dosDate);
                writer.Write(e.crc);
                writer.Write(checked((uint)e.stored.Length));
                writer.Write(checked((uint)e.raw.Length));
                writer.Write((ushort)name.Length);
                writer.Write((ushort)0);                     // extra
                writer.Write(name);
                writer.Write(e.stored);
            }
            long directory = stream.Position;
            for (int i = 0; i < entries.Count; i++)
            {
                Entry e = entries[i];
                byte[] name = Encoding.ASCII.GetBytes(e.path);
                writer.Write(0x02014b50u);
                writer.Write((ushort)20);                    // versión que lo creó
                writer.Write((ushort)20);                    // versión necesaria
                writer.Write((ushort)0);
                writer.Write((ushort)(e.deflated ? 8 : 0));
                writer.Write(dosTime);
                writer.Write(dosDate);
                writer.Write(e.crc);
                writer.Write(checked((uint)e.stored.Length));
                writer.Write(checked((uint)e.raw.Length));
                writer.Write((ushort)name.Length);
                writer.Write((ushort)0);                     // extra
                writer.Write((ushort)0);                     // comentario
                writer.Write((ushort)0);                     // disco
                writer.Write((ushort)0);                     // atributos internos
                writer.Write(0u);                            // atributos externos
                writer.Write(checked((uint)offsets[i]));
                writer.Write(name);
            }
            long end = stream.Position;
            writer.Write(0x06054b50u);
            writer.Write((ushort)0);
            writer.Write((ushort)0);
            writer.Write((ushort)entries.Count);
            writer.Write((ushort)entries.Count);
            writer.Write(checked((uint)(end - directory)));
            writer.Write(checked((uint)directory));
            writer.Write((ushort)0);
            writer.Flush();
        }

        private static uint[] crcTable;

        internal static uint Crc32(byte[] data)
        {
            uint[] table = crcTable;
            if (table == null)
            {
                table = new uint[256];
                for (uint n = 0; n < 256; n++)
                {
                    uint c = n;
                    for (int k = 0; k < 8; k++) c = (c & 1) != 0 ? 0xEDB88320u ^ (c >> 1) : c >> 1;
                    table[n] = c;
                }
                crcTable = table;
            }
            uint crc = 0xFFFFFFFFu;
            for (int i = 0; i < data.Length; i++) crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >> 8);
            return crc ^ 0xFFFFFFFFu;
        }

        internal static string Sha256Hex(byte[] data)
        {
            byte[] hash;
            using (SHA256 sha = SHA256.Create()) hash = sha.ComputeHash(data);
            var hex = new StringBuilder(64);
            foreach (byte b in hash) hex.Append(b.ToString("x2", CultureInfo.InvariantCulture));
            return hex.ToString();
        }

        // Un DateTime sin Kind se interpreta como UTC, no como hora local.
        private static DateTime Utc(DateTime value)
        {
            return value.Kind == DateTimeKind.Local ? value.ToUniversalTime() : DateTime.SpecifyKind(value, DateTimeKind.Utc);
        }

        private static byte[] Utf8(string text) { return new UTF8Encoding(false).GetBytes(text); }

        private static bool IsFinite(float value) { return !float.IsNaN(value) && !float.IsInfinity(value); }

        private static bool IsFinite(Vec3 v) { return IsFinite(v.x) && IsFinite(v.y) && IsFinite(v.z); }

        // JSON mínimo y estricto: nunca emite null ni números no finitos.
        private sealed class Json
        {
            private readonly StringBuilder text = new StringBuilder();
            private bool needsComma;

            public override string ToString() { return text.ToString(); }

            private void Separate()
            {
                if (needsComma) text.Append(',');
                needsComma = true;
            }

            public Json Open(char bracket) { Separate(); text.Append(bracket); needsComma = false; return this; }
            public Json Close(char bracket) { text.Append(bracket); needsComma = true; return this; }

            public Json Key(string name)
            {
                Separate();
                Quote(name);
                text.Append(':');
                needsComma = false;
                return this;
            }

            public Json Int(long value) { Separate(); text.Append(value.ToString(CultureInfo.InvariantCulture)); return this; }
            public Json Bool(bool value) { Separate(); text.Append(value ? "true" : "false"); return this; }
            public Json Raw(string json) { Separate(); text.Append(json); return this; }
            public Json String(string value) { Separate(); Quote(value); return this; }

            public Json Number(float value)
            {
                if (!IsFinite(value)) throw new ExportFailedException("Valor numérico no finito en el documento.");
                Separate();
                text.Append(value.ToString("R", CultureInfo.InvariantCulture));
                return this;
            }

            public Json Position(Vec3 p)
            {
                return Open('{').Key("x").Number(p.x).Key("y").Number(p.y).Key("z").Number(p.z).Close('}');
            }

            private void Quote(string value)
            {
                text.Append('"');
                foreach (char c in value)
                {
                    switch (c)
                    {
                        case '"': text.Append("\\\""); break;
                        case '\\': text.Append("\\\\"); break;
                        case '\n': text.Append("\\n"); break;
                        case '\r': text.Append("\\r"); break;
                        case '\t': text.Append("\\t"); break;
                        default:
                            if (c < 0x20) text.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                            else text.Append(c);
                            break;
                    }
                }
                text.Append('"');
            }
        }
    }
}
