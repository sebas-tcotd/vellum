using System;
using System.Collections.Generic;

namespace VellumBridge.Capture
{
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
        public string raw; // JSON ya serializado por RawFieldSerializer.RawFields
    }
}
