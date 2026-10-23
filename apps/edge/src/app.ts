import cors from '@fastify/cors';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import {
  EDGE_COOKIE,
  clearCookieHeader,
  readCookie,
  setCookieHeader,
  signEdgeSession,
  verifyEdgeSession,
  verifyPlaybackToken,
  type EdgeSession,
} from './auth.js';
import { ResourceCache } from './cache.js';
import { config } from './config.js';
import { rewriteManifest, type ResourceRoute } from './manifest.js';

const PLAYLIST_TYPE = 'application/vnd.apple.mpegurl';

export interface EdgeOptions {
  pop?: string;
  playbackSecret?: string;
  sessionSecret?: string;
  webOrigin?: string;
  sessionTtlSecs?: number;
  cacheBytes?: number;
  upstreamTimeoutMs?: number;
  cookieSecure?: boolean;
  fetchImpl?: typeof fetch;
}

interface ResourceResult {
  body: Buffer;
  contentType: string;
  cacheStatus: 'HIT' | 'MISS' | 'COALESCED';
}

class UpstreamStatusError extends Error {
  constructor(readonly status: number) {
    super(`upstream responded ${status}`);
    this.name = 'UpstreamStatusError';
  }
}

export async function buildEdge(options: EdgeOptions = {}): Promise<FastifyInstance> {
  const pop = options.pop ?? config.pop;
  const playbackSecret = options.playbackSecret ?? config.playbackSecret;
  const sessionSecret = options.sessionSecret ?? config.sessionSecret;
  const webOrigin = options.webOrigin ?? config.webOrigin;
  const sessionTtlSecs = options.sessionTtlSecs ?? config.sessionTtlSecs;
  const cacheBytes = options.cacheBytes ?? config.cacheBytes;
  const upstreamTimeoutMs = options.upstreamTimeoutMs ?? config.upstreamTimeoutMs;
  const cookieSecure = options.cookieSecure ?? config.cookieSecure;
  const upstreamFetch = options.fetchImpl ?? fetch;

  const cache = new ResourceCache(cacheBytes);
  const inFlight = new Map<string, Promise<{ body: Buffer; contentType: string }>>();

  const app = Fastify({ logger: false, trustProxy: true });

  await app.register(cors, {
    origin: webOrigin
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    maxAge: 86_400,
  });

  app.get('/health', async () => ({
    ok: true,
    pop,
    uptimeSecs: Math.round(process.uptime()),
    cache: cache.stats(),
  }));

  /**
   * Exchange a short-lived playback token for an edge session cookie. This is
   * the only authorization step that touches the API's token; every later
   * manifest, key, and segment request is validated locally with HMAC.
   */
  app.post<{ Body: { token?: unknown } }>('/v1/session', async (request, reply) => {
    const token = typeof request.body?.token === 'string' ? request.body.token : '';
    const claims = verifyPlaybackToken(token, playbackSecret);
    if (!claims) {
      return reply.code(401).send({
        error: {
          code: 'invalid_playback_token',
          message: 'Playback token is invalid or expired.',
        },
      });
    }

    const value = signEdgeSession({ ...claims, pop }, sessionSecret, sessionTtlSecs);
    reply.header('set-cookie', setCookieHeader(EDGE_COOKIE, value, sessionTtlSecs, cookieSecure));
    reply.header('cache-control', 'no-store');

    return {
      pop,
      ttlSecs: sessionTtlSecs,
      expiresAt: new Date(Date.now() + sessionTtlSecs * 1000).toISOString(),
    };
  });

  app.delete('/v1/session', async (_request, reply) => {
    reply.header('set-cookie', clearCookieHeader(EDGE_COOKIE, cookieSecure));
    return reply.code(204).send();
  });

  for (const route of ['manifest', 'segment', 'key'] as const) {
    app.get<{ Querystring: { u?: string } }>(`/v1/${route}`, async (request, reply) => {
      const session = currentSession(request, sessionSecret);
      if (!session) {
        return sendEdgeError(reply, 401, 'edge_unauthorized', 'Open a playback session first.');
      }

      const candidate = typeof request.query.u === 'string' ? request.query.u : '';
      const target = authorize(session.src, candidate);
      if (!target) {
        return sendEdgeError(
          reply,
          403,
          'source_not_allowed',
          'That media URL is outside this playback session.',
        );
      }

      let resource: ResourceResult;
      try {
        resource = await load(target, route);
      } catch (error) {
        if (error instanceof UpstreamStatusError) {
          return sendEdgeError(
            reply,
            502,
            'upstream_error',
            `The origin responded with ${error.status}.`,
          );
        }
        if (error instanceof Error && error.name === 'TimeoutError') {
          return sendEdgeError(reply, 504, 'upstream_timeout', 'The origin timed out.');
        }
        return sendEdgeError(reply, 502, 'upstream_error', 'The origin could not be reached.');
      }

      reply.header('x-blitzman-pop', pop);
      reply.header('x-cache', resource.cacheStatus);
      reply.header('x-session-id', session.sid);
      reply.header(
        'cache-control',
        route === 'manifest' ? 'private, max-age=5' : 'private, max-age=3600, immutable',
      );
      reply.header(
        'content-type',
        route === 'manifest' ? PLAYLIST_TYPE : resource.contentType,
      );

      if (route === 'manifest') {
        return reply.send(rewriteManifest(resource.body.toString('utf8'), target));
      }
      return reply.send(resource.body);
    });
  }

  async function load(target: string, route: ResourceRoute): Promise<ResourceResult> {
    const cached = cache.get(target);
    if (cached) return { ...cached, cacheStatus: 'HIT' };

    const pending = inFlight.get(target);
    if (pending) {
      const shared = await pending;
      return { ...shared, cacheStatus: 'COALESCED' };
    }

    const task = (async () => {
      const response = await upstreamFetch(target, {
        headers: {
          'user-agent': 'BlitzmanEdge/0.1 (+https://github.com/0xMudit/Blitzman)',
          accept: '*/*',
        },
        signal: AbortSignal.timeout(upstreamTimeoutMs),
      });
      if (!response.ok) throw new UpstreamStatusError(response.status);

      const body = Buffer.from(await response.arrayBuffer());
      const contentType = resolveContentType(target, response.headers.get('content-type'));
      const ttlMs = route === 'manifest' ? 60_000 : 3_600_000;
      cache.set(target, body, contentType, ttlMs);
      return { body, contentType };
    })();

    inFlight.set(target, task);
    try {
      return { ...(await task), cacheStatus: 'MISS' };
    } finally {
      inFlight.delete(target);
    }
  }

  return app;
}

