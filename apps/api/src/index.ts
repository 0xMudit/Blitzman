import { buildApp } from './app.js';
import { assertSecrets, config } from './config.js';
import { createDb } from './db.js';

assertSecrets();

const db = await createDb({ url: config.databaseUrl, dir: config.pgliteDir });
const app = await buildApp({ db, logger: true });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    app.log.info(`${signal} received, shutting down`);
    await app.close();
    await db.close();
    process.exit(0);
  });
}

await app.listen({ port: config.port, host: '0.0.0.0' });
app.log.info(`Blitzman API on http://localhost:${config.port} (${db.driver})`);
