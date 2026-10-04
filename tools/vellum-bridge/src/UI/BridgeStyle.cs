using System;
using System.IO;
using ColossalFramework.PlatformServices;
using ColossalFramework.UI;
using UnityEngine;

namespace VellumBridge.UI
{
    // Lo que comparten el panel de opciones y el modal de resultado: colores, texto, botones,
    // líneas, texturas y enlaces. La jerarquía sale del tamaño y el color del texto, no de adornos.
    internal static class BridgeStyle
    {
        internal static readonly Color32 Primary = new Color32(240, 243, 247, 255);
        internal static readonly Color32 Secondary = new Color32(154, 166, 180, 255);
        internal static readonly Color32 Muted = new Color32(125, 136, 150, 255);
        internal static readonly Color32 Rule = new Color32(58, 66, 77, 255);
        internal static readonly Color32 Ready = new Color32(143, 209, 138, 255);
        internal static readonly Color32 Failed = new Color32(224, 122, 106, 255);
        internal static readonly Color32 Warning = new Color32(200, 169, 106, 255);
        internal static readonly Color32 PrimaryButton = new Color32(91, 150, 214, 255);

        internal static UILabel Label(UIComponent parent, string text, float scale, Color32 color)
        {
            UILabel label = parent.AddUIComponent<UILabel>();
            label.text = text;
            label.textScale = scale;
            label.textColor = color;
            return label;
        }

        internal static UILabel Wrapped(UIComponent parent, string text, float scale, Color32 color, float width)
        {
            UILabel label = Label(parent, text, scale, color);
            label.wordWrap = true;
            label.autoSize = false;
            label.autoHeight = true;
            label.width = width;
            return label;
        }

        internal static UIButton Button(UIComponent parent, string text, bool primary, Action action, float scale = 0.95f)
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

        // Texto clicable sin fondo, más tenue que un botón.
        internal static UIButton Link(UIComponent parent, string text, Action action, float scale = 0.8f)
        {
            UIButton link = parent.AddUIComponent<UIButton>();
            link.text = text;
            link.textScale = scale;
            link.textColor = Secondary;
            link.hoveredTextColor = Primary;
            link.pressedTextColor = Primary;
            link.focusedTextColor = Secondary;
            link.autoSize = true;
            link.eventClick += delegate { action(); };
            return link;
        }

        internal static UIPanel Row(UIComponent parent, float width)
        {
            UIPanel row = parent.AddUIComponent<UIPanel>();
            row.width = width;
            row.autoLayout = true;
            row.autoLayoutDirection = LayoutDirection.Horizontal;
            row.autoLayoutPadding = new RectOffset(0, 12, 0, 0);
            row.autoFitChildrenVertically = true;
            return row;
        }

        // Una línea de 1 px con aire arriba y abajo. Los sprites del juego (GenericPanelWhite) son
        // 9-slice y no bajan de su alto mínimo, así que la línea es una textura propia.
        internal static void Divider(UIComponent parent, float width)
        {
            UIPanel space = parent.AddUIComponent<UIPanel>();
            space.size = new Vector2(width, 17f);
            UITextureSprite rule = space.AddUIComponent<UITextureSprite>();
            rule.texture = Solid(Rule);
            rule.size = new Vector2(width, 1f);
            rule.relativePosition = new Vector3(0f, 8f);
        }

        internal static Texture2D Solid(Color32 color)
        {
            var texture = new Texture2D(1, 1, TextureFormat.ARGB32, false);
            texture.SetPixel(0, 0, color);
            texture.Apply();
            return texture;
        }

        // Un círculo con borde suave, dibujado a 16 px y mostrado a 8.
        internal static Texture2D Dot(Color32 color)
        {
            const int size = 16;
            var texture = new Texture2D(size, size, TextureFormat.ARGB32, false);
            float radius = size / 2f;
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float dx = x + 0.5f - radius, dy = y + 0.5f - radius;
                    float alpha = Mathf.Clamp01(radius - Mathf.Sqrt(dx * dx + dy * dy));
                    texture.SetPixel(x, y, new Color32(color.r, color.g, color.b, (byte)(alpha * 255f)));
                }
            texture.filterMode = FilterMode.Bilinear;
            texture.Apply();
            return texture;
        }

        internal static UITextureSprite Image(UIComponent parent, Texture2D texture, float width)
        {
            UITextureSprite sprite = parent.AddUIComponent<UITextureSprite>();
            sprite.texture = texture;
            sprite.size = new Vector2(width, width * texture.height / texture.width);
            return sprite;
        }

        internal static Texture2D LoadTexture(string name)
        {
            try
            {
                using (Stream stream = typeof(BridgeStyle).Assembly.GetManifestResourceStream("VellumBridge." + name))
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

        internal static void OpenWeb(string url)
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

        // Abre la carpeta en el explorador del sistema; la crea si todavía no existe.
        internal static void OpenFolder(string folder)
        {
            try
            {
                Directory.CreateDirectory(folder);
                Application.OpenURL(new Uri(folder).AbsoluteUri);
            }
            catch (Exception error)
            {
                Debug.LogWarning("[VellumBridge] No se pudo abrir la carpeta " + folder + ": " + error.Message);
                ResultModal.Show(ResultView.Failure(Strings.OpenFolderShort, error.Message));
            }
        }
    }
}
