# Instalar el sistema en la PC de la tienda (paso a paso)

Decisión D5 (2026-11-09) y respuesta del 2026-11-14: el sistema se instala en **la PC del local** y se
usa **solo desde esa PC** (sin acceso desde otros equipos ni desde Internet). Por eso no hace falta
HTTPS ni abrir puertos: la aplicación escucha únicamente en `localhost`.

Esta guía es para **quien instala** (el desarrollador o un técnico). Se sigue en orden: cada fase
termina con una comprobación. Qué pasa si se corta la luz o se apaga la PC está en
[CORTES-Y-APAGADOS.md](CORTES-Y-APAGADOS.md); el detalle de los respaldos, en [BACKUPS.md](BACKUPS.md);
los comandos de `local:up`, en [LOCAL.md](LOCAL.md).

> Estado al 2026-11-18: todo lo que se indica aquí existe y está probado en una PC de desarrollo con
> Windows 11 y en el CI. Lo que no está automatizado se lista en la fase 11.

## Resumen de fases

| Fase | Qué                                                   | Tiempo aprox.       |
| ---- | ----------------------------------------------------- | ------------------- |
| 0    | Pedir al cliente lo necesario (antes de ir)           | —                   |
| 1    | Preparar Windows y la BIOS                            | 30 min              |
| 2    | Instalar los programas                                | 45 min              |
| 3    | Acceso de solo lectura al repositorio                 | 10 min              |
| 4    | Instalar el sistema con datos de **demostración**     | 20–40 min (1.ª vez) |
| 5    | Respaldos automáticos                                 | 20 min              |
| 6    | Pruebas completas (roles, hardware, cortes, respaldo) | 2–3 h               |
| 7    | Borrar las pruebas y dejar el sistema en limpio       | 15 min              |
| 8    | Cargar los datos reales                               | según el inventario |
| 9    | Puesta en marcha (primer día) y rutina                | —                   |
| 10   | Actualizar el sistema (más adelante)                  | 15 min              |
| 11   | Lo que no está resuelto                               | —                   |

## Fase 0. Qué pedir al cliente (antes de ir)

### Equipo

| Qué                       | Requisito                                                                                                                                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PC**                    | Windows 11 **Pro** 64 bits, versión 23H2 o posterior (Windows 10 22H2 Pro también sirve). Con la edición Home, Docker suele funcionar, pero su documentación no la lista: probarlo antes. Licencia de Windows activada. |
| Procesador                | 64 bits con **virtualización** (Intel VT-x o AMD-V), de 8.ª generación o más nuevo (Core i3 / Ryzen 3 o superior).                                                                                                      |
| Memoria                   | **8 GB mínimo** (lo que exige Docker Desktop); **16 GB recomendado** (Docker + navegador + impresión).                                                                                                                  |
| Disco                     | **SSD** con **60 GB libres** o más (programas e imagen ≈ 10 GB; base y respaldos crecen con las fotos).                                                                                                                 |
| **UPS** (batería)         | 600–1000 VA para la PC y el monitor; mejor si tiene puerto USB (permite apagado ordenado). Es la mejor defensa contra cortes de luz.                                                                                    |
| Impresora de comprobantes | Térmica de 80 mm (o 58 mm) **con controlador para Windows**, o una impresora A4/A5.                                                                                                                                     |
| Impresora de etiquetas    | Si se van a imprimir etiquetas con código: con controlador para Windows.                                                                                                                                                |
| Lector de códigos         | USB, en **modo teclado** (HID) y que envíe **Enter** al final de cada lectura.                                                                                                                                          |
| Disco USB externo         | Recomendado: segunda copia de los respaldos que se guarda fuera del local.                                                                                                                                              |
| Internet                  | Para instalar (se descargan ≈ 3–5 GB), para actualizar y para la copia en Google Drive. **La venta diaria no necesita Internet.**                                                                                       |

### Cuentas y licencias

- **Contraseña de un usuario administrador** de Windows (para instalar).
- **Docker Desktop** es gratuito para empresas de **menos de 250 empleados y menos de US$10 millones**
  de ingresos anuales: confirmar que la tienda cumple ambas condiciones.
