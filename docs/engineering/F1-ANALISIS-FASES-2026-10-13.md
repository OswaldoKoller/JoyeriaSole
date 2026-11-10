# Análisis de pendientes y fases — 2026-10-13

Documento de apoyo a decisión. **No convierte ninguna decisión pendiente en regla**: cada «propuesta» es una recomendación técnica para que el cliente confirme o corrija. Fuentes: [PENDIENTES.md](../business/PENDIENTES.md), [RESOLUCIONES-2026-10-09](../business/RESOLUCIONES-2026-10-09.md), [RESOLUCIONES-2026-10-11](../business/RESOLUCIONES-2026-10-11.md), [ROADMAP.md](ROADMAP.md) y el código de la rama `feature/ingreso-mercaderia`.

## 1. Resumen

- De las 27 decisiones registradas, **9 siguen sin cerrarse** (P-03, P-06, P-13, P-14, P-16, P-18, P-24, P-25, P-26); las cuatro de infraestructura (P-14, P-16, P-18, P-26) **no bloquean el desarrollo**, solo la puerta de producción.
- Las cinco que sí condicionan funcionalidad (P-03, P-24, P-25, P-13, P-06) bloquean **partes** de las órdenes 3, 4 y 5 del roadmap, no el trabajo completo: cada una se puede dividir en una porción libre y otra dependiente (sección 4).
- Hay **cuatro reglas ya aprobadas que el código aún no cumple** (sección 3) y **seis inconsistencias documentales** (sección 2) que conviene corregir antes de que alguien las implemente por error.

## 2. Inconsistencias en la documentación

| #   | Dónde                                                           | Qué dice                                             | Realidad / acción                                                                                                                                        |
| --- | --------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | `CLAUDE.md`, «Decisiones PENDIENTES»                            | P-03 «PENDIENTE», P-07 pendiente.                    | P-07 está 🟢 (ADR-015, implementado); P-03 está 🟡 **parcial** (fórmula aprobada como base). Actualizar `CLAUDE.md` (no lo hice: son sus instrucciones). |
| D2  | `PENDIENTES.md` fila P-13 (histórica) y RESOLUCIONES-2026-10-09 | «Bloquear movimientos durante el conteo».            | El 2026-10-11 el cliente dijo lo contrario (no bloquear; conciliar). Prevalece 10-11; marcar la fila histórica como reemplazada.                         |
| D3  | `ROADMAP.md`, tabla «Estado comprobable» F1-04                  | «Ingresos y ajustes siguen sin implementar».         | Ingresos ya están implementados (orden 2). Quedan ajustes.                                                                                               |
| D4  | Migración `init`, comentario sobre stock negativo               | «Decisión PENDIENTE (P-08)».                         | P-08 está aprobada («no permitir stock negativo»). No se edita la migración (regla); se corrige con una nueva (ver R2).                                  |
| D5  | `permissions.ts`, comentario de `DEFAULT_ROLE_PERMISSIONS`      | «Falta decidir ajustes manuales».                    | P-01 se cerró el 2026-10-11 (responsable aprueba todo). Falta asignar `inventory:adjust` e `inventory-counts:approve` cuando exista el flujo.            |
| D6  | `schema.prisma`: comentarios «PENDIENTE (P-11/P-12/P-07)»       | Varias decisiones figuran pendientes en comentarios. | P-11, P-12 y P-07 están aprobadas. Cambio solo de comentarios; incluirlo en la próxima migración de esquema.                                             |

## 3. Reglas aprobadas que el código aún no cumple

| #   | Regla aprobada                                               | Estado en el código                                                                                                                            | Riesgo / acción propuesta                                                                                                                                                                            |
| --- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **P-22** Bloquear desactivar producto/variante con stock > 0 | No se encontró validación en `products.service.ts` de esta rama (el trabajo de catálogo en curso en el directorio principal podría incluirla). | Verificar al integrar el catálogo de Codex; si falta, agregar con prueba de integración. No necesita decisión nueva.                                                                                 |
| R2  | **P-08** No permitir stock negativo                          | Solo lo impide el servicio; la BD no tiene `CHECK (quantity >= 0)` en `inventory_balances`.                                                    | Defensa en profundidad: migración nueva con el `CHECK`. Bajo riesgo (los saldos actuales son ≥ 0; verificar con `SELECT` antes). Cubre ajustes y conteos futuros.                                    |
| R3  | **P-01** Responsable aprueba sus conteos y ajustes           | El rol `INVENTORY_MANAGER` no tiene `inventory:adjust` ni `inventory-counts:approve`.                                                          | Se asigna cuando se implemente el flujo (ya acordado), con prueba de permisos.                                                                                                                       |
| R4  | **P-25** Cambios de precio con aprobación                    | Hoy un usuario con `prices:manage` cambia precio directamente (catálogo) y queda solo en auditoría.                                            | Contradice el requisito aprobado. Mientras P-25 no defina aprobador/vigencia, **no ampliar** los puntos donde se edita el precio y registrar el cambio actual como excepción temporal en el ROADMAP. |

