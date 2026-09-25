using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Text.Json;
using VellumBridge.Export;

// Harness del escritor .vellummap fuera de CS1 (Story 5.3). Comprueba la matriz de la spec con un
// modelo sintético y deja en <salida> deflate, stored y filtered.vellummap para validarlos con el
// lector Rust:
//   dotnet run --project tools/vellum-bridge/tests -- $TMPDIR/vb
//   cargo run -p parser-cslmap --example validate_vellummap -- $TMPDIR/vb/deflate.vellummap
namespace VellumBridge.Tests
{
    internal static class Program
    {
        private const int Terrain = 1081 * 1081;
        private static int failures;

        private static int Main(string[] args)
        {
            if (args.Length != 1)
            {
                Console.Error.WriteLine("uso: dotnet run --project tools/vellum-bridge/tests -- <carpeta de salida>");
                return 2;
            }
            string output = Path.GetFullPath(args[0]);
            Directory.CreateDirectory(output);
            string scratch = Path.Combine(output, "cases");
            if (Directory.Exists(scratch)) Directory.Delete(scratch, true);
            Directory.CreateDirectory(scratch);

            Checksums();
            Geometry();
            AreaGrids();
            StopNamesAndDepth(Path.Combine(scratch, "paused"));
            RunningOmitsDepth(Path.Combine(scratch, "running"));
            ForcedStored(Path.Combine(scratch, "stored"));
            NumberingSkipsNonFinite(Path.Combine(scratch, "numbering"));
            ExportSummary filtered = InvalidRecordsFiltered(Path.Combine(scratch, "filtered"));
            File.Copy(filtered.path, Path.Combine(output, "filtered.vellummap"), true);
            Failures(scratch);

            // Archivos sintéticos para el lector Rust: deflate (en pausa, con profundidad) y
            // stored (simulación en marcha, sin profundidad).
            ExportSummary deflate = Publish(Model(true), Path.Combine(scratch, "final-deflate"), null, Path.Combine(output, "deflate.vellummap"));
            ExportSummary stored = Publish(Model(false), Path.Combine(scratch, "final-stored"), Throwing, Path.Combine(output, "stored.vellummap"));
            Check(deflate.modules.Contains("terrain (deflate)"), "deflate.vellummap usa deflate");
            Check(stored.modules.Contains("terrain (stored)"), "stored.vellummap usa stored");
            Directory.Delete(scratch, true);

            // Conteos del modelo, para compararlos con los que imprime validate_vellummap.
            Expected("deflate.vellummap y stored.vellummap", deflate);
            Expected("filtered.vellummap", filtered);
            if (failures > 0)
            {
                Console.Error.WriteLine(failures + " aserciones fallidas");
                return 1;
            }
            Console.WriteLine("OK: aserciones superadas; escritos deflate.vellummap, stored.vellummap y filtered.vellummap en " + output);
            return 0;
        }

        // ─── Modelo sintético ────────────────────────────────────────────────────