- (Opcional, recomendado) una **cuenta de Google de la tienda**, no personal, con verificación en dos
  pasos, para la segunda copia de los respaldos.
- El acceso al repositorio (privado) lo prepara el desarrollador en la fase 3; **no** se usan
  credenciales personales en la PC de la tienda.

### Datos del negocio

- Nombre comercial, dirección, teléfono y **NIT**.
- **Logo**: PNG, JPG o WebP de hasta 2 MB, con fondo blanco o transparente (en blanco y negro si el
  comprobante sale en rollo térmico).
- Leyenda del pie del comprobante (por defecto: «No se aceptan devoluciones. Solo se realizan cambios de
  pieza presentando este comprobante.»).
- **Personal**: nombre, correo (es el usuario para entrar; debe ser único) y rol de cada persona
  (Administrador, Responsable de inventario o Vendedor). Al menos **dos administradores**.
- **Catálogo e inventario**: categorías, atributos (tallas, materiales…), proveedores y, por pieza:
  nombre, variante, código del proveedor o de barras, costo, precio de venta y cantidad actual (el
  Excel del cliente).
- Medios de pago que usan (efectivo, QR, transferencia) y el **fondo de caja** inicial.
- **Horario de la tienda** (para las horas activas de Windows y la hora del respaldo).
- Quién será el **responsable de los respaldos** y dónde se guardarán la copia de `.env` y la frase de
  cifrado (gestor de contraseñas, USB guardado o sobre cerrado).

### Tiempo y personas

Una ventana de **4 a 6 horas sin atención al público** para instalar y probar, y luego 1–2 horas por rol
para la capacitación (con el [tutorial](../tutorial/README.md)).

## Fase 1. Preparar Windows y la BIOS

### 1.1 BIOS / UEFI (al encender: F2, F10, Supr o Esc, según la marca)

1. **Virtualización: Enabled** (Intel Virtualization Technology / VT-x, o AMD SVM / AMD-V).
2. (Recomendado) **Restore on AC Power Loss** (o «AC Power Recovery», «After Power Loss»): **Power On**
   o **Last State**. Así la PC se enciende sola cuando vuelve la luz.
3. Guardar y salir.

### 1.2 Cuentas de Windows

Se usan **dos cuentas locales**:

- **El administrador** (ya existe): solo para instalar y mantener.
- **`Tienda`** (usuario **estándar**, con contraseña): la que se usa todos los días. **Todo el sistema
  (Docker, el proyecto, los respaldos) vive en esta cuenta**: Docker Desktop guarda sus datos por usuario,
  así que si se instala en otra cuenta, `Tienda` no los vería.

En **PowerShell como administrador**:

```powershell
$clave = Read-Host -AsSecureString "Contraseña para la cuenta Tienda"
New-LocalUser -Name "Tienda" -Password $clave -FullName "Tienda Joyería Sole" -PasswordNeverExpires
Add-LocalGroupMember -SID "S-1-5-32-545" -Member "Tienda"   # grupo Usuarios (en cualquier idioma)
```

### 1.3 Energía (PowerShell como administrador)

```powershell
powercfg /change standby-timeout-ac 0     # nunca suspender
powercfg /change hibernate-timeout-ac 0   # nunca hibernar
powercfg /hibernate off                   # quita la hibernación y el «inicio rápido»
powercfg /change monitor-timeout-ac 15    # la pantalla sí puede apagarse
```

Sin «inicio rápido», apagar es un apagado completo: Docker arranca limpio al día siguiente.

### 1.4 Hora, actualizaciones y seguridad

1. Zona horaria de Bolivia y hora automática:
   `tzutil /s "SA Western Standard Time"` y, en Configuración → Hora e idioma, activar «Establecer la
   hora automáticamente».
2. Configuración → Windows Update → Opciones avanzadas → **Horas activas**: el horario de la tienda
   (p. ej. 8:00 a 21:00). Windows no reiniciará solo dentro de ese horario. Activar «Notificarme cuando
   se requiera un reinicio».
3. Instalar ahora todas las actualizaciones pendientes y reiniciar (para no hacerlo el día de la
   apertura).
