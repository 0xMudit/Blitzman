import { config as loadEnv } from 'dotenv';

loadEnv({ quiet: true });

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  port: positiveNumber(process.env.PORT, 4100),
  pop: process.env.POP_NAME ?? 'edge-local',
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  /** Shared with the API. The edge verifies playback tokens locally. */
  playbackSecret: process.env.PLAYBACK_SECRET ?? 'dev-playback-secret-change-me',
  /** Signs the cookie the edge issues after verifying a playback token. */
  sessionSecret: process.env.EDGE_SESSION_SECRET ?? 'dev-edge-secret-change-me',
  sessionTtlSecs: positiveNumber(process.env.EDGE_SESSION_TTL_SECS, 180),
  cacheBytes: positiveNumber(process.env.EDGE_CACHE_BYTES, 96 * 1024 * 1024),
  upstreamTimeoutMs: positiveNumber(process.env.EDGE_UPSTREAM_TIMEOUT_MS, 20_000),
  cookieSecure: process.env.EDGE_COOKIE_SECURE === 'true',
} as const;
