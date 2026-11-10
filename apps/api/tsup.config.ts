import { defineConfig } from 'tsup';

// Empaqueta la API en un bundle ESM para producción.
// El paquete compartido (@joyeria/shared, TypeScript sin compilar) se incluye en el bundle;
// el resto de dependencias se resuelven desde node_modules en tiempo de ejecución.
//
// Dos puntos de entrada:
//   - dist/server.js  la API (y la SPA).
//   - dist/seed.js    el seed ESTRUCTURAL de producción (`node dist/seed.js`). La imagen final no
//                     contiene tsx, ni src/, ni el código fuente de @joyeria/shared, así que
//                     `prisma db seed` (que ejecuta `tsx prisma/seed.ts`) no puede correr allí.
//                     En desarrollo se sigue usando `npm run db:seed`.
export default defineConfig({
  entry: { server: 'src/server.ts', seed: 'prisma/seed.ts' },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: false, // los .map no se publican en la imagen (S-09)
  noExternal: ['@joyeria/shared'],
});