4. Bloqueo de pantalla: Configuración → Cuentas → Opciones de inicio de sesión → pedir la contraseña al
   volver de la pantalla apagada.
5. Si la PC puede salir del local: **BitLocker** (Windows Pro) para cifrar el disco.

**Comprobación de la fase 1:** el Administrador de tareas → Rendimiento → CPU muestra
«Virtualización: Habilitado»; `powercfg /a` ya no lista la hibernación.

## Fase 2. Instalar los programas

Iniciar sesión como **`Tienda`**. Cuando un instalador pida permisos, escribir el usuario y la clave
del **administrador** (así los programas quedan para la máquina, pero Docker queda en la cuenta
`Tienda`).

| #   | Programa                                    | Cómo                                                                                                                                                      |
| --- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **WSL 2**                                   | PowerShell como administrador: `wsl --install --no-distribution`, luego `wsl --update`. Reiniciar. `wsl --version` debe mostrar WSL **2.1.5 o superior**. |
| 2   | **Docker Desktop**                          | Descargar de docker.com e instalar con «Use WSL 2 instead of Hyper-V» marcado. Al terminar, cerrar sesión y volver a entrar.                              |
| 3   | Permiso de Docker para `Tienda`             | PowerShell como administrador: `Add-LocalGroupMember -Group "docker-users" -Member "Tienda"`. **Cerrar sesión y volver a entrar** como `Tienda`.          |
| 4   | **Git para Windows**                        | De git-scm.com, con las opciones por defecto (incluye «Git Bash»).                                                                                        |
| 5   | **Node.js 22 LTS**                          | De nodejs.org, la versión **22** LTS (la misma que usa el CI, archivo `.nvmrc`). Comprobar: `node --version` (22.12 o superior) y `npm --version`.        |
| 6   | **Google Chrome**                           | Navegador para el sistema (Edge también sirve).                                                                                                           |
| 7   | Controladores de las impresoras             | Los del fabricante. En Windows → Impresoras, definir el tamaño de papel (rollo de 80 o 58 mm) e imprimir una página de prueba.                            |
| 8   | (Opcional) **Google Drive para escritorio** | Iniciar sesión con la cuenta de la tienda. Crear en «Mi unidad» la carpeta `Respaldos Joyería Sole`.                                                      |

### 2.1 Configurar Docker Desktop (como `Tienda`)

1. Abrir Docker Desktop, aceptar las condiciones; no hace falta iniciar sesión en Docker.
2. Settings → General:
   - ✔ **Start Docker Desktop when you sign in to your computer** (imprescindible: así la aplicación
     vuelve sola cada mañana).
   - ✔ Use the WSL 2 based engine.
3. Settings → Software updates: desmarcar **Always download updates** (las actualizaciones se instalan a
   mano, fuera del horario de venta).
4. Esperar a que abajo a la izquierda diga **Engine running**.

### 2.2 Lector de códigos

Abrir el Bloc de notas y escanear un código: debe aparecer el número **y saltar de línea**. Si no salta
de línea, configurar el lector con el código «Add CR/Enter suffix» de su manual.

**Comprobación de la fase 2** (PowerShell como `Tienda`): `docker version` muestra «Server» sin errores,
`git --version`, `node --version` (≥ 22.12) y `npm --version` responden.

## Fase 3. Acceso de solo lectura al repositorio

El repositorio es **privado**. En la PC de la tienda se usa una **clave de despliegue** que solo puede
**leer** este repositorio (no da acceso a la cuenta de GitHub del desarrollador).

En **Git Bash**, como `Tienda`:

```bash
ssh-keygen -t ed25519 -C "pc-tienda-joyeria" -f ~/.ssh/joyeria_deploy -N ""
cat ~/.ssh/joyeria_deploy.pub
cat >> ~/.ssh/config <<'EOF'
Host github-joyeria
  HostName github.com
  User git
  IdentityFile ~/.ssh/joyeria_deploy
  IdentitiesOnly yes
EOF
```

En GitHub (desarrollador): repositorio → **Settings → Deploy keys → Add deploy key**; título «PC tienda»;
pegar la clave pública que mostró `cat`; **no** marcar «Allow write access».

