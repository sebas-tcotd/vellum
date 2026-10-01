using ICities;
using UnityEngine;
using VellumBridge.Capture;
using VellumBridge.Export;

namespace VellumBridge
{
    public sealed class BridgeThreading : ThreadingExtensionBase
    {
        // OnUpdate corre en el hilo principal cada frame, también con la simulación en pausa.
        public override void OnUpdate(float realTimeDelta, float simulationTimeDelta)
        {
            if (!BridgeMod.Active) return;
            // Ctrl+Shift+V captura sin abrir el menú, que pausa el juego: así se puede
            // capturar con la simulación corriendo. Con la ciudad en pausa, igual que el botón.
            bool ctrl = Input.GetKey(KeyCode.LeftControl) || Input.GetKey(KeyCode.RightControl);
            bool shift = Input.GetKey(KeyCode.LeftShift) || Input.GetKey(KeyCode.RightShift);
            if (ctrl && shift && Input.GetKeyDown(KeyCode.V)) BridgeCapture.Request();
            if (ctrl && shift && Input.GetKeyDown(KeyCode.E)) BridgeExport.Request();
            BridgeCapture.ShowPendingResult();
            BridgeExport.ShowPendingResult();
        }
    }
}
