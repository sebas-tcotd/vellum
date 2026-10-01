using System;
using System.Globalization;
using System.Reflection;
using System.Text;

namespace VellumBridge.Capture
{
    internal static class RawFieldSerializer
    {
        // Volcado crudo de un struct del juego (District, DistrictPark) por reflexión, para
        // descubrir qué datos de área expone CS1 sin atarse a nombres de campo: un campo que
        // no existe no rompe la compilación, simplemente no aparece. Los enums salen con su
        // nombre (las políticas de un bitmask quedan como "Smoke, Recycling"), los structs
        // anidados (DistrictPrivateData, DistrictAgeData…) se expanden hasta `MaxRawDepth`,
        // y los arreglos solo con su largo. No se interpreta nada: eso se deriva fuera.
        private const int MaxRawDepth = 2;

        internal static string RawFields(object value)
        {
            var w = new StringBuilder();
            RawValue(w, value, 0);
            return w.ToString();
        }

        private static void RawValue(StringBuilder w, object value, int depth)
        {
            if (value == null) { w.Append("null"); return; }
            Type type = value.GetType();
            if (type.IsEnum) { SnapshotJson.String(w, value.ToString()); return; }
            if (value is bool) { w.Append((bool)value ? "true" : "false"); return; }
            if (value is float) { SnapshotJson.Float(w, (float)value); return; }
            if (value is double) { SnapshotJson.Float(w, (float)(double)value); return; }
            if (type.IsPrimitive) { w.Append(Convert.ToString(value, CultureInfo.InvariantCulture)); return; }
            if (value is string) { SnapshotJson.String(w, (string)value); return; }
            if (type.IsArray) { w.Append("{\"length\":").Append(((System.Array)value).Length).Append('}'); return; }
            if (!type.IsValueType || depth >= MaxRawDepth) { SnapshotJson.String(w, value.ToString()); return; }

            w.Append('{');
            bool first = true;
            foreach (FieldInfo field in type.GetFields(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic))
            {
                object fieldValue;
                try { fieldValue = field.GetValue(value); }
                catch (Exception) { continue; }
                SnapshotJson.Key(w, field.Name, first);
                first = false;
                RawValue(w, fieldValue, depth + 1);
            }
            w.Append('}');
        }
    }
}