Comprobación: `ssh -T git@github-joyeria` (responder `yes` la primera vez) debe decir «You've
successfully authenticated, but GitHub does not provide shell access».

Si la tienda deja de ser cliente o se cambia de PC: borrar esa clave en GitHub (Deploy keys).

## Fase 4. Instalar el sistema con datos de demostración

Primero se instala **con datos ficticios** para probar todo (fase 6) y después se borra (fase 7). Las
ventas no se pueden anular ni borrar (DEC-V07): las pruebas **nunca** se hacen con la base definitiva.

En **Git Bash**, como `Tienda`:

```bash
git clone git@github-joyeria:OswaldoKoller/JoyeriaSole.git ~/JoyeriaSole
cd ~/JoyeriaSole
git checkout main
npm ci
npm run local:up -- --demo
```

`local:up` (la primera vez tarda 20–40 minutos porque construye la imagen):

1. Crea `.env` con contraseñas y secretos aleatorios (nunca se imprimen ni se suben a Git).
2. Inicia PostgreSQL y crea el usuario de la base de la aplicación (`joyeria_app`, sin superusuario).
3. Construye e inicia la aplicación, aplica las migraciones y siembra los datos iniciales y los de
   demostración.
4. Termina con:

```text
✔ Joyería Sole está corriendo en http://localhost:8080
  Protección del libro: activa (la aplicación usa «joyeria_app», sin superusuario ni TRUNCATE)
```

Si dice «INACTIVA», repetir `npm run local:up -- --demo` y, si sigue, no continuar (pedir soporte).

### 4.1 Accesos directos

- Chrome → Configuración → Al iniciar → «Abrir una página específica»: `http://localhost:8080`. Crear un
  acceso directo en el escritorio a esa dirección.
- (Útil) Un archivo `Estado del sistema.cmd` en el escritorio con:

  ```bat
  @echo off
  cd /d %USERPROFILE%\JoyeriaSole
  call npm run local:status
  call npm run backup:status
  pause
  ```

**Comprobación de la fase 4:** `http://localhost:8080` muestra el inicio de sesión; los usuarios de
demostración (`demo-admin@…`, `demo-inventario@…`, `demo-vendedor@example.invalid`) entran con la
clave `DEMO_USER_PASSWORD` de `.env` (abrir con `notepad .env`).

## Fase 5. Respaldos automáticos

Detalle y opciones en [BACKUPS.md](BACKUPS.md). En `notepad .env` agregar al final (ajustar las rutas):

```ini
# Respaldos
BACKUP_DIR=D:\RespaldosJoyeria
BACKUP_PASSPHRASE=una frase larga que solo sepa el responsable
BACKUP_EXTRA_DIR=G:\Mi unidad\Respaldos Joyería Sole
```

- `BACKUP_DIR`: mejor en **otro disco** (D:). Si la PC tiene un solo disco, quitar la línea (por
  defecto: `C:\Users\Tienda\respaldos-joyeria-sole`).
- `BACKUP_PASSPHRASE`: 12 caracteres o más. **Imprescindible** si hay copia en Google Drive. **No se
  puede recuperar**: guardarla con la copia de `.env`.
- `BACKUP_EXTRA_DIR`: carpeta de Google Drive o un disco USB. Opcional, muy recomendada.

Luego, en Git Bash dentro de `~/JoyeriaSole`:

```bash
npm run backup                          # primer respaldo: debe terminar sin «✖»
npm run backup:verify                   # «✔ El respaldo se restauró completo y sus cifras coinciden»
npm run backup:schedule -- --at=13:00   # tarea diaria de Windows
npm run backup:status
```

- **Hora del respaldo**: una hora en la que la PC **siempre** esté encendida con la sesión `Tienda`
  iniciada (p. ej. al mediodía). La tarea corre solo con esa sesión abierta; si a esa hora la PC estaba
  apagada, el respaldo se hace **al volver a iniciar sesión**.
- Guardar **una copia de `.env`** (incluye la frase) en el gestor de contraseñas o en un USB guardado
  fuera de la PC. **No** por correo ni en Git.

**Comprobación de la fase 5:** `npm run backup:status` muestra el último respaldo de hace 0 h, la
segunda copia (si se configuró) y la tarea programada.

