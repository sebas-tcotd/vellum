using System;
using ColossalFramework;
using UnityEngine;
using System.Threading;
using VellumBridge.UI;

namespace VellumBridge.Export
{
    // Exportación «Exportar para Vellum»: el documento .vellummap (docs/es/vellummap-format.md).
    // La copia de buffers ocurre en el hilo de simulación (o aquí mismo con el juego en pausa); la
    // serialización, compresión y escritura, en un hilo aparte para no frenar la simulación. El
    // resultado vuelve por pendingResult a OnUpdate, como en la captura.
    internal static class BridgeExport
    {
        // Transiciones de estado bajo `gate`. `generation` cambia con cada carga o descarga de
        // ciudad: el resultado de una exportación solo se publica si su generación sigue vigente,
        // así el de la ciudad anterior nunca aparece en la nueva.
        private static readonly object gate = new object();
        private static bool loaded;
        private static int generation;
        private static bool exporting;
        private static bool writing;          // hilo de escritura vivo
        private static volatile string pendingResult;

        internal static void SetLoaded(bool value)
        {
            lock (gate)
            {
                loaded = value;
                generation++;
                pendingResult = null;
                // Con un hilo de escritura vivo, `exporting` lo libera ese hilo al terminar: así no
                // hay dos exportaciones simultáneas.
                if (!writing) exporting = false;
            }
        }

        internal static void Request()
        {
            int ticket;
            lock (gate)
            {
                if (!loaded) { BridgeResultPresenter.Show("Carga una ciudad antes de exportar para Vellum. Inténtalo de nuevo."); return; }
                if (exporting) { BridgeResultPresenter.Show("Ya hay una exportación en curso."); return; }
                if (SavePanel.isSaving) { BridgeResultPresenter.Show("Hay un guardado en curso. Inténtalo de nuevo cuando termine."); return; }
                exporting = true;
                ticket = generation;
            }
            Debug.Log("[VellumBridge] Exportación: solicitada.");
            var simulation = Singleton<SimulationManager>.instance;
            if (IsPaused(simulation))
            {
                BridgeResultPresenter.Show("Exportando para Vellum…\n\nLa ventana mostrará el resultado al terminar.");
                Extract(ticket, false);
            }
            else
            {
                // Con el juego en marcha, la extracción pausa la simulación y la reanuda al terminar.
                BridgeResultPresenter.Show("Capturando tu ciudad…\n\nEl juego se pausa un momento y sigue solo. La ventana mostrará el resultado al terminar.");
                simulation.AddAction(delegate { Extract(ticket, true); });
            }
        }

        private static bool IsPaused(SimulationManager simulation)
        {
            return simulation.SimulationPaused || simulation.ForcedSimulationPaused;
        }

        internal static void ShowPendingResult()
        {
            string message = pendingResult;
            if (message == null) return;
            pendingResult = null;
            BridgeResultPresenter.Show(message);
        }

        // El archivo ya está publicado: su `snapshotId` pasa a ser el padre de la próxima
        // exportación, salvo que la ciudad haya cambiado (sería la identidad de otra partida).
        private static void PublishedSnapshot(int ticket, string snapshotId)
        {
            lock (gate)
            {
                if (ticket == generation) BridgeIdentity.Published(snapshotId);
                else Debug.Log("[VellumBridge] Exportación: la ciudad cambió; su snapshotId no se registra como padre.");
            }
        }

        // Termina la operación dueña de `exporting`. El mensaje solo se publica si la ciudad no cambió.
        private static void Finish(int ticket, string message)
        {
            lock (gate)
            {
                exporting = false;
                writing = false;
                if (ticket == generation) pendingResult = message;
                else Debug.Log("[VellumBridge] Exportación: resultado descartado porque la ciudad cambió: " + message);
            }
        }

