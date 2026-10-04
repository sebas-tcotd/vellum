using System;
using System.IO;
using System.Text;

namespace VellumBridge.Capture
{
    internal static class SnapshotWriter
    {
        internal static string Write(Snapshot document, string folder)
        {
            Directory.CreateDirectory(folder);
            string id = DateTime.UtcNow.ToString("yyyyMMddTHHmmssfffZ");
            string target = Path.Combine(folder, "snapshot-" + id + ".json");
            string temporary = target + ".part";
            try
            {
                File.WriteAllText(temporary, SnapshotJson.Write(document), new UTF8Encoding(false));
                File.Move(temporary, target);
            }
            finally { if (File.Exists(temporary)) File.Delete(temporary); }
            string summary = Strings.SnapshotWritten(document.diagnostics.complete, target, new FileInfo(target).Length);
            return summary;
        }
    }
}
