using System;
using System.Globalization;
using System.IO;
using ColossalFramework.UI;
using ICities;
using UnityEngine;
using VellumBridge.Capture;
using VellumBridge.Export;

namespace VellumBridge.UI
{
    // La página de Vellum Bridge en Opciones. No imita una app web: la jerarquía sale del tamaño y
    // el color del texto, de separadores y de un solo botón principal, con componentes del propio
    // juego (UIPanel, UILabel, UIButton, UITextureSprite) colgados del panel que da UIHelper.
    internal static class OptionsPanel
    {
        private const float Gap = 8f;
        // Versión y estado; cabe «Carga una ciudad para exportar».
        private const float SideWidth = 260f;

        private static UIPanel page;
        private static UILabel status;
        private static UITextureSprite statusDot;
        private static Texture2D readyDot;
        private static Texture2D idleDot;
        private static UILabel lastExport;
        private static bool wasExporting;

        internal static void Build(UIHelperBase helper)
        {
            var host = ((UIHelper)helper).self as UIComponent;
            if (host == null) { Fallback(helper); return; }
            float width = Mathf.Max(host.width - 40f, 480f);

            page = host.AddUIComponent<UIPanel>();
            page.width = width;
            page.autoLayout = true;
            page.autoLayoutDirection = LayoutDirection.Vertical;
            page.autoLayoutPadding = new RectOffset(0, 0, 0, (int)Gap);
            page.autoFitChildrenVertically = true;

            Header(width);
            BridgeStyle.Divider(page, width);

            if (!ExportStorage.IntroSeen()) Intro(width);

            Title(Strings.ExportTitle);
            Body(Strings.ExportBody, width);
            UIPanel row = BridgeStyle.Row(page, width);
            BridgeStyle.Button(row, Strings.ExportButton, true, BridgeExport.Request);
            Hint(row, Strings.ExportShortcut);
            lastExport = Body("", width);
            BridgeStyle.Button(page, Strings.OpenFolder, false, OpenExportFolder);
            BridgeStyle.Divider(page, width);

            Title(Strings.DesktopTitle);
            Body(Strings.DesktopBody, width);
            Texture2D badge = StoreBadge();
            if (badge != null)
            {
                UITextureSprite store = BridgeStyle.Image(page, badge, 161f);
                store.eventClick += delegate { DesktopHandoff.Get(null); };
                BridgeStyle.Link(page, Strings.OtherPlatforms, delegate { BridgeStyle.OpenWeb(BridgeInfo.DesktopUrl); });
            }
            else BridgeStyle.Button(page, Strings.GetDesktop, false, delegate { DesktopHandoff.Get(null); });
            BridgeStyle.Divider(page, width);

            BridgeStyle.Label(page, Strings.DiagnosticsTitle, 0.9f, BridgeStyle.Secondary);
            BridgeStyle.Label(page, Strings.DiagnosticsBody, 0.8f, BridgeStyle.Muted);
            UIPanel diagnostics = BridgeStyle.Row(page, width);
            BridgeStyle.Button(diagnostics, Strings.CaptureButton, false, BridgeCapture.Request, 0.8f);
            Hint(diagnostics, "Ctrl+Shift+V");
            BridgeStyle.Divider(page, width);

            string folder = ExportStorage.DisplayFolder();
            if (folder != null) BridgeStyle.Wrapped(page, Strings.SavedIn(folder), 0.8f, BridgeStyle.Muted, width);

            page.eventVisibilityChanged += delegate (UIComponent component, bool visible) { if (visible) Refresh(); };
            Refresh();
        }

        // Cada frame en la partida (BridgeThreading): con la página visible, sigue el estado y
        // vuelve a leer la última exportación cuando termina una.
        internal static void Tick()
        {
            if (page == null || !page.isVisible) return;
            bool exporting = BridgeExport.Exporting;
            if (exporting != wasExporting) Refresh();
        }

        private static void Refresh()
        {
            if (page == null) return;
            try
            {
                wasExporting = BridgeExport.Exporting;
                bool ready = BridgeExport.Loaded && !wasExporting;
                status.text = wasExporting ? Strings.StatusExporting : BridgeExport.Loaded ? Strings.StatusReady : Strings.StatusNoCity;
                status.textColor = ready ? BridgeStyle.Ready : BridgeStyle.Secondary;
                statusDot.texture = ready
                    ? readyDot ?? (readyDot = BridgeStyle.Dot(BridgeStyle.Ready))
                    : idleDot ?? (idleDot = BridgeStyle.Dot(BridgeStyle.Muted));

                FileInfo latest = ExportStorage.LatestExport();
                lastExport.isVisible = latest != null;
                if (latest != null)
                    lastExport.text = Strings.LastExport(CityName(latest),
                        latest.LastWriteTime.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture),
                        ExportSummaryFormatter.Size(latest.Length));
            }
            catch (Exception error) { Debug.LogWarning("[VellumBridge] No se pudo actualizar el panel: " + error.Message); }
        }

