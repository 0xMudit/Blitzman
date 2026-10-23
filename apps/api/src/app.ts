import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { config } from './config.js';
import type { Db } from './db.js';
import { sendError } from './errors.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerCatalogRoutes } from './routes/catalog.js';
import { registerMeRoutes } from './routes/me.js';
import { registerPlaybackRoutes } from './routes/playback.js';
import { ensureSchema } from './schema.js';
import { seedIfEmpty } from './seed.js';

export interface BuildAppOptions {
  db: Db;
  /** Seed the demo catalog when the titles table is empty. Default: true. */
  seed?: boolean;
  logger?: boolean;
}

export async function buildApp({
  db,
  seed = true,
  logger = false,
}: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger, trustProxy: true });

  await app.register(cors, {
    origin: config.webOrigin
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86_400,
  });

  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  await ensureSchema(db);
  if (seed && config.seedOnEmpty) {
    await seedIfEmpty(db);
  }

  app.get('/health', async () => ({
    ok: true,
    driver: db.driver,
    uptimeSecs: Math.round(process.uptime()),
  }));

  await registerAuthRoutes(app, db);
  await registerCatalogRoutes(app, db);
  await registerPlaybackRoutes(app, db);
  await registerMeRoutes(app, db);

  app.setNotFoundHandler((request, reply) =>
    sendError(reply, 404, 'not_found', `No route for ${request.method} ${request.url}.`),
  );

  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error.statusCode && error.statusCode < 500) {
      return sendError(
        reply,
        error.statusCode,
        error.code ?? 'request_error',
        error.message,
      );
    }
    request.log.error(error);
    return sendError(reply, 500, 'internal_error', 'Something went wrong.');
  });

  return app;
}
