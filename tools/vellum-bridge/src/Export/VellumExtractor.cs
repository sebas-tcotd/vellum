using System;
using System.Collections.Generic;
using System.Reflection;
using ColossalFramework;
using UnityEngine;

// Lectura de CS1 para la exportación .vellummap. Corre en el hilo de simulación (o en el
// principal con el juego en pausa) y solo copia buffers a un VellumModel: serializar,
// comprimir y escribir ocurre después, fuera de este hilo, en VellumWriter.
namespace VellumBridge.Export
{
    internal static class VellumExtractor
    {
        // Un fallo en un módulo obligatorio lanza ExportFailedException: la exportación se aborta.
        internal static VellumModel Extract(string producerVersion)
        {
            var simulation = Singleton<SimulationManager>.instance;
            var model = new VellumModel();
            model.snapshotId = Guid.NewGuid().ToString();
            model.exportedAtUtc = DateTime.UtcNow;
            model.producerVersion = producerVersion;
            model.gameVersion = BuildConfig.applicationVersion;
            model.simulationPaused = simulation.SimulationPaused || simulation.ForcedSimulationPaused;
            model.gameTime = simulation.m_currentGameTime.ToString("yyyy-MM-dd'T'HH:mm:ss",
                System.Globalization.CultureInfo.InvariantCulture);
            if (simulation.m_metaData != null)
            {
                model.cityName = simulation.m_metaData.m_CityName;
                // Convert.ToString sirve tanto si el juego lo guarda como string como si es un Guid.
                string instance = Convert.ToString(simulation.m_metaData.m_gameInstanceIdentifier);
                if (instance != null) instance = instance.Trim();
                // Vacío o Guid.Empty no identifican la partida: se omite.
                if (!string.IsNullOrEmpty(instance) && !string.Equals(instance.Trim('{', '}'), Guid.Empty.ToString(), StringComparison.OrdinalIgnoreCase))
                    model.gameInstanceId = instance;
            }

            Required("terrain", delegate { model.terrain = (ushort[])Singleton<TerrainManager>.instance.RawHeights2.Clone(); });
            Required("water", delegate { ReadWater(model); });
            Required("vegetation", delegate { ReadVegetation(model); });
            Required("roads", delegate { ReadRoads(model); });
            Required("transit", delegate { ReadTransit(model); });
            Required("buildings", delegate { ReadBuildings(model); });
            Required("districts", delegate { ReadDistricts(model); });
            Required("parks", delegate { ReadParks(model); });

            // Las grillas de áreas son opcionales: si fallan, el módulo se omite con su límite.
            model.districtGrid = OptionalGrid("distritos", delegate { return Singleton<DistrictManager>.instance.m_districtGrid; });
            model.parkGrid = OptionalGrid("parques", delegate { return Singleton<DistrictManager>.instance.m_parkGrid; });
            return model;
        }

        private static void Required(string module, Action read)
        {
            try { read(); }
            catch (ExportFailedException) { throw; }
            catch (Exception error)
            {
                Debug.LogError("[VellumBridge] Exportación: falló la lectura de `" + module + "`: " + error);
                throw new ExportFailedException("No se pudo leer `" + module + "` (" + error.Message
                    + "). Es un módulo obligatorio: no se escribió ningún archivo. Revisa el log [VellumBridge].", error);
            }
        }

