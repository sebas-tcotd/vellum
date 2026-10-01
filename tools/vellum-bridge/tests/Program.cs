using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
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
            Identity();
            StopNamesAndDepth(Path.Combine(scratch, "paused"));
            RunningOmitsDepth(Path.Combine(scratch, "running"));
            FirstExportOmitsIdentity(Path.Combine(scratch, "first"));
            ForcedStored(Path.Combine(scratch, "stored"));
            NumberingSkipsNonFinite(Path.Combine(scratch, "numbering"));
            StationNames(Path.Combine(scratch, "stations"));
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
                parentSnapshotId = "7c9e6679-7425-40de-944b-e07fc1f90ae7",
                cityId = "5b8a3c1e-2f47-4d0a-9e61-7c3f0d2b4a95",
                exportedAtUtc = new DateTime(2026, 9, 23, 14, 5, 0, DateTimeKind.Utc),
                gameTime = "2031-05-17T08:00:00",
                gameVersion = "1.21.1-f9",
                gameInstanceId = "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
                producerVersion = "0.9.0-experimental",
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
                sourceId = 13, startNode = 4, endNode = 5, itemClass = "Small Road", width = 16f, name = "Oak Ave",
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

            // RICO histórico sin renombrar: sin nombre visible, con historical.
            m.buildings.Add(new BuildingModel { sourceId = 36, prefab = "EU LD 15A", itemClass = "Low Residential - Level2", serviceType = "ResidentialLow", position = new Vec3(841.8f, 206.7f, 2459.1f), angle = 0f, width = 4, length = 4, historical = true });
            m.buildings.Add(new BuildingModel { sourceId = 40, prefab = "Water Pipe Junction", itemClass = "Water Pipe", serviceType = "None", position = new Vec3(10f, 60f, 10f), angle = 1.2f, width = 1, length = 1 });
            // Servicio renombrado por el jugador.
            m.buildings.Add(new BuildingModel { sourceId = 812, prefab = "Library", name = "Administração", customName = true, itemClass = "Education Facility", serviceType = "None", position = new Vec3(20f, 60f, 20f), angle = 0f, width = 3, length = 3 });
            // Servicio sin renombrar: nombre generado por el juego, sin customName.
            m.buildings.Add(new BuildingModel { sourceId = 813, prefab = "Opera House", name = "Opera House", itemClass = "Monument Facility", serviceType = "None", position = new Vec3(30f, 60f, 30f), angle = 0f, width = 2, length = 2 });
            // Renombrado, pero el nombre no se pudo leer: ni name ni customName.
            m.buildings.Add(new BuildingModel { sourceId = 814, prefab = "H1 2x2 Shop", customName = true, itemClass = "Low Commercial", serviceType = "CommercialLow", position = new Vec3(40f, 60f, 40f), angle = 0f, width = 2, length = 2 });

            var downtown = new AreaModel { sourceId = 1, name = "Downtown", labelPosition = new Vec3(0, 0, 0), population = 1234, homes = 500, commercialJobs = 120, industrialJobs = 80, officeJobs = 300 };
            downtown.specializations.AddRange(new[] { "Tourist", "", "Hightech" });
            m.districts.Add(downtown);
            // Distrito recién creado: todo en cero y sin especialización.
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

        // Entrada de la identidad en la partida: `cityId\nlastSnapshotId`.
        private static void Identity()
        {
            string city, snapshot;
            Check(VellumIdentity.TryDecode(VellumIdentity.Encode("c-1", "s-1"), out city, out snapshot)
                && city == "c-1" && snapshot == "s-1", "Identidad: ida y vuelta con snapshot");
            Check(VellumIdentity.TryDecode(VellumIdentity.Encode("c-1", null), out city, out snapshot)
                && city == "c-1" && snapshot == null, "Identidad: ida y vuelta sin snapshot");
            Check(Encoding.UTF8.GetString(VellumIdentity.Encode("c-1", null)) == "c-1\n", "Identidad: sin snapshot, campo vacío");
            Check(VellumIdentity.TryDecode(Encoding.UTF8.GetBytes("c-1\ns-1\nlineage\nmore"), out city, out snapshot)
                && city == "c-1" && snapshot == "s-1", "Identidad: campos extra de un Bridge futuro ignorados");
            foreach (var bad in new[] {
                new KeyValuePair<string, byte[]>("vacía", new byte[0]),
                new KeyValuePair<string, byte[]>("sin separador", Encoding.UTF8.GetBytes("c-1")),
                new KeyValuePair<string, byte[]>("sin cityId", Encoding.UTF8.GetBytes("\ns-1")),
                new KeyValuePair<string, byte[]>("cityId con control", Encoding.UTF8.GetBytes("c\t1\ns-1")),
                new KeyValuePair<string, byte[]>("snapshot con control", Encoding.UTF8.GetBytes("c-1\ns\u00011")),
                new KeyValuePair<string, byte[]>("cityId de 129", Encoding.UTF8.GetBytes(new string('a', 129) + "\n")),
                new KeyValuePair<string, byte[]>("snapshot de 129", Encoding.UTF8.GetBytes("c-1\n" + new string('a', 129))),
                new KeyValuePair<string, byte[]>("UTF-8 inválido", new byte[] { 0xFF, 0x0A, 0x41 }),
                new KeyValuePair<string, byte[]>("nula", null),
            })
                Check(!VellumIdentity.TryDecode(bad.Value, out city, out snapshot) && city == null && snapshot == null,
                    "Identidad corrupta (" + bad.Key + ") cuenta como vacía");
            Check(VellumIdentity.TryDecode(Encoding.UTF8.GetBytes(new string('a', 128) + "\n"), out city, out snapshot),
                "Identidad: cityId de 128 aceptado");
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

        // Primera exportación de una partida sin identidad: ni `city.id` ni `parentSnapshotId`
        // (nulos o vacíos), nunca claves vacías.
        private static void FirstExportOmitsIdentity(string folder)
        {
            VellumModel model = Model(true);
            model.cityId = null;
            model.parentSnapshotId = "";
            ExportSummary summary = VellumWriter.Export(model, folder, null);
            using (ZipArchive zip = ZipFile.OpenRead(summary.path))
            using (JsonDocument manifest = Json(zip, "manifest.json"))
            {
                JsonElement root = manifest.RootElement;
                JsonElement value;
                Check(root.GetProperty("exportSchemaVersion").GetString() == "1.1", "Sin identidad: manifest 1.1 igual");
                Check(!root.GetProperty("city").TryGetProperty("id", out value), "Sin cityId: se omite city.id");
                Check(root.GetProperty("city").GetProperty("name").GetString() == "Harness: City/Test", "Sin cityId: city.name intacto");
                Check(!root.TryGetProperty("parentSnapshotId", out value), "Sin exportación anterior: se omite parentSnapshotId");
            }
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
                    Check(segments[3].GetProperty("name").GetString() == "Oak Ave", "Segmento con nombre de calle");
                    Check(!segments[0].TryGetProperty("name", out _), "Segmento sin nombre: se omite la clave");
                }
                using (JsonDocument buildings = Json(zip, "buildings.json"))
                {
                    JsonElement list = buildings.RootElement.GetProperty("buildings");
                    JsonElement anchor = list[0].GetProperty("footprint")[0];
                    Check(Math.Abs(anchor.GetProperty("x").GetDouble() - 825.8) < 0.01 && Math.Abs(anchor.GetProperty("z").GetDouble() - 2475.1) < 0.01,
                        "Footprint en buildings.json empieza por el ancla");
                    BuildingPlaceData(list);
                }
                using (JsonDocument districtsJson = Json(zip, "districts.json"))
                    DistrictPlaceData(districtsJson.RootElement.GetProperty("districts"));
                using (JsonDocument parks = Json(zip, "parks.json"))
                    foreach (JsonElement park in parks.RootElement.GetProperty("parks").EnumerateArray())
                        Check(!park.TryGetProperty("population", out _) && !park.TryGetProperty("specializations", out _),
                            "Parques sin datos de lugar");
                using (JsonDocument manifest = Json(zip, "manifest.json"))
                {
                    JsonElement root = manifest.RootElement;
                    Check(root.GetProperty("exportedAtUtc").GetString() == "2026-09-23T14:05:00Z", "exportedAtUtc en UTC con Z");
                    Check(root.GetProperty("exportSchemaVersion").GetString() == "1.1", "Manifest 1.1");
                    Check(root.GetProperty("city").GetProperty("id").GetString() == "5b8a3c1e-2f47-4d0a-9e61-7c3f0d2b4a95", "city.id escrito");
                    Check(root.GetProperty("parentSnapshotId").GetString() == "7c9e6679-7425-40de-944b-e07fc1f90ae7", "parentSnapshotId escrito");
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

        // buildings 1.1: prefab propio, name visible opcional, customName/historical solo si true.
        private static void BuildingPlaceData(JsonElement list)
        {
            var byId = new Dictionary<int, JsonElement>();
            foreach (JsonElement building in list.EnumerateArray()) byId[building.GetProperty("sourceId").GetInt32()] = building;
            JsonElement value;

            JsonElement rico = byId[36];
            Check(rico.GetProperty("prefab").GetString() == "EU LD 15A", "RICO: prefab en su campo");
            Check(!rico.TryGetProperty("name", out value) && !rico.TryGetProperty("customName", out value), "RICO sin renombrar: sin name ni customName");
            Check(rico.GetProperty("historical").GetBoolean(), "RICO histórico: historical true");

            JsonElement renamed = byId[812];
            Check(renamed.GetProperty("prefab").GetString() == "Library" && renamed.GetProperty("name").GetString() == "Administração",
                "Servicio renombrado: prefab Library, name Administração");
            Check(renamed.GetProperty("customName").GetBoolean() && !renamed.TryGetProperty("historical", out value),
                "Servicio renombrado: customName true, sin historical");

            JsonElement unique = byId[813];
            Check(unique.GetProperty("name").GetString() == "Opera House" && !unique.TryGetProperty("customName", out value),
                "Edificio único sin renombrar: name visible sin customName");

            JsonElement unreadable = byId[814];
            Check(!unreadable.TryGetProperty("name", out value) && !unreadable.TryGetProperty("customName", out value),
                "Nombre ilegible: sin name ni customName");
            Check(!byId[40].TryGetProperty("name", out value), "Sin nombre propio (estructura de red): sin name");
        }

        // districts 1.1: los cuatro campos siempre presentes; cero y [] son datos.
        private static void DistrictPlaceData(JsonElement list)
        {
            JsonElement downtown = list[0], harbor = list[1];
            JsonElement jobs = downtown.GetProperty("jobs");
            Check(downtown.GetProperty("population").GetInt64() == 1234 && downtown.GetProperty("homes").GetInt64() == 500,
                "Distrito poblado: population y homes");
            Check(jobs.GetProperty("commercial").GetInt64() == 120 && jobs.GetProperty("industrial").GetInt64() == 80
                && jobs.GetProperty("office").GetInt64() == 300, "Distrito poblado: empleos por sector");
            int sectors = 0;
            foreach (JsonProperty ignored in jobs.EnumerateObject()) sectors++;
            Check(sectors == 3, "jobs: solo commercial, industrial y office");
            JsonElement specializations = downtown.GetProperty("specializations");
            Check(specializations.GetArrayLength() == 2 && specializations[0].GetString() == "Tourist" && specializations[1].GetString() == "Hightech",
                "Especializaciones en orden y sin vacíos");

            JsonElement zeroJobs = harbor.GetProperty("jobs");
            Check(harbor.GetProperty("population").GetInt64() == 0 && harbor.GetProperty("homes").GetInt64() == 0
                && zeroJobs.GetProperty("commercial").GetInt64() == 0 && zeroJobs.GetProperty("industrial").GetInt64() == 0
                && zeroJobs.GetProperty("office").GetInt64() == 0, "Distrito recién creado: ceros presentes");
            Check(harbor.GetProperty("specializations").GetArrayLength() == 0, "Distrito sin especialización: []");
        }

        // Tabla «Módulos v1» de docs/es/vellummap-format.md: id → archivo y forma de la grilla
        // (resolución, celda, muestra, escala; null = módulo JSON sin `grid`).
        private sealed class Spec
        {
            public string path, sample;
            public string version = "1.0";
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
            { "buildings", new Spec { path = "buildings.json", version = "1.1" } },
            { "districts", new Spec { path = "districts.json", version = "1.1" } },
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
                Check(module.GetProperty("version").GetString() == spec.version, id + ": version " + spec.version);
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

        // Paradas de un edificio de estación: nombre del jugador, landmark, calle de acceso y choques
        // (vellummap-format.md, «Nombres de parada»).
        private static void StationNames(string folder)
        {
            VellumModel model = Model(true);
            var metro = new LineModel { sourceId = 20, name = "Metro Line 20", transportType = "Metro", r = 1, g = 2, b = 3, alpha = 255 };
            var train = new LineModel { sourceId = 21, name = "Train Line 21", transportType = "Train", r = 4, g = 5, b = 6, alpha = 255 };
            model.lines.Add(metro);
            model.lines.Add(train);

            // Renombrada por el jugador, con transbordo: dos líneas, dos nodos, el mismo edificio.
            AddStation(model, 1001, 5000f, 5000f, 0, "Gray Station");
            metro.stops.Add(StationStop(501, 1001, null));
            train.stops.Add(StationStop(502, 1001, null));
            // Un parque compartido: lo usa la más cercana (1002, a 50 m); 1003 (a 100 m) usa su calle.
            model.parks.Add(new AreaModel { sourceId = 30, name = "Riverside Park", labelPosition = new Vec3(6000f, 0f, 6000f) });
            AddStation(model, 1002, 6050f, 6000f, 0, null);
            AddStation(model, 1003, 6000f, 6100f, 2001, null);
            model.segments.Add(Street(2001, 3020, 3021, "Pine St", 5900f, 6150f, 6100f, 6150f));
            metro.stops.Add(StationStop(503, 1002, null));
            metro.stops.Add(StationStop(504, 1003, null));
            // Choque de calle resuelto por el cruce más cercano a cada estación.
            AddStation(model, 1004, 8000f, 8000f, 2002, null);
            AddStation(model, 1005, 8380f, 8000f, 2004, null);   // más cerca del extremo d
            model.segments.Add(Street(2002, 3001, 3002, "Long Ave", 7900f, 8000f, 8100f, 8000f));
            model.segments.Add(Street(2003, 3001, 3010, "First St", 7900f, 8000f, 7900f, 8200f));
            model.segments.Add(Street(2004, 3003, 3004, "Long Ave", 8200f, 8000f, 8400f, 8000f));
            model.segments.Add(Street(2005, 3003, 3011, "Third St", 8200f, 8000f, 8200f, 8200f));
            model.segments.Add(Street(2008, 3004, 3012, "Zed St", 8400f, 8000f, 8400f, 8200f));
            metro.stops.Add(StationStop(505, 1004, null));
            metro.stops.Add(StationStop(506, 1005, null));
            // Choque sin cruce: se numera por sourceId.
            AddStation(model, 1006, 10000f, 10000f, 2006, null);
            AddStation(model, 1007, 10100f, 10000f, 2006, null);
            model.segments.Add(Street(2006, 3005, 3006, "Short Rd", 9950f, 10000f, 10150f, 10000f));
            train.stops.Add(StationStop(508, 1007, null));
            train.stops.Add(StationStop(507, 1006, null));
            // Sin landmark ni calle de acceso: sin nombre; el nombre de mod de otro nodo sigue ganando.
            AddStation(model, 1008, 12000f, 12000f, 0, null);
            metro.stops.Add(StationStop(509, 1008, null));
            metro.stops.Add(StationStop(511, 1008, "Mod Name"));
            // Edificio de estación que no se exportó: regla de calle.
            StopModel orphan = StationStop(510, 9999, null);
            orphan.streetName = "Elm Lane";
            metro.stops.Add(orphan);
            // Edificio renombrado como landmark; uno sin nombre más cerca no cuenta.
            model.buildings.Add(new BuildingModel { sourceId = 1100, prefab = "Office", name = "Clock Tower", customName = true, itemClass = "Office", serviceType = "None", position = new Vec3(14000f, 60f, 14000f), width = 2, length = 2 });
            model.buildings.Add(new BuildingModel { sourceId = 1101, prefab = "Office", itemClass = "Office", serviceType = "None", position = new Vec3(14050f, 60f, 14000f), width = 2, length = 2 });
            AddStation(model, 1009, 14100f, 14000f, 0, null);
            // La parada lleva una calle (como en un terminal): no debe numerar «Oak Ave».
            StopModel onStreet = StationStop(512, 1009, null);
            onStreet.streetName = "Oak Ave";
            metro.stops.Add(onStreet);
            // Un parque a 200 m queda fuera del radio.
            model.parks.Add(new AreaModel { sourceId = 31, name = "Far Park", labelPosition = new Vec3(16200f, 0f, 16000f) });
            AddStation(model, 1010, 16000f, 16000f, 2007, null);
            model.segments.Add(Street(2007, 3007, 3008, "Far St", 15900f, 16050f, 16100f, 16050f));
            metro.stops.Add(StationStop(513, 1010, null));
            // Grupo mixto: 1011 no tiene cruce en su extremo cercano y usa el del otro (el menor en
            // orden ordinal); 1012 no tiene cruce y se numera.
            AddStation(model, 1011, 20010f, 20000f, 2010, null);
            AddStation(model, 1012, 20500f, 20000f, 2013, null);
            model.segments.Add(Street(2010, 3030, 3031, "Ring Rd", 20000f, 20000f, 20200f, 20000f));
            model.segments.Add(Street(2011, 3031, 3034, "Spoke St", 20200f, 20000f, 20200f, 20200f));
            model.segments.Add(Street(2012, 3031, 3035, "Alpha St", 20200f, 20000f, 20200f, 19800f));
            model.segments.Add(Street(2013, 3032, 3033, "Ring Rd", 20400f, 20000f, 20600f, 20000f));
            train.stops.Add(StationStop(514, 1011, null));
            train.stops.Add(StationStop(515, 1012, null));
            // El mismo par calle / cruce: se numera.
            AddStation(model, 1013, 22010f, 22000f, 2014, null);
            AddStation(model, 1014, 22020f, 22000f, 2014, null);
            model.segments.Add(Street(2014, 3040, 3041, "Twin Ave", 22000f, 22000f, 22200f, 22000f));
            model.segments.Add(Street(2015, 3040, 3042, "Gate St", 22000f, 22000f, 22000f, 22200f));
            train.stops.Add(StationStop(516, 1013, null));
            train.stops.Add(StationStop(517, 1014, null));
            // Una estación renombrada sin paradas no es landmark; de dos landmarks gana el más cercano.
            model.buildings.Add(new BuildingModel { sourceId = 1020, prefab = "Metro Entrance", name = "Ghost Station", customName = true, transitStation = true, itemClass = "Metro Station", serviceType = "PublicTransportMetro", position = new Vec3(24000f, 60f, 24000f), width = 2, length = 2 });
            model.buildings.Add(new BuildingModel { sourceId = 1022, prefab = "Office", name = "Far Tower", customName = true, itemClass = "Office", serviceType = "None", position = new Vec3(24150f, 60f, 24000f), width = 2, length = 2 });
            model.buildings.Add(new BuildingModel { sourceId = 1023, prefab = "Office", name = "Near Tower", customName = true, itemClass = "Office", serviceType = "None", position = new Vec3(24110f, 60f, 24000f), width = 2, length = 2 });
            AddStation(model, 1021, 24050f, 24000f, 0, null);
            metro.stops.Add(StationStop(518, 1021, null));
            // Un landmark a la misma distancia de dos estaciones: gana la de menor sourceId.
            model.parks.Add(new AreaModel { sourceId = 32, name = "Mid Park", labelPosition = new Vec3(26000f, 0f, 26000f) });
            AddStation(model, 1031, 26050f, 26000f, 2020, null);
            AddStation(model, 1030, 25950f, 26000f, 0, null);
            model.segments.Add(Street(2020, 3050, 3051, "Tie St", 26000f, 26100f, 26100f, 26100f));
            metro.stops.Add(StationStop(519, 1031, null));
            metro.stops.Add(StationStop(520, 1030, null));
            // Un landmark justo a 150 m está dentro del radio.
            model.parks.Add(new AreaModel { sourceId = 33, name = "Edge Park", labelPosition = new Vec3(28150f, 0f, 28000f) });
            AddStation(model, 1040, 28000f, 28000f, 0, null);
            metro.stops.Add(StationStop(521, 1040, null));
            // Una estación con solo nombres de mod no compite por landmarks.
            model.buildings.Add(new BuildingModel { sourceId = 1052, prefab = "Office", name = "Shared Plaza", customName = true, itemClass = "Office", serviceType = "None", position = new Vec3(30060f, 60f, 30000f), width = 2, length = 2 });
            AddStation(model, 1050, 30030f, 30000f, 0, null);
            AddStation(model, 1051, 30120f, 30000f, 0, null);
            metro.stops.Add(StationStop(522, 1050, "Only Mod"));
            metro.stops.Add(StationStop(523, 1051, null));
            // Servicio sin renombrar: su título; un servicio renombrado gana aunque esté más lejos.
            AddService(model, 1061, 32050f, 32000f, "Medical Clinic");
            AddStation(model, 1060, 32000f, 32000f, 0, null);
            AddService(model, 1063, 33020f, 33000f, "Police Station");
            model.buildings.Add(new BuildingModel { sourceId = 1064, prefab = "Police Station", name = "Comisaría Central", customName = true, itemClass = "Police Department", serviceType = "None", position = new Vec3(33100f, 60f, 33000f), width = 2, length = 2 });
            AddStation(model, 1062, 33000f, 33000f, 0, null);
            metro.stops.Add(StationStop(524, 1060, null));
            metro.stops.Add(StationStop(525, 1062, null));
            // El mismo título en dos estaciones: ninguna lo usa; sin calle de acceso, la calle con
            // nombre más cercana (a 30 m); la otra no tiene calle a 50 m y queda sin nombre.
            AddService(model, 1067, 34040f, 34000f, "Fire Station");
            AddService(model, 1068, 36040f, 36000f, "Fire Station");
            AddStation(model, 1065, 34000f, 34000f, 0, null);
            AddStation(model, 1066, 36000f, 36000f, 0, null);
            model.segments.Add(Street(2030, 3060, 3061, "Ember St", 33900f, 34030f, 34100f, 34030f));
            model.segments.Add(Street(2031, 3062, 3063, "Too Far St", 35900f, 36060f, 36100f, 36060f));
            metro.stops.Add(StationStop(526, 1065, null));
            metro.stops.Add(StationStop(527, 1066, null));
            // Área de parque que contiene a la estación (su etiqueta queda fuera del radio).
            model.parks.Add(new AreaModel { sourceId = 34, name = "Oficii Campvs", labelPosition = new Vec3(9000f, 0f, 9000f), parkType = "TradeSchool" });
            SetCell(model.parkGrid, 550, 350, 34, 200);                      // x ∈ [−1920, −1900.8), z ∈ [1920, 1939.2)
            AddStation(model, 1070, -1910f, 1930f, 0, null);
            metro.stops.Add(StationStop(528, 1070, null));
            // Orden: el servicio gana al área y a la calle; el área gana a la calle.
            AddPark(model, 36, "Pump Campus", 606, 293);
            AddService(model, 1085, -2950f, 3000f, "Police Post");
            AddStation(model, 1080, -3000f, 3000f, 2040, null);
            model.segments.Add(Street(2040, 3070, 3071, "Pump Rd", -3100f, 3020f, -2900f, 3020f));
            AddPark(model, 37, "Area Wins Campus", 606, 241);
            AddStation(model, 1081, -4000f, 3000f, 2041, null);
            model.segments.Add(Street(2041, 3072, 3073, "Area Rd", -4100f, 3020f, -3900f, 3020f));
            // Dos estaciones en la misma área: ninguna la usa y pasan a su calle.
            AddPark(model, 38, "Shared Area", 606, 189);
            SetCell(model.parkGrid, 611, 189, 38, 255);
            AddStation(model, 1082, -5000f, 3000f, 2042, null);
            AddStation(model, 1083, -5000f, 3100f, 2043, null);
            SetCell(model.parkGrid, 616, 189, 38, 255);
            AddStation(model, 1087, -5000f, 3200f, 0, null);                  // sin calle a 50 m
            model.segments.Add(Street(2042, 3074, 3075, "Share A St", -5100f, 3020f, -4900f, 3020f));
            model.segments.Add(Street(2043, 3076, 3077, "Share B St", -5100f, 3120f, -4900f, 3120f));
            // Calle de acceso sin nombre: la calle con nombre más cercana; una autopista más
            // cerca no cuenta.
            AddStation(model, 1084, -6000f, -3000f, 2044, null);
            model.segments.Add(Street(2044, 3078, 3079, null, -6100f, -2990f, -5900f, -2990f));
            model.segments.Add(Street(2045, 3080, 3081, "Fallback Ave", -6100f, -2970f, -5900f, -2970f));
            SegmentModel highway = Street(2046, 3082, 3083, "Big Highway", -6100f, -2995f, -5900f, -2995f);
            highway.itemClass = "Highway";
            model.segments.Add(highway);
            // La ranura más pesada es un área sin nombre: cuenta la siguiente con nombre.
            model.parks.Add(new AreaModel { sourceId = 40, name = "", labelPosition = new Vec3(-7000f, 0f, -8000f) });
            AddPark(model, 41, "Lighter Reserve", 606, 137);
            int slot = (606 * model.parkGrid.resolution + 137) * 8;
            model.parkGrid.cells[slot + 1] = 41;
            model.parkGrid.cells[slot + 5] = 100;
            model.parkGrid.cells[slot] = 40;
            model.parkGrid.cells[slot + 4] = 255;
            AddStation(model, 1086, -6000f, 3000f, 0, null);
            train.stops.Add(StationStop(539, 1086, null));
            // Aeropuerto con cuatro estaciones: dos con calle, dos sin calle.
            AddPark(model, 42, "Laurel City Airport", 400, 400);
            SetCell(model.parkGrid, 400, 401, 42, 255);
            SetCell(model.parkGrid, 401, 400, 42, 255);
            SetCell(model.parkGrid, 401, 401, 42, 255);
            AddStation(model, 1110, -955f, -955f, 2050, null);               // celda (400, 400)
            AddStation(model, 1111, -935f, -955f, 2051, null);               // celda (400, 401)
            AddStation(model, 1112, -955f, -935f, 0, null);                  // celda (401, 400)
            AddStation(model, 1113, -935f, -935f, 0, null);                  // celda (401, 401)
            model.segments.Add(Street(2050, 3090, 3091, "Hancock Street", -1100f, -2000f, -1000f, -2000f));
            model.segments.Add(Street(2051, 3092, 3093, "Fairview Bridge", -1100f, -2100f, -1000f, -2100f));
            train.stops.Add(StationStop(540, 1110, null));
            train.stops.Add(StationStop(541, 1111, null));
            train.stops.Add(StationStop(542, 1112, null));
            train.stops.Add(StationStop(543, 1113, null));
            // Estación integrada en un edificio único: su nombre propio, derivado.
            model.buildings.Add(new BuildingModel { sourceId = 1120, prefab = "Grand Terminal", name = "Grand Terminal", itemClass = "Monument", serviceType = "None", position = new Vec3(50000f, 60f, 50000f), width = 8, length = 8 });
            metro.stops.Add(StationStop(545, 1120, null));
            train.stops.Add(StationStop(529, 1080, null));
            train.stops.Add(StationStop(530, 1081, null));
            train.stops.Add(StationStop(531, 1082, null));
            train.stops.Add(StationStop(532, 1083, null));
            train.stops.Add(StationStop(533, 1084, null));
            train.stops.Add(StationStop(544, 1087, null));
            // Empate entre landmarks: el edificio gana al parque.
            model.buildings.Add(new BuildingModel { sourceId = 1097, prefab = "Office", name = "Tie Building", customName = true, itemClass = "Office", serviceType = "None", position = new Vec3(40100f, 60f, 40000f), width = 2, length = 2 });
            model.parks.Add(new AreaModel { sourceId = 39, name = "Tie Park", labelPosition = new Vec3(40000f, 0f, 40100f) });
            AddStation(model, 1090, 40000f, 40000f, 0, null);
            metro.stops.Add(StationStop(534, 1090, null));
            // Dos landmarks distintos con el mismo nombre: ninguna estación lo usa.
            model.buildings.Add(new BuildingModel { sourceId = 1098, prefab = "Office", name = "Twin Plaza", customName = true, itemClass = "Office", serviceType = "None", position = new Vec3(42050f, 60f, 42000f), width = 2, length = 2 });
            model.buildings.Add(new BuildingModel { sourceId = 1099, prefab = "Office", name = "Twin Plaza", customName = true, itemClass = "Office", serviceType = "None", position = new Vec3(44050f, 60f, 44000f), width = 2, length = 2 });
            AddStation(model, 1091, 42000f, 42000f, 0, null);
            AddStation(model, 1092, 44000f, 44000f, 0, null);
            metro.stops.Add(StationStop(535, 1091, null));
            metro.stops.Add(StationStop(536, 1092, null));
            // Un título igual al nombre que el jugador le puso a otra estación no se usa.
            AddStation(model, 1095, 46000f, 46000f, 0, "Fire Hall");
            AddService(model, 1105, 48050f, 48000f, "Fire Hall");
            AddStation(model, 1096, 48000f, 48000f, 0, null);
            metro.stops.Add(StationStop(537, 1095, null));
            metro.stops.Add(StationStop(538, 1096, null));

            ExportSummary summary = VellumWriter.Export(model, folder, null);
            Dictionary<int, string> names = StopNames(summary.path);
            Dictionary<int, bool> derived = StopDerived(summary.path);
            Check(names[501] == "Gray Station" && !derived[501], "Estación renombrada: su nombre, nameDerived false");
            Check(names[502] == "Gray Station" && !derived[502], "Transbordo: el mismo nombre en otra línea, sin numerar");
            Check(names[503] == "Riverside Park" && derived[503], "Landmark compartido: lo usa la estación más cercana");
            Check(names[504] == "Pine St" && derived[504], "Landmark compartido: la otra usa su calle de acceso");
            Check(names[505] == "Long Ave / First St" && names[506] == "Long Ave / Zed St", "Choque de calle: <calle> / <cruce del extremo más cercano>");
            Check(names[507] == "Short Rd 1" && names[508] == "Short Rd 2" && derived[507], "Choque sin cruce: numeradas por sourceId");
            Check(!names.ContainsKey(509) && !derived.ContainsKey(509), "Estación sin datos: sin name ni nameDerived");
            Check(names[511] == "Mod Name" && !derived[511], "Nombre de mod del nodo gana a la estación");
            Check(names[510] == "Elm Lane", "Edificio no exportado: regla de calle");
            Check(names[512] == "Clock Tower" && derived[512], "Edificio renombrado como landmark");
            Check(names[5] == "Oak Ave", "Parada de estación con calle: no numera la calle de otras paradas");
            Check(names[514] == "Ring Rd / Alpha St", "Sin cruce en el extremo cercano: el del otro, el menor en orden ordinal");
            Check(names[515] == "Ring Rd", "Grupo mixto: si queda una sola sin cruce, lleva la calle a secas");
            Check(names[516] == "Twin Ave 1" && names[517] == "Twin Ave 2", "El mismo par calle / cruce: se numera");
            Check(names[518] == "Near Tower", "Estación renombrada sin paradas no es landmark; gana el landmark más cercano");
            Check(names[520] == "Mid Park" && names[519] == "Tie St", "Empate de distancia: el landmark va a la de menor sourceId");
            Check(names[521] == "Edge Park", "Landmark a 150 m exactos: dentro del radio");
            Check(names[522] == "Only Mod" && names[523] == "Shared Plaza", "Estación con solo nombres de mod no compite por landmarks");
            Check(names[524] == "Medical Clinic" && derived[524], "Servicio sin renombrar: su título");
            Check(names[525] == "Comisaría Central", "Servicio renombrado gana al título de uno más cercano");
            Check(names[526] == "Ember St", "Título repetido: pasa a la calle más cercana");
            Check(!names.ContainsKey(527), "Título repetido y sin calle a 50 m: sin nombre");
            Check(names[528] == "Oficii Campvs" && derived[528], "Área de parque que contiene a la estación");
            Check(names[529] == "Police Post", "Orden: el servicio gana al área y a la calle");
            Check(names[530] == "Area Wins Campus", "Orden: el área gana a la calle");
            Check(names.ContainsKey(539) && names[539] == "Lighter Reserve", "Área: la ranura más pesada con nombre");
            Check(names[531] == "Shared Area - Share A St" && names[532] == "Shared Area - Share B St", "Dos estaciones en la misma área: <área> - <calle>");
            Check(names[540] == "LCA - Hancock Street" && names[541] == "LCA - Fairview Bridge" && derived[540], "Área de tres palabras o más: iniciales como prefijo");
            Check(names[545] == "Grand Terminal" && derived[545], "Estación integrada en un único: su nombre, derivado");
            Check(names[544] == "Shared Area", "Una sola estación del área sin calle: el área a secas");
            Check(names[542] == "Laurel City Airport 1" && names[543] == "Laurel City Airport 2", "Área compartida sin calle: el área numerada");
            Check(!summary.limits.Exists(l => l.Contains("1112") || l.Contains("1113")), "Área compartida sin calle: no es una estación sin nombre");
            Check(names[533] == "Fallback Ave", "Calle de acceso sin nombre: la más cercana, sin autopistas");
            Check(names[534] == "Tie Building", "Empate entre landmarks: el edificio gana al parque");
            Check(!names.ContainsKey(535) && !names.ContainsKey(536), "Landmarks homónimos: ninguna estación los usa");
            Check(names[537] == "Fire Hall" && !names.ContainsKey(538), "Título igual al nombre de otra estación: no se usa");
            Check(summary.limits.Exists(l => l.Contains("estaciones sin nombre") && l.Contains("1008") && l.Contains("1066")), "Límite: estaciones sin nombre con sus ids");
            Check(summary.limits.Contains("1 paradas sin calle con nombre: se exportan sin nombre."), "Las paradas de estación sin nombre no cuentan como paradas de calle (solo la 7)");
            Check(names[513] == "Far St", "Landmark a 200 m: fuera del radio");
            Check(names[10] == "Main St 1", "Paradas de calle: regla sin cambios");
        }

        private static void AddStation(VellumModel model, int id, float x, float z, int accessSegment, string playerName)
        {
            model.buildings.Add(new BuildingModel
            {
                sourceId = id, prefab = "Metro Entrance", name = playerName, customName = playerName != null,
                itemClass = "Metro Station", serviceType = "PublicTransportMetro", position = new Vec3(x, 60f, z),
                width = 2, length = 2, accessSegment = accessSegment,
            });
        }

        private static void AddPark(VellumModel model, int id, string name, int row, int col)
        {
            // La etiqueta queda lejos de toda estación: solo cuenta la celda.
            model.parks.Add(new AreaModel { sourceId = id, name = name, labelPosition = new Vec3(-8000f + id * 10f, 0f, -8000f) });
            SetCell(model.parkGrid, row, col, (byte)id, 255);
        }

        private static void AddService(VellumModel model, int id, float x, float z, string title)
        {
            model.buildings.Add(new BuildingModel
            {
                sourceId = id, prefab = title, itemClass = "Service", serviceType = "None",
                position = new Vec3(x, 60f, z), width = 2, length = 2, serviceTitle = title,
            });
        }

        private static StopModel StationStop(int id, int station, string custom)
        {
            StopModel stop = Stop(id, null, custom);
            stop.stationBuildingId = station;
            return stop;
        }

        private static SegmentModel Street(int id, int from, int to, string name, float ax, float az, float dx, float dz)
        {
            var a = new Vec3(ax, 70f, az);
            var d = new Vec3(dx, 70f, dz);
            return new SegmentModel { sourceId = id, startNode = from, endNode = to, itemClass = "Small Road", width = 16f, name = name, a = a, b = a, c = d, d = d };
        }

        private static Dictionary<int, bool> StopDerived(string path)
        {
            var derived = new Dictionary<int, bool>();
            using (ZipArchive zip = ZipFile.OpenRead(path))
            using (JsonDocument transit = Json(zip, "transit.json"))
                foreach (JsonElement line in transit.RootElement.GetProperty("lines").EnumerateArray())
                    foreach (JsonElement stop in line.GetProperty("stops").EnumerateArray())
                    {
                        JsonElement value;
                        if (stop.TryGetProperty("nameDerived", out value)) derived[stop.GetProperty("sourceId").GetInt32()] = value.GetBoolean();
                    }
            return derived;
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
            model.buildings.Add(new BuildingModel { sourceId = 36, prefab = "Duplicate", itemClass = "x", serviceType = "None", width = 1, length = 1 });
            model.buildings.Add(new BuildingModel { sourceId = 41, prefab = "NaN", itemClass = "x", serviceType = "None", position = new Vec3(0f, float.NaN, 0f), width = 1, length = 1 });
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
                    Check(ids.Count == 5 && !ids.Contains(41) && list[0].GetProperty("prefab").GetString() == "EU LD 15A",
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