        private static VellumModel Model(bool paused)
        {
            var m = new VellumModel
            {
                snapshotId = Guid.NewGuid().ToString(),
                exportedAtUtc = new DateTime(2026, 9, 23, 14, 5, 0, DateTimeKind.Utc),
                gameTime = "2031-05-17T08:00:00",
                gameVersion = "1.21.1-f9",
                gameInstanceId = "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
                producerVersion = "0.6.0-experimental",
                cityName = "Harness: City/Test",
                seaLevel = 40f,
                simulationPaused = paused,
                hasWaterFrameIndex = true,
                waterFrameIndex = 123456,
            };
            m.terrain = new ushort[Terrain];
            m.waterDepth = new ushort[Terrain];
            for (int i = 0; i < Terrain; i++)
            {
                int row = i / 1081, col = i % 1081;
                m.terrain[i] = (ushort)(64 * 60 + row + col);
                // Un lago en el centro; en su borde, profundidades 16 (seco) y 17 (mojado).
                if (row >= 500 && row < 580 && col >= 500 && col < 580) m.waterDepth[i] = 640;
                else if (row == 499 && col >= 500 && col < 580) m.waterDepth[i] = (ushort)(col % 2 == 0 ? 16 : 17);
            }
            m.vegetation = new byte[512 * 512];
            for (int i = 0; i < m.vegetation.Length; i++) m.vegetation[i] = (byte)(i % 7 == 0 ? 200 : 0);

            for (int id = 1; id <= 5; id++)
                m.nodes.Add(new NodeModel { sourceId = id, position = new Vec3(id * 100f, 70f, 0f), elevation = (byte)(id == 3 ? 12 : 0), underground = id == 5 });
            m.segments.Add(Straight(10, 1, 2, "Small Road", 16f));
            m.segments.Add(Straight(11, 2, 3, "Medium Road", 32f));
            m.segments.Add(Straight(12, 3, 4, "Water Pipe", 2f)); // red no vial: se exporta igual
            m.segments.Add(new SegmentModel
            {
                sourceId = 13, startNode = 4, endNode = 5, itemClass = "Small Road", width = 16f,
                a = new Vec3(400, 70, 0), b = new Vec3(430, 70, 20), c = new Vec3(470, 70, 20), d = new Vec3(500, 70, 0),
            });

            var bus = new LineModel { sourceId = 4, name = "Bus Line 4", transportType = "Bus", r = 0xFF, g = 0x66, b = 0x00, alpha = 0xFF };
            bus.stops.Add(Stop(30, "Main St", null));
            bus.stops.Add(Stop(10, "Main St", null));
            bus.stops.Add(Stop(5, "Oak Ave", null));
            bus.stops.Add(Stop(7, null, null));
            bus.stops.Add(Stop(8, "Main St", "Central Station"));
            bus.route.AddRange(new[] { 10, 11, 99 });
            var metro = new LineModel { sourceId = 6, name = "Metro Line 1", transportType = "Metro", r = 0x12, g = 0xab, b = 0x34, alpha = 0xFF };
            metro.stops.Add(Stop(20, "Main St", null));
            metro.route.Add(12);
            m.lines.Add(bus);
            m.lines.Add(metro);

            m.buildings.Add(new BuildingModel { sourceId = 36, name = "EU LD 15A", itemClass = "Low Residential - Level2", serviceType = "ResidentialLow", position = new Vec3(841.8f, 206.7f, 2459.1f), angle = 0f, width = 4, length = 4 });
            m.buildings.Add(new BuildingModel { sourceId = 40, name = "Water Pipe Junction", itemClass = "Water Pipe", serviceType = "None", position = new Vec3(10f, 60f, 10f), angle = 1.2f, width = 1, length = 1 });

            m.districts.Add(new AreaModel { sourceId = 1, name = "Downtown", labelPosition = new Vec3(0, 0, 0) });
            m.districts.Add(new AreaModel { sourceId = 2, name = "Harbor", labelPosition = new Vec3(500, 0, 500) });
            m.parks.Add(new AreaModel { sourceId = 3, name = "City Zoo", labelPosition = new Vec3(-50, 0, -50), parkType = "Zoo" });
            m.parks.Add(new AreaModel { sourceId = 4, name = "Old Park", labelPosition = new Vec3(0, 0, 0) });

            m.districtGrid = new AreaGrid { resolution = 512, cells = new byte[512 * 512 * 8] };
            SetCell(m.districtGrid, 0, 0, 1, 255);
            SetCell(m.districtGrid, 511, 511, 2, 128);
            m.parkGrid = new AreaGrid { resolution = 900, cells = new byte[900 * 900 * 8] };
            SetCell(m.parkGrid, 450, 450, 3, 255);
            m.limits.Add("límite del extractor (sintético)");
            return m;
        }

        private static SegmentModel Straight(int id, int from, int to, string itemClass, float width)
        {
            var a = new Vec3(from * 100f, 70f, 0f);
            var d = new Vec3(to * 100f, 70f, 0f);
            return new SegmentModel
            {
                sourceId = id, startNode = from, endNode = to, itemClass = itemClass, width = width,
                a = a, b = new Vec3(a.x + 33.3f, 70f, 0f), c = new Vec3(d.x - 33.3f, 70f, 0f), d = d,
            };
        }

        private static StopModel Stop(int id, string street, string custom)
        {
            return new StopModel { sourceId = id, position = new Vec3(id, 70f, id), streetName = street, customName = custom };
        }

        private static void SetCell(AreaGrid grid, int row, int col, byte id, byte alpha)
        {
            int o = (row * grid.resolution + col) * 8;
            grid.cells[o] = id;
            grid.cells[o + 4] = alpha;
        }

        private static byte[] Throwing(byte[] raw) { throw new InvalidOperationException("DeflateStream no disponible (simulado)"); }

        // ─── Casos ──────────────────────────────────────────────────────────────

        private static void Expected(string label, ExportSummary s)
        {
            Console.WriteLine("expected " + label + ": roadNodes=" + s.nodes + " roadSegments=" + s.segments
                + " transitLines=" + s.lines + " stops=" + s.stops + " buildings=" + s.buildings
                + " districts=" + s.districts + " parks=" + s.parks);
        }

        private static void Checksums()
        {
            Check(VellumWriter.Crc32(System.Text.Encoding.ASCII.GetBytes("123456789")) == 0xCBF43926u, "CRC32 de referencia");
            Check(VellumWriter.Sha256Hex(new byte[0]) == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "SHA-256 de vacío");
        }