        // Profundidad cruda (Cell.m_height) del buffer estable de WaterSimulation, igual que el Raw
        // Snapshot: m_waterBuffers y m_waterFrameIndex son privados y se leen por reflexión. De ella
        // sale la máscara; solo se escribe como módulo si la simulación estaba en pausa.
        private static void ReadWater(VellumModel model)
        {
            var water = Singleton<TerrainManager>.instance.WaterSimulation;
            const BindingFlags flags = BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public;
            var buffers = (WaterSimulation.Cell[][])typeof(WaterSimulation).GetField("m_waterBuffers", flags).GetValue(water);
            uint frame = (uint)typeof(WaterSimulation).GetField("m_waterFrameIndex", flags).GetValue(water);
            var cells = buffers[~(frame >> 6) & 1u];
            var depth = new ushort[cells.Length];
            for (int i = 0; i < cells.Length; i++) depth[i] = cells[i].m_height;
            model.waterDepth = depth;
            model.hasWaterFrameIndex = true;
            model.waterFrameIndex = frame;
            model.seaLevel = water.m_currentSeaLevel;
        }

        private static void ReadVegetation(VellumModel model)
        {
            var cells = Singleton<NaturalResourceManager>.instance.m_naturalResources;
            var tree = new byte[cells.Length];
            for (int i = 0; i < cells.Length; i++) tree[i] = cells[i].m_tree;
            model.vegetation = tree;
        }

        private static Vec3 V(Vector3 v) { return new Vec3(v.x, v.y, v.z); }

        private static void ReadRoads(VellumModel model)
        {
            var nodes = Singleton<NetManager>.instance.m_nodes.m_buffer;
            for (int i = 1; i < nodes.Length; i++)
            {
                if ((nodes[i].m_flags & NetNode.Flags.Created) == 0) continue;
                model.nodes.Add(new NodeModel
                {
                    sourceId = i,
                    position = V(nodes[i].m_position),
                    elevation = nodes[i].m_elevation,
                    underground = (nodes[i].m_flags & NetNode.Flags.Underground) != 0,
                });
            }

            var segments = Singleton<NetManager>.instance.m_segments.m_buffer;
            int withoutPrefab = 0, segmentNameErrors = 0;
            for (int i = 1; i < segments.Length; i++)
            {
                if ((segments[i].m_flags & NetSegment.Flags.Created) == 0) continue;
                var segment = segments[i];
                var info = segment.Info;
                if (info == null || info.m_class == null) { withoutPrefab++; continue; }
                Vector3 start = nodes[segment.m_startNode].m_position;
                Vector3 end = nodes[segment.m_endNode].m_position;
                bool smoothStart = (nodes[segment.m_startNode].m_flags & NetNode.Flags.Middle) != 0;
                bool smoothEnd = (nodes[segment.m_endNode].m_flags & NetNode.Flags.Middle) != 0;
                Vector3 middle1, middle2;
                NetSegment.CalculateMiddlePoints(start, segment.m_startDirection, end, segment.m_endDirection,
                    smoothStart, smoothEnd, out middle1, out middle2);
                // Solo las calles tienen nombre; una tubería o una ruta de avión devuelve vacío.
                string name = null;
                try { name = Singleton<NetManager>.instance.GetSegmentName((ushort)i); }
                catch (Exception) { segmentNameErrors++; }
                // Redes no viales (tuberías, rutas de avión y barco, conexiones) también se exportan:
                // itemClass las clasifica.
                model.segments.Add(new SegmentModel
                {
                    sourceId = i,
                    startNode = segment.m_startNode,
                    endNode = segment.m_endNode,
                    itemClass = info.m_class.name,
                    width = info.m_halfWidth * 2f,
                    name = name,
                    a = V(start), b = V(middle1), c = V(middle2), d = V(end),
                });
            }
            if (withoutPrefab > 0) model.limits.Add(withoutPrefab + " segmentos omitidos por no tener prefab cargado.");
            if (segmentNameErrors > 0) model.limits.Add(segmentNameErrors + " segmentos sin nombre porque no se pudo leer el nombre de su calle.");
        }

