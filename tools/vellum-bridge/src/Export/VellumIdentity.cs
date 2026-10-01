using System.Text;

// Entrada de la identidad de la ciudad en la partida (clave "VellumBridge.Identity"): UTF-8
// `cityId\nlastSnapshotId`. Sin tipos del juego, para probarla en el harness; BridgeIdentity la
// usa desde la serialización de mods de CS1.
namespace VellumBridge.Export
{
    internal static class VellumIdentity
    {
        internal const int MaxIdLength = 128;

        // `lastSnapshotId` null o vacío se escribe como campo vacío.
        internal static byte[] Encode(string cityId, string lastSnapshotId)
        {
            return Encoding.UTF8.GetBytes(cityId + "\n" + (lastSnapshotId ?? ""));
        }

        // false si la entrada es ilegible (sin cityId, ids inválidos): cuenta como partida sin
        // identidad. Los campos después del segundo se ignoran: un Bridge futuro puede añadir
        // alguno sin que uno viejo lo tome por corrupta y acuñe un city.id nuevo.
        internal static bool TryDecode(byte[] data, out string cityId, out string lastSnapshotId)
        {
            cityId = null;
            lastSnapshotId = null;
            if (data == null) return false;
            string[] parts;
            try { parts = new UTF8Encoding(false, true).GetString(data).Split('\n'); }
            catch (DecoderFallbackException) { return false; }
            if (parts.Length < 2 || !Valid(parts[0]) || (parts[1].Length != 0 && !Valid(parts[1]))) return false;
            cityId = parts[0];
            lastSnapshotId = parts[1].Length == 0 ? null : parts[1];
            return true;
        }

        // No vacío, como mucho 128 caracteres y sin caracteres de control (incluido el salto de
        // línea que separa los campos).
        internal static bool Valid(string id)
        {
            if (string.IsNullOrEmpty(id) || id.Length > MaxIdLength) return false;
            foreach (char c in id) if (char.IsControl(c)) return false;
            return true;
        }
    }
}
