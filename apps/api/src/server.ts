import { buildApp } from './app.ts';
import { loadEnv } from './config/env.ts';

const env = loadEnv();
const app = await buildApp(env);

// Apagado ordenado: termina las peticiones en curso y cierra la conexión a la BD.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'Cerrando servidor...');
    app
      .close()
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        app.log.error({ err }, 'Error al cerrar');
        process.exit(1);
      });
  });
}

try {
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
} catch (err) {
  app.log.fatal({ err }, 'No se pudo iniciar el servidor');
  process.exit(1);
}
