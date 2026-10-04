using System;
using ColossalFramework.Globalization;
using UnityEngine;

namespace VellumBridge
{
    // Fija el idioma de Strings desde el del juego: "es" es español y cualquier otro, inglés.
    internal static class BridgeLocale
    {
        private static bool subscribed;

        internal static void Refresh()
        {
            try
            {
                if (!LocaleManager.exists) return;
                Strings.Spanish = LocaleManager.instance.language == "es";
                if (subscribed) return;
                LocaleManager.eventLocaleChanged += Refresh;
                subscribed = true;
            }
            catch (Exception error) { Debug.LogWarning("[VellumBridge] No se pudo leer el idioma del juego: " + error.Message); }
        }

        internal static void Unsubscribe()
        {
            if (!subscribed) return;
            try { LocaleManager.eventLocaleChanged -= Refresh; }
            catch (Exception) { }
            subscribed = false;
        }
    }
}
