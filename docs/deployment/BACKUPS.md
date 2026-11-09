# Estrategia de respaldo

> El backup del proveedor de hosting **no reemplaza** una estrategia propia: si se pierde la cuenta,
> se borra la base por error o el proveedor falla, se necesita una copia fuera de su control.

## Qué se respalda

| Dato                                                                       | Dónde vive            | Respaldo                                                       |
| -------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------- |
| Base de datos completa (catálogo, stock, movimientos, auditoría, usuarios) | PostgreSQL            | **Sí — crítico**                                               |
| Código, migraciones, configuración                                         | GitHub                | Ya versionado (clonar = respaldo)                              |
| Variables de entorno / secretos                                            | Panel del hosting     | Copia en gestor de contraseñas del responsable (no en el repo) |
| Fotos de producto                                                          | PostgreSQL            | Dentro de la base: entran en cualquier volcado (`pg_dump`)     |
| Documentos escaneados de recepción                                         | Aún no existen (P-14) | Cuando existan: bucket con versionado                          |

**Fotos de producto.** Los bytes de las fotos viven en la tabla `product_photo_blobs` de PostgreSQL
([ADR-020](../decisions/ADR-020-fotos-de-producto.md)), así que forman parte de cualquier respaldo de la base
y de su restauración; no hay un bucket aparte que respaldar. El ADR estima que 2 000 productos con 3 fotos
reducidas ocupan unos 0,5 a 1 GB y que los respaldos crecen en la misma proporción: tenerlo en cuenta al
dimensionar el plan de la base y el almacenamiento de la copia externa.

## Propuesta (a confirmar en P-26)

| Capa                                                                                     | Frecuencia                  | Retención                 | Objetivo                                              |
| ---------------------------------------------------------------------------------------- | --------------------------- | ------------------------- | ----------------------------------------------------- |
| 1. Backup administrado del hosting + PITR                                                | Continuo / diario           | 7 días (según plan)       | Recuperar a cualquier minuto reciente (RPO ≈ minutos) |
| 2. `pg_dump` lógico cifrado a almacenamiento externo (Cloudflare R2/S3, **otra cuenta**) | Diario 03:00 (hora Bolivia) | 30 diarios + 12 mensuales | Sobrevivir a la pérdida del proveedor o de la cuenta  |
| 3. Dump manual antes de cada migración destructiva o cambio grande                       | A demanda                   | 90 días                   | Volver atrás un cambio concreto                       |

Objetivos propuestos: **RPO** ≤ 24 h en el peor caso (≤ minutos con PITR) · **RTO** ≤ 4 h.

### Implementación prevista de la capa 2

Un job programado (GitHub Actions `schedule` o cron del hosting) que ejecute:

```bash
pg_dump --format=custom --no-owner "$DATABASE_URL" \
  | gpg --symmetric --cipher-algo AES256 --batch --passphrase "$BACKUP_PASSPHRASE" \
  > joyeria-$(date -u +%Y%m%dT%H%MZ).dump.gpg
# subir a R2/S3 con credenciales de SOLO ESCRITURA; reglas de ciclo de vida para la retención
```

- Credenciales del bucket con permiso solo de escritura (un atacante con acceso al job no puede borrar backups).
- Alertar si el job falla (notificación de GitHub/email).
- Se implementará al elegir hosting (P-18); los secretos irán como _secrets_ del job.

## Restauración

```bash
gpg --decrypt joyeria-AAAAMMDD.dump.gpg > joyeria.dump
createdb joyeria_restore
pg_restore --no-owner --dbname "postgresql://.../joyeria_restore" joyeria.dump
# verificar conteos (productos, variantes, movimientos) y luego apuntar DATABASE_URL o renombrar
```

- **Probar una restauración completa al menos una vez por trimestre** en una base temporal y
  registrar el resultado. Un backup que nunca se restauró no es un backup confiable.
- Verificación rápida post-restauración: `SELECT count(*) FROM inventory_movements;` y comparar la
  suma de movimientos por variante con `inventory_balances`.

## Entornos

| Entorno             | Política                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Producción          | Las tres capas.                                                                                                                                                    |
| Staging (si existe) | Solo backup del hosting. Puede regenerarse desde un dump anonimizado de producción.                                                                                |
| Desarrollo local    | Sin backups: los datos se regeneran con migraciones + seed. Volumen Docker `db-data`. Nunca copiar datos reales de producción a equipos personales sin anonimizar. |
