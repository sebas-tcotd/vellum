use quick_xml::events::BytesStart;
use std::borrow::Cow;

pub fn attr_str(e: &BytesStart, name: &[u8]) -> Option<String> {
    find_attribute(e, name, |value| Some(value.into_owned()))
}

pub fn attr_f64(e: &BytesStart, name: &[u8]) -> Option<f64> {
    find_attribute(e, name, |value| {
        value.parse::<f64>().ok().filter(|v| v.is_finite())
    })
}

/// Converts RGBA components to an 8-digit hex color string (e.g. "#FF6600FF").
pub fn rgba_to_hex(r: u8, g: u8, b: u8, a: u8) -> String {
    format!("#{r:02X}{g:02X}{b:02X}{a:02X}")
}

/// Encapsula la lógica de búsqueda y procesamiento de atributos.
fn find_attribute<F, T>(e: &BytesStart, name: &[u8], mut f: F) -> Option<T>
where
    F: FnMut(Cow<str>) -> Option<T>,
{
    e.attributes().find_map(|a| {
        let a = match a {
            Ok(attr) => attr,
            Err(e) => {
                eprintln!("[parser-cslmap] Malformed attribute in XML: {e}");
                return None;
            }
        };
        if a.key.local_name().as_ref() == name {
            f(a.unescape_value().ok()?)
        } else {
            None
        }
    })
}
