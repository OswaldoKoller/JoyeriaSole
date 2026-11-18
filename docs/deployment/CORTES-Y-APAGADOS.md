# Cortes de luz, apagados y reinicios: qué pasa y qué hacer

Para la instalación en la PC de la tienda ([PC-TIENDA.md](PC-TIENDA.md)). Explica, caso por caso y en
orden, qué hace el sistema cuando la PC se apaga de golpe, se reinicia o algo falla, y qué tiene que
hacer el personal. Los simulacros de la fase 6.3 de la guía de instalación prueban estos casos.

## 1. Por qué el sistema aguanta un apagado

| Garantía                         | Qué significa para la tienda                                                                                                                                                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Todo o nada**                  | Una venta, un cambio de pieza, un cierre de caja, un ingreso o un ajuste se guardan en **una sola transacción**: la venta, sus pagos, el movimiento de stock y la auditoría se guardan juntos o no se guarda nada. **Nunca queda una venta a medias** ni un stock descontado sin su venta. |
| **Lo confirmado no se pierde**   | PostgreSQL escribe cada operación confirmada en su registro (WAL) antes de responder. Si la pantalla dijo «Venta registrada», la venta está guardada aunque la luz se corte un segundo después. Al volver a arrancar, la base se recupera sola.                                            |
| **Sin duplicados al reintentar** | La venta y el cambio de pieza llevan una clave única por intento (`Idempotency-Key`). Si se reintenta el mismo intento, el sistema devuelve la venta ya registrada en vez de crear otra (durante 24 horas).                                                                                |
| **Vuelve solo**                  | Docker Desktop arranca al iniciar sesión en Windows y vuelve a levantar la base y la aplicación (`restart: unless-stopped`).                                                                                                                                                               |
| **La caja sigue abierta**        | La caja abierta vive en la base: un apagado no la cierra ni la descuadra. Se puede cerrar al volver (la sesión de caja puede cruzar días).                                                                                                                                                 |
| **El respaldo no se pierde**     | Si a la hora del respaldo la PC estaba apagada, se hace al volver a iniciar sesión. Un respaldo interrumpido no deja un archivo que parezca bueno (se escribe primero como `.partial`; uno cifrado a medias no pasa la verificación).                                                      |
| **Límite**                       | Lo que estaba **escrito en pantalla y sin confirmar** (un carrito, un formulario) puede perderse. Y un apagado brusco puede, en casos raros, dañar el disco virtual de Docker: para eso están el **UPS** y el **respaldo diario**.                                                         |

## 2. Secuencia normal al volver la luz (o al encender cada mañana)

1. La PC enciende: sola si la BIOS tiene «Restore on AC Power Loss: Power On», o con el botón.
2. Windows muestra el inicio de sesión. **Hasta que alguien entre como `Tienda`, el sistema no está
   disponible** (Docker Desktop corre dentro de la sesión).
3. Al entrar, Docker Desktop arranca solo (1–3 minutos; abajo a la izquierda dice «Engine running»).
4. Arranca PostgreSQL. Si el apagado fue brusco, primero **se recupera solo**: aplica lo confirmado y
   descarta lo que no llegó a confirmarse (unos segundos más).
5. Arranca la aplicación: aplica las migraciones pendientes (normalmente ninguna) y queda lista.
6. Si había un respaldo pendiente, la tarea programada lo hace ahora.
7. Abrir Chrome en `http://localhost:8080`. Si no han pasado 8 horas desde el último ingreso, la sesión
   sigue abierta; si no, volver a entrar.
8. Comprobar con `Estado del sistema.cmd`: «responde» y «Protección del libro: activa».

Si en el paso 7 la página no carga, esperar 2 minutos más y recargar; si sigue, ver el caso C12.

## 3. Casos, uno por uno

Cada caso: **qué pasa** en el sistema → **qué hacer**, en orden.

### C1. Apagado normal al cerrar (Inicio → Apagar)

- **Qué pasa:** Windows cierra Docker, que detiene la base de forma ordenada. No se pierde nada.
- **Qué hacer:** antes de apagar, **cerrar la caja** (arqueo). Al día siguiente, la secuencia normal
  (sección 2).

### C2. Reinicio por actualización de Windows

- **Qué pasa:** igual que C1 (cierre ordenado). Con las «horas activas» configuradas, Windows no reinicia
  dentro del horario de la tienda.
- **Qué hacer:** entrar como `Tienda` y seguir la sección 2. Si se reinició en pleno horario, revisar que
  las horas activas sigan bien configuradas.

### C3. Corte de luz con UPS

- **Qué pasa:** la PC sigue funcionando con la batería del UPS (unos minutos, según el modelo).
- **Qué hacer:**
  1. Terminar la venta en curso.
  2. Si el corte dura más de 5 minutos: **cerrar la caja** si es fin de jornada y **apagar con Inicio →
     Apagar** (caso C1) antes de que se agote la batería.
  3. Si el UPS tiene cable USB, Windows lo ve como batería y puede apagarse solo de forma ordenada al
     quedar poca carga (Opciones de energía → «Acción de batería crítica: Apagar»).

