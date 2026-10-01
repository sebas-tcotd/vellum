using System;
using ColossalFramework;
using UnityEngine;
using System.Collections.Generic;
using System.Reflection;

namespace VellumBridge.Capture
{
    internal static class SnapshotExtractor
    {
        internal static Snapshot Extract()
        {
            var document = new Snapshot();
            document.kind = "vellum-bridge-raw-snapshot";
            document.snapshotVersion = 1;
            document.bridgeVersion = BridgeInfo.Version;
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

            return document;
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
                result.Add(new AreaRecord
                {
                    id = i,
                    name = Singleton<DistrictManager>.instance.GetDistrictName((byte)i),
                    flags = buffer[i].m_flags.ToString(),
                    raw = RawFieldSerializer.RawFields(buffer[i])
                });
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
                    parkType = buffer[i].m_parkType.ToString(),
                    raw = RawFieldSerializer.RawFields(buffer[i])
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
}
