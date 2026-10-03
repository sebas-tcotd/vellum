using System;
using System.IO;
using System.Security.Cryptography;
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

        // Espacio de nombres UUIDv5 de los `city.id` que Bridge deriva de `m_gameInstanceIdentifier`.
        // No cambiarlo: cambiaría el `city.id` de todas las partidas sin identidad guardada.
        internal static readonly Guid InstanceNamespace = new Guid("6c9ea331-f2ab-49b9-a3d1-52021a189911");

        // El identificador de partida del juego, normalizado (sin espacios ni llaves, en minúsculas),
        // o null si está vacío o es Guid.Empty: entonces no identifica la partida.
        internal static string NormalizeInstanceId(string raw)
        {
            if (raw == null) return null;
            string id = raw.Trim().Trim('{', '}').Trim().ToLowerInvariant();
            if (id.Length == 0 || id == Guid.Empty.ToString()) return null;
            return id;
        }

        // `city.id` estable de una partida: UUIDv5 de su identificador de juego. Toda exportación de
        // la misma partida lleva el mismo aunque no se guarde después de exportar.
        internal static string CityIdFromInstance(string instanceId)
        {
            return NameBasedUuid(InstanceNamespace, NormalizeInstanceId(instanceId));
        }

        // RFC 4122 §4.3 con SHA-1 (versión 5). Los bytes van en orden de red, por eso se formatea a
        // mano y no con Guid, que guarda los tres primeros campos en little-endian.
        internal static string NameBasedUuid(Guid ns, string name)
        {
            byte[] space = ns.ToByteArray();
            Array.Reverse(space, 0, 4);
            Array.Reverse(space, 4, 2);
            Array.Reverse(space, 6, 2);
            byte[] text = Encoding.UTF8.GetBytes(name);
            byte[] input = new byte[space.Length + text.Length];
            Buffer.BlockCopy(space, 0, input, 0, space.Length);
            Buffer.BlockCopy(text, 0, input, space.Length, text.Length);
            byte[] hash;
            using (SHA1 sha1 = SHA1.Create()) hash = sha1.ComputeHash(input);
            hash[6] = (byte)((hash[6] & 0x0F) | 0x50);
            hash[8] = (byte)((hash[8] & 0x3F) | 0x80);
            var uuid = new StringBuilder(36);
            for (int i = 0; i < 16; i++)
            {
                if (i == 4 || i == 6 || i == 8 || i == 10) uuid.Append('-');
                uuid.Append(hash[i].ToString("x2"));
            }
            return uuid.ToString();
        }

        // Índice local de linaje: `<raíz>/.lineage/<cityId>.txt` con la `snapshotId` de la última
        // exportación publicada. Da el `parentSnapshotId` cuando la partida no lo guardó. Solo para
        // `city.id` con forma de UUID, que es lo único que Bridge escribe y un nombre de archivo seguro.
        internal static string LineageFile(string root, string cityId)
        {
            if (!IsUuid(cityId)) return null;
            return Path.Combine(Path.Combine(root, ".lineage"), cityId.ToLowerInvariant() + ".txt");
        }

        // null si no hay índice o no se puede leer: la exportación sale sin padre, como antes.
        internal static string ReadLastSnapshot(string root, string cityId)
        {
            string file = LineageFile(root, cityId);
            if (file == null) return null;
            try
            {
                if (!File.Exists(file)) return null;
                string snapshot = File.ReadAllText(file, Encoding.UTF8).Trim();
                return Valid(snapshot) ? snapshot : null;
            }
            catch (IOException) { return null; }
            catch (UnauthorizedAccessException) { return null; }
        }

        // Lanza si no se puede escribir: el llamador lo registra sin afectar la exportación.
        internal static void WriteLastSnapshot(string root, string cityId, string snapshotId)
        {
            string file = LineageFile(root, cityId);
            if (file == null || !Valid(snapshotId)) return;
            Directory.CreateDirectory(Path.GetDirectoryName(file));
            File.WriteAllText(file, snapshotId, new UTF8Encoding(false));
        }

        // net35 no tiene Guid.TryParse. Exige la forma canónica con guiones (36 caracteres).
        private static bool IsUuid(string id)
        {
            if (id == null || id.Length != 36) return false;
            for (int i = 0; i < 36; i++)
            {
                char c = id[i];
                bool dash = i == 8 || i == 13 || i == 18 || i == 23;
                if (dash ? c != '-' : !Uri.IsHexDigit(c)) return false;
            }
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
