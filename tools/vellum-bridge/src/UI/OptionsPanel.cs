using System;
using System.Globalization;
using System.IO;
using ColossalFramework.PlatformServices;
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
        private static readonly Color32 Primary = new Color32(240, 243, 247, 255);
        private static readonly Color32 Secondary = new Color32(154, 166, 180, 255);
        private static readonly Color32 Muted = new Color32(125, 136, 150, 255);
        private static readonly Color32 Rule = new Color32(58, 66, 77, 255);
        private static readonly Color32 ReadyColor = new Color32(143, 209, 138, 255);
        private static readonly Color32 PrimaryButton = new Color32(91, 150, 214, 255);

        private const float Gap = 8f;

        private static UIPanel page;
        private static UILabel status;
        private static UIPanel statusDot;
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
            Divider(width);

            Title(Strings.ExportTitle);
            Body(Strings.ExportBody, width);
            UIPanel row = Row(width);
            Button(row, Strings.ExportButton, true, BridgeExport.Request);
            Hint(row, Strings.ExportShortcut);
            lastExport = Body("", width);
            Button(page, Strings.OpenFolder, false, OpenExportFolder);
            Divider(width);

            Title(Strings.DesktopTitle);
            Body(Strings.DesktopBody, width);
            Texture2D badge = StoreBadge();
            if (badge != null)
            {
                Image(page, badge, 160f);
                Link(Strings.OtherPlatforms, BridgeInfo.DesktopUrl);
            }
            else Button(page, Strings.GetDesktop, false, delegate { OpenWeb(BridgeInfo.DesktopUrl); });
            Divider(width);

            Label(page, Strings.DiagnosticsTitle, 0.9f, Secondary);
            Label(page, Strings.DiagnosticsBody, 0.8f, Muted);
            UIPanel diagnostics = Row(width);
            Button(diagnostics, Strings.CaptureButton, false, BridgeCapture.Request, 0.8f);
            Hint(diagnostics, "Ctrl+Shift+V");
            Divider(width);

            string folder = ExportStorage.DisplayFolder();
            if (folder != null)
            {
                UILabel footer = Label(page, Strings.SavedIn(folder), 0.8f, Muted);
                footer.wordWrap = true;
                footer.autoSize = false;
                footer.autoHeight = true;
                footer.width = width;
            }

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
                status.textColor = ready ? ReadyColor : Secondary;
                statusDot.color = ready ? ReadyColor : Muted;

                FileInfo latest = ExportStorage.LatestExport();
                lastExport.isVisible = latest != null;
                if (latest != null)
                    lastExport.text = Strings.LastExport(CityName(latest),
                        latest.LastWriteTime.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture), Size(latest.Length));
            }
            catch (Exception error) { Debug.LogWarning("[VellumBridge] No se pudo actualizar el panel: " + error.Message); }
        }

        // La carpeta de la ciudad, o el nombre del archivo si es de antes de la carpeta por ciudad.
        private static string CityName(FileInfo export)
        {
            return export.Directory.FullName.TrimEnd(Path.DirectorySeparatorChar) == ExportStorage.ExportFolder().TrimEnd(Path.DirectorySeparatorChar)
                ? Path.GetFileNameWithoutExtension(export.Name) : export.Directory.Name;
        }

        private static string Size(long bytes)
        {
            return bytes < 1024 * 1024
                ? (bytes / 1024.0).ToString("0.0", CultureInfo.InvariantCulture) + " KB"
                : (bytes / (1024.0 * 1024.0)).ToString("0.0", CultureInfo.InvariantCulture) + " MB";
        }

        // ─── Bloques ───────────────────────────────────────────────────────────────────────

        private static void Header(float width)
        {
            UIPanel header = Row(width);
            header.autoLayoutPadding = new RectOffset(0, 16, 0, 0);
            Texture2D mark = LoadTexture("vellum-mark.png");
            if (mark != null) Image(header, mark, 52f);

            UIPanel name = header.AddUIComponent<UIPanel>();
            name.autoLayout = true;
            name.autoLayoutDirection = LayoutDirection.Vertical;
            name.autoFitChildrenVertically = true;
            name.width = width - 52f - 16f - 180f;
            Label(name, "Vellum Bridge", 1.6f, Primary);
            Label(name, Strings.Tagline, 0.85f, Secondary);

            UIPanel side = header.AddUIComponent<UIPanel>();
            side.autoLayout = true;
            side.autoLayoutDirection = LayoutDirection.Vertical;
            side.autoFitChildrenVertically = true;
            side.width = 180f;
            Label(side, BridgeInfo.Version, 0.75f, Muted);
            UIPanel line = side.AddUIComponent<UIPanel>();
            line.autoLayout = true;
            line.autoLayoutDirection = LayoutDirection.Horizontal;
            line.autoLayoutPadding = new RectOffset(0, 6, 4, 0);
            line.autoFitChildrenVertically = true;
            line.width = 180f;
            statusDot = line.AddUIComponent<UIPanel>();
            statusDot.backgroundSprite = "GenericPanelWhite";
            statusDot.size = new Vector2(8f, 8f);
            status = Label(line, "", 0.85f, Secondary);
        }

        private static UILabel Title(string text) { return Label(page, text, 1.1f, Primary); }

        private static UILabel Body(string text, float width)
        {
            UILabel label = Label(page, text, 0.85f, Secondary);
            label.wordWrap = true;
            label.autoSize = false;
            label.autoHeight = true;
            label.width = width;
            return label;
        }

        private static void Hint(UIComponent parent, string text) { Label(parent, text, 0.8f, Muted).padding = new RectOffset(0, 0, 10, 0); }

        private static UILabel Label(UIComponent parent, string text, float scale, Color32 color)
        {
            UILabel label = parent.AddUIComponent<UILabel>();
            label.text = text;
            label.textScale = scale;
            label.textColor = color;
            return label;
        }

        private static UIPanel Row(float width)
        {
            UIPanel row = page.AddUIComponent<UIPanel>();
            row.width = width;
            row.autoLayout = true;
            row.autoLayoutDirection = LayoutDirection.Horizontal;
            row.autoLayoutPadding = new RectOffset(0, 12, 0, 0);
            row.autoFitChildrenVertically = true;
            return row;
        }

        private static void Divider(float width)
        {
            UIPanel rule = page.AddUIComponent<UIPanel>();
            rule.backgroundSprite = "GenericPanelWhite";
            rule.color = Rule;
            rule.size = new Vector2(width, 1f);
        }

        private static UIButton Button(UIComponent parent, string text, bool primary, Action action, float scale = 0.95f)
        {
            UIButton button = parent.AddUIComponent<UIButton>();
            button.text = text;
            button.textScale = scale;
            button.normalBgSprite = "ButtonMenu";
            button.hoveredBgSprite = "ButtonMenuHovered";
            button.pressedBgSprite = "ButtonMenuPressed";
            button.focusedBgSprite = "ButtonMenu";
            button.disabledBgSprite = "ButtonMenuDisabled";
            if (primary) button.color = PrimaryButton;
            button.textPadding = new RectOffset(18, 18, 8, 6);
            button.autoSize = true;
            button.eventClick += delegate { action(); };
            return button;
        }

        private static void Link(string text, string url)
        {
            UIButton link = page.AddUIComponent<UIButton>();
            link.text = text;
            link.textScale = 0.8f;
            link.textColor = Secondary;
            link.hoveredTextColor = Primary;
            link.autoSize = true;
            link.eventClick += delegate { OpenWeb(url); };
        }

        private static void Image(UIComponent parent, Texture2D texture, float width)
        {
            UITextureSprite sprite = parent.AddUIComponent<UITextureSprite>();
            sprite.texture = texture;
            sprite.size = new Vector2(width, width * texture.height / texture.width);
        }

        // Sin el panel de UIHelper (no debería pasar): los dos botones de siempre.
        private static void Fallback(UIHelperBase helper)
        {
            helper.AddButton(Strings.ExportButton, delegate { BridgeExport.Request(); });
            helper.AddButton(Strings.CaptureButton, delegate { BridgeCapture.Request(); });
        }

        // ─── Recursos y enlaces ────────────────────────────────────────────────────────────

        // La insignia solo existe en Windows, con el Product ID y el arte oficial de Microsoft.
        private static Texture2D StoreBadge()
        {
            if (Application.platform != RuntimePlatform.WindowsPlayer || BridgeInfo.StoreProductId.Length == 0) return null;
            return LoadTexture("store-badge.png");
        }

        private static Texture2D LoadTexture(string name)
        {
            try
            {
                using (Stream stream = typeof(OptionsPanel).Assembly.GetManifestResourceStream("VellumBridge." + name))
                {
                    if (stream == null) return null;
                    var bytes = new byte[stream.Length];
                    int read = 0;
                    while (read < bytes.Length) read += stream.Read(bytes, read, bytes.Length - read);
                    var texture = new Texture2D(2, 2, TextureFormat.ARGB32, false);
                    texture.LoadImage(bytes);
                    texture.filterMode = FilterMode.Bilinear;
                    return texture;
                }
            }
            catch (Exception error)
            {
                Debug.LogWarning("[VellumBridge] No se pudo cargar " + name + ": " + error.Message);
                return null;
            }
        }

        private static void OpenWeb(string url)
        {
            if (url.StartsWith("https://", StringComparison.Ordinal))
            {
                try
                {
                    if (PlatformService.IsOverlayEnabled()) { PlatformService.ActivateGameOverlayToWebPage(url); return; }
                }
                catch (Exception error) { Debug.LogWarning("[VellumBridge] Overlay de Steam no disponible: " + error.Message); }
            }
            Application.OpenURL(url);
        }

        private static void OpenExportFolder()
        {
            try
            {
                string folder = ExportStorage.ExportFolder();
                Directory.CreateDirectory(folder);
                Application.OpenURL(new Uri(folder).AbsoluteUri);
            }
            catch (Exception error)
            {
                Debug.LogWarning("[VellumBridge] No se pudo abrir la carpeta de exportaciones: " + error.Message);
                BridgeResultPresenter.Show(error.Message);
            }
        }
    }
}
