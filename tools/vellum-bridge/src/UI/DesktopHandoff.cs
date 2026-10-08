using System;
using System.Diagnostics;
using Microsoft.Win32;
using UnityEngine;
using VellumBridge.Export;

namespace VellumBridge.UI
{
    // El traspaso a Vellum Desktop. Todo ocurre tras una acción explícita del jugador y solo con
    // lo que el sistema ya sabe: el enlace oficial de BridgeInfo y la asociación de .vellummap.
    // Bridge no descarga, no instala, no adivina rutas de instalación y no lanza ejecutables.
    internal static class DesktopHandoff
    {
        // «Obtener Vellum Desktop»: la ficha de la Store en Windows con el listado público, y si
        // no la landing (BridgeInfo.DesktopUrl).
        internal static void Get(string fileForMessage)
        {
            try
            {
                if (BridgeInfo.StoreListed && Application.platform == RuntimePlatform.WindowsPlayer) Application.OpenURL(BridgeInfo.StoreUrl);
                else BridgeStyle.OpenWeb(BridgeInfo.DesktopUrl);
            }
            catch (Exception error)
            {
                UnityEngine.Debug.LogWarning("[VellumBridge] No se pudo abrir la descarga: " + error.Message);
                ResultModal.Show(ResultView.Failure(Strings.GetDesktop, Strings.OpenFailed(error.Message, fileForMessage)));
            }
        }

        // Solo en Windows y solo si el sistema ya tiene un programa para .vellummap. En macOS y
        // Linux no hay una comprobación fiable, así que no se ofrece.
        internal static bool CanOpenInVellum
        {
            get
            {
                if (Application.platform != RuntimePlatform.WindowsPlayer) return false;
                try { return HasHandler(); }
                catch (Exception error)
                {
                    UnityEngine.Debug.LogWarning("[VellumBridge] No se pudo comprobar la asociación de " + VellumWriter.FileExtension + ": " + error.Message);
                    return false;
                }
            }
        }

        private static bool HasHandler()
        {
            string extension = VellumWriter.FileExtension;
            using (RegistryKey user = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\" + extension + @"\UserChoice"))
                if (user != null && !string.IsNullOrEmpty(user.GetValue("ProgId") as string)) return true;
            using (RegistryKey key = Registry.ClassesRoot.OpenSubKey(extension))
            {
                if (key == null) return false;
                if (!string.IsNullOrEmpty(key.GetValue(null) as string)) return true;
                using (RegistryKey progIds = key.OpenSubKey("OpenWithProgids"))
                    return progIds != null && progIds.GetValueNames().Length > 0;
            }
        }

        // «Abrir en Vellum»: el archivo se entrega a la asociación del sistema, nada más.
        internal static void Open(string file)
        {
            try { Process.Start(new ProcessStartInfo(file) { UseShellExecute = true }); }
            catch (Exception error)
            {
                UnityEngine.Debug.LogWarning("[VellumBridge] No se pudo abrir " + file + ": " + error.Message);
                ResultModal.Show(ResultView.Failure(Strings.OpenInVellum, Strings.OpenFailed(error.Message, file)));
            }
        }

        // «Mostrar archivo»: el explorador del sistema, con el archivo seleccionado donde se puede.
        internal static void Reveal(string file)
        {
            try
            {
                switch (Application.platform)
                {
                    case RuntimePlatform.WindowsPlayer: Process.Start("explorer.exe", "/select,\"" + file + "\""); break;
                    case RuntimePlatform.OSXPlayer: Process.Start("open", "-R \"" + file + "\""); break;
                    default: BridgeStyle.OpenFolder(System.IO.Path.GetDirectoryName(file)); break;
                }
            }
            catch (Exception error)
            {
                UnityEngine.Debug.LogWarning("[VellumBridge] No se pudo mostrar " + file + ": " + error.Message);
                ResultModal.Show(ResultView.Failure(Strings.ShowFile, Strings.OpenFailed(error.Message, file)));
            }
        }
    }
}
