import { defineConfig } from 'tsup';

// Empaqueta la API en un único bundle ESM para producción.
// El paquete compartido (@joyeria/shared, TypeScript sin compilar) se incluye en el bundle;
// el resto de dependencias se resuelven desde node_modules en tiempo de ejecución.
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: false, // los .map no se publican en la imagen (S-09)
  noExternal: ['@joyeria/shared'],
});