        private static void Geometry()
        {
            List<Vec3> longOne = VellumWriter.SampleBezier(new Vec3(0, 0, 0), new Vec3(33.3f, 0, 0), new Vec3(66.6f, 0, 0), new Vec3(100, 0, 0));
            Check(longOne.Count == 5, "Bézier de 100 m: 5 puntos (cada 25 m), hay " + longOne.Count);
            Check(longOne[0].x == 0 && longOne[longOne.Count - 1].x == 100, "Bézier: inicio y fin exactos");
            List<Vec3> shortOne = VellumWriter.SampleBezier(new Vec3(0, 0, 0), new Vec3(3, 0, 0), new Vec3(6, 0, 0), new Vec3(10, 0, 0));
            Check(shortOne.Count == 2, "Bézier corta: mínimo 2 puntos");

            Vec3[] corners = VellumWriter.Footprint(new Vec3(100, 50, 200), 0f, 4, 2);
            // θ = 0: a = (8,0,0), b = (0,0,−8); ancla = p − a·2 − b·1 = (84, 50, 208).
            Check(Near(corners[0], 84, 50, 208), "Footprint: ancla p − a·w/2 − b·l/2");
            Check(Near(corners[2], 116, 50, 192), "Footprint: esquina opuesta p + a·w/2 + b·l/2");
            Check(VellumWriter.SafeFileName(" a<b>:c/d\\e|f?g*h. ") == "a_b__c_d_e_f_g_h", "Nombre de archivo saneado");
            Check(VellumWriter.SafeFileName(null) == "Ciudad", "Nombre de archivo por defecto");
            Check(VellumWriter.SafeFileName("con") == "con_" && VellumWriter.SafeFileName("COM3") == "COM3_"
                && VellumWriter.SafeFileName("LPT9.city") == "LPT9.city_" && VellumWriter.SafeFileName("COM0") == "COM0"
                && VellumWriter.SafeFileName("Console") == "Console", "Nombres reservados de Windows");
            string emoji = new string('a', 79) + "\U0001F30A" + "tail";
            string cut = VellumWriter.SafeFileName(emoji);
            Check(cut.Length == 79 && !char.IsHighSurrogate(cut[cut.Length - 1]), "Corte a 80 sin partir un par sustituto");
            Check(VellumWriter.SafeFileName(new string('a', 78) + "\U0001F30A" + "tail").Length == 80, "Par sustituto completo dentro del límite");
            List<Vec3> huge = VellumWriter.SampleBezier(new Vec3(0, 0, 0), new Vec3(1e9f, 0, 0), new Vec3(2e9f, 0, 0), new Vec3(3e9f, 0, 0));
            Check(huge.Count == 4097, "Bézier: tope de 4096 pasos, hay " + huge.Count);
        }

        private static void AreaGrids()
        {
            var ids = new Dictionary<int, bool> { { 1, true } };
            var limits = new List<string>();
            var odd = new AreaGrid { resolution = 256, cells = new byte[256 * 256 * 8] };
            Check(VellumWriter.AreaGridBytes("distritos", odd, ids, limits) == null, "Grilla 256²: módulo omitido");
            Check(limits.Count == 1 && limits[0].Contains("256"), "Grilla 256²: límite declarado");

            limits.Clear();
            var unknown = new AreaGrid { resolution = 900, cells = new byte[900 * 900 * 8] };
            unknown.cells[8] = 9;
            unknown.cells[12] = 200;
            Check(VellumWriter.AreaGridBytes("distritos", unknown, ids, limits) == null && limits.Count == 1,
                "Grilla con un id no declarado con peso: módulo omitido con límite");

            // Costa Tijuca: ids de áreas borradas en ranuras sin peso → se escriben como 0.
            limits.Clear();
            var stale = new AreaGrid { resolution = 900, cells = new byte[900 * 900 * 8] };
            stale.cells[0] = 1; stale.cells[4] = 255;   // ranura 1: área viva con peso
            stale.cells[1] = 3;                          // ranura 2: área borrada, alpha 0
            byte[] cleaned = VellumWriter.AreaGridBytes("distritos", stale, ids, limits);
            Check(cleaned != null && cleaned[0] == 1 && cleaned[4] == 255 && cleaned[1] == 0,
                "Ranura sin peso con id inexistente: se escribe 0 y la grilla se conserva");
            Check(stale.cells[1] == 3, "La limpieza no modifica el modelo");
            Check(limits.Count == 1 && limits[0].Contains("1 ranuras"), "Ranuras limpiadas declaradas como límite");

            limits.Clear();
            Check(VellumWriter.AreaGridBytes("parques", null, ids, limits) == null && limits.Count == 1,
                "Grilla ilegible: módulo omitido con límite");
        }

