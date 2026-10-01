using ICities;
using UnityEngine;
using VellumBridge.Capture;
using VellumBridge.Export;

namespace VellumBridge
{
    public sealed class BridgeLoading : LoadingExtensionBase
    {
        public override void OnLevelLoaded(LoadMode mode)
        {
            BridgeCapture.SetLoaded(true);
            BridgeExport.SetLoaded(true);
            Debug.Log("[VellumBridge] Ciudad cargada; captura con Ctrl+Shift+V y exportación para Vellum con Ctrl+Shift+E, o desde las opciones del mod.");
        }

        public override void OnLevelUnloading()
        {
            BridgeCapture.SetLoaded(false);
            BridgeExport.SetLoaded(false);
            // La próxima partida trae la suya en OnLoadData; así nunca hereda la de esta.
            BridgeIdentity.Reset();
        }
    }
}
