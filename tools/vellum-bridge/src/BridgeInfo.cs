namespace VellumBridge
{
    internal static class BridgeInfo
    {
        // Va de la mano con Vellum Desktop desde 1.0. Pasó de -rc a 1.0.0 con el anuncio de la Store,
        // junto con StoreListed = true, en la misma actualización del mod.
        internal const string Version = "1.0.0";

        // Una página nuestra, no el destino final: si la descarga cambia de lugar se cambia la
        // landing, no el mod publicado.
        internal const string DesktopUrl = "https://sebas-tcotd.github.io/vellum/#download";

        // Product ID de Vellum en la Microsoft Store.
        internal const string StoreProductId = "9N65WG3V160T";

        // «Vellum ya está en la Store»: en true desde 1.0.0, cuando el listado se hizo público. Con
        // false la insignia no se muestra, porque llevaría a un listado que no existe. Bridge no se
        // conecta a internet, así que no lo consulta.
        internal const bool StoreListed = true;

        internal static string StoreUrl { get { return "ms-windows-store://pdp/?productid=" + StoreProductId; } }
    }
}
