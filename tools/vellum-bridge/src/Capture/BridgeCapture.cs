using System;
using ColossalFramework;
using UnityEngine;
using VellumBridge.UI;

namespace VellumBridge.Capture
{
    internal static class BridgeCapture
    {
        private static bool loaded;
        private static volatile bool capturing;
        private static volatile string pendingResult;

        internal static void SetLoaded(bool value) { loaded = value; capturing = false; pendingResult = null; }

        // Se invoca desde el botón de opciones, en el hilo principal.
        internal static void Request()
        {
            if (!loaded) { BridgeResultPresenter.Show(Strings.NeedCityToCapture); return; }
            if (capturing) return;
            capturing = true;
            var simulation = Singleton<SimulationManager>.instance;
            // En pausa (p. ej. con el menú Esc abierto) el hilo de simulación no avanza ticks,
            // así que se captura aquí mismo. Con la simulación corriendo, la lectura se encola
            // a ese hilo para no leer los buffers mientras se modifican.
            if (simulation.SimulationPaused || simulation.ForcedSimulationPaused) Run();
            else simulation.AddAction(Run);
        }

        internal static void ShowPendingResult()
        {
            string message = pendingResult;
            if (message == null) return;
            pendingResult = null;
            BridgeResultPresenter.Show(message);
        }

        private static void Run()
        {
            try { pendingResult = Capture(); }
            catch (Exception error)
            {
                Debug.LogError("[VellumBridge] Captura fallida: " + error);
                pendingResult = Strings.CaptureFailed(error.Message);
            }
            finally { capturing = false; }
        }

        private static string Capture()
        {
            if (!loaded || SavePanel.isSaving)
            {
                Debug.LogWarning("[VellumBridge] Captura rechazada: ciudad no cargada o guardado en curso.");
                return Strings.CaptureRejected;
            }

            Snapshot document = SnapshotExtractor.Extract();

            if (SavePanel.isSaving)
            {
                Debug.LogWarning("[VellumBridge] Captura descartada: comenzó un guardado.");
                return Strings.CaptureDiscarded;
            }

            try
            {
                string summary = SnapshotWriter.Write(document, System.IO.Path.Combine(System.IO.Path.Combine(
                    ColossalFramework.IO.DataLocation.localApplicationData, "VellumBridge"), "Snapshots"));
                Debug.Log("[VellumBridge] " + summary);
                return summary + "\n\n" + Strings.ExtractionErrors(document.diagnostics.errors.Count);
            }
            catch (Exception error)
            {
                Debug.LogError("[VellumBridge] Escritura fallida: " + error);
                return Strings.CaptureWriteFailed(error.Message);
            }
        }
    }
}