        private static void ReadTransit(VellumModel model)
        {
            var manager = Singleton<TransportManager>.instance;
            var lines = manager.m_lines.m_buffer;
            var nodes = Singleton<NetManager>.instance.m_nodes.m_buffer;
            var lanes = Singleton<NetManager>.instance.m_lanes.m_buffer;
            int withoutPrefab = 0, missingLegs = 0, nameErrors = 0;
            var corrupt = new List<int>();
            for (int i = 1; i < lines.Length; i++)
            {
                var flags = lines[i].m_flags;
                if ((flags & TransportLine.Flags.Created) == 0) continue;
                // Temporary = vista previa de la herramienta de líneas, no una línea real.
                if ((flags & TransportLine.Flags.Temporary) != 0) continue;
                var info = lines[i].Info;
                if (info == null) { withoutPrefab++; continue; }
                Color32 color = manager.GetLineColor((ushort)i);
                var line = new LineModel
                {
                    sourceId = i,
                    name = manager.GetLineName((ushort)i),
                    transportType = info.m_transportType.ToString(),
                    r = color.r, g = color.g, b = color.b, alpha = color.a,
                };

                // Una lista de paradas cíclica o corrupta deja fuera solo esa línea, con su límite.
                try
                {
                    ushort first = lines[i].m_stops;
                    ushort stop = first;
                    int guard = 0;
                    for (; stop != 0 && guard < 32768; guard++)
                    {
                        var record = new StopModel { sourceId = stop, position = V(nodes[stop].m_position) };
                        record.customName = Singleton<InstanceManager>.instance.GetName(new InstanceID { NetNode = stop });
                        uint lane = nodes[stop].m_lane;
                        ushort street = lane != 0 ? lanes[lane].m_segment : (ushort)0;
                        if (street != 0)
                        {
                            try { record.streetName = Singleton<NetManager>.instance.GetSegmentName(street); }
                            catch (Exception) { nameErrors++; }
                        }
                        line.stops.Add(record);
                        stop = TransportLine.GetNextStop(stop);
                        if (stop == first) break;
                    }
                    if (guard >= 32768) throw new InvalidOperationException("lista de paradas cíclica");
                }
                catch (Exception error)
                {
                    Debug.LogWarning("[VellumBridge] Exportación: línea " + i + " omitida: " + error);
                    corrupt.Add(i);
                    continue;
                }

                foreach (StopModel s in line.stops)
                    if (!AppendLeg(s.sourceId, line.route)) missingLegs++;
                model.lines.Add(line);
            }
            if (withoutPrefab > 0) model.limits.Add(withoutPrefab + " líneas omitidas por no tener prefab cargado.");
            if (missingLegs > 0) model.limits.Add(missingLegs + " tramos de línea sin ruta calculada: la ruta de esas líneas queda incompleta.");
            if (nameErrors > 0) model.limits.Add(nameErrors + " paradas sin nombre porque no se pudo leer el nombre de su calle.");
            if (corrupt.Count > 0)
            {
                var ids = new string[corrupt.Count];
                for (int k = 0; k < ids.Length; k++) ids[k] = corrupt[k].ToString(System.Globalization.CultureInfo.InvariantCulture);
                model.limits.Add(corrupt.Count + " líneas omitidas por una lista de paradas cíclica o corrupta (ids: " + string.Join(", ", ids) + ").");
            }
        }

        // Añade a la ruta los segmentos del camino del pathfinder del tramo que parte de `stop`
        // (el segmento de la red de transporte cuyo inicio es la parada, como GetNextStop), sin
        // repetir el mismo segmento en posiciones consecutivas. Los segmentos se acumulan aparte y
        // solo pasan a la ruta si la cadena entera se leyó bien; si no, es un tramo faltante (false).
        private static bool AppendLeg(int stop, List<int> route)
        {
            var leg = new List<int>();
            try
            {
                if (!ReadLeg(stop, leg)) return false;
            }
            catch (Exception) { return false; }
            foreach (int segment in leg)
                if (route.Count == 0 || route[route.Count - 1] != segment) route.Add(segment);
            return true;
        }