## Fase 6. Pruebas completas (con los datos de demostración)

Marcar cada punto. Si algo falla, anotarlo y no pasar a la fase 7.

### 6.1 Por rol (usar el [tutorial](../tutorial/README.md))

| ✔   | Rol           | Prueba                                                                                  | Resultado esperado                                                |
| --- | ------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
|     | Todos         | Entrar, cambiar la contraseña en «Mi cuenta», salir.                                    | Entra con la nueva clave.                                         |
|     | Administrador | Datos del negocio: NIT, **logo** y leyenda.                                             | El comprobante muestra logo y leyenda.                            |
|     | Responsable   | Abrir caja con fondo.                                                                   | «Caja abierta».                                                   |
|     | Vendedor      | Vender **escaneando** una pieza; pagar en efectivo con vuelto; imprimir el comprobante. | Venta VTA-…; stock −1; comprobante legible a escala 100 %.        |
|     | Vendedor      | Vender con QR y con pago mixto.                                                         | Suma de pagos = total.                                            |
|     | Vendedor      | **Cambio de pieza** por una más cara (cobrar la diferencia) y probar una más barata.    | La cara se registra (CMB-…); la barata se rechaza.                |
|     | Vendedor      | Reimprimir un comprobante.                                                              | Sale con «COPIA».                                                 |
|     | Responsable   | Ingreso de mercadería (borrador → confirmar), ajuste, conteo físico, etiquetas.         | Saldos y movimientos cambian solo al confirmar o aprobar.         |
|     | Responsable   | Cerrar caja con arqueo.                                                                 | Esperado = fondo + efectivo de ventas y cambios.                  |
|     | Administrador | Crear un usuario Vendedor con clave temporal; auditoría.                                | El nuevo usuario debe cambiar la clave; la auditoría lo registra. |

### 6.2 Hardware

- Comprobante en rollo: en el diálogo de impresión de Chrome, **Márgenes: ninguno**, **Escala: 100**,
  **sin encabezados ni pies de página**; elegir el formato 58/80 mm en la pantalla del comprobante.
  Chrome recuerda la elección.
- Etiquetas: imprimir una hoja y **escanear** la etiqueta impresa en el punto de venta.

### 6.3 Cortes y apagados (simulacros)

Hacerlos **ahora**, con datos de prueba. Qué se espera en cada caso está en
[CORTES-Y-APAGADOS.md](CORTES-Y-APAGADOS.md).

| ✔   | Simulacro                                                                                   | Resultado esperado                                                                                                     |
| --- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
|     | Inicio → **Reiniciar**. Entrar como `Tienda`.                                               | En 1–3 min Docker dice «Engine running»; `Estado del sistema.cmd` muestra «responde» y «Protección del libro: activa». |
|     | Con la caja abierta y sin ventas en curso, **desenchufar** la PC (o mantener el botón 5 s). | Al encender: igual que arriba; la caja sigue abierta y la última venta existe.                                         |
|     | Armar una venta, pulsar **Confirmar** y desenchufar enseguida.                              | Al volver: la venta está completa en el historial **o** no existe (nunca a medias). Seguir el caso C5 de la guía.      |
|     | Desenchufar el **UPS** de la pared.                                                         | La PC sigue encendida. Con el cable USB del UPS, Windows lo muestra como batería.                                      |
|     | Cerrar Docker Desktop (Quit) y volver a abrirlo.                                            | La aplicación vuelve sola.                                                                                             |
|     | `npm run backup:restore -- <último respaldo> --yes`                                         | Restaura, «La base vuelve a pertenecer a joyeria_app», la aplicación responde.                                         |

## Fase 7. Borrar las pruebas y dejar el sistema en limpio

Las ventas de prueba no se pueden borrar una por una: se borra **toda** la base de prueba. Solo en
este momento, antes de cargar datos reales.

1. En `notepad .env`, poner el correo y el nombre del administrador real:
   `SEED_ADMIN_EMAIL=correo-real@…` y `SEED_ADMIN_NAME=Nombre Apellido`. **No cambiar ese correo después
   desde la pantalla**: si no existe un usuario con ese correo, cada `local:up` vuelve a crear ese
   administrador con la clave inicial de `.env`.
