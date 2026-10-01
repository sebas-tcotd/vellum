using System;
using System.Globalization;
using System.Text;

namespace VellumBridge.Capture
{
    // JsonUtility en CS1 omite los objetos anidados (payload, diagnostics) y solo
    // emite los campos primitivos de la raíz, así que el JSON se escribe a mano.
    internal static class SnapshotJson
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
            Key(w, "raw", false);
            w.Append(a.raw ?? "null");
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

        internal static void Key(StringBuilder w, string name, bool first)
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

        internal static void Float(StringBuilder w, float value)
        {
            if (float.IsNaN(value) || float.IsInfinity(value)) w.Append("null");
            else w.Append(value.ToString("R", CultureInfo.InvariantCulture));
        }

        private static void Int(StringBuilder w, int value)
        {
            w.Append(value.ToString(CultureInfo.InvariantCulture));
        }

        internal static void String(StringBuilder w, string value)
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
}