### C4. Corte de luz sin UPS, sin nadie usando el sistema

- **Qué pasa:** la base no se cerró de forma ordenada, pero todo lo confirmado está guardado. Al arrancar
  se recupera sola (sección 2, paso 4).
- **Qué hacer:** secuencia normal (sección 2). Revisar en el **Inicio** y en **Caja** que las cifras
  sean las de antes del corte.

### C5. Corte justo al confirmar una venta

Qué hacer depende de qué alcanzó a verse en pantalla:

1. **No se llegó a pulsar «Confirmar venta»:** no se registró nada. Al volver, armar la venta de nuevo
   (el carrito puede haberse perdido).
2. **Se pulsó «Confirmar» y no llegó la respuesta:** la venta está **completa o no existe**, nunca a
   medias. Al volver:
   1. Si Chrome restaura la pestaña y aparece **«Resultado incierto: no cobre de nuevo»**, pulsar
      **Reintentar**: si la venta se había registrado, el sistema la reconoce y la muestra (no la
      duplica); si no, la registra ahora.
   2. Si no aparece ese aviso: **Ventas → Historial de ventas** y buscar una venta con esa hora, esas
      piezas y ese importe.
      - **Está:** no volver a cobrar ni registrarla. Abrir la venta e imprimir el comprobante.
      - **No está:** registrarla de nuevo; el dinero ya está en el cajón, **no volver a cobrar**.
3. **Ya se veía «Venta VTA-… registrada»:** está guardada. Si faltó el comprobante, reimprimirlo desde
   el historial; puede salir con «COPIA», es normal.

En todos los casos **el cliente no paga dos veces**: el dinero recibido ya está en el cajón.

### C6. Corte durante un cambio de pieza

- **Qué pasa:** igual que una venta: o se registró todo (entra la pieza devuelta, sale la nueva, se
  cobra la diferencia) o nada. Un cambio no se puede registrar dos veces con el mismo intento.
- **Qué hacer:** **Ventas → Historial de cambios**. Si el cambio está, reimprimir su comprobante; si no,
  registrarlo de nuevo (sin volver a cobrar la diferencia si ya se cobró).

### C7. Corte durante la impresión del comprobante

- **Qué pasa:** la venta ya está guardada. La impresión se registra antes de imprimir.
- **Qué hacer:** reimprimir desde el detalle de la venta. Saldrá con «COPIA»: es lo esperado y no indica
  ningún problema.

### C8. Corte con la caja abierta

- **Qué pasa:** la caja sigue abierta y con sus cifras (ventas, cambios y fondo) después del corte.
- **Qué hacer:** seguir vendiendo con la misma caja. Al final del día, cerrarla con el arqueo normal.

### C9. Corte justo al cerrar la caja

- **Qué pasa:** el cierre se guarda completo o no se guarda.
- **Qué hacer:** abrir **Caja**. Si sigue abierta, repetir el cierre con el mismo conteo. Si ya figura
  cerrada, revisar el cierre en el historial de cajas; si el conteo quedó mal, el Administrador lo corrige
  (nunca se reabre).

### C10. Corte durante ingresos, ajustes o conteos

- **Qué pasa:** los borradores guardados siguen ahí; las confirmaciones y aprobaciones son todo o nada.
  En un conteo, cada lectura escaneada se guarda al momento.
- **Qué hacer:** abrir el documento y revisar su estado. Si sigue en borrador o pendiente, confirmarlo o
  aprobarlo otra vez. En un conteo, seguir escaneando desde donde quedó.

### C11. Corte durante el respaldo

- **Qué pasa:** queda, como mucho, un archivo `.partial` (no cuenta como respaldo). Si el respaldo iba
  cifrado y se cortó al escribirlo, ese archivo no pasa la verificación.
- **Qué hacer:** `npm run backup` cuando la PC vuelva (o esperar al de la noche siguiente). Si quedó un
  `.partial` en la carpeta de respaldos, se puede borrar.

### C12. La PC encendió, pero el sistema no carga

Seguir en orden; parar en cuanto funcione:

1. Esperar 3 minutos desde que se inició sesión: Docker tarda en arrancar.
2. Mirar el ícono de Docker (ballena, junto al reloj). Si Docker Desktop no está abierto, abrirlo desde
   el menú Inicio.
3. `Estado del sistema.cmd`: si dice «sin respuesta», en Git Bash dentro de `~/JoyeriaSole`:
   `npm run local:up` (es seguro: conserva los datos).
4. Si Docker se queda en «Starting…»: cerrarlo (clic derecho en la ballena → **Quit Docker Desktop**), en
   PowerShell `wsl --shutdown`, y volver a abrir Docker Desktop.
5. Reiniciar la PC (Inicio → Reiniciar).
6. Si sigue sin funcionar: **no** reinstalar Docker ni borrar nada; avisar al desarrollador. Mientras
   tanto, vender **en papel** (comprobante manual) y registrar después.

