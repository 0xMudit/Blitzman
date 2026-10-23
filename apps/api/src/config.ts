import { config as loadEnv } from 'dotenv';

loadEnv({ quiet: true });

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  port: positiveNumber(process.env.PORT, 4000),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-jwt-secret-change-me',
  playbackSecret: process.env.PLAYBACK_SECRET ?? 'dev-playback-secret-change-me',
  databaseUrl: process.env.DATABASE_URL?.trim() || undefined,
  pgliteDir: process.env.PGLITE_DIR ?? '.data/pglite',
  maxConcurrentStreams: positiveNumber(process.env.MAX_CONCURRENT_STREAMS, 2),
  playbackTtlSecs: positiveNumber(process.env.PLAYBACK_TTL_SECS, 120),
  seedOnEmpty: process.env.SEED_ON_EMPTY !== 'false',
  isProduction: process.env.NODE_ENV === 'production',
} as const;

export function assertSecrets(): void {
  if (!config.isProduction) return;
  for (const [name, value] of [
    ['JWT_SECRET', config.jwtSecret],
    ['PLAYBACK_SECRET', config.playbackSecret],
  ] as const) {
    if (value.startsWith('dev-')) {
      throw new Error(`${name} must be set to a strong random value in production.`);
    }
  }
}
