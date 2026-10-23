import { mkdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import postgres from 'postgres';

/**
 * The smallest database seam that matters at this stage: route handlers speak
 * plain SQL through one async interface, so development runs on embedded
 * PGlite (zero setup) and deployment runs on real PostgreSQL.
 */
export interface Db {
  readonly driver: 'pglite' | 'postgres';
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export interface CreateDbOptions {
  /** PostgreSQL connection string. When present, PGlite is not used. */
  url?: string;
  /** PGlite data directory. Omit for an in-memory database (tests). */
  dir?: string;
}

export async function createDb({ url, dir }: CreateDbOptions = {}): Promise<Db> {
  if (url) {
    const sql = postgres(url, { max: 10, onnotice: () => {} });
    return {
      driver: 'postgres',
      async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
        const rows = await sql.unsafe(text, params as never[]);
        return rows as unknown as T[];
      },
      async close() {
        await sql.end({ timeout: 5 });
      },
    };
  }

  if (dir) {
    // PGlite's filesystem backend does not create parent directories itself.
    await mkdir(dir, { recursive: true });
  }
  const pglite = dir ? new PGlite(dir) : new PGlite();
  await pglite.waitReady;

  return {
    driver: 'pglite',
    async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
      const result = await pglite.query(text, params);
      return result.rows as T[];
    },
    async close() {
      await pglite.close();
    },
  };
}