## 4. Evaluación de cada decisión abierta

Formato: _qué falta → qué puede avanzar sin ella → propuesta para confirmar_.

### P-03 Precio sugerido (🟡 parcial)

- **Falta:** redondeo monetario y su vínculo con P-25.
- **Avanza sin ella:** cálculo del costo total por variante (ya existe en ingresos: compra + extras prorrateados) y su **visualización** como «precio sugerido»; guardar el multiplicador por categoría (valor por defecto 2).
- **Propuesta:** sugerir (nunca aplicar solo); redondeo configurable por categoría, con opciones _sin redondeo_ · _al boliviano entero superior_ · _a 0,50_. Por defecto, sin redondeo hasta que el cliente elija.
- **Pregunta al cliente:** ¿cómo quiere redondear los precios? ¿Es igual para todas las categorías?

### P-25 Aprobación de cambios de precio (🟡 parcial)

- **Falta:** quién aprueba y desde cuándo rige.
- **Avanza sin ella:** el modelo de «solicitud de cambio de precio» (estado pendiente/aprobada/rechazada, valor anterior, nuevo, regla aplicada, solicitante) y su historial consultable.
- **Propuesta:** aprueba el Administrador; vigencia inmediata al aprobar; historial en tabla propia (no solo auditoría) para poder consultarlo.
- **Pregunta:** ¿quién aprueba (¿puede el responsable de inventario aprobar sus propios cambios, como en P-01?) y cuándo entra en vigor el precio nuevo?

### P-24 Piezas nuevas durante el ingreso (🟡 parcial)

- **Falta:** datos mínimos para confirmar un ingreso con producto nuevo.
- **Avanza sin ella:** el flujo de alta rápida desde el ingreso (producto activo, SKU automático, variante) si se exigen al menos **categoría, nombre y costo**; la cantidad ya viene del ítem.
- **Propuesta:** mínimo = categoría + nombre + costo + cantidad; el precio queda en 0 (no se vende) hasta pasar por P-25; el resto de la ficha se completa después. Alternativa: marcar la ficha como «incompleta» para una lista de pendientes (campo nuevo, requiere aprobación).
- **Pregunta:** ¿qué datos son indispensables antes de que una pieza nueva quede en el stock?

### P-13 Alcance del conteo físico (🟡 parcial)

- **Falta:** si el conteo es total, por categoría o por ubicación.
- **Avanza sin ella:** captura de conteo, snapshot y conciliación de movimientos intermedios al aprobar (regla ya definida); ajustes manuales (no dependen del conteo).
- **Propuesta:** conteo **total y por categoría**. «Ubicación» no existe en el modelo y la tienda es de un solo punto (multi-sucursal está fuera de alcance): no modelarla ahora.
- **Pregunta:** ¿cuenta toda la tienda a la vez o por secciones (anillos, collares…)?

### P-06 Códigos (🟡 parcial)

- **Falta:** si se conserva además el código del proveedor y qué contiene el QR.
- **Avanza sin ella:** etiqueta Code 128 con el SKU (aprobada). El esquema ya soporta código del proveedor (`supplier_products.supplier_code`) y código de barras único por variante.
- **Propuesta:** conservar el código del proveedor como dato de búsqueda; **posponer el QR** fuera de Fase 1 salvo que el cliente defina su contenido.
- **Pregunta:** ¿se busca también por el código del proveedor? ¿Qué debería abrir el QR, si lo necesita?

### P-14, P-16, P-18, P-26 (🟡 infraestructura)

