namespace VellumBridge
{
    internal static class BridgeInfo
    {
        // Va de la mano con Vellum Desktop desde 1.0. Queda en -rc hasta el anuncio de la Store:
        // ese día pasa a "1.0.0" junto con StoreListed = true, en la misma actualización del mod.
        internal const string Version = "1.0.0-rc";

        // Una página nuestra, no el destino final: si la descarga cambia de lugar se cambia la
        // landing, no el mod publicado.
        internal const string DesktopUrl = "https://sebas-tcotd.github.io/vellum/#download";

        // Product ID de Vellum en la Microsoft Store.
        internal const string StoreProductId = "9N65WG3V160T";

        // «Vellum ya está en la Store»: pasar a true (y Version a "1.0.0") cuando el listado sea
        // público y publicar una actualización del mod. Mientras tanto la insignia no se muestra, porque llevaría a un
        // listado que todavía no existe. Bridge no se conecta a internet, así que no lo consulta.
        internal const bool StoreListed = false;

        internal static string StoreUrl { get { return "ms-windows-store://pdp/?productid=" + StoreProductId; } }
    }
}