        private static void StopNamesAndDepth(string folder)
        {
            ExportSummary summary = VellumWriter.Export(Model(true), folder, null);
            using (ZipArchive zip = ZipFile.OpenRead(summary.path))
            {
                Check(Path.GetFileName(summary.path) == "Harness_ City_Test 2026-09-23 140500.vellummap", "Nombre del archivo publicado: " + Path.GetFileName(summary.path));
                Check(zip.GetEntry("water-depth.bin") != null, "En pausa: water-depth.bin presente");
                using (JsonDocument water = Json(zip, "water.json"))
                {
                    JsonElement depth = water.RootElement.GetProperty("depth");
                    Check(depth.GetProperty("simulationPaused").GetBoolean(), "En pausa: depth.simulationPaused true");
                    Check(depth.GetProperty("frameIndex").GetInt64() == 123456, "En pausa: frameIndex");
                }

                var names = new Dictionary<int, string>();
                var derived = new Dictionary<int, bool>();
                using (JsonDocument transit = Json(zip, "transit.json"))
                {
                    foreach (JsonElement line in transit.RootElement.GetProperty("lines").EnumerateArray())
                        foreach (JsonElement stop in line.GetProperty("stops").EnumerateArray())
                        {
                            int id = stop.GetProperty("sourceId").GetInt32();
                            JsonElement value;
                            if (stop.TryGetProperty("name", out value)) names[id] = value.GetString();
                            if (stop.TryGetProperty("nameDerived", out value)) derived[id] = value.GetBoolean();
                        }
                    string color = transit.RootElement.GetProperty("lines")[1].GetProperty("color").GetString();
                    Check(color == "#12AB34FF", "Color #RRGGBBAA en mayúscula: " + color);
                }
                Check(names[10] == "Main St 1" && names[20] == "Main St 2" && names[30] == "Main St 3",
                    "Varias paradas en una calle: numeradas por sourceId entre líneas");
                Check(derived[10] && derived[20] && derived[30], "Nombres derivados: nameDerived true");
                Check(names[5] == "Oak Ave" && derived[5], "Una sola parada en la calle: <calle>");
                Check(!names.ContainsKey(7) && !derived.ContainsKey(7), "Parada sin calle: sin name ni nameDerived");
                Check(names[8] == "Central Station" && !derived[8], "Nombre de mod: nameDerived false");

                byte[] mask = Bytes(zip, "water-mask.bin");
                Check(mask[499 * 1081 + 500] == 0 && mask[499 * 1081 + 501] == 1 && mask[540 * 1081 + 540] == 1 && mask[0] == 0,
                    "Máscara = profundidad > 16");

                byte[] districts = Bytes(zip, "districts.bin");
                Check(districts.Length == 900 * 900 * 8, "districts.bin mide 900²×8");
                Check(districts[(194 * 900 + 194) * 8] == 1 && districts[(194 * 900 + 194) * 8 + 4] == 255,
                    "Grilla vanilla centrada: celda (0,0) → (194,194)");
                Check(districts[(705 * 900 + 705) * 8] == 2, "Grilla vanilla centrada: celda (511,511) → (705,705)");
                Check(districts[0] == 0, "Relleno de ceros fuera de los 25 tiles");
                Check(Bytes(zip, "parks.bin")[(450 * 900 + 450) * 8] == 3, "Grilla de 900² sin cambios");

                using (JsonDocument roads = Json(zip, "roads.json"))
                {
                    JsonElement segments = roads.RootElement.GetProperty("segments");
                    Check(segments.GetArrayLength() == 4, "Redes no viales exportadas (Water Pipe)");
                    Check(segments[0].GetProperty("points").GetArrayLength() == 5, "Segmento de 100 m: 5 puntos");
                }
                using (JsonDocument buildings = Json(zip, "buildings.json"))
                {
                    JsonElement anchor = buildings.RootElement.GetProperty("buildings")[0].GetProperty("footprint")[0];
                    Check(Math.Abs(anchor.GetProperty("x").GetDouble() - 825.8) < 0.01 && Math.Abs(anchor.GetProperty("z").GetDouble() - 2475.1) < 0.01,
                        "Footprint en buildings.json empieza por el ancla");
                }
                using (JsonDocument manifest = Json(zip, "manifest.json"))
                {
                    JsonElement root = manifest.RootElement;
                    Check(root.GetProperty("exportedAtUtc").GetString() == "2026-09-23T14:05:00Z", "exportedAtUtc en UTC con Z");
                    Check(root.GetProperty("modules").GetArrayLength() == 12, "En pausa: 12 módulos");
                    ModuleTable(root);
                    foreach (JsonElement module in root.GetProperty("modules").EnumerateArray())
                    {
                        ZipArchiveEntry entry = zip.GetEntry(module.GetProperty("path").GetString());
                        string sha = VellumWriter.Sha256Hex(Bytes(zip, entry.FullName));
                        Check(sha == module.GetProperty("sha256").GetString(), "sha256 de " + entry.FullName);
                        Check(module.GetProperty("codec").GetString() == "deflate", "codec deflate en " + entry.FullName);
                    }
                }
            }
            Check(summary.limits.Exists(l => l.Contains("rellenada")), "Límite: grilla rellenada desde 512²");
            Check(summary.limits.Exists(l => l.Contains("sin calle")), "Límite: paradas sin calle");
            Check(summary.limits.Exists(l => l.Contains("DLC")), "Límite: DLC y mods");
            Check(summary.limits.Contains("límite del extractor (sintético)"), "Límites del extractor conservados");
            Check(!summary.limits.Exists(l => l.Contains("Profundidad")), "En pausa: sin límite de profundidad");
        }

