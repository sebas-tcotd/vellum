namespace VellumBridge
{
    internal static class BridgeInfo
    {
        // Va de la mano con Vellum Desktop desde 1.0.
        internal const string Version = "1.0.0";

        // Una página nuestra, no el destino final: si la descarga cambia de lugar se cambia la
        // landing, no el mod publicado.
        internal const string DesktopUrl = "https://sebas-tcotd.github.io/vellum/#download";

        // Product ID de Vellum en la Microsoft Store.
        internal const string StoreProductId = "9N65WG3V160T";

        // «Vellum ya está en la Store»: pasar a true cuando el listado sea público y publicar una
        // actualización del mod. Mientras tanto la insignia no se muestra, porque llevaría a un
        // listado que todavía no existe. Bridge no se conecta a internet, así que no lo consulta.
        internal const bool StoreListed = false;

        internal static string StoreUrl { get { return "ms-windows-store://pdp/?productid=" + StoreProductId; } }
    }
}
