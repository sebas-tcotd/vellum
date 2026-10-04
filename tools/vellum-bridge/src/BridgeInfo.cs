namespace VellumBridge
{
    internal static class BridgeInfo
    {
        // Va de la mano con Vellum Desktop desde 1.0.
        internal const string Version = "1.0.0";

        // Una página nuestra, no el destino final: si la descarga cambia de lugar se cambia la
        // landing, no el mod publicado.
        internal const string DesktopUrl = "https://sebas-tcotd.github.io/vellum/#download";

        // Product ID de Vellum en la Microsoft Store (9N…). Vacío = la insignia no se muestra:
        // un listado sin publicar sería un enlace muerto.
        internal const string StoreProductId = "";

        internal static string StoreUrl { get { return "ms-windows-store://pdp/?productid=" + StoreProductId; } }
    }
}
