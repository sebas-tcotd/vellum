using System;
using System.Collections.Generic;

// Modelo plano de una exportación .vellummap: la frontera entre el juego y el escritor.
// VellumExtractor lo llena en el hilo de simulación copiando buffers de CS1; VellumWriter lo
// serializa en otro hilo sin tocar el juego. Por eso aquí no hay tipos de Unity ni de CS1, y el
// archivo compila igual en el mod (net35, C# 7.3) y en el harness de pruebas (.NET moderno).
namespace VellumBridge.Export
{
    internal struct Vec3
    {
        public float x, y, z;
        public Vec3(float x, float y, float z) { this.x = x; this.y = y; this.z = z; }
    }

    internal sealed class VellumModel
    {
        // ─── Metadatos ──────────────────────────────────────────────────────────
        public string snapshotId;          // UUID nuevo por exportación
        public DateTime exportedAtUtc;     // DateTimeKind.Utc
        public string gameTime;            // m_currentGameTime, "yyyy-MM-ddTHH:mm:ss"; null si no se conoce
        public string gameVersion;         // BuildConfig.applicationVersion
        public string gameInstanceId;      // m_gameInstanceIdentifier; null si no se conoce
        public string producerVersion;     // versión de Vellum Bridge
        public string cityName;

        // ─── Grillas ────────────────────────────────────────────────────────────
        public ushort[] terrain;           // RawHeights2, 1081²
        public float seaLevel;             // metros
        public ushort[] waterDepth;        // WaterSimulation.Cell.m_height, 1081²; de aquí sale la máscara
        public bool simulationPaused;      // con false no se escribe water-depth.bin
        public bool hasWaterFrameIndex;
        public uint waterFrameIndex;
        public byte[] vegetation;          // NaturalResourceManager.m_tree, 512²
        public AreaGrid districtGrid;      // null si no se pudo leer
        public AreaGrid parkGrid;

        // ─── Entidades ──────────────────────────────────────────────────────────
        public List<NodeModel> nodes = new List<NodeModel>();
        public List<SegmentModel> segments = new List<SegmentModel>();
        public List<LineModel> lines = new List<LineModel>();
        public List<BuildingModel> buildings = new List<BuildingModel>();
        public List<AreaModel> districts = new List<AreaModel>();
        public List<AreaModel> parks = new List<AreaModel>();

        // ─── Límites contados por el extractor ─────────────────────────────────
        // Lo parcial no bloqueante se cuenta y se muestra, nunca en silencio. El escritor añade
        // los suyos (profundidad omitida, relleno de grillas, paradas sin calle, …).
        public List<string> limits = new List<string>();
    }

    // Grilla de áreas cruda del DistrictManager: resolución² celdas × (4 ids + 4 alphas).
    internal sealed class AreaGrid
    {
        public int resolution;
        public byte[] cells;
    }

    internal sealed class NodeModel
    {
        public int sourceId;
        public Vec3 position;
        public byte elevation;
        public bool underground;
    }

    internal sealed class SegmentModel
    {
        public int sourceId;
        public int startNode, endNode;
        public string itemClass;
        public float width;
        // Nombre visible de la calle (GetSegmentName); null si la red no tiene nombre.
        public string name;
        // Curva Bézier cúbica del segmento: a = inicio, b y c = puntos medios
        // (NetSegment.CalculateMiddlePoints), d = fin.
        public Vec3 a, b, c, d;
    }

    internal sealed class LineModel
    {
        public int sourceId;
        public string name;
        public string transportType;
        public byte r, g, b, alpha;        // displayColor
        public List<StopModel> stops = new List<StopModel>();
        public List<int> route = new List<int>();
    }

    internal sealed class StopModel
    {
        public int sourceId;               // nodo de la parada
        public Vec3 position;
        public string customName;          // stopCustomNames: null o vacío si ningún mod lo asignó
        public string streetName;          // GetSegmentName del segmento de la parada; null o vacío si no hay
    }

    internal sealed class BuildingModel
    {
        public int sourceId;
        public string name;                // prefab
        public string itemClass;
        public string serviceType;         // sub-servicio
        public Vec3 position;
        public float angle;                // radianes
        public int width, length;          // celdas de 8 m
    }

    internal sealed class AreaModel
    {
        public int sourceId;
        public string name;
        public Vec3 labelPosition;
        public string parkType;            // solo parques; null o vacío se omite
    }
}
