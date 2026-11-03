# Microsoft Store: envío retenido y tiempo de certificación

**Estado:** pendiente. Cuando se llene: «completado el AAAA-MM-DD por …».

Anotación de la Story 15.1 (segundo criterio de aceptación, Epic 15). La llena
el mantenedor con el próximo envío manual de `vX.Y.Z` a la Store. La Story 15.3
espera a que esté completa para fijar qué hace su job cuando ya hay un envío en
curso.

Lo que hay que comprobar: si un envío **certificado pero retenido** («No
publicar hasta que seleccione Publicar ahora») deja crear otro envío en Partner
Center, y cuánto tarda hoy una certificación. Ninguna de las dos cosas está
documentada por Microsoft.

## Datos del envío

| Campo                                                        | Valor                                                                 |
| ------------------------------------------------------------ | --------------------------------------------------------------------- |
| Versión de Vellum                                            | `vX.Y.Z`                                                              |
| Versión del paquete MSIX                                     | `X.Y.Z.0`                                                             |
| ID del envío en Partner Center                               | _por llenar_                                                          |
| Opción de publicación elegida                                | «No publicar hasta que seleccione Publicar ahora» (si fue otra, cuál) |
| Herramienta usada (Partner Center web o `msstore` y versión) | _por llenar_                                                          |
| Fecha y hora del envío (con zona)                            | _por llenar_                                                          |
| Fecha y hora en que el envío quedó certificado               | _por llenar_                                                          |
| Tiempo de certificación (envío → certificado)                | _por llenar_                                                          |
| Fecha y hora de «Publicar ahora»                             | _por llenar_                                                          |
| Tiempo hasta que la ficha mostró la versión nueva            | _por llenar_                                                          |

## Envío retenido: ¿se puede crear otro?

Con el envío anterior certificado y retenido, intentar crear un envío nuevo
(en Partner Center o con `msstore`) y anotar qué pasó.

- **¿Partner Center dejó crear otro envío?** _sí / no_
- **Qué mostró exactamente** (mensaje, botón deshabilitado, estado del envío
  anterior): _por llenar_
- **¿El envío retenido siguió intacto después?** _sí / no_
- **Si se canceló alguno, cuál y qué pasó con la espera de certificación:**
  _por llenar_

## Envío en certificación (opcional)

Si hubo ocasión mientras el envío seguía en certificación (todavía sin
certificar), anotar si Partner Center dejó crear otro y qué mostró. El segundo
escenario de la 15.3 cubre los dos estados: _por llenar o «no se probó»_

## Evidencia

- Capturas o enlaces (sin datos de la cuenta): _por llenar_
- Notas adicionales: _por llenar_

## Qué significa para la Story 15.3

Una frase con la consecuencia para el segundo escenario de la 15.3 («un envío
anterior sigue en certificación o retenido»): _por llenar_
