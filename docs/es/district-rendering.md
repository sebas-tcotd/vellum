# Estrategia de renderizado de distritos

Este documento explica qué información sobre distritos existe realmente en un
archivo `.cslmap` y por qué Vellum los trata como anotaciones durante la fase de
compatibilidad con CSLMap.

## Contexto

El archivo `.cslmap` no contiene límites, polígonos ni ownership de celdas para los
distritos. Cada distrito expone esencialmente:

```text
District
 ├─ ID
 ├─ Name
 └─ Single Position
```

Ejemplo:

```xml
<Dist id="127" name="Centro Histórico">
    <p x="691.2004" y="206.956787" z="2900.73657" />
</Dist>
```

La posición funciona como ancla de la etiqueta o como centro aproximado. No es
una descripción de un área.

## Qué renderiza el visor original

El visor JavaScript original lee el nombre y la posición, crea un elemento de
texto SVG y lo coloca en esas coordenadas:

```text
Datos del distrito
      ↓
Nombre + posición
      ↓
Etiqueta de texto SVG
```

No crea geometría, polígonos, bordes ni un overlay de área.

La posición de pantalla usa conceptualmente `x = district.x` y `y = -district.z`.
Para mantener legible el texto sobre terreno, calles y edificios, el visor duplica
la etiqueta: una copia dibuja el stroke y la otra el fill.

## Implementación actual de Vellum

Vellum conserva la limitación del formato, pero ofrece dos modos basados en puntos
mediante MapLibre:

- un marcador circular en la posición del distrito;
- una etiqueta de texto opcional con el nombre del distrito, halo y gestión de
  colisiones.

Ambos modos son anotaciones. Ninguno implica que Vellum conozca el área real del
distrito.

## Limitación importante del formato

La limitación nace en el export `.cslmap`, no en el renderer. El formato contiene:

```text
Nombre del distrito
Posición del distrito
```

pero no contiene:

```text
Límites del distrito
Celdas del distrito
Polígonos del distrito
Formas del distrito
Mapas de ownership
```

Por eso ningún renderer puede reconstruir límites verdaderos a partir de esos
datos sin inventar información.

## Implicaciones para Vellum

Durante la fase de compatibilidad con CSLMap, el modelo recomendado es:

```rust
pub struct District {
    pub id: u32,
    pub name: String,
    pub position: Vec3,
}
```

Y el modelo visual es deliberadamente pequeño:

```text
District → Label
```

> **En simples palabras:** un distrito de `.cslmap` es una etiqueta con una
> posición, no una región geográfica.

## Qué no deberíamos intentar todavía

Evitar la reconstrucción de polígonos, contornos, áreas estimadas, bordes falsos o
formas procedurales. Eso produciría una precisión aparente que los datos de origen
no respaldan.

## Expansión futura

Una integración directa con Cities: Skylines podría aportar celdas reales a través
del District Manager:

```text
Cities: Skylines API
        ↓
District Manager
        ↓
Celdas del distrito
        ↓
Geometría del distrito
```

Con esos datos sí tendrían sentido límites, overlays de área, heatmaps, estadísticas
y estilos temáticos. Es una dirección futura, no una capacidad del formato actual.

## Recomendación

En la fase `.cslmap`, tratar los distritos como anotaciones: el marcador es la vista
predeterminada y la etiqueta delineada es una alternativa. Si el formato futuro aporta geometría, el modelo puede
evolucionar a:

```text
District = área geográfica + metadata + visualización
```