        // Tabla «Módulos v1» de docs/es/vellummap-format.md: id → archivo y forma de la grilla
        // (resolución, celda, muestra, escala; null = módulo JSON sin `grid`).
        private sealed class Spec
        {
            public string path, sample;
            public int resolution;
            public double cellSize;
            public double? scale;
        }

        private static readonly Dictionary<string, Spec> Modules = new Dictionary<string, Spec>
        {
            { "terrain", new Spec { path = "terrain.bin", resolution = 1081, cellSize = 16, sample = "u16le", scale = 1.0 / 64 } },
            { "water", new Spec { path = "water.json" } },
            { "water-mask", new Spec { path = "water-mask.bin", resolution = 1081, cellSize = 16, sample = "u8" } },
            { "water-depth", new Spec { path = "water-depth.bin", resolution = 1081, cellSize = 16, sample = "u16le", scale = 1.0 / 64 } },
            { "vegetation", new Spec { path = "vegetation.bin", resolution = 512, cellSize = 33.75, sample = "u8" } },
            { "roads", new Spec { path = "roads.json" } },
            { "transit", new Spec { path = "transit.json" } },
            { "buildings", new Spec { path = "buildings.json" } },
            { "districts", new Spec { path = "districts.json" } },
            { "parks", new Spec { path = "parks.json" } },
            { "district-grid", new Spec { path = "districts.bin", resolution = 900, cellSize = 19.2, sample = "u8x8" } },
            { "park-grid", new Spec { path = "parks.bin", resolution = 900, cellSize = 19.2, sample = "u8x8" } },
        };

        private static void ModuleTable(JsonElement manifest)
        {
            var ids = new List<string>();
            foreach (JsonElement module in manifest.GetProperty("modules").EnumerateArray())
            {
                string id = module.GetProperty("id").GetString();
                ids.Add(id);
                Spec spec;
                if (!Modules.TryGetValue(id, out spec)) { Check(false, "Módulo desconocido en el manifest: " + id); continue; }
                Check(module.GetProperty("path").GetString() == spec.path, id + ": path " + spec.path);
                Check(module.GetProperty("version").GetString() == "1.0", id + ": version 1.0");
                JsonElement grid;
                bool hasGrid = module.TryGetProperty("grid", out grid);
                if (spec.sample == null) { Check(!hasGrid, id + ": módulo JSON sin grid"); continue; }
                if (!hasGrid) { Check(false, id + ": falta grid"); continue; }
                Check(grid.GetProperty("resolution").GetInt32() == spec.resolution, id + ": resolution " + spec.resolution);
                Check(grid.GetProperty("cellSize").GetDouble() == spec.cellSize, id + ": cellSize " + spec.cellSize);
                Check(grid.GetProperty("sample").GetString() == spec.sample, id + ": sample " + spec.sample);
                JsonElement scale;
                bool hasScale = grid.TryGetProperty("scale", out scale);
                Check(hasScale == spec.scale.HasValue && (!hasScale || scale.GetDouble() == spec.scale.Value), id + ": scale");
                int properties = 0;
                foreach (JsonProperty ignored in grid.EnumerateObject()) properties++;
                Check(properties == (hasScale ? 4 : 3), id + ": grid sin campos extra");
            }
            Check(ids.Count == new HashSet<string>(ids).Count, "Módulos sin repetir");
            foreach (KeyValuePair<string, Spec> spec in Modules)
                if (spec.Key != "water-depth" && spec.Key != "district-grid" && spec.Key != "park-grid")
                    Check(ids.Contains(spec.Key), "Módulo obligatorio presente: " + spec.Key);
        }