        // La carpeta de la ciudad, o el nombre del archivo si es de antes de la carpeta por ciudad.
        private static string CityName(FileInfo export)
        {
            return export.Directory.FullName.TrimEnd(Path.DirectorySeparatorChar) == ExportStorage.ExportFolder().TrimEnd(Path.DirectorySeparatorChar)
                ? Path.GetFileNameWithoutExtension(export.Name) : export.Directory.Name;
        }

        // ─── Bloques ───────────────────────────────────────────────────────────────────────

        private static void Header(float width)
        {
            UIPanel header = BridgeStyle.Row(page, width);
            header.autoLayoutPadding = new RectOffset(0, 16, 0, 0);
            Texture2D mark = BridgeStyle.LoadTexture("vellum-mark.png");
            if (mark != null) BridgeStyle.Image(header, mark, 52f);

            UIPanel name = header.AddUIComponent<UIPanel>();
            name.autoLayout = true;
            name.autoLayoutDirection = LayoutDirection.Vertical;
            name.autoFitChildrenVertically = true;
            name.width = width - 52f - 16f - SideWidth - 16f;
            BridgeStyle.Label(name, "Vellum Bridge", 1.6f, BridgeStyle.Primary);
            BridgeStyle.Label(name, Strings.Tagline, 0.85f, BridgeStyle.Secondary);

            UIPanel side = header.AddUIComponent<UIPanel>();
            side.autoLayout = true;
            side.autoLayoutDirection = LayoutDirection.Vertical;
            side.autoFitChildrenVertically = true;
            side.width = SideWidth;
            BridgeStyle.Label(side, BridgeInfo.Version, 0.75f, BridgeStyle.Muted);
            UIPanel line = side.AddUIComponent<UIPanel>();
            line.size = new Vector2(SideWidth, 20f);
            // A mano y no con autoLayout: el punto va centrado con la primera línea del texto.
            statusDot = line.AddUIComponent<UITextureSprite>();
            statusDot.size = new Vector2(8f, 8f);
            statusDot.relativePosition = new Vector3(0f, 6f);
            status = BridgeStyle.Label(line, "", 0.85f, BridgeStyle.Secondary);
            status.relativePosition = new Vector3(14f, 0f);
        }

        // Primer uso: qué hace Bridge y qué hace falta aparte. Continuar la descarta para siempre
        // (ver ExportStorage.IntroSeen).
        private static void Intro(float width)
        {
            UIPanel intro = page.AddUIComponent<UIPanel>();
            intro.width = width;
            intro.autoLayout = true;
            intro.autoLayoutDirection = LayoutDirection.Vertical;
            intro.autoLayoutPadding = new RectOffset(0, 0, 0, (int)Gap);
            intro.autoFitChildrenVertically = true;
            BridgeStyle.Label(intro, Strings.IntroTitle, 1.1f, BridgeStyle.Primary);
            BridgeStyle.Wrapped(intro, Strings.IntroBody, 0.85f, BridgeStyle.Secondary, width);
            UIPanel actions = BridgeStyle.Row(intro, width);
            BridgeStyle.Button(actions, Strings.GetDesktop, false, delegate { DesktopHandoff.Get(null); });
            BridgeStyle.Button(actions, Strings.Continue, true, delegate
            {
                ExportStorage.MarkIntroSeen();
                intro.Hide();
            });
            BridgeStyle.Divider(intro, width);
        }

        private static UILabel Title(string text) { return BridgeStyle.Label(page, text, 1.1f, BridgeStyle.Primary); }

        private static UILabel Body(string text, float width) { return BridgeStyle.Wrapped(page, text, 0.85f, BridgeStyle.Secondary, width); }

        private static void Hint(UIComponent parent, string text) { BridgeStyle.Label(parent, text, 0.8f, BridgeStyle.Muted).padding = new RectOffset(0, 0, 10, 0); }

        // Sin el panel de UIHelper (no debería pasar): los dos botones de siempre.
        private static void Fallback(UIHelperBase helper)
        {
            helper.AddButton(Strings.ExportButton, delegate { BridgeExport.Request(); });
            helper.AddButton(Strings.CaptureButton, delegate { BridgeCapture.Request(); });
        }

        // La insignia oficial de Microsoft en el idioma del panel, solo en Windows y con el listado
        // público (BridgeInfo.StoreListed). El panel se rearma al cambiar el idioma del juego.
        private static Texture2D StoreBadge()
        {
            if (!BridgeInfo.StoreListed || Application.platform != RuntimePlatform.WindowsPlayer) return null;
            return BridgeStyle.LoadTexture(Strings.Spanish ? "store-badge-es.png" : "store-badge-en.png");
        }

        private static void OpenExportFolder()
        {
            try { BridgeStyle.OpenFolder(ExportStorage.ExportFolder()); }
            catch (ExportFailedException error) { ResultModal.Show(ResultView.Failure(Strings.OpenFolderShort, error.Message)); }
        }
    }
}