- No bloquean funcionalidad. Bloquean el **paso a producción**: hosting y dominio (P-18), RPO/RTO y copias (P-26), identidad visual (P-16) y almacenamiento de fotos (P-14).
- **Propuesta:** fotos fuera de Fase 1 (hoy la API solo acepta JSON); pedir P-18 y P-26 antes de la puerta de producción; mantener la paleta provisional hasta recibir P-16.

## 5. Revisión de fases y qué corresponde hacer

| Fase                 | Estado real                                                     | Qué corresponde                                                                                                             |
| -------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| F1-PREP              | Hecha y verificada                                              | Pendiente solo el ensayo de instalación limpia y restauración (puerta de producción).                                       |
| F1-01 Proveedores    | Implementada, aceptación del cliente pendiente                  | Ejecutar guion de aceptación con el cliente.                                                                                |
| F1-02 Usuarios       | Implementada, aceptación pendiente                              | Ídem; verificar P-19 (sesión fija de 3 h) y protección del último administrador (los agentes de seguridad lo prueban).      |
| F1-03 Catálogo       | Base lista; cierre en curso (Codex, orden 1)                    | Integrar su trabajo en una rama, verificar R1 (P-22) y agregar E2E de catálogo. Etiqueta Code 128 sin esperar P-06 parcial. |
| F1-04 Inventario     | Saldos, movimientos, stock inicial e **ingresos** implementados | **Ajustes manuales (5a)**: desbloqueados (P-01, P-08, P-20 aprobadas). Alta de piezas nuevas (orden 3) espera P-24.         |
| F1-05 Conteo/control | No iniciada                                                     | **Conteo (5b)** espera P-13 (alcance). Alertas de control (sin stock, bajo mínimo) ya existen.                              |
| Cierre / producción  | No iniciada                                                     | Demostración, aceptación y puerta de producción (P-18, P-26, secretos, restauración ensayada, CI remoto en verde).          |

### Orden de trabajo recomendado

1. **Ya:** integrar el catálogo en curso (orden 1) y cerrar R1/R2; fusionar los PR #1–#4 en orden.
2. **Sin esperar al cliente:** dividir el roadmap — **5a ajustes manuales** (aprobación del responsable, motivo libre, sin stock negativo) y **4a precio sugerido de solo lectura** — y construirlos.
3. **Con una respuesta corta del cliente:** P-24 → orden 3; P-13 → orden 5b; P-25 y redondeo de P-03 → orden 4b.
4. **Cierre:** demo guiada con datos desechables, aceptación F1-01…F1-04 y puerta de producción.

## 6. Preguntas consolidadas para el cliente

1. ¿Cómo se redondean los precios sugeridos (entero superior, 0,50, sin redondeo)? ¿Igual para todas las categorías?
2. ¿Quién aprueba un cambio de precio y cuándo entra en vigor?
3. ¿Qué datos mínimos debe tener una pieza nueva para quedar en el stock?
4. El conteo físico, ¿es de toda la tienda o por categorías?
5. ¿Se conserva y busca por el código del proveedor? ¿Necesita QR y con qué contenido?
6. (Antes de producción) hosting y dominio, tolerancia a pérdida de datos y caída, logo y colores, y si se necesitan fotos.

## 7. Seguridad y rendimiento

Esta revisión incluyó auditoría estática, pruebas ofensivas contra una instancia local desechable y mediciones de rendimiento con datos sintéticos. Sus resultados y correcciones se documentan en `docs/security/SECURITY.md` (sección «Revisión ofensiva 2026-10-13») y `docs/testing/PERFORMANCE.md`.

> **Actualización 2026-11-09.** El párrafo anterior no se sostiene: la sección «Revisión ofensiva
> 2026-10-13» de `SECURITY.md` y `docs/testing/PERFORMANCE.md` **no existen** (DT-DOC-05 del informe
> técnico). Por decisión del responsable (E4 de
> [RESOLUCIONES-2026-11-09](../business/RESOLUCIONES-2026-11-09.md)), la revisión de seguridad y
> rendimiento archivada es el [informe técnico](../informe-tecnico/). Contiene análisis estático del
> código y de la documentación, mediciones de tamaño de _bundle_ obtenidas compilando (`vite build`) y
> cifras de pruebas y tiempos tomadas del CI. **No contiene** pruebas ofensivas ejecutadas ni mediciones
> de carga o rendimiento con el volumen del cliente: ambas **siguen pendientes**. El texto original se
> conserva como registro histórico.