        private static void NumberingSkipsNonFinite(string folder)
        {
            VellumModel model = Model(true);
            var elm = new LineModel { sourceId = 9, name = "Bus Line 9", transportType = "Bus", r = 1, g = 2, b = 3, alpha = 255 };
            elm.stops.Add(Stop(40, "Elm St", null));
            StopModel broken = Stop(41, "Elm St", null);
            broken.position = new Vec3(float.NaN, 70f, 0f);
            elm.stops.Add(broken);
            elm.stops.Add(Stop(42, "Elm St", null));
            model.lines.Add(elm);

            ExportSummary summary = VellumWriter.Export(model, folder, null);
            Dictionary<int, string> names = StopNames(summary.path);
            Check(names.ContainsKey(40) && names[40] == "Elm St 1", "Parada no finita en la calle: la siguiente es «Elm St 1»");
            Check(names.ContainsKey(42) && names[42] == "Elm St 2", "Parada no finita en la calle: sin hueco («Elm St 2», no 3)");
            Check(!names.ContainsKey(41) && !StopIds(summary.path).Contains(41), "Parada no finita omitida");
            Check(summary.limits.Exists(l => l.Contains("paradas omitidas por posición no finita")), "Límite: parada no finita");
        }

        // Registros inválidos: el escritor los omite, los cuenta como límite y el documento sigue
        // siendo válido para el lector Rust (filtered.vellummap).
        private static ExportSummary InvalidRecordsFiltered(string folder)
        {
            VellumModel model = Model(true);
            model.nodes.Add(new NodeModel { sourceId = 6, position = new Vec3(float.NaN, 70f, 0f) });
            model.nodes.Add(new NodeModel { sourceId = 1, position = new Vec3(1f, 2f, 3f) });              // id repetido
            model.segments.Add(Straight(20, 1, 99, "Small Road", 16f));                                    // nodo inexistente
            model.segments.Add(Straight(21, 5, 6, "Small Road", 16f));                                     // nodo con NaN
            model.segments.Add(Straight(10, 1, 2, "Duplicate Road", 16f));                                 // id repetido
            SegmentModel nanCurve = Straight(22, 1, 3, "Small Road", 16f);
            nanCurve.b = new Vec3(float.NaN, 0f, 0f);
            model.segments.Add(nanCurve);                                                                  // coordenada NaN
            var duplicate = new LineModel { sourceId = 4, name = "Duplicate", transportType = "Tram", alpha = 255 };
            duplicate.stops.Add(Stop(5, "Main St", null));                                                 // no debe contar para numerar
            model.lines.Add(duplicate);
            model.buildings.Add(new BuildingModel { sourceId = 36, name = "Duplicate", itemClass = "x", serviceType = "None", width = 1, length = 1 });
            model.buildings.Add(new BuildingModel { sourceId = 41, name = "NaN", itemClass = "x", serviceType = "None", position = new Vec3(0f, float.NaN, 0f), width = 1, length = 1 });
            model.districts.Add(new AreaModel { sourceId = 1, name = "Duplicate District", labelPosition = new Vec3(0, 0, 0) });
            model.parks.Add(new AreaModel { sourceId = 7, name = "NaN Park", labelPosition = new Vec3(float.PositiveInfinity, 0, 0) });

            ExportSummary summary = VellumWriter.Export(model, folder, null);
            using (ZipArchive zip = ZipFile.OpenRead(summary.path))
            {
                using (JsonDocument roads = Json(zip, "roads.json"))
                {
                    List<int> nodes = Ids(roads.RootElement.GetProperty("nodes"));
                    Check(nodes.Count == 5 && !nodes.Contains(6), "Nodos: sin el NaN ni el repetido");
                    JsonElement first = roads.RootElement.GetProperty("nodes")[0].GetProperty("position");
                    Check(first.GetProperty("x").GetDouble() == 100, "Nodo repetido: se conserva el primero");
                    List<int> segments = Ids(roads.RootElement.GetProperty("segments"));
                    Check(segments.Count == 4 && !segments.Contains(20) && !segments.Contains(21) && !segments.Contains(22),
                        "Segmentos: sin huérfanos ni curva NaN");
                    Check(roads.RootElement.GetProperty("segments")[0].GetProperty("itemClass").GetString() == "Small Road",
                        "Segmento repetido: se conserva el primero");
                }
                using (JsonDocument transit = Json(zip, "transit.json"))
                {
                    JsonElement lines = transit.RootElement.GetProperty("lines");
                    Check(lines.GetArrayLength() == 2 && lines[0].GetProperty("transportType").GetString() == "Bus", "Línea repetida omitida");
                }
                using (JsonDocument buildings = Json(zip, "buildings.json"))
                {
                    JsonElement list = buildings.RootElement.GetProperty("buildings");
                    List<int> ids = Ids(list);
                    Check(ids.Count == 2 && !ids.Contains(41) && list[0].GetProperty("name").GetString() == "EU LD 15A",
                        "Edificios: sin el repetido ni el NaN");
                }
                using (JsonDocument districts = Json(zip, "districts.json"))
                {
                    JsonElement list = districts.RootElement.GetProperty("districts");
                    Check(list.GetArrayLength() == 2 && list[0].GetProperty("name").GetString() == "Downtown", "Distrito repetido omitido");
                }
                using (JsonDocument parks = Json(zip, "parks.json"))
                    Check(!Ids(parks.RootElement.GetProperty("parks")).Contains(7), "Parque con etiqueta no finita omitido");
            }
            Dictionary<int, string> names = StopNames(summary.path);
            Check(names[10] == "Main St 1" && names[20] == "Main St 2" && names[30] == "Main St 3",
                "Paradas de una línea omitida no cuentan para numerar");

            string[] expected =
            {
                "2 nodos omitidos", "2 segmentos omitidos porque su nodo", "2 segmentos omitidos por datos no válidos",
                "1 líneas omitidas", "2 edificios omitidos", "1 districts omitidos", "1 parks omitidos",
            };
            foreach (string limit in expected)
                Check(summary.limits.Exists(l => l.StartsWith(limit)), "Límite declarado: «" + limit + "…»");
            return summary;
        }