        // `pauseIfRunning`: la acción corre en el hilo de simulación, entre dos pasos. Si el juego
        // sigue en marcha, se pausa solo durante la extracción, así `water-depth.bin` sale de un
        // estado quieto; la escritura (otro hilo) ya corre con el juego reanudado.
        private static void Extract(int ticket, bool pauseIfRunning)
        {
            VellumModel model;
            try
            {
                bool cityLoaded;
                lock (gate)
                {
                    cityLoaded = loaded;
                    // La ciudad cambió mientras la acción esperaba en la cola: SetLoaded ya liberó
                    // `exporting` y puede haber otra exportación en marcha, así que no se toca.
                    if (ticket != generation)
                    {
                        Debug.LogWarning("[VellumBridge] Exportación descartada: la ciudad cambió antes de extraer.");
                        return;
                    }
                }
                if (!cityLoaded || SavePanel.isSaving)
                {
                    Debug.LogWarning("[VellumBridge] Exportación rechazada: ciudad no cargada o guardado en curso.");
                    Finish(ticket, "Exportación cancelada: no hay ciudad cargada o hay un guardado en curso. No se escribió nada. Inténtalo de nuevo.");
                    return;
                }
                string parentSnapshotId;
                string cityId = BridgeIdentity.ForExport(out parentSnapshotId);
                var watch = System.Diagnostics.Stopwatch.StartNew();
                var simulation = Singleton<SimulationManager>.instance;
                // Solo se reanuda si la pausó Bridge: una pausa del jugador (o forzada) se respeta.
                bool pausedHere = pauseIfRunning && !IsPaused(simulation);
                if (pausedHere) simulation.SimulationPaused = true;
                Debug.Log("[VellumBridge] Exportación: extracción iniciada" + (pausedHere ? " (simulación pausada por Bridge)." : "."));
                try
                {
                    model = VellumExtractor.Extract(BridgeInfo.Version, cityId, parentSnapshotId);
                }
                finally
                {
                    if (pausedHere) simulation.SimulationPaused = false;
                }
                Debug.Log("[VellumBridge] Exportación: extracción terminada en " + watch.ElapsedMilliseconds + " ms ("
                    + model.nodes.Count + " nodos, " + model.segments.Count + " segmentos, " + model.lines.Count + " líneas, "
                    + model.buildings.Count + " edificios; simulación " + (model.simulationPaused ? "en pausa" : "en marcha") + ").");
            }
            catch (Exception error)
            {
                Debug.LogError("[VellumBridge] Exportación: extracción fallida: " + error);
                Finish(ticket, "Exportación cancelada: " + error.Message + (error is ExportFailedException ? "" : " No se escribió ningún archivo."));
                return;
            }

            try
            {
                lock (gate)
                {
                    if (ticket != generation)
                    {
                        // SetLoaded ya liberó `exporting` (no había escritura viva): no se toca.
                        Debug.LogWarning("[VellumBridge] Exportación descartada: la ciudad cambió durante la extracción.");
                        return;
                    }
                    writing = true;
                }
                var thread = new Thread(delegate () { Write(ticket, model); });
                thread.IsBackground = true;
                thread.Name = "VellumBridge export";
                thread.Start();
            }
            catch (Exception error)
            {
                Debug.LogError("[VellumBridge] Exportación: no se pudo iniciar la escritura: " + error);
                Finish(ticket, "Exportación cancelada: no se pudo iniciar la escritura (" + error.Message + "). No se escribió ningún archivo.");
            }
        }

        private static void Write(int ticket, VellumModel model)
        {
            ExportSummary summary = null;
            bool published = false;
            try
            {
                var watch = System.Diagnostics.Stopwatch.StartNew();
                string folder = ExportStorage.ExportFolder();
                string cityFolder = VellumWriter.CityFolder(folder, model);
                // La raíz por los .part de versiones anteriores a la carpeta por ciudad.
                ExportStorage.DeleteOrphanParts(folder);
                ExportStorage.DeleteOrphanParts(cityFolder);
                Debug.Log("[VellumBridge] Exportación: escritura iniciada en " + cityFolder + ".");
                var options = new WriterOptions();
                options.isSaving = delegate { return SavePanel.isSaving; };
                summary = VellumWriter.Export(model, folder, options);
                published = true;
                PublishedSnapshot(ticket, model.snapshotId);
                Debug.Log("[VellumBridge] Exportación: publicada " + summary.path + " (" + summary.bytes + " bytes) en "
                    + watch.ElapsedMilliseconds + " ms. Módulos: " + string.Join(", ", summary.modules.ToArray())
                    + ". Límites: " + summary.limits.Count + ".");
                foreach (string limit in summary.limits) Debug.Log("[VellumBridge] Exportación: límite: " + limit);
                Finish(ticket, ExportSummaryFormatter.Describe(summary));
            }
            catch (Exception error)
            {
                if (published)
                {
                    Debug.LogError("[VellumBridge] Exportación: publicada, pero falló el resumen: " + error);
                    Finish(ticket, "El archivo sí se escribió:\n" + summary.path
                        + "\n\nNo se pudo preparar el resumen (" + error.Message + "). Revisa el log [VellumBridge].");
                    return;
                }
                Debug.LogError("[VellumBridge] Exportación: escritura fallida: " + error);
                Finish(ticket, "Exportación cancelada: " + (error is ExportFailedException ? error.Message
                    : "error inesperado al escribir (" + error.Message + "). No se escribió ningún archivo."));
            }
        }

    }
}
