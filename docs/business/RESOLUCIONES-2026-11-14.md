# Resoluciones del responsable — 2026-11-14

Respuestas del responsable de la tienda a la lista de pendientes entregada el 2026-11-13, y encargos
de desarrollo derivados. Las decisiones técnicas quedan en [ADR-026](../decisions/ADR-026-cambio-de-pieza-en-ventas.md);
el estado de cada decisión, en [PENDIENTES.md](PENDIENTES.md).

## 1. Respuestas

| Tema                                        | Respuesta del responsable                                                                                                                         | Efecto                                                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Valores por defecto de Ventas (D-01 a D-19) | «Como lo veas conveniente».                                                                                                                       | Se **confirman tal como están implementados** (ver sección 3).                                                              |
| Permisos exclusivos del Administrador       | «Sí, solo el administrador»: `cash:correct`, `sales-incidents:manage`, `settings:manage`.                                                         | Lista confirmada. `audit:read` y `users:manage` no se agregan a la lista.                                                   |
| X-1 · incidencias                           | «Las incidencias van dentro del sistema».                                                                                                         | Se conserva `/sale-incidents`; X-1 queda **resuelta**. La «hoja fuera del sistema» de la aclaración de C5 queda sin efecto. |
| Datos del comprobante                       | En la demo ya están los datos reales; faltan **NIT y logo** (los entrega el 2026-11-14).                                                          | D-07: datos cargados en «Datos del negocio»; el logo ya se puede subir (sección 2.1).                                       |
| Contador                                    | «No hay problemas».                                                                                                                               | Sin cambios.                                                                                                                |
| Asesor legal                                | Por política de la empresa **no habrá devoluciones**; solo **cambio de pieza** (anillo talla 10 por talla 12). Devolución en la tienda no existe. | Nuevo requisito: cambio de pieza ligado a la venta (ADR-026). Coherente con DEC-V07 (no se anulan ventas).                  |
| P-28 a P-43                                 | «Las dejo en tu recomendación»; solo pidió un informe de lo realizado.                                                                            | Aceptadas por delegación. [Informe](../informe-tecnico/08-decisiones-p28-p43-2026-11-14.md).                                |
| Instalación en la PC de la tienda           | Solo se usará la PC del local (sin acceso desde otros equipos).                                                                                   | No hace falta HTTPS ni exponer el puerto en la red; ver [PC-TIENDA.md](../deployment/PC-TIENDA.md).                         |
| Respaldo                                    | Al disco local; opciones gratuitas para una copia en Google Drive (el cliente no quiere pagar servidor).                                          | Script de respaldo automático y segunda copia en carpeta sincronizada (ver [BACKUPS.md](../deployment/BACKUPS.md)).         |
| Inventario actual                           | «Entiendo que existe en Excel» (el cliente lo entregará).                                                                                         | Pendiente del cliente. La carga sigue siendo manual (P-45); se revisa un importador si el archivo es grande.                |

## 2. Encargos de desarrollo (autorizados)

### 2.1 Logo del negocio en los comprobantes

Subir, cambiar y quitar el logo desde «Datos del negocio» (solo Administrador); sale en el encabezado
del comprobante de venta y del de cambio. Más una **leyenda al pie** editable, que por defecto dice la
política de la tienda («No se aceptan devoluciones. Solo se realizan cambios de pieza presentando este
comprobante.»). Elegida por recomendación del responsable («escoge lo que sea más recomendable»).

### 2.2 Cambio de pieza

Reglas dictadas por el responsable:

1. Con el **comprobante de la venta**; **sin plazo** por el momento.
2. Se admite **diferencia de precio solo si la pieza nueva es más cara** que la comprada; **nunca por
   una más económica** (regla de negocio).
3. **El mismo vendedor** registra el cambio: la pieza ya está contabilizada y la pantalla debe ser
   simple para evitar errores.
4. La lógica debe evitar **duplicidad y descuadres** de ventas, caja e inventario.

Implementado según ADR-026. Cierra **P-30** (quién registra: el Vendedor; la pieza devuelta vuelve al
stock sin revisión previa) y **Q-V08** (cambios de pieza).

### 2.3 Respaldo automático

Script `npm run backup` con carpeta propia, verificación, cifrado opcional, segunda copia y tarea diaria
de Windows. Detalle en [BACKUPS.md](../deployment/BACKUPS.md).

## 3. Valores por defecto de Ventas confirmados

D-01 a D-19 quedan **confirmados** como están: venden Vendedor, Responsable y Administrador; el Vendedor
ve solo sus ventas; numeración `VTA-`/`CAJ-`/`CMB-`; fondo `0` válido si se escribe; reimpresión para
quien puede ver la venta; comprobante con datos vigentes; medios Efectivo, QR y Transferencia con
referencia opcional; incidencias de cuatro tipos que reporta el Vendedor o el Responsable y gestiona el
Administrador; arqueo no ciego; correcciones sin plazo; 1 a 50 líneas y 1 a 999 unidades; sin descuentos,
clientes ni fecha retroactiva; sesión que puede cruzar días; «COPIA» desde la segunda impresión.

Siguen **abiertas** (no se preguntaron): Q-V06 (descuentos), Q-V10 (clientes), Q-V14 (ventas
retroactivas), Q-V16 y Q-V17.

## 4. Supuestos propios del cambio de pieza, por confirmar

Se aplicaron por defecto y están en [PENDIENTES.md](PENDIENTES.md) (D-20 a D-23): el crédito de la pieza
devuelta es lo que el cliente **pagó**; cualquier persona con `sales:exchange` puede buscar la venta por
su número (aunque la haya hecho otro vendedor); el cambio no tiene plazo; el comprobante del cambio no
registra copias.
