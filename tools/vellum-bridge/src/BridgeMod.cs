using System.Reflection;
using ICities;
using UnityEngine;
using VellumBridge.Capture;
using VellumBridge.Export;

namespace VellumBridge
{
    public sealed class BridgeMod : IUserMod
    {
        // La versión en el nombre: es lo único que el Content Manager y la pestaña de opciones
        // muestran, y así se ve qué DLL cargó el juego.
        public string Name { get { return "Vellum Bridge " + BridgeInfo.Version; } }
        public string Description { get { return "Exporta tu ciudad a .vellummap para abrirla en Vellum Desktop."; } }

        // Al recargar el mod en caliente, CS1 llama OnDisabled en la instancia vieja y OnEnabled en
        // la nueva, pero el ensamblado viejo sigue en memoria y, con una ciudad cargada, su
        // BridgeThreading sigue registrado hasta que se descarga (el nuevo entra con la próxima
        // carga). `Active` es estático por ensamblado: apaga los atajos del viejo, así nunca
        // corren dos copias ni código viejo. El log deja ver qué DLL quedó cargado.
        internal static bool Active;

        public void OnEnabled()
        {
            Active = true;
            Debug.Log("[VellumBridge] Mod activado: " + BridgeInfo.Version + " (ensamblado " + Assembly.GetExecutingAssembly().GetName().Version + ").");
        }

        public void OnDisabled()
        {
            Active = false;
            Debug.Log("[VellumBridge] Mod desactivado: " + BridgeInfo.Version + " (ensamblado " + Assembly.GetExecutingAssembly().GetName().Version + ").");
        }

        public void OnSettingsUI(UIHelperBase helper)
        {
            helper.AddButton("Capturar Raw Snapshot", delegate { BridgeCapture.Request(); });
            helper.AddButton("Exportar para Vellum", delegate { BridgeExport.Request(); });
        }
    }
}
