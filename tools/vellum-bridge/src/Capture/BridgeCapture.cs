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
        private static volatile ResultView pendingResult;

        internal static void SetLoaded(bool value) { loaded = value; capturing = false; pendingResult = null; }

        // Se invoca desde el botón de opciones, en el hilo principal.
        internal static void Request()
        {
            if (!loaded) { ResultModal.Show(ResultView.Failure(Strings.CantCaptureTitle, Strings.NeedCityToCapture)); return; }
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
            ResultView result = pendingResult;
            if (result == null) return;
            pendingResult = null;
            ResultModal.Show(result);
        }

        private static void Run()
        {
            try { pendingResult = Capture(); }
            catch (Exception error)
            {
                Debug.LogError("[VellumBridge] Captura fallida: " + error);
                pendingResult = ResultView.Failure(Strings.CaptureFailedTitle, error.Message);
            }
            finally { capturing = false; }
        }

        private static ResultView Capture()
        {
            if (!loaded || SavePanel.isSaving)
            {
                Debug.LogWarning("[VellumBridge] Captura rechazada: ciudad no cargada o guardado en curso.");
                return ResultView.Failure(Strings.CantCaptureTitle, Strings.CaptureRejected);
            }

            Snapshot document = SnapshotExtractor.Extract();

            if (SavePanel.isSaving)
            {
                Debug.LogWarning("[VellumBridge] Captura descartada: comenzó un guardado.");
                return ResultView.Failure(Strings.CaptureFailedTitle, Strings.CaptureDiscarded);
            }

            try
            {
                string folder = System.IO.Path.Combine(System.IO.Path.Combine(
                    ColossalFramework.IO.DataLocation.localApplicationData, "VellumBridge"), "Snapshots");
                string summary = SnapshotWriter.Write(document, folder);
                Debug.Log("[VellumBridge] " + summary);
                var captured = new ResultView { kind = ResultKind.Success, title = Strings.CapturedTitle, body = summary };
                captured.note = Strings.ExtractionErrors(document.diagnostics.errors.Count);
                captured.folder = folder;
                return captured;
            }
            catch (Exception error)
            {
                Debug.LogError("[VellumBridge] Escritura fallida: " + error);
                return ResultView.Failure(Strings.CaptureFailedTitle, error.Message);
            }
        }
    }
}
