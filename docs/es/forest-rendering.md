# Estrategia de renderizado de bosques

El bloque `<Forests>` de `.cslmap` no contiene árboles individuales ni geometría
forestal. Contiene una cuadrícula de densidad de `512 × 512`, donde cada celda
guarda un valor entre `0` y `255`.

## Qué hace el visor original

El visor original lee las filas de `<Forest>`, construye una imagen RGBA de
`512 × 512`, usa un verde fijo y coloca el valor de densidad en el canal alpha.
Después convierte la imagen en PNG y la dibuja como un `<image>` SVG que cubre el
mapa completo.

```text
Cuadrícula de densidad
        ↓
Textura RGBA
        ↓
PNG
        ↓
Imagen SVG
```

Es un enfoque eficiente, aunque el raster puede hacerse visible al acercarse mucho.

## Implementación actual de Vellum

El renderer MapLibre activo representa cada celda forestal como un punto GeoJSON.
Una capa de círculos usa la densidad normalizada de la celda para calcular su radio
y opacidad. Es más simple que el pipeline de textura descrito abajo y es el
comportamiento implementado hoy; el suavizado y el Gaussian blur siguen siendo una
posible mejora visual futura.

## Resultado visual buscado

La meta no es representar cada árbol. Los bosques deberían verse como regiones de
densidad suaves, con transiciones graduales, sin una cuadrícula de píxeles evidente
y con una apariencia cercana a un heatmap de recursos.

```text
Densidad alta     ███████
Densidad media    ▓▓▓▓▒▒▒
Densidad baja     ▒▒▒░░░░
Sin bosque        transparente
```

## Enfoque recomendado

Representar la cuadrícula como una textura de densidad suavizada:

```text
Cuadrícula 512×512
        ↓
Textura RGBA escalada
        ↓
Gaussian blur
        ↓
Mapeo de color
        ↓
Overlay del mapa
```

Ventajas:

- se acerca a la estética del overlay de recursos de Cities: Skylines;
- es rápido y no requiere generar geometría;
- funciona naturalmente con diferentes niveles de zoom.

## Pasos sugeridos

### 1. Leer la cuadrícula

Conservar la estructura que ya produce el parser:

```text
forest[y][x] → u8
```

Normalizar cada valor como `density = forest_value / 255.0`.

### 2. Escalar antes de mostrar

Escalar de `512` a `2048` o `4096` mediante interpolación bilinear reduce los
bordes obvios entre celdas.

### 3. Aplicar un desenfoque

Un radio de aproximadamente `4px–12px`, ajustado al zoom, convierte los bloques
duros en parches orgánicos.

### 4. Aplicar una rampa de color

```text
0.00 → transparente
0.20 → verde muy claro
0.50 → verde medio
0.80 → verde oscuro
1.00 → verde profundo
```

Una paleta inicial posible es:

```text
rgba(70,120,70,0.00)
rgba(90,150,80,0.20)
rgba(70,140,60,0.40)
rgba(40,110,40,0.60)
rgba(20,80,20,0.80)
```

### 5. Colocar la capa

```text
Terreno
    ↓
Overlay de bosques
    ↓
Edificios
    ↓
Calles
    ↓
Tránsito
    ↓
Etiquetas
```

## Alternativa futura: Marching Squares

La cuadrícula podría convertirse en contornos vectoriales mediante Marching
Squares:

```text
Cuadrícula → Marching Squares → Polígonos → Canvas/SVG
```

Ofrece zoom infinito y contornos nítidos, pero exige más implementación y se aleja
de la textura difusa del overlay original. No es la opción recomendada para la
primera implementación.

## Recomendación final

Si una iteración futura busca acercarse más al overlay original, puede tratar los
datos forestales como un campo continuo de densidad: textura escalada, desenfoque,
color verde con alpha y una capa de overlay. La implementación actual y esa posible
alternativa comparten una restricción importante: no renderizar árboles individuales.
