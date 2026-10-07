using System.Collections.Generic;
using System.IO;
using VellumBridge.Export;

namespace VellumBridge.UI
{
    internal enum ResultKind { Progress, Success, Failure }

    // Lo que muestra el modal de resultado. Puro: lo arman los hilos de exportación y captura, y
    // ResultModal lo dibuja en el hilo principal.
    internal sealed class ResultView
    {
        public ResultKind kind;
        public string title;
        public string body;
        public string note;                                  // línea secundaria, más tenue
        public List<string> limits = new List<string>();
        public string details;                               // lo que copia «Copiar detalles»
        public string folder;                                // carpeta que abre el botón secundario

        internal static ResultView Progress(string title, string body)
        {
            return new ResultView { kind = ResultKind.Progress, title = title, body = body };
        }

        internal static ResultView Failure(string title, string body)
        {
            return new ResultView { kind = ResultKind.Failure, title = title, body = body };
        }

        // Conteos humanos en la cara; nodos, segmentos y módulos quedan en los detalles y en el log.
        internal static ResultView Exported(ExportSummary summary)
        {
            string folder = Path.GetDirectoryName(summary.path);
            return new ResultView
            {
                kind = ResultKind.Success,
                title = Strings.CityExported(Path.GetFileName(folder)),
                body = Path.GetFileName(summary.path) + " · " + ExportSummaryFormatter.Size(summary.bytes),
                note = Strings.HumanCounts(summary.buildings, summary.lines, summary.stops, summary.districts),
                limits = summary.limits.FindAll(limit => !Strings.IsPermanentNote(limit)),
                details = ExportSummaryFormatter.Describe(summary),
                folder = folder,
            };
        }
    }
}
