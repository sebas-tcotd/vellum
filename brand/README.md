# `brand/` — la fuente de identidad del instalador

Todo lo que un usuario ve mientras instala Vellum —el editor que declara
Windows, el banner del MSI, el panel del NSIS, el fondo del DMG, el nombre y el
comentario que aparecen en el lanzador de Linux— sale de este directorio. Es el
único sitio donde se edita texto o marca de instalador; en el destino nunca se
toca nada a mano.

Documentación de lo que se produce con esto:
[Empaquetado e instaladores (es)](../docs/es/packaging-and-installers.md) ·
[Packaging & installers (en)](../docs/en/packaging-and-installers.md).

## Qué hay aquí

| Archivo               | Qué es                                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `vellum-mark.svg`     | El símbolo canónico, 236×236: disco pergamino con la V serif. Copia versionada de `apps/desktop/public/vellum-logo.svg`.   |
| `installer-copy.json` | Editor, copyright, homepage, licencia, categoría, descripciones corta y larga en `en` y `es`, y los campos del `.desktop`. |

## Qué se deriva de qué

```
brand/vellum-mark.svg ─┐
                       ├─ pnpm brand:build ─→ apps/desktop/src-tauri/installer/
brand/installer-copy.json ─┘                    wix-banner.bmp      493×58
                       │                        wix-dialog.bmp      493×312
                       │                        nsis-header.bmp     150×57
                       │                        nsis-sidebar.bmp    164×314
                       │                        dmg-background.png  660×400
                       │                        derived-assets.json (hashes)
                       │
                       └─ a mano ─────────────→ apps/desktop/src-tauri/tauri.conf.json
                                                apps/desktop/src-tauri/linux/vellum.desktop
```

Los derivados **se commitean**. WiX y NSIS sólo aceptan BMP y ningún runner de
CI de este repo tiene rasterizador; meter uno en la ruta crítica del release
por un artwork que cambia una vez al año cuesta más de lo que rinde. En su
lugar, `scripts/build-brand-assets.mjs` se corre a mano y
`pnpm check:installer` comprueba en cada PR que los derivados existen, miden lo
que tienen que medir y siguen siendo los que produce esta fuente.

## Cambiar la marca o el texto

1. Editar `vellum-mark.svg` o `installer-copy.json`.
2. `pnpm brand:build` — reescribe los cinco derivados y `derived-assets.json`.
3. Si cambió `installer-copy.json`, propagar a mano los campos a
   `apps/desktop/src-tauri/tauri.conf.json` y, si toca, a
   `apps/desktop/src-tauri/linux/vellum.desktop`. `check:installer` dice
   exactamente qué clave quedó desincronizada.
4. `pnpm check:installer` — verde antes de commitear.
5. Commitear fuente y derivados **juntos**. Un derivado sin su fuente, o al
   revés, hace fallar CI.

## Restricciones que no son negociables

- **`vellum-mark.svg` tiene exactamente dos paths**, en este orden: el disco y
  el glifo. El script los recolorea por separado (un disco pergamino sobre un
  banner pergamino no se ve). Si el símbolo pasa a tener tres paths, hay que
  actualizar `readMarkPaths`.
- **Nada de texto en el artwork.** Cormorant Garamond y DM Mono sólo existen
  aquí como woff2 dentro del bundle de la app, que `resvg` no sabe leer, y
  caer en la serif que tenga la máquina haría que los BMP commiteados
  dependieran de quién los generó. Los tres instaladores ya dibujan ellos
  mismos el nombre del producto.
- **El instalador siempre va en claro.** Vive dentro del chrome del sistema
  operativo, no dentro de Vellum: no hay tema oscuro que aplicar.
- La paleta sale de `packages/ui/src/styles/01-settings.css` y está duplicada
  en `installer-copy.json` porque el script es Node puro y no importa CSS.