### C13. Alguien cerró Docker Desktop o ejecutó `local:down`

- **Qué pasa:** la aplicación deja de responder. Si se cerró Docker Desktop, al volver a abrirlo todo
  arranca solo. Si alguien ejecutó `npm run local:down`, los contenedores quedan detenidos a propósito y
  **no** vuelven solos.
- **Qué hacer:** abrir Docker Desktop; si no vuelve en 3 minutos, `npm run local:up`.

### C14. La PC se suspendió o se durmió

- **Qué pasa:** con la configuración de la fase 1 no debería ocurrir. Si ocurre, el sistema queda en
  pausa y sigue al despertar; el respaldo de esa hora se hace después.
- **Qué hacer:** mover el ratón o pulsar una tecla; si no responde, caso C12. Revisar la configuración de
  energía (fase 1.3).

### C15. Se cayó Internet

- **Qué pasa:** **nada** en el sistema: funciona sin Internet (vender, cobrar, imprimir, caja, stock).
  Solo se detiene la copia en Google Drive, que se pone al día cuando vuelve la conexión.
- **Qué hacer:** seguir trabajando. Los pagos por QR o transferencia se confirman en el banco como
  siempre y se registran en el sistema como QR o transferencia.

### C16. La hora de la PC quedó mal

- **Qué pasa:** las ventas y movimientos llevarían una fecha u hora equivocada. Suele ser la pila de la
  placa base, que ya no guarda la hora.
- **Qué hacer:** antes de vender, revisar la hora del reloj de Windows. Si está mal: Configuración → Hora
  e idioma → «Sincronizar ahora» (con Internet) o corregirla a mano, y reemplazar la pila.

### C17. Error de migración después de una actualización

- **Qué pasa:** si la actualización (fase 10 de la guía) se interrumpe mientras se aplica una migración,
  la migración se deshace, pero la siguiente vez la aplicación puede negarse a arrancar avisando de una
  migración fallida.
- **Qué hacer:** **no** repetir comandos al azar ni borrar nada. Avisar al desarrollador: se revisa el
  estado, se marca la migración y se vuelve a aplicar. El respaldo hecho antes de actualizar permite
  volver atrás si hiciera falta.

### C18. El disco virtual de Docker se dañó (raro, tras apagados bruscos)

- **Qué pasa:** Docker no arranca o la base no levanta aunque se sigan los pasos de C12.
- **Qué hacer (con el desarrollador):**
  1. Reinstalar o reiniciar Docker Desktop; se pierden los contenedores y la base local.
  2. `npm run local:up` (instalación limpia).
  3. `npm run backup:restore -- <último respaldo> --yes` ([BACKUPS.md](BACKUPS.md), «Desastre»).
  4. Volver a registrar lo vendido **desde el último respaldo** usando los comprobantes impresos.

### C19. Robo, incendio o disco destruido

- **Qué pasa:** se pierden la PC y los respaldos de su disco.
- **Qué hacer:** instalar en otra PC (guía completa) y restaurar el último respaldo de la **segunda
  copia** (Google Drive o el disco USB guardado fuera). Hacen falta la **copia de `.env`** y la **frase
  de cifrado**: por eso se guardan fuera de la PC.

## 4. Resumen

| Situación                         | ¿Se pierde algo?                           | Acción                                      |
| --------------------------------- | ------------------------------------------ | ------------------------------------------- |
| Apagado o reinicio normal         | No                                         | Entrar como `Tienda` y esperar.             |
| Corte con UPS                     | No                                         | Terminar y apagar con Inicio → Apagar.      |
| Corte sin UPS, sin uso            | No                                         | Secuencia normal.                           |
| Corte al confirmar venta o cambio | No (todo o nada); quizá el carrito escrito | Reintentar o revisar el historial (C5, C6). |
| Corte con caja abierta            | No                                         | Seguir; cerrar al final del día.            |
| Corte durante respaldo            | Solo ese respaldo                          | Repetir `npm run backup`.                   |
| El sistema no carga               | No                                         | C12 paso a paso.                            |
| Disco de Docker dañado            | Lo posterior al último respaldo            | Restaurar y volver a registrar (C18).       |
| Robo o incendio                   | Lo posterior a la última segunda copia     | Otra PC y la segunda copia (C19).           |

## 5. Prevención

1. **UPS** para la PC y el monitor (el mayor riesgo es el apagado brusco).
2. BIOS con encendido al volver la luz, sin suspensión ni inicio rápido (fase 1 de la guía).
3. Horas activas de Windows Update y actualizaciones de Docker a mano.
4. Apagar **siempre** con Inicio → Apagar, después de cerrar la caja.
5. Respaldo diario, segunda copia fuera del local y verificación mensual ([BACKUPS.md](BACKUPS.md)).
6. Copia de `.env` y de la frase de cifrado guardadas **fuera** de la PC.
