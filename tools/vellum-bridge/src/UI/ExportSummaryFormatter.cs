using System.Globalization;
using System.Text;
using VellumBridge.Export;

namespace VellumBridge.UI
{
    internal static class ExportSummaryFormatter
    {
        // El resumen completo (ruta, conteos técnicos, módulos y límites): lo que copia «Copiar
        // detalles» para un reporte de error.
        internal static string Describe(ExportSummary summary)
        {
            var text = new StringBuilder();
            text.Append(Strings.ExportedHeader).Append("\n").Append(summary.path).Append("\n");
            text.Append(Size(summary.bytes)).Append("\n\n");
            text.Append(Strings.Counts(summary.nodes, summary.segments, summary.lines, summary.stops,
                summary.buildings, summary.districts, summary.parks)).Append("\n\n");
            text.Append(Strings.Modules).Append(string.Join(", ", summary.modules.ToArray())).Append("\n");
            if (summary.limits.Count > 0)
            {
                text.Append("\n").Append(Strings.Limits).Append("\n");
                foreach (string limit in summary.limits) text.Append("• ").Append(limit).Append("\n");
            }
            return text.ToString();
        }

        internal static string Size(long bytes)
        {
            if (bytes < 0) return Strings.UnknownSize;
            return bytes < 1024 * 1024
                ? (bytes / 1024.0).ToString("0.0", CultureInfo.InvariantCulture) + " KB"
                : (bytes / (1024.0 * 1024.0)).ToString("0.0", CultureInfo.InvariantCulture) + " MB";
        }
    }
}
