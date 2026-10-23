import assert from 'node:assert/strict';
import test from 'node:test';
import type { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { buildEdge } from './app.js';

const PLAYBACK_SECRET = 'test-playback-secret';
const SESSION_SECRET = 'test-edge-secret';
const SRC = 'https://media.example.com/movie/master.m3u8';

const MANIFEST = [
  '#EXTM3U',
  '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"',
  '#EXT-X-MAP:URI="init.mp4"',
  '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=1280x720',
  'v1/index.m3u8',
  '#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=100000,URI="v1/iframe.m3u8"',
  '',
].join('\n');

function fakeUpstream() {
  const calls = new Map<string, number>();
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    calls.set(url, (calls.get(url) ?? 0) + 1);

    if (url === SRC) {
      return new Response(MANIFEST, {
        status: 200,
        headers: { 'content-type': 'application/vnd.apple.mpegurl' },
      });
    }
    if (url.endsWith('/v1/index.m3u8')) {
      return new Response('#EXTM3U\n#EXTINF:6,\nseg1.ts\n', {
        status: 200,
        headers: { 'content-type': 'application/vnd.apple.mpegurl' },
      });
    }
    if (url.endsWith('/v1/seg1.ts')) {
      return new Response(new Uint8Array([0x47, 0x40, 0x11, 0x10]), {
        status: 200,
        headers: { 'content-type': 'video/mp2t' },
      });
    }
    return new Response('missing', { status: 404 });
  };
  return { calls, fetchImpl };
}

async function harness(): Promise<{
  app: FastifyInstance;
  calls: Map<string, number>;
  close: () => Promise<void>;
}> {
  const upstream = fakeUpstream();
  const app = await buildEdge({
    pop: 'edge-test',
    playbackSecret: PLAYBACK_SECRET,
    sessionSecret: SESSION_SECRET,
    sessionTtlSecs: 120,
    cacheBytes: 1_000_000,
    fetchImpl: upstream.fetchImpl,
  });
  return {
    app,
    calls: upstream.calls,
    close: () => app.close(),
  };
}

function playbackToken(overrides: Record<string, string> = {}, expiresInSecs = 120): string {
  return jwt.sign(
    { sid: 'session-1', uid: 'user-1', tid: 'title-1', src: SRC, ...overrides },
    PLAYBACK_SECRET,
    { expiresIn: expiresInSecs },
  );
}

async function openSession(app: FastifyInstance): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/session',
    payload: { token: playbackToken() },
  });
  assert.equal(response.statusCode, 200, response.body);
  const setCookie = String(response.headers['set-cookie'] ?? '');
  assert.match(setCookie, /blitz_edge=/);
  assert.match(setCookie, /HttpOnly/);
  return setCookie.split(';')[0];
}

const proxyUrl = (route: string, upstream: string) =>
  `/v1/${route}?u=${encodeURIComponent(upstream)}`;

test('issues an edge cookie for a valid playback token and rejects bad tokens', async () => {
  const { app, close } = await harness();
  try {
    const valid = await app.inject({
      method: 'POST',
      url: '/v1/session',
      payload: { token: playbackToken() },
    });
    assert.equal(valid.statusCode, 200);
    assert.equal(valid.json().pop, 'edge-test');
    assert.equal(valid.json().ttlSecs, 120);

    const invalid = await app.inject({
      method: 'POST',
      url: '/v1/session',
      payload: { token: 'not-a-jwt' },
    });
    assert.equal(invalid.statusCode, 401);
    assert.equal(invalid.json().error.code, 'invalid_playback_token');

    const expired = await app.inject({
      method: 'POST',
      url: '/v1/session',
      payload: { token: playbackToken({}, -5) },
    });
    assert.equal(expired.statusCode, 401);
  } finally {
    await close();
  }
});

