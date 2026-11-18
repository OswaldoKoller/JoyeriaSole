# Preparar la PC de la tienda

Decisión D5 (2026-11-09) y respuesta del 2026-11-14: el sistema se instala en **la PC del local** y se
usa **solo desde esa PC** (sin acceso desde otros equipos ni desde Internet). Por eso no hace falta
HTTPS ni abrir puertos: la aplicación escucha únicamente en `localhost`. Esta guía deja la PC lista;
la parte de respaldos está en [BACKUPS.md](BACKUPS.md) y el uso diario en [LOCAL.md](LOCAL.md).

> Estado al 2026-11-17: lo marcado **✔** existe y está probado; lo marcado **⚠ pendiente** no está
> automatizado todavía y se lista al final.

## 1. Programas (una sola vez)

| Programa                                | Para qué                                     | Cómo                                                                                    |
| --------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------- |
| Windows 11 Pro actualizado              | Base                                         | Activar la **virtualización** en la BIOS si Docker lo pide.                             |
| **Docker Desktop**                      | Ejecuta la base de datos y la aplicación     | Instalar y marcar «Iniciar Docker Desktop al iniciar sesión» (Configuración → General). |
| **Node.js 22.12 o superior** (con npm)  | Comandos `npm run …` (despliegue, respaldos) | Instalar la versión LTS desde nodejs.org.                                               |
| **Git**                                 | Descargar y actualizar el sistema            | Instalar Git para Windows.                                                              |
| Navegador (Chrome o Edge)               | Usar el sistema en `http://localhost:8080`   | Crear un acceso directo en el escritorio.                                               |
| (Opcional) Google Drive para escritorio | Segunda copia gratuita de los respaldos      | Ver [BACKUPS.md](BACKUPS.md), «Segunda copia».                                          |

## 2. Energía y Windows

- **Que la PC no se suspenda ni hiberne** (Configuración → Sistema → Energía: «Nunca» en pantalla
  apagada y suspensión con corriente). Si se apaga de golpe, la base de datos se recupera, pero se pierde
  lo que no se había guardado: conviene un **UPS** (batería) de bajo costo.
- Usuario de Windows **con contraseña** y bloqueo de pantalla al alejarse. **No compartir la sesión**:
  quien entra a la PC puede abrir los respaldos.
- Activar **BitLocker** (cifrado del disco) si la PC puede salir del local.
- Actualizaciones de Windows fuera del horario de venta.

## 3. Instalar el sistema ✔

```bash
git clone https://github.com/OswaldoKoller/JoyeriaSole.git
cd JoyeriaSole
npm ci
npm run local:up           # crea .env con claves aleatorias, construye e inicia todo
```

- Abrir `http://localhost:8080`. El correo y la contraseña del Administrador salen al terminar
  `local:up` (la contraseña está en `.env`, `SEED_ADMIN_PASSWORD`). **Cambiar esa contraseña en «Mi
  cuenta»** y crear un **segundo Administrador** con otro correo.
- **No usar `--demo`** en la PC real (carga datos ficticios).
- **Protección del libro** ✔ (D3): `local:up` crea un usuario de base de datos propio de la aplicación
  (`APP_DB_USER`, sin permisos de administrador de PostgreSQL) y la aplicación trabaja solo con él, así
  que no puede vaciar el libro de movimientos ni la auditoría. Al terminar, `local:up` y `npm run
local:status` deben decir **«Protección del libro: activa»**; si dicen «INACTIVA», repetir
  `npm run local:up` y, si sigue, pedir ayuda antes de cargar datos.
- La aplicación y la base **vuelven solas** al reiniciar la PC o Docker (`restart: unless-stopped`) ✔.
  Basta con que Docker Desktop inicie con Windows.
- **Guardar una copia de `.env`** en un gestor de contraseñas o en un USB guardado aparte: sin
  `POSTGRES_PASSWORD` y `AUTH_SECRET` no se puede reconstruir el entorno. **No** subirlo a Git ni al correo.
  Si `local:up` avisa «Se agregó a .env el usuario de la base para la aplicación», **actualizar esa copia**.

## 4. Datos del negocio y de la tienda ✔

1. Entrar como Administrador → «Datos del negocio»: nombre, dirección, teléfono y **NIT**.
2. Subir el **logo** (PNG, JPG o WebP de hasta 2 MB; con fondo blanco o transparente).
3. Revisar la **leyenda del pie** del comprobante (por defecto: no hay devoluciones, solo cambio de pieza).
4. Crear los usuarios reales (Vendedor, Responsable) con **contraseña temporal** que cada uno cambia al entrar.
5. Cargar categorías, atributos, proveedores y el inventario inicial (manual; si el Excel es grande se
   evalúa un importador).

## 5. Hardware ✔ (comprobar)

- **Impresora de comprobantes** (rollo de 58 u 80 mm, o A4/A5): imprimir un comprobante de prueba de
  una venta y de un cambio; en el diálogo usar escala 100 % y desactivar encabezados y pies de página.
- **Impresora de etiquetas** y **lector de códigos** (se comporta como un teclado): probar escaneando
  una pieza en el punto de venta.

## 6. Respaldos ✔

Seguir [BACKUPS.md](BACKUPS.md): `npm run backup:schedule` programa el respaldo diario; `npm run
backup:verify` prueba una restauración. **Hacerlo antes de cargar datos reales** y repetir la prueba
de restauración cada mes.

## 7. Antes de abrir la tienda

1. `npm run backup` y `npm run backup:verify` terminan en verde.
2. Probar cada rol con datos de prueba: vender, **cambiar una pieza**, abrir y cerrar caja.
3. Borrar los datos de prueba (con ayuda; **no** usar `local:reset` sin respaldo y sin confirmar).
4. Un periodo en paralelo con el control actual (Excel o papel) durante los primeros días.

## 8. Qué NO está resuelto todavía (⚠ pendiente)

| Tema                  | Situación                                                                                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cookies sin HTTPS     | Aceptable porque solo se usa desde `localhost` (la base y la aplicación no escuchan en la red). **No** exponer el puerto 8080 a la red del local sin antes configurar HTTPS. |
| Copia fuera del local | Opcional y gratuita (Google Drive para escritorio). Sin ella, un robo o incendio en el local pierde también los respaldos del disco. Se recomienda activarla.                |
| Monitoreo             | No hay alertas automáticas: `npm run backup:status` indica si el último respaldo tiene más de un día. Revisarlo al abrir la tienda o una vez por semana.                     |
| Actualizar el sistema | `git pull` y `npm run local:up` conservan los datos; **hacer `npm run backup` antes de cada actualización**.                                                                 |
