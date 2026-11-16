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

## Respaldo automático en la PC de la tienda (disco local) ✔

Implementado el 2026-11-14 (`scripts/backup.mjs`, sin servidor de pago). **Solo lee** la base de datos:
no la detiene ni la modifica. Pensado para la instalación de [PC-TIENDA.md](PC-TIENDA.md).

### Uso

```bash
npm run backup                         # respaldo ahora
npm run backup:status                  # ¿cuándo fue el último? ¿está programada la tarea diaria?
npm run backup:verify                  # prueba de restauración en una base temporal
npm run backup:schedule -- --at=20:30  # programa el respaldo todos los días (Programador de tareas de Windows)
npm run backup:unschedule              # quita la tarea
npm run backup:restore -- <archivo> --yes   # devuelve el sistema a ese respaldo (hace antes otro respaldo)
```

Qué hace cada respaldo, en orden: crea la carpeta si no existe (con subcarpetas `AAAA/MM`), vuelca la
base con `pg_dump` desde el contenedor, **comprueba que el archivo se pueda leer**, guarda su huella
SHA-256 y un manifiesto (`.json`) con cifras de control (usuarios, productos, variantes, movimientos,
ventas, cambios y cajas), lo **cifra** si hay frase, hace la **segunda copia** (y verifica que sea
idéntica), y borra lo que sale de la retención. El registro queda en `respaldo.log`.

Archivos: `<carpeta>/2026/11/joyeria-20261114-203000.dump` (o `.dump.enc` si va cifrado) y su `.json`.

### Configuración (variables de entorno o en el `.env` de la raíz)

| Variable                                    | Por defecto                                    | Para qué                                                                                            |
| ------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `BACKUP_DIR`                                | `<carpeta del usuario>\respaldos-joyeria-sole` | Dónde se guardan. Conviene **otro disco** o una carpeta fuera de la carpeta del proyecto.           |
| `BACKUP_EXTRA_DIR`                          | (sin segunda copia)                            | Segunda copia: disco externo o carpeta sincronizada con Google Drive.                               |
| `BACKUP_PASSPHRASE`                         | (sin cifrar)                                   | Frase de **12 o más caracteres**. **Imprescindible** si la segunda copia va a la nube.              |
| `BACKUP_KEEP_DAILY` / `BACKUP_KEEP_MONTHLY` | 14 / 12                                        | Días y meses que se conservan en el disco local (el último respaldo de cada día y de cada mes).     |
| `BACKUP_EXTRA_KEEP_DAILY` / `…_MONTHLY`     | 7 / 3                                          | Lo mismo para la segunda copia (Google Drive gratis tiene 15 GB; con fotos cada respaldo pesa más). |
| `BACKUP_CONTAINER`, `COMPOSE_PROJECT_NAME`  | servicio `db` del proyecto `joyeria-local`     | Solo si la base está en otro contenedor.                                                            |

Notas: la frase de cifrado **no se puede recuperar**: guardarla en un gestor de contraseñas junto con
la copia de `.env`. Sin ella, un respaldo cifrado es inútil. Con la tarea programada, si la PC está
apagada a la hora indicada el respaldo se hace al encenderla (con la sesión de Windows iniciada), y
**Docker Desktop debe estar abierto**.

### Segunda copia gratuita en Google Drive (el cliente no quiere pagar servidor)

| Opción                                                     | Costo                 | Dificultad | Cómo                                                                                                                                                                                                                                                       | Recomendación               |
| ---------------------------------------------------------- | --------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| **A. Google Drive para escritorio + carpeta sincronizada** | Gratis (15 GB)        | Baja       | Instalar «Google Drive para escritorio» con la cuenta de la tienda; crear la carpeta `Respaldos Joyería Sole` dentro de «Mi unidad»; poner `BACKUP_EXTRA_DIR` en esa carpeta (p. ej. `G:\Mi unidad\Respaldos Joyería Sole`) y definir `BACKUP_PASSPHRASE`. | **Recomendada**             |
| B. `rclone` hacia Google Drive                             | Gratis (15 GB)        | Media      | Instalar rclone, `rclone config` (tipo `drive`) y subir la carpeta de respaldos con `rclone copy` desde una segunda tarea programada. Útil si no se quiere dejar Drive sincronizado en la PC.                                                              | Alternativa                 |
| C. Disco USB o disco externo                               | Costo único del disco | Baja       | Conectarlo y poner `BACKUP_EXTRA_DIR` en esa unidad. Si está desconectado, el script avisa («Falló la segunda copia») y el respaldo local queda bien. Cambiar de disco cada semana y guardarlo fuera del local.                                            | Muy recomendada además de A |
| D. Otra PC del local (carpeta compartida)                  | Gratis                | Media      | `BACKUP_EXTRA_DIR` apunta a la carpeta de red. No protege contra robo o incendio del local.                                                                                                                                                                | Mejor que nada              |

- **Tamaño**: las fotos viven dentro de la base ([ADR-020](../decisions/ADR-020-fotos-de-producto.md)),
  así que cada respaldo pesa lo que pese la base (≈ 0,5 a 1 GB con 2 000 piezas y 3 fotos). Con 7 días y 3
  meses en la nube son unos 10 respaldos: calcular que no pasen de 15 GB y bajar
  `BACKUP_EXTRA_KEEP_DAILY` si hace falta.
- **Privacidad**: el respaldo contiene precios, costos, ventas y las claves cifradas de los usuarios.
  Por eso, **cifrar siempre** lo que sube a la nube (`BACKUP_PASSPHRASE`).
- Una cuenta de Google de la tienda con **verificación en dos pasos**; no usar una cuenta personal.

### Probar que sirve (cada mes)

`npm run backup:verify` restaura el último respaldo en una base **temporal** (que borra al terminar) y
compara las cifras con las del manifiesto. Debe terminar con «✔ El respaldo se restauró completo». Si
el respaldo está cifrado, necesita `BACKUP_PASSPHRASE`. Registrar la fecha y el resultado.

### Desastre: restaurar en la PC (o en otra)

1. Instalar los programas y el sistema ([PC-TIENDA.md](PC-TIENDA.md)) y `npm run local:up`.
2. Copiar el respaldo a la PC (y el `.env` guardado, para conservar las claves).
3. `npm run backup:restore -- <archivo.dump> --yes`: primero comprueba que el archivo se puede leer (y
   descifrar); si no, **no toca nada**. Luego hace un respaldo de lo que hay (sin borrar respaldos
   antiguos), detiene la aplicación, **reemplaza** la base por el respaldo y la vuelve a iniciar (al
   arrancar aplica las migraciones que falten). Si algo falla, indica dónde quedó la copia previa.

Probado el 2026-11-16 contra una base desechable: respaldo cifrado, `verify` (cifras coinciden),
`restore` sin `--yes` (se niega), con frase equivocada (no toca la base) y restauración correcta. 4. Entrar, revisar las cifras del Inicio y de la caja, y probar una venta.

Objetivos con esta configuración: **RPO ≤ 24 horas** (lo vendido desde el último respaldo se
vuelve a registrar a mano desde los comprobantes), **RTO ≈ 1 hora** si ya está instalado Docker.

## Propuesta para un hosting en la nube (a confirmar en P-26; no aplica a la PC de la tienda)

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
