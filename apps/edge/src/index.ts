import { buildEdge } from './app.js';

const port = Number(process.argv[2] ?? process.env.PORT ?? 4100);
const pop = process.argv[3] ?? process.env.POP_NAME ?? `edge-${port}`;

const app = await buildEdge({ pop });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
}

await app.listen({ port, host: '0.0.0.0' });
console.log(`Blitzman edge PoP "${pop}" on http://localhost:${port}`);
