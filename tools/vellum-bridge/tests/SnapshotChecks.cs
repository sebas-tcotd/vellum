using System;
using System.IO;
using System.Text.Json;
using VellumBridge.Capture;

namespace VellumBridge.Tests
{
    internal static class SnapshotChecks
    {
        internal static void Run(Action<bool, string> check, string folder)
        {
            var snapshot = new Snapshot
            {
                kind = "vellum-bridge-raw-snapshot",
                snapshotVersion = 1,
                bridgeVersion = "0.9.0-experimental",
                gameVersion = "test",
                capturedAt = "2026-10-01T00:00:00.0000000Z",
                cityName = "Ciudad \"A\"\\B\n\t\u0001",
                simulationPaused = true,
                diagnostics = new Diagnostics(),
                payload = new Payload
                {
                    roads = new[] { new Road { id = 1, name = "Calle Ñ", halfWidth = float.NaN,
                        startDirection = new[] { 1f, float.PositiveInfinity, -2.5f } } },
                    roadNodes = new NodeRecord[0],
                    transit = new[] { new TransitRecord { id = 2, legs = new[] {
                        new LegRecord { pathUnit = uint.MaxValue, pathReady = true,
                            pathSegments = new[] { 3 }, pathLanes = new[] { 1 }, pathOffsets = new[] { 255 } }
                    } } },
                    districts = new[] { new AreaRecord { id = 1, raw = RawFieldSerializer.RawFields(new RawArea { flags = RawFlags.Created, values = new[] { 1, 2 }, nested = new RawNested { count = 7 } }) } },
                    parks = new[] { new AreaRecord { id = 2, parkType = "Park" } },
                    terrain = new TerrainRecord { resolution = 1, cellSize = 16, heightScale = 1f / 64f,
                        encoding = "uint16-le-base64", data = "AAA=" },
                    water = new WaterRecord { resolution = 1, frameIndex = uint.MaxValue, depth = "AAA=",
                        sources = new[] { new WaterSourceRecord { id = 1, inputRate = uint.MaxValue } } },
                    districtGrid = new GridRecord { resolution = 1, encoding = "cell-u8x8-base64", data = "AAAAAAAAAAA=" }
                }
            };
            snapshot.diagnostics.errors.Add("buildings: fallo controlado");
            snapshot.diagnostics.unsupported.AddRange(new[] { "dlcs", "mods" });
            string json = SnapshotJson.Write(snapshot);
            using (var parsed = JsonDocument.Parse(json))
            {
                var root = parsed.RootElement;
                var payload = root.GetProperty("payload");
                check(root.GetProperty("cityName").GetString() == snapshot.cityName, "Snapshot: escapes preservan el nombre");
                check(root.GetProperty("simulationPaused").GetBoolean(), "Snapshot: pausa preservada");
                check(payload.GetProperty("buildings").ValueKind == JsonValueKind.Null, "Snapshot: sección fallida es null");
                check(payload.GetProperty("roadNodes").GetArrayLength() == 0, "Snapshot: sección vacía es []");
                check(payload.GetProperty("roads")[0].GetProperty("halfWidth").ValueKind == JsonValueKind.Null,
                    "Snapshot: NaN se serializa como null");
                check(payload.GetProperty("roads")[0].GetProperty("startDirection")[1].ValueKind == JsonValueKind.Null,
                    "Snapshot: infinito en un vector se serializa como null");
                check(payload.GetProperty("transit")[0].GetProperty("legs")[0].GetProperty("pathUnit").GetInt64() == uint.MaxValue,
                    "Snapshot: pathUnit conserva enteros uint32");
                JsonElement parkType;
                check(!payload.GetProperty("districts")[0].TryGetProperty("parkType", out parkType), "Snapshot: distrito omite parkType");
                check(payload.GetProperty("parks")[0].GetProperty("parkType").GetString() == "Park", "Snapshot: parque incluye parkType");
                var raw = payload.GetProperty("districts")[0].GetProperty("raw");
                check(raw.GetProperty("flags").GetString() == "Created", "Snapshot: reflexión conserva nombres de enums");
                check(raw.GetProperty("values").GetProperty("length").GetInt32() == 2, "Snapshot: reflexión resume arrays por longitud");
                check(raw.GetProperty("nested").GetProperty("count").GetInt32() == 7, "Snapshot: reflexión expande structs anidados");
                check(root.GetProperty("diagnostics").GetProperty("errors").GetArrayLength() == 1, "Snapshot: diagnósticos preservados");
            }
            string summary = SnapshotWriter.Write(snapshot, folder);
            string[] files = Directory.GetFiles(folder, "*.json");
            check(files.Length == 1 && File.ReadAllText(files[0]) == json, "Snapshot: archivo publicado conserva el JSON");
            check(summary.Contains(files[0]) && summary.StartsWith("Snapshot parcial:"), "Snapshot: resumen incluye estado y ruta");
            check(Directory.GetFiles(folder, "*.part").Length == 0, "Snapshot: publicación no deja temporales");

            string blocked = Path.Combine(folder, "blocked");
            File.WriteAllText(blocked, "archivo donde debería haber una carpeta");
            bool failed = false;
            try { SnapshotWriter.Write(snapshot, blocked); }
            catch (IOException) { failed = true; }
            check(failed && Directory.GetFiles(folder, "*.json").Length == 1, "Snapshot: fallo de IO no publica un archivo");

            snapshot.payload = null;
            string failingFolder = Path.Combine(folder, "serialization-failure");
            failed = false;
            try { SnapshotWriter.Write(snapshot, failingFolder); }
            catch (NullReferenceException) { failed = true; }
            check(failed && Directory.GetFiles(failingFolder).Length == 0, "Snapshot: fallo de serialización limpia el temporal");
        }

        private enum RawFlags { Created = 1 }
        private struct RawNested { public int count; }
        private struct RawArea
        {
            public RawFlags flags;
            public int[] values;
            public RawNested nested;

        }
    }
}
