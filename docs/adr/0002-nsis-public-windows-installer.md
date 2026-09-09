# ADR 0002: NSIS como instalador público de Windows

**Estado:** aceptado — 2026-09-09

## Contexto

Vellum es una aplicación de escritorio para usuarios individuales. Un MSI es
útil para despliegues administrados, pero su wizard por máquina no representa
el camino más simple para descargar, instalar y abrir Vellum. El release ya
genera NSIS per-user, aunque antes el MSI era el enlace recomendado y el destino
genérico del updater.

## Decisión

El ejecutable NSIS es el instalador Windows recomendado y el destino de
`windows-x86_64` en `latest.json`. El MSI sigue publicado como alternativa para
despliegues gestionados y conserva su asociación `.cslmap` opt-in.

Vellum mantiene un template NSIS basado en la plantilla de Tauri 2.10.3. La UI
visible se limita a bienvenida con un único CTA, progreso y apertura final. El
template conserva instalación `currentUser`, `/S`, `/UPDATE`, WebView2,
uninstaller y la mecánica de empaquetado de Tauri. Antes de instalar, detecta y
desinstala el MSI anterior con el mismo producto y editor; si ese paso falla o
se cancela, aborta para no dejar instalaciones paralelas. No introduce hooks ni
asociaciones de archivos automáticas.

## Consecuencias

- La descarga pública evita UAC en la instalación normal y reduce decisiones
  para el usuario común.
- Cada actualización de Tauri que altere su template NSIS exige revisar el
  template de Vellum y sus invariantes automatizadas.
- El MSI no desaparece ni se vuelve una ruta no soportada; sólo deja de ser la
  recomendación predeterminada.
- Asociar `.cslmap` desde NSIS queda fuera de esta decisión: requerirá una
  elección explícita y reversible en una entrega posterior.
