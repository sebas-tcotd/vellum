using System;
using UnityEngine;

namespace VellumBridge.UI
{
    internal static class BridgeResultPresenter
    {
        internal static void Show(string message)
        {
            try
            {
                ColossalFramework.UI.UIView.library.ShowModal<ExceptionPanel>("ExceptionPanel")
                    .SetMessage("Vellum Bridge", message, false);
            }
            catch (Exception error) { Debug.LogWarning("[VellumBridge] No se pudo mostrar el resultado: " + error); }
        }
    }
}