        private static bool ReadLeg(int stop, List<int> leg)
        {
            var nodes = Singleton<NetManager>.instance.m_nodes.m_buffer;
            var segments = Singleton<NetManager>.instance.m_segments.m_buffer;
            var units = Singleton<PathManager>.instance.m_pathUnits.m_buffer;
            ushort legSegment = 0;
            for (int k = 0; k < 8; k++)
            {
                ushort candidate = nodes[stop].GetSegment(k);
                if (candidate != 0 && segments[candidate].m_startNode == stop) { legSegment = candidate; break; }
            }
            if (legSegment == 0) return true; // última parada de una línea abierta: no hay tramo
            uint unit = segments[legSegment].m_path;
            if (unit == 0 || (units[unit].m_pathFindFlags & PathUnit.FLAG_READY) == 0) return false;
            int guard = 0;
            while (unit != 0)
            {
                if (++guard > 65536) return false;
                int count = units[unit].m_positionCount;
                for (int p = 0; p < count; p++)
                {
                    PathUnit.Position position;
                    if (!units[unit].GetPosition(p, out position)) return false;
                    leg.Add(position.m_segment);
                }
                unit = units[unit].m_nextPathUnit;
            }
            return true;
        }

        private static void ReadBuildings(VellumModel model)
        {
            var buffer = Singleton<BuildingManager>.instance.m_buildings.m_buffer;
            int withoutPrefab = 0;
            for (int i = 1; i < buffer.Length; i++)
            {
                if ((buffer[i].m_flags & Building.Flags.Created) == 0) continue;
                var building = buffer[i];
                var info = building.Info;
                if (info == null || info.m_class == null) { withoutPrefab++; continue; }
                // Las estructuras Untouchable (pilares, uniones, postes) también se exportan.
                model.buildings.Add(new BuildingModel
                {
                    sourceId = i,
                    name = info.name,
                    itemClass = info.m_class.name,
                    serviceType = info.m_class.m_subService.ToString(),
                    position = V(building.m_position),
                    angle = building.m_angle,
                    width = building.m_width,
                    length = building.m_length,
                });
            }
            if (withoutPrefab > 0) model.limits.Add(withoutPrefab + " edificios omitidos por no tener prefab cargado.");
        }

        private static void ReadDistricts(VellumModel model)
        {
            var manager = Singleton<DistrictManager>.instance;
            var buffer = manager.m_districts.m_buffer;
            for (int i = 1; i < buffer.Length; i++)
            {
                if ((buffer[i].m_flags & District.Flags.Created) == 0) continue;
                model.districts.Add(new AreaModel
                {
                    sourceId = i,
                    name = manager.GetDistrictName((byte)i),
                    labelPosition = V(buffer[i].m_nameLocation),
                });
            }
        }

        private static void ReadParks(VellumModel model)
        {
            var manager = Singleton<DistrictManager>.instance;
            var buffer = manager.m_parks.m_buffer;
            for (int i = 1; i < buffer.Length; i++)
            {
                if ((buffer[i].m_flags & DistrictPark.Flags.Created) == 0) continue;
                model.parks.Add(new AreaModel
                {
                    sourceId = i,
                    name = manager.GetParkName((byte)i),
                    labelPosition = V(buffer[i].m_nameLocation),
                    parkType = buffer[i].m_parkType.ToString(),
                });
            }
        }

        private delegate DistrictManager.Cell[] GridSource();

        private static AreaGrid OptionalGrid(string what, GridSource source)
        {
            try
            {
                DistrictManager.Cell[] cells = source();
                int resolution = (int)Math.Round(Math.Sqrt(cells.Length));
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
                return new AreaGrid { resolution = resolution, cells = bytes };
            }
            catch (Exception error)
            {
                // El escritor declara el límite «grilla omitida» al recibir null.
                Debug.LogWarning("[VellumBridge] Exportación: no se pudo leer la grilla de " + what + ": " + error);
                return null;
            }
        }
    }
}
