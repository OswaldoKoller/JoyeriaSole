# Despliegue local

Para ver y probar la aplicación completa (base de datos, API y web) en esta máquina con un solo
comando. **No es producción**: la base y la aplicación solo escuchan en `localhost`, las cookies van
sin HTTPS y no hay copias de seguridad. Nunca usarlo con datos reales.

## Requisitos

- Node.js 22.12 o superior y npm 10 o superior.
- Docker Desktop abierto (el script avisa si no responde).

## Uso

```bash
npm run local:up                 # primera vez: crea .env, construye la imagen y deja todo listo
npm run local:up -- --demo       # además carga usuarios, productos y stock de demostración
npm run local:status             # estado de los servicios
npm run local:logs               # últimos registros de la aplicación
npm run local:down               # detiene todo conservando los datos
npm run local:reset -- --yes     # detiene todo y BORRA la base de datos local
```

Al terminar `local:up` imprime la dirección (`http://localhost:8080`) y el correo del administrador.
Su contraseña está en `.env` (`SEED_ADMIN_PASSWORD`); conviene cambiarla en «Mi cuenta» tras el
primer ingreso.

## Modos

| Modo               | Qué corre en contenedores         | Dirección               | Cuándo usarlo                                                |
| ------------------ | --------------------------------- | ----------------------- | ------------------------------------------------------------ |
| `docker` (defecto) | PostgreSQL + imagen de producción | `http://localhost:8080` | Probar lo mismo que se publicará: la imagen única API + SPA. |
| `node`             | Solo PostgreSQL                   | `http://localhost:3000` | Reconstruir más rápido (`npm run local:up -- --mode=node`).  |

En ambos modos la API sirve también la web (mismo origen), igual que en producción.

## Qué hace `local:up`

1. Comprueba Node y Docker.
2. Si no existe `.env`, lo crea desde `.env.example` con contraseñas y secretos aleatorios (permisos
   restringidos; nunca se imprimen ni se suben a Git) y elige un puerto libre para PostgreSQL.
3. Inicia PostgreSQL y espera a que esté sano.
4. Modo `docker`: construye e inicia la imagen (aplica las migraciones al arrancar). Modo `node`:
   compila, aplica migraciones e inicia la API como proceso en segundo plano (PID y registro en
   `.local-deploy/`, ignorado por Git).
5. Siembra los datos de estructura (roles, permisos, administrador, atributos); es idempotente.
6. Espera a que `/api/v1/health` responda.

Repetir `local:up` es seguro: reutiliza la base y reconstruye solo lo que cambió.

## Variables útiles

- `APP_PORT` (por defecto 8080): puerto de la aplicación en modo `docker`.
- `API_PORT` en `.env` (por defecto 3000): puerto en modo `node`.
- `COMPOSE_PROJECT_NAME` (por defecto `joyeria-local`): el despliegue local usa contenedores y
  volumen propios, distintos de los de `npm run db:up` (`joyeria-sole`), así que no toca la base de
  desarrollo. Cambiarlo para tener varios despliegues locales a la vez.

## Problemas frecuentes

- **«Docker no está disponible»**: abrir Docker Desktop y esperar a que indique que está en marcha.
- **Puerto ocupado**: otro programa usa 8080 o 3000. Cambiar `APP_PORT` / `API_PORT`.
- **Falla el login de la base**: el volumen conserva la contraseña con la que se creó. Si se regeneró
  `.env`, ejecutar `npm run local:reset -- --yes` y volver a levantar.
