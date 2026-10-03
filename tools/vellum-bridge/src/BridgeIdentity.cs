using System;
using ICities;
using UnityEngine;
using VellumBridge.Export;

namespace VellumBridge
{
    // Identidad de la ciudad para Vellum, guardada en la partida con la serialización de mods de
    // CS1 (clave "VellumBridge.Identity", formato en VellumIdentity). Con ella cada
    // exportación lleva `city.id` y, desde la segunda, `parentSnapshotId`.
    //
    // Una partida sin identidad guardada no estrena un id al azar: lo deriva de su
    // `m_gameInstanceIdentifier` (UUIDv5), así que conserva el mismo aunque el jugador no guarde
    // después de exportar. El padre sale entonces del índice local de linaje (`.lineage`). Una
    // identidad ya guardada en la partida prevalece, para no cambiar los `city.id` existentes.
    public sealed class BridgeIdentity : SerializableDataExtensionBase
    {
        private const string Key = "VellumBridge.Identity";

        // `cityId` se lee y se escribe en el hilo de simulación (extracción, OnLoadData,
        // OnSaveData) y `lastSnapshotId` también desde el hilo de escritura: todo bajo `gate`.
        private static readonly object gate = new object();
        private static string cityId;
        private static string lastSnapshotId;

        internal static void Reset()
        {
            lock (gate)
            {
                cityId = null;
                lastSnapshotId = null;
            }
        }

        public override void OnLoadData()
        {
            string loadedCity = null, loadedSnapshot = null;
            try
            {
                byte[] data = serializableDataManager.LoadData(Key);
                // Una entrada corrupta (sin cityId, ids inválidos) cuenta como vacía.
                if (data != null && !VellumIdentity.TryDecode(data, out loadedCity, out loadedSnapshot))
                    Debug.LogWarning("[VellumBridge] Identidad de la partida ilegible: se ignora.");
            }
            catch (Exception error)
            {
                Debug.LogWarning("[VellumBridge] No se pudo leer la identidad de la partida: " + error.Message);
                loadedCity = null;
                loadedSnapshot = null;
            }
            lock (gate)
            {
                cityId = loadedCity;
                lastSnapshotId = loadedSnapshot;
            }
            Debug.Log("[VellumBridge] Identidad de la ciudad: " + (loadedCity ?? "ninguna todavía") + ".");
        }

        public override void OnSaveData()
        {
            string city, snapshot;
            lock (gate)
            {
                city = cityId;
                snapshot = lastSnapshotId;
            }
            if (city == null) return;
            try
            {
                serializableDataManager.SaveData(Key, VellumIdentity.Encode(city, snapshot));
            }
            catch (Exception error)
            {
                Debug.LogWarning("[VellumBridge] No se pudo guardar la identidad en la partida: " + error.Message);
            }
        }

        // La identidad para una exportación. Sin identidad guardada, `cityId` se deriva del
        // identificador de partida (o es aleatorio si el juego no da uno). Devuelve la última
        // `snapshotId` publicada (el padre de la nueva): la de la partida o, si no la tiene, la del
        // índice de linaje en `root`. null si no hay ninguna.
        internal static string ForExport(string gameInstanceId, string root, out string parentSnapshotId)
        {
            lock (gate)
            {
                if (cityId == null)
                {
                    cityId = VellumIdentity.NormalizeInstanceId(gameInstanceId) != null
                        ? VellumIdentity.CityIdFromInstance(gameInstanceId)
                        : Guid.NewGuid().ToString();
                }
                if (lastSnapshotId == null) lastSnapshotId = VellumIdentity.ReadLastSnapshot(root, cityId);
                parentSnapshotId = lastSnapshotId;
                return cityId;
            }
        }

        // Solo tras publicar el archivo, y solo si la ciudad no cambió (lo comprueba el llamador).
        // También se anota en el índice de linaje, para la próxima sesión sin guardar.
        internal static void Published(string root, string snapshotId)
        {
            string city;
            lock (gate)
            {
                lastSnapshotId = snapshotId;
                city = cityId;
            }
            if (city == null) return;
            try
            {
                VellumIdentity.WriteLastSnapshot(root, city, snapshotId);
            }
            catch (Exception error)
            {
                Debug.LogWarning("[VellumBridge] No se pudo anotar el linaje de la ciudad: " + error.Message);
            }
        }
    }
}
