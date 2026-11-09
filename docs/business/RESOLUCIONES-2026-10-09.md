# Decisiones comunicadas por el cliente — 2026-10-09

> **Superado en parte por [RESOLUCIONES-2026-11-05](RESOLUCIONES-2026-11-05.md) y por el estado vigente de [PENDIENTES.md](PENDIENTES.md).** Ya no rigen, entre otras: la sesión de 3 horas (P-19), los motivos de ajuste solo en texto libre (P-20), «solo bolivianos» (P-10) y bloquear movimientos durante el conteo (P-13).

El usuario transmitió las siguientes respuestas. Se marcaron 🟢 en [PENDIENTES.md](PENDIENTES.md) solo las decisiones completas. Las parciales permanecen 🟡. «Aprobada» significa que la regla puede implementarse en su módulo; no significa que ya esté implementada.

| ID   | Respuesta                                                                                                                                                                                       | Estado     |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| P-01 | El responsable de almacén puede aprobar sus propios inventarios físicos. Falta aclarar si puede autorizar sus ajustes manuales.                                                                 | 🟡 Parcial |
| P-02 | El vendedor no ve costos de compra.                                                                                                                                                             | 🟢         |
| P-19 | Sesión de exactamente 3 horas desde el login, sin extensión por actividad; después se requiere nuevo login. Contraseña mínima de 10 caracteres. No se requiere 2FA.                             | 🟢         |
| P-21 | Un usuario puede tener varios roles.                                                                                                                                                            | 🟢         |
| P-23 | Auditoría y sesiones vencidas se retienen indefinidamente.                                                                                                                                      | 🟢         |
| P-04 | Máximo dos niveles de categorías.                                                                                                                                                               | 🟢         |
| P-05 | SKU generado automáticamente mediante un correlativo único.                                                                                                                                     | 🟢         |
| P-06 | Se conservan códigos del proveedor o, si no existe uno, el sistema genera un código propio después de guardar la ficha. El contenido propio se muestra en Code 128; el QR sigue sin definición. | 🟡 Parcial |
| P-15 | Solo se usan las doce definiciones del requerimiento. El cliente puede agregar valores y entregar listas para precargar; no se inventan valores.                                                | 🟡 Parcial |
| P-10 | Fase 1 solo en bolivianos (Bs/BOB).                                                                                                                                                             | 🟢         |
| P-17 | No se controlan lotes ni números de serie.                                                                                                                                                      | 🟢         |
| P-22 | Bloquear desactivación de producto o variante con stock positivo.                                                                                                                               | 🟢         |
| P-27 | Datos específicos de joyería como atributos; las fotos siguen sujetas a P-14 (archivos).                                                                                                        | 🟡 Parcial |
| P-08 | No permitir stock negativo.                                                                                                                                                                     | 🟢         |
| P-09 | Todo se controla por piezas enteras.                                                                                                                                                            | 🟢         |
| P-11 | Numeración de ingresos y conteos automática, correlativa y única.                                                                                                                               | 🟢         |
| P-12 | Tipo de documento de recepción en texto libre.                                                                                                                                                  | 🟢         |
| P-13 | Bloquear movimientos durante el conteo; falta definir su alcance (total, categoría o ubicación).                                                                                                | 🟡 Parcial |
| P-20 | Motivos de ajuste en texto libre.                                                                                                                                                               | 🟢         |
| P-24 | El responsable de inventario puede recibir y registrar piezas no esperadas, incluso productos nuevos. Falta definir el estado inicial del producto y la confirmación del alta.                  | 🟡 Parcial |

P-03, P-07, P-14, P-16, P-18, P-25 y P-26 no recibieron respuesta. El permiso `inventory-counts:approve` del rol de responsable de inventario no se cambia por esta documentación: se incorporará con pruebas cuando se implemente el conteo, tras cerrar P-01. Del mismo modo, ninguna respuesta se convierte por sí sola en un servicio de inventario, un formato de SKU o una política de contraseñas.
