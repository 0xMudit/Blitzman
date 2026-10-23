import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { createDb } from './db.js';

interface Harness {
  app: FastifyInstance;
  close: () => Promise<void>;
}

async function harness(): Promise<Harness> {
  const db = await createDb();
  const app = await buildApp({ db, seed: true });
  return {
    app,
    async close() {
      await app.close();
      await db.close();
    },
  };
}

async function register(app: FastifyInstance, email?: string): Promise<{ token: string; email: string }> {
  const address = email ?? `${randomUUID()}@example.com`;
  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email: address, name: 'Test Viewer', password: 'correct horse battery' },
  });
  assert.equal(response.statusCode, 201, response.body);
  return { token: response.json().token, email: address };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

test('health reports the database driver and catalog is seeded', async () => {
  const { app, close } = await harness();
  try {
    const health = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(health.statusCode, 200);
    assert.equal(health.json().driver, 'pglite');

    const catalog = await app.inject({ method: 'GET', url: '/catalog' });
    assert.equal(catalog.statusCode, 200);
    const body = catalog.json();
    assert.ok(body.titles.length >= 6);
    assert.ok(body.featured);
    // Manifests are only released with a playback token.
    assert.equal(body.titles[0].manifestUrl, undefined);
  } finally {
    await close();
  }
});

test('registration, duplicate rejection, login, and profile', async () => {
  const { app, close } = await harness();
  try {
    const email = `${randomUUID()}@example.com`;
    const { token } = await register(app, email);

    const duplicate = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, name: 'Again', password: 'another password' },
    });
    assert.equal(duplicate.statusCode, 409);
    assert.equal(duplicate.json().error.code, 'email_taken');

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: 'correct horse battery' },
    });
    assert.equal(login.statusCode, 200);
    assert.equal(login.json().user.email, email);

    const badLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: 'wrong password' },
    });
    assert.equal(badLogin.statusCode, 401);

    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: auth(token) });
    assert.equal(me.statusCode, 200);
    assert.equal(me.json().user.email, email);
    assert.equal(me.json().activeStreams, 0);

    const anonymous = await app.inject({ method: 'GET', url: '/auth/me' });
    assert.equal(anonymous.statusCode, 401);
  } finally {
    await close();
  }
});

test('playback sessions are signed and capped by the concurrency limit', async () => {
  const { app, close } = await harness();
  try {
    const { token } = await register(app);
    const catalog = await app.inject({ method: 'GET', url: '/catalog' });
    const slug = catalog.json().titles[0].slug;

    const first = await app.inject({
      method: 'POST',
      url: `/catalog/${slug}/playback`,
      headers: auth(token),
      payload: { device: 'test-runner' },
    });
    assert.equal(first.statusCode, 201);
    const session = first.json();
    assert.ok(session.token.split('.').length === 3, 'expected a JWT');
    assert.ok(session.manifestUrl.startsWith('https://'));
    assert.ok(session.expiresAt);

    const second = await app.inject({
      method: 'POST',
      url: `/catalog/${slug}/playback`,
      headers: auth(token),
    });
    assert.equal(second.statusCode, 201);

    const third = await app.inject({
      method: 'POST',
      url: `/catalog/${slug}/playback`,
      headers: auth(token),
    });
    assert.equal(third.statusCode, 409);
    assert.equal(third.json().error.code, 'concurrency_limit');
    assert.equal(third.json().error.details.maxConcurrentStreams, 2);

    const ended = await app.inject({
      method: 'DELETE',
      url: `/playback/${session.sessionId}`,
      headers: auth(token),
    });
    assert.equal(ended.statusCode, 204);

    const afterRelease = await app.inject({
      method: 'POST',
      url: `/catalog/${slug}/playback`,
      headers: auth(token),
    });
    assert.equal(afterRelease.statusCode, 201);

    const anonymous = await app.inject({
      method: 'POST',
      url: `/catalog/${slug}/playback`,
    });
    assert.equal(anonymous.statusCode, 401);
  } finally {
    await close();
  }
});

test('watch progress upserts, appears in continue-watching, and completes', async () => {
  const { app, close } = await harness();
  try {
    const { token } = await register(app);
    const catalog = await app.inject({ method: 'GET', url: '/catalog' });
    const slug = catalog.json().titles[0].slug;

    const saved = await app.inject({
      method: 'PUT',
      url: `/me/progress/${slug}`,
      headers: auth(token),
      payload: { positionSecs: 120, durationSecs: 600 },
    });
    assert.equal(saved.statusCode, 200);
    assert.equal(saved.json().completed, false);

    const continued = await app.inject({
      method: 'GET',
      url: '/me/continue',
      headers: auth(token),
    });
    assert.equal(continued.statusCode, 200);
    assert.equal(continued.json().items.length, 1);
    assert.equal(continued.json().items[0].title.slug, slug);
    assert.equal(continued.json().items[0].positionSecs, 120);
    assert.ok(continued.json().items[0].progress > 0);

    const updated = await app.inject({
      method: 'PUT',
      url: `/me/progress/${slug}`,
      headers: auth(token),
      payload: { positionSecs: 600, durationSecs: 600 },
    });
    assert.equal(updated.json().completed, true);

    const afterCompletion = await app.inject({
      method: 'GET',
      url: '/me/continue',
      headers: auth(token),
    });
    assert.equal(afterCompletion.json().items.length, 0);

    const invalid = await app.inject({
      method: 'PUT',
      url: `/me/progress/${slug}`,
      headers: auth(token),
      payload: { positionSecs: 'soon', durationSecs: 600 },
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.json().error.code, 'invalid_progress');
  } finally {
    await close();
  }
});
