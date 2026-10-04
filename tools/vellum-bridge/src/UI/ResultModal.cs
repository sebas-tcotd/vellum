using System;
using ColossalFramework.UI;
using UnityEngine;

namespace VellumBridge.UI
{
    // El resultado de exportar o capturar, en un modal propio en lugar del ExceptionPanel del juego
    // (que anunciaba un éxito con el triángulo de advertencia). Tres estados: en curso, hecho y
    // cancelado. Aceptar es la acción principal: devuelve al jugador a su ciudad.
    internal static class ResultModal
    {
        private const float Width = 460f;
        private const float Pad = 20f;
        private const float Inner = Width - 2f * Pad;

        private static UIPanel panel;
        private static ResultKind shown;
        private static bool pushed;
        private static UITextureSprite progressFill;

        // Reemplaza lo que esté abierto: el «en curso» de una exportación pasa a su resultado.
        internal static void Show(ResultView view)
        {
            try
            {
                Close();
                Build(view);
            }
            catch (Exception error)
            {
                Debug.LogWarning("[VellumBridge] No se pudo mostrar el resultado: " + error);
                Close();
            }
        }

        // Una exportación descartada (la ciudad cambió) no tiene resultado que mostrar.
        internal static void CloseProgress()
        {
            if (panel != null && shown == ResultKind.Progress) Close();
        }

        internal static void Close()
        {
            if (panel == null) return;
            try
            {
                if (pushed && UIView.GetModalComponent() == panel) UIView.PopModal();
                UnityEngine.Object.Destroy(panel.gameObject);
            }
            catch (Exception error) { Debug.LogWarning("[VellumBridge] No se pudo cerrar el resultado: " + error.Message); }
            panel = null;
            progressFill = null;
            pushed = false;
        }

        // Cada frame en la partida: la barra de «en curso» avanza sola (no hay porcentaje real que
        // prometer) y el modal se mantiene centrado mientras su alto se asienta.
        internal static void Tick()
        {
            if (panel == null) return;
            panel.CenterToParent();
            if (progressFill == null) return;
            float span = Inner + progressFill.width;
            float x = (Time.realtimeSinceStartup * 0.5f * span) % span - progressFill.width;
            progressFill.relativePosition = new Vector3(x, 0f);
        }

        private static void Build(ResultView view)
        {
            UIView root = UIView.GetAView();
            panel = root.AddUIComponent(typeof(UIPanel)) as UIPanel;
            shown = view.kind;
            panel.backgroundSprite = "GenericPanel";
            panel.color = new Color32(31, 36, 43, 255);
            panel.width = Width;
            panel.padding = new RectOffset((int)Pad, (int)Pad, 16, (int)Pad);
            panel.autoLayout = true;
            panel.autoLayoutDirection = LayoutDirection.Vertical;
            panel.autoLayoutPadding = new RectOffset(0, 0, 0, 8);
            panel.autoFitChildrenVertically = true;

            BridgeStyle.Label(panel, "Vellum Bridge", 0.75f, BridgeStyle.Muted);
            Title(view);
            if (!string.IsNullOrEmpty(view.body)) BridgeStyle.Wrapped(panel, Capitalized(view.body), 0.85f, BridgeStyle.Secondary, Inner);
            if (!string.IsNullOrEmpty(view.note)) BridgeStyle.Wrapped(panel, view.note, 0.8f, BridgeStyle.Muted, Inner);

            if (view.kind == ResultKind.Progress) ProgressBar();
            else
            {
                if (view.limits.Count > 0) Limits(view);
                UIPanel actions = BridgeStyle.Row(panel, Inner);
                actions.padding = new RectOffset(0, 0, 6, 0);
                BridgeStyle.Button(actions, Strings.Ok, true, Close);
                string folder = view.folder;
                if (folder != null) BridgeStyle.Button(actions, Strings.OpenFolderShort, false, delegate { BridgeStyle.OpenFolder(folder); });
            }

            panel.BringToFront();
            panel.CenterToParent();
            UIView.PushModal(panel);
            pushed = true;
        }

        private static void Title(ResultView view)
        {
            UIPanel line = panel.AddUIComponent<UIPanel>();
            line.size = new Vector2(Inner, 26f);
            float x = 0f;
            if (view.kind != ResultKind.Progress)
            {
                // El mismo punto del panel de opciones: verde si salió, rojo si se canceló.
                UITextureSprite dot = line.AddUIComponent<UITextureSprite>();
                dot.texture = BridgeStyle.Dot(view.kind == ResultKind.Success ? BridgeStyle.Ready : BridgeStyle.Failed);
                dot.size = new Vector2(8f, 8f);
                dot.relativePosition = new Vector3(0f, 9f);
                x = 16f;
            }
            UILabel title = BridgeStyle.Label(line, view.title, 1.2f, BridgeStyle.Primary);
            title.relativePosition = new Vector3(x, 0f);
        }

        private static void ProgressBar()
        {
            UIPanel track = panel.AddUIComponent<UIPanel>();
            track.size = new Vector2(Inner, 3f);
            track.clipChildren = true;
            UITextureSprite background = track.AddUIComponent<UITextureSprite>();
            background.texture = BridgeStyle.Solid(new Color32(47, 55, 66, 255));
            background.size = track.size;
            progressFill = track.AddUIComponent<UITextureSprite>();
            progressFill.texture = BridgeStyle.Solid(BridgeStyle.PrimaryButton);
            progressFill.size = new Vector2(Inner * 0.35f, 3f);
        }

        // «N límites, ver detalles» despliega la lista y «Copiar detalles», que copia el resumen
        // completo (ruta, conteos técnicos, módulos y límites) para un reporte de error.
        private static void Limits(ResultView view)
        {
            UIButton toggle = BridgeStyle.Link(panel, Strings.ShowLimits(view.limits.Count), delegate { });
            toggle.textColor = BridgeStyle.Warning;

            UIPanel details = panel.AddUIComponent<UIPanel>();
            details.width = Inner;
            details.autoLayout = true;
            details.autoLayoutDirection = LayoutDirection.Vertical;
            details.autoLayoutPadding = new RectOffset(0, 0, 0, 6);
            details.autoFitChildrenVertically = true;
            BridgeStyle.Wrapped(details, "• " + string.Join("\n• ", view.limits.ToArray()), 0.75f, BridgeStyle.Secondary, Inner);
            string text = view.details;
            if (!string.IsNullOrEmpty(text))
            {
                UIButton copy = null;
                copy = BridgeStyle.Link(details, Strings.CopyDetails, delegate
                {
                    GUIUtility.systemCopyBuffer = text;
                    copy.text = Strings.Copied;
                }, 0.75f);
            }
            details.isVisible = false;

            int count = view.limits.Count;
            toggle.eventClick += delegate
            {
                details.isVisible = !details.isVisible;
                toggle.text = details.isVisible ? Strings.HideLimits : Strings.ShowLimits(count);
            };
        }

        // Los motivos de error a veces vienen en minúscula (un mensaje de excepción).
        private static string Capitalized(string text)
        {
            return text.Length > 0 && char.IsLower(text[0]) ? char.ToUpper(text[0]) + text.Substring(1) : text;
        }
    }
}
