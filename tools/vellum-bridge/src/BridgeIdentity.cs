using System;
using ICities;
using UnityEngine;
using VellumBridge.Export;

namespace VellumBridge
{
    // Identidad de la ciudad para Vellum, guardada en la partida con la serialización de mods de
    // CS1 (clave "VellumBridge.Identity", formato en VellumIdentity). Con ella cada
    // exportación lleva `city.id` y, desde la segunda, `parentSnapshotId`. Límite conocido: si el
    // jugador no guarda la partida después de exportar, la identidad nueva se pierde y la próxima
    // carga vuelve a la guardada (o a ninguna).
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

        // La identidad para una exportación: genera `cityId` en la primera. Devuelve la última
        // `snapshotId` publicada (el padre de la nueva), o null.
        internal static string ForExport(out string parentSnapshotId)
        {
            lock (gate)
            {
                if (cityId == null) cityId = Guid.NewGuid().ToString();
                parentSnapshotId = lastSnapshotId;
                return cityId;
            }
        }

        // Solo tras publicar el archivo, y solo si la ciudad no cambió (lo comprueba el llamador).
        internal static void Published(string snapshotId)
        {
            lock (gate) lastSnapshotId = snapshotId;
        }
    }
}
