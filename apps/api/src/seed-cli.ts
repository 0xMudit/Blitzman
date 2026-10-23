import { config } from './config.js';
import { createDb } from './db.js';
import { ensureSchema } from './schema.js';
import { seedTitles } from './seed.js';

const db = await createDb({ url: config.databaseUrl, dir: config.pgliteDir });
await ensureSchema(db);
const count = await seedTitles(db);
console.log(`Seeded ${count} titles into ${db.driver}.`);
await db.close();