function currentSession(
  request: FastifyRequest,
  secret: string,
): EdgeSession | null {
  const raw = readCookie(request.headers.cookie, EDGE_COOKIE);
  return raw ? verifyEdgeSession(raw, secret) : null;
}

/**
 * A session is bound to the manifest URL it was minted for. Every requested
 * URL must share the origin and directory of that manifest, which stops a
 * valid cookie from being turned into an open proxy.
 */
export function authorize(src: string, candidate: string): string | null {
  if (!candidate) return null;

  let srcUrl: URL;
  let target: URL;
  try {
    srcUrl = new URL(src);
    target = new URL(candidate);
  } catch {
    return null;
  }

  if (target.protocol !== 'https:') return null;
  if (target.username || target.password) return null;
  if (target.origin !== srcUrl.origin) return null;

  const srcPath = safePath(srcUrl);
  const targetPath = safePath(target);
  if (!srcPath || !targetPath) return null;

  // Reject traversal even when encoded; URL normalizes plain `..`, not `%2e%2e`.
  if (targetPath.split('/').some((segment) => segment === '..')) return null;

  const directory = srcPath.slice(0, srcPath.lastIndexOf('/') + 1);
  if (!directory || !targetPath.startsWith(directory)) return null;

  return target.toString();
}

function safePath(url: URL): string | null {
  try {
    return decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
}

function resolveContentType(target: string, upstream: string | null): string {
  // Some origins serve .ts as application/octet-stream. Trust the extension
  // for known media types so browsers and downstream caches see the truth.
  const guessed = guessContentType(target);
  if (guessed !== 'application/octet-stream') return guessed;
  if (upstream && upstream !== 'application/octet-stream') return upstream;
  return 'application/octet-stream';
}

function guessContentType(url: string): string {
  const path = new URL(url).pathname.toLowerCase();
  if (path.endsWith('.m3u8')) return PLAYLIST_TYPE;
  if (path.endsWith('.ts')) return 'video/mp2t';
  if (path.endsWith('.m4s') || path.endsWith('.mp4')) return 'video/mp4';
  if (path.endsWith('.m4a')) return 'audio/mp4';
  if (path.endsWith('.aac')) return 'audio/aac';
  if (path.endsWith('.vtt') || path.endsWith('.webvtt')) return 'text/vtt';
  return 'application/octet-stream';
}

function sendEdgeError(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
): FastifyReply {
  return reply.code(status).send({ error: { code, message } });
}