test('rewrites manifest URIs and serves repeat requests from cache', async () => {
  const { app, calls, close } = await harness();
  try {
    const cookie = await openSession(app);

    const first = await app.inject({
      method: 'GET',
      url: proxyUrl('manifest', SRC),
      headers: { cookie },
    });
    assert.equal(first.statusCode, 200);
    assert.equal(first.headers['x-cache'], 'MISS');
    assert.equal(first.headers['x-blitzman-pop'], 'edge-test');
    assert.match(String(first.headers['content-type']), /mpegurl/);

    // Keys, init segments, and renditions all point back at the PoP.
    assert.match(first.body, /URI="\/v1\/key\?u=/);
    assert.match(first.body, /URI="\/v1\/segment\?u=/);
    assert.match(first.body, /#EXT-X-I-FRAME-STREAM-INF:[^\n]*URI="\/v1\/manifest\?u=/);
    assert.match(first.body, /^\/v1\/manifest\?u=/m);
    assert.doesNotMatch(first.body, /^v1\/index\.m3u8$/m);

    const second = await app.inject({
      method: 'GET',
      url: proxyUrl('manifest', SRC),
      headers: { cookie },
    });
    assert.equal(second.statusCode, 200);
    assert.equal(second.headers['x-cache'], 'HIT');
    assert.equal(calls.get(SRC), 1);
  } finally {
    await close();
  }
});

test('proxies and caches segments with the right content type', async () => {
  const { app, calls, close } = await harness();
  try {
    const cookie = await openSession(app);
    const segment = 'https://media.example.com/movie/v1/seg1.ts';

    const first = await app.inject({
      method: 'GET',
      url: proxyUrl('segment', segment),
      headers: { cookie },
    });
    assert.equal(first.statusCode, 200);
    assert.equal(first.headers['x-cache'], 'MISS');
    assert.equal(first.headers['content-type'], 'video/mp2t');
    assert.equal(first.rawPayload.length, 4);

    const second = await app.inject({
      method: 'GET',
      url: proxyUrl('segment', segment),
      headers: { cookie },
    });
    assert.equal(second.statusCode, 200);
    assert.equal(second.headers['x-cache'], 'HIT');
    assert.equal(calls.get(segment), 1);
  } finally {
    await close();
  }
});

test('rejects missing sessions, tampered cookies, and out-of-session URLs', async () => {
  const { app, close } = await harness();
  try {
    const anonymous = await app.inject({ method: 'GET', url: proxyUrl('manifest', SRC) });
    assert.equal(anonymous.statusCode, 401);
    assert.equal(anonymous.json().error.code, 'edge_unauthorized');

    const cookie = await openSession(app);
    const tampered = await app.inject({
      method: 'GET',
      url: proxyUrl('manifest', SRC),
      headers: { cookie: `${cookie}tampered` },
    });
    assert.equal(tampered.statusCode, 401);

    const foreignOrigin = await app.inject({
      method: 'GET',
      url: proxyUrl('segment', 'https://evil.example.com/movie/seg.ts'),
      headers: { cookie },
    });
    assert.equal(foreignOrigin.statusCode, 403);
    assert.equal(foreignOrigin.json().error.code, 'source_not_allowed');

    const foreignDirectory = await app.inject({
      method: 'GET',
      url: proxyUrl('segment', 'https://media.example.com/other/seg.ts'),
      headers: { cookie },
    });
    assert.equal(foreignDirectory.statusCode, 403);

    const traversal = await app.inject({
      method: 'GET',
      url: proxyUrl('segment', 'https://media.example.com/movie/%2e%2e/other/seg.ts'),
      headers: { cookie },
    });
    assert.equal(traversal.statusCode, 403);

    const insecure = await app.inject({
      method: 'GET',
      url: proxyUrl('segment', 'http://media.example.com/movie/seg.ts'),
      headers: { cookie },
    });
    assert.equal(insecure.statusCode, 403);
  } finally {
    await close();
  }
});

test('surfaces upstream failures as gateway errors', async () => {
  const { app, close } = await harness();
  try {
    const cookie = await openSession(app);
    const missing = await app.inject({
      method: 'GET',
      url: proxyUrl('segment', 'https://media.example.com/movie/v1/missing.ts'),
      headers: { cookie },
    });
    assert.equal(missing.statusCode, 502);
    assert.equal(missing.json().error.code, 'upstream_error');
  } finally {
    await close();
  }
});

test('clearing the edge session removes authorization', async () => {
  const { app, close } = await harness();
  try {
    const cookie = await openSession(app);
    const cleared = await app.inject({
      method: 'DELETE',
      url: '/v1/session',
      headers: { cookie },
    });
    assert.equal(cleared.statusCode, 204);
    assert.match(String(cleared.headers['set-cookie']), /Max-Age=0/);
  } finally {
    await close();
  }
});