        private static List<int> Ids(JsonElement array)
        {
            var ids = new List<int>();
            foreach (JsonElement item in array.EnumerateArray()) ids.Add(item.GetProperty("sourceId").GetInt32());
            return ids;
        }

        private static Dictionary<int, string> StopNames(string path)
        {
            var names = new Dictionary<int, string>();
            using (ZipArchive zip = ZipFile.OpenRead(path))
            using (JsonDocument transit = Json(zip, "transit.json"))
                foreach (JsonElement line in transit.RootElement.GetProperty("lines").EnumerateArray())
                    foreach (JsonElement stop in line.GetProperty("stops").EnumerateArray())
                    {
                        JsonElement name;
                        if (stop.TryGetProperty("name", out name)) names[stop.GetProperty("sourceId").GetInt32()] = name.GetString();
                    }
            return names;
        }

        private static List<int> StopIds(string path)
        {
            var ids = new List<int>();
            using (ZipArchive zip = ZipFile.OpenRead(path))
            using (JsonDocument transit = Json(zip, "transit.json"))
                foreach (JsonElement line in transit.RootElement.GetProperty("lines").EnumerateArray())
                    ids.AddRange(Ids(line.GetProperty("stops")));
            return ids;
        }

        private static void RunningOmitsDepth(string folder)
        {
            ExportSummary summary = VellumWriter.Export(Model(false), folder, null);
            using (ZipArchive zip = ZipFile.OpenRead(summary.path))
            {
                Check(zip.GetEntry("water-depth.bin") == null, "En marcha: sin water-depth.bin");
                Check(zip.GetEntry("water-mask.bin") != null, "En marcha: con water-mask.bin");
                using (JsonDocument water = Json(zip, "water.json"))
                {
                    JsonElement ignored;
                    Check(!water.RootElement.TryGetProperty("depth", out ignored), "En marcha: water.json sin depth");
                }
            }
            Check(summary.limits.Exists(l => l.StartsWith("Profundidad del agua omitida")), "En marcha: límite «profundidad omitida»");
        }

        private static void ForcedStored(string folder)
        {
            var options = new WriterOptions { compress = Throwing };
            ExportSummary summary = VellumWriter.Export(Model(true), folder, options);
            AllStored(summary, "DeflateStream lanza");

            options = new WriterOptions { compress = raw => new byte[] { 1, 2, 3 } };
            summary = VellumWriter.Export(Model(true), folder, options);
            AllStored(summary, "deflate que no reproduce los bytes");
        }

        private static void AllStored(ExportSummary summary, string label)
        {
            using (ZipArchive zip = ZipFile.OpenRead(summary.path))
            {
                foreach (ZipArchiveEntry entry in zip.Entries)
                    Check(entry.CompressedLength == entry.Length, label + ": " + entry.FullName + " sin comprimir");
                using (JsonDocument manifest = Json(zip, "manifest.json"))
                    foreach (JsonElement module in manifest.RootElement.GetProperty("modules").EnumerateArray())
                        Check(module.GetProperty("codec").GetString() == "stored", label + ": manifest declara stored");
            }
            Check(summary.modules.TrueForAll(m => m.EndsWith("(stored)")), label + ": resumen con stored");
            Check(summary.limits.FindAll(l => l.StartsWith("deflate no disponible")).Count == 1, label + ": motivo declarado una sola vez");
        }

