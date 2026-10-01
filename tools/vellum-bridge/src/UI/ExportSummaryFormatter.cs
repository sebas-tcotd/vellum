using System.Globalization;
using System.Text;
using VellumBridge.Export;

namespace VellumBridge.UI
{
    internal static class ExportSummaryFormatter
    {
        internal static string Describe(ExportSummary summary)
        {
            var text = new StringBuilder();
            text.Append("Exportado para Vellum:\n").Append(summary.path).Append("\n");
            if (summary.bytes < 0) text.Append("tamaño desconocido");
            else if (summary.bytes < 1024 * 1024)
                text.Append((summary.bytes / 1024.0).ToString("0.0", CultureInfo.InvariantCulture)).Append(" KB");
            else text.Append((summary.bytes / (1024.0 * 1024.0)).ToString("0.0", CultureInfo.InvariantCulture)).Append(" MB");
            text.Append("\n\n");
            text.Append(summary.nodes).Append(" nodos, ").Append(summary.segments).Append(" segmentos, ")
                .Append(summary.lines).Append(" líneas, ").Append(summary.stops).Append(" paradas, ")
                .Append(summary.buildings).Append(" edificios, ").Append(summary.districts).Append(" distritos, ")
                .Append(summary.parks).Append(" parques.\n\n");
            text.Append("Módulos: ").Append(string.Join(", ", summary.modules.ToArray())).Append("\n");
            if (summary.limits.Count > 0)
            {
                text.Append("\nLímites:\n");
                foreach (string limit in summary.limits) text.Append("• ").Append(limit).Append("\n");
            }
            return text.ToString();
        }
    }
}