2. En Git Bash, en `~/JoyeriaSole`:

   ```bash
   npm run local:reset -- --yes   # BORRA la base de prueba (solo ahora)
   npm run local:up               # instalación limpia, SIN --demo
   ```

3. Debe terminar con «Protección del libro: activa».
4. Borrar los respaldos de prueba: el contenido de `BACKUP_DIR` y de la carpeta de la segunda copia.
5. `npm run backup` y `npm run backup:verify` sobre la base limpia.
6. Actualizar la copia guardada de `.env`.

## Fase 8. Cargar los datos reales

Con el administrador real (correo de `SEED_ADMIN_EMAIL`, clave inicial `SEED_ADMIN_PASSWORD` de `.env`):

1. **Mi cuenta → cambiar la contraseña** de inmediato.
2. **Datos del negocio**: nombre, dirección, teléfono, **NIT**, **logo** y leyenda del pie.
3. **Usuarios**: el segundo administrador, los responsables y los vendedores, con **contraseña
   temporal** (cada uno la cambia al entrar).
4. **Catálogo**: categorías, atributos, proveedores y tipos de costo.
5. **Productos y variantes** con SKU, códigos de barras o del proveedor y precios de venta.
6. **Stock inicial** (Responsable → Stock inicial) o un ingreso de mercadería, pieza por pieza, según el
   Excel. Si el archivo es grande, se evalúa un importador antes de cargarlo a mano.
7. **Etiquetas** de las piezas sin código.
8. Comparar las cantidades del sistema con el Excel (Saldos y alertas).
9. `npm run backup` y `npm run backup:verify`.

## Fase 9. Puesta en marcha y rutina

### Primer día

1. Encender la PC, entrar como `Tienda`, esperar «Engine running», abrir el acceso directo.
2. Abrir la caja con el fondo real.
3. Durante los primeros días, llevar **en paralelo** el control anterior (Excel o papel).

### Rutina

| Cuándo                                   | Quién        | Qué                                                                                                                                 |
| ---------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Cada mañana                              | Quien abre   | Encender, entrar como `Tienda`, esperar «Engine running» (1–3 min), abrir el sistema, **abrir la caja**.                            |
| Cada noche                               | Quien cierra | **Cerrar la caja** (arqueo). Apagar con **Inicio → Apagar** (nunca desenchufando ni con el botón).                                  |
| Cada semana                              | Responsable  | `Estado del sistema.cmd`: el último respaldo no debe tener más de un día. Revisar la carpeta de Google Drive. Cambiar el disco USB. |
| Cada mes                                 | Responsable  | `npm run backup:verify` y anotar la fecha y el resultado.                                                                           |
| Cuando Windows o Docker pidan actualizar | Responsable  | Fuera del horario de venta, con un respaldo hecho antes.                                                                            |

## Fase 10. Actualizar el sistema (cuando haya una versión nueva)

Fuera del horario de venta, en Git Bash dentro de `~/JoyeriaSole`:

```bash
npm run backup        # siempre antes
git pull
npm ci
npm run local:up      # aplica las migraciones; conserva los datos
```

Debe terminar con «Protección del libro: activa». Si muestra un error de migración, **no repetir
comandos al azar**: avisar al desarrollador (la base está a salvo y el respaldo recién hecho permite
volver atrás).

## Fase 11. Lo que no está resuelto

| Tema                  | Situación                                                                                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cookies sin HTTPS     | Aceptable porque solo se usa desde `localhost` (la base y la aplicación no escuchan en la red). **No** exponer el puerto 8080 a la red del local sin antes configurar HTTPS. |
| Copia fuera del local | Opcional y gratuita (Google Drive para escritorio o disco USB). Sin ella, un robo o incendio en el local pierde también los respaldos del disco. Se recomienda activarla.    |
| Monitoreo             | No hay alertas automáticas: el estado se revisa con `Estado del sistema.cmd` (fase 9).                                                                                       |
| Arranque sin sesión   | La aplicación arranca cuando alguien **inicia sesión** como `Tienda` (Docker Desktop no corre sin sesión). Es lo esperado: se usa desde esa misma PC.                        |