        private static void Failures(string scratch)
        {
            // Guardado que empieza durante la escritura: el .part se borra y no hay archivo final.
            string folder = Path.Combine(scratch, "saving-late");
            int calls = 0;
            var late = new WriterOptions { isSaving = () => ++calls > 1 };
            Fails(delegate { VellumWriter.Export(Model(true), folder, late); }, "guardado iniciado durante la escritura");
            Check(calls == 2, "isSaving consultado antes de empezar y antes de publicar");
            Empty(folder, "guardado tardío");

            folder = Path.Combine(scratch, "saving-early");
            Fails(delegate { VellumWriter.Export(Model(true), folder, new WriterOptions { isSaving = () => true }); }, "guardado en curso");
            Check(!Directory.Exists(folder), "Guardado en curso: nada escrito");

            // Módulo obligatorio que falla: aborta sin escribir.
            folder = Path.Combine(scratch, "no-terrain");
            VellumModel broken = Model(true);
            broken.terrain = null;
            Fails(delegate { VellumWriter.Export(broken, folder, null); }, "terreno ausente");
            Check(!Directory.Exists(folder), "Terreno ausente: nada escrito");
            folder = Path.Combine(scratch, "bad-vegetation");
            broken = Model(true);
            broken.vegetation = new byte[10];
            Fails(delegate { VellumWriter.Export(broken, folder, null); }, "vegetación de otra resolución");
            Empty(folder, "vegetación de otra resolución");

            // Sin fecha de exportación: aborta antes de escribir.
            folder = Path.Combine(scratch, "no-date");
            broken = Model(true);
            broken.exportedAtUtc = default(DateTime);
            Fails(delegate { VellumWriter.Export(broken, folder, null); }, "exportedAtUtc sin valor");
            Empty(folder, "exportedAtUtc sin valor");

            // IO: la carpeta de destino es un archivo; y una carpeta sin permiso de escritura.
            folder = Path.Combine(scratch, "blocked");
            Directory.CreateDirectory(folder);
            string blocker = Path.Combine(folder, "Vellum Bridge");
            File.WriteAllText(blocker, "x");
            Fails(delegate { VellumWriter.Export(Model(true), blocker, null); }, "carpeta de destino ocupada por un archivo");
            Check(File.ReadAllText(blocker) == "x", "Carpeta ocupada: el archivo que la ocupa no cambia");
            File.Delete(blocker);
            Empty(folder, "carpeta de destino ocupada por un archivo");

            folder = Path.Combine(scratch, "read-only");
            Directory.CreateDirectory(folder);
            if (!OperatingSystem.IsWindows())
            {
                File.SetUnixFileMode(folder, UnixFileMode.UserRead | UnixFileMode.UserExecute);
                try
                {
                    Fails(delegate { VellumWriter.Export(Model(true), folder, null); }, "carpeta sin permiso de escritura");
                    Empty(folder, "carpeta sin permiso de escritura");
                }
                finally { File.SetUnixFileMode(folder, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute); }
            }
        }

        // ─── Utilidades ─────────────────────────────────────────────────────────

        private static ExportSummary Publish(VellumModel model, string folder, Func<byte[], byte[]> compress, string target)
        {
            ExportSummary summary = VellumWriter.Export(model, folder, new WriterOptions { compress = compress });
            File.Copy(summary.path, target, true);
            return summary;
        }

        private static void Fails(Action action, string label)
        {
            try
            {
                action();
                Check(false, label + ": se esperaba ExportFailedException");
            }
            catch (ExportFailedException error)
            {
                Console.WriteLine("ok   " + label + " → " + error.Message);
            }
        }

        private static void Empty(string folder, string label)
        {
            string[] files = Directory.Exists(folder) ? Directory.GetFileSystemEntries(folder) : new string[0];
            Check(files.Length == 0, label + ": ni archivo final ni .part (" + string.Join(", ", files) + ")");
        }

        private static JsonDocument Json(ZipArchive zip, string name) { return JsonDocument.Parse(Bytes(zip, name)); }

        private static byte[] Bytes(ZipArchive zip, string name)
        {
            using (Stream stream = zip.GetEntry(name).Open())
            using (var buffer = new MemoryStream())
            {
                stream.CopyTo(buffer);
                return buffer.ToArray();
            }
        }

        private static bool Near(Vec3 v, float x, float y, float z)
        {
            return Math.Abs(v.x - x) < 1e-3 && Math.Abs(v.y - y) < 1e-3 && Math.Abs(v.z - z) < 1e-3;
        }

        private static void Check(bool condition, string label)
        {
            if (condition) return;
            failures++;
            Console.Error.WriteLine("FAIL " + label);
        }
    }
}
