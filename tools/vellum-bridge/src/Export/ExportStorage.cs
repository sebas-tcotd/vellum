using System;
using System.IO;
using UnityEngine;

namespace VellumBridge.Export
{
    internal static class ExportStorage
    {
        // Un cierre del juego a mitad de escritura deja un .part (el hilo es background). Como solo
        // hay una exportación a la vez, cualquier .part de la carpeta es huérfano.
        internal static void DeleteOrphanParts(string folder)
        {
            if (!Directory.Exists(folder)) return;
            foreach (string part in Directory.GetFiles(folder, "*" + VellumWriter.FileExtension + ".part"))
            {
                try
                {
                    File.Delete(part);
                    Debug.Log("[VellumBridge] Exportación: borrado el temporal huérfano " + part + ".");
                }
                catch (Exception error) { Debug.LogWarning("[VellumBridge] Exportación: no se pudo borrar " + part + ": " + error.Message); }
            }
        }

        // Documentos/Vellum Bridge (la raíz; cada ciudad va en su subcarpeta, ver
        // VellumWriter.CityFolder). Mono en macOS y Linux devuelve $HOME como MyDocuments: se usa
        // $HOME/Documents si existe y, si no, $HOME/Vellum Bridge.
        internal static string ExportFolder()
        {
            string documents = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
            if (string.IsNullOrEmpty(documents) || !Path.IsPathRooted(documents))
                throw new ExportFailedException("No se encontró la carpeta Documentos del usuario (el sistema devolvió «"
                    + documents + "»). No se escribió ningún archivo.");
            if (Path.DirectorySeparatorChar == '/')
            {
                string nested = Path.Combine(documents, "Documents");
                if (Directory.Exists(nested)) documents = nested;
            }
            return Path.Combine(documents, "Vellum Bridge");
        }
    }
}
