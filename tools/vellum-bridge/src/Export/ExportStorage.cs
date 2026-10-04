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

        private static bool Unix { get { return Path.DirectorySeparatorChar == '/'; } }

        // La raíz de las exportaciones (cada ciudad va en su subcarpeta, ver VellumWriter.CityFolder).
        // Windows: Documentos\Vellum Bridge, donde el usuario tenga Documentos. macOS y Linux:
        // ~/Vellum Bridge (Mono devuelve $HOME como carpeta personal).
        internal static string ExportFolder()
        {
            string parent = Environment.GetFolderPath(Unix ? Environment.SpecialFolder.Personal : Environment.SpecialFolder.MyDocuments);
            if (string.IsNullOrEmpty(parent) || !Path.IsPathRooted(parent))
                throw new ExportFailedException(Strings.NoUserFolder(parent));
            return Path.Combine(parent, "Vellum Bridge");
        }

        // La carpeta como la lee el jugador: con ~ en macOS y Linux, o null si no se puede resolver.
        internal static string DisplayFolder()
        {
            string folder;
            try { folder = ExportFolder(); }
            catch (ExportFailedException) { return null; }
            if (!Unix) return folder;
            string home = Environment.GetFolderPath(Environment.SpecialFolder.Personal).TrimEnd('/');
            return home.Length > 0 && folder.StartsWith(home + "/", StringComparison.Ordinal) ? "~" + folder.Substring(home.Length) : folder;
        }

        // El .vellummap más reciente en la carpeta de alguna ciudad o en la raíz (exportaciones
        // anteriores a la carpeta por ciudad), o null si no hay ninguno.
        internal static FileInfo LatestExport()
        {
            try
            {
                var root = new DirectoryInfo(ExportFolder());
                if (!root.Exists) return null;
                FileInfo latest = null;
                Consider(root, ref latest);
                foreach (DirectoryInfo city in root.GetDirectories())
                    if (!city.Name.StartsWith(".", StringComparison.Ordinal)) Consider(city, ref latest);
                return latest;
            }
            catch (Exception error)
            {
                Debug.LogWarning("[VellumBridge] No se pudo buscar la última exportación: " + error.Message);
                return null;
            }
        }

        private static void Consider(DirectoryInfo folder, ref FileInfo latest)
        {
            foreach (FileInfo file in folder.GetFiles("*" + VellumWriter.FileExtension))
                if (latest == null || file.LastWriteTimeUtc > latest.LastWriteTimeUtc) latest = file;
        }
    }
}
