import fp from 'fastify-plugin';
import { createPrismaClient, type PrismaClient } from '../lib/prisma.ts';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export const prismaPlugin = fp<{ databaseUrl: string }>(
  async (app, { databaseUrl }) => {
    const prisma = createPrismaClient(databaseUrl);
    await prisma.$connect();
    app.decorate('prisma', prisma);
    app.addHook('onClose', async () => {
      await prisma.$disconnect();
    });
  },
  { name: 'prisma' },
);
