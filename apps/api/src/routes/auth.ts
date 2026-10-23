import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  hashPassword,
  requireUser,
  signUserToken,
  verifyPassword,
} from '../auth.js';
import type { Db } from '../db.js';
import { sendError } from '../errors.js';
import { cleanString, isValidEmail } from '../validation.js';

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
}

interface RegisterBody {
  email?: unknown;
  name?: unknown;
  password?: unknown;
}

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

export async function registerAuthRoutes(app: FastifyInstance, db: Db): Promise<void> {
  app.post<{ Body: RegisterBody }>(
    '/auth/register',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = request.body ?? {};
      const email = cleanString(body.email, 254).toLowerCase();
      const name = cleanString(body.name, 60);
      const password = typeof body.password === 'string' ? body.password : '';

      if (!isValidEmail(email)) {
        return sendError(reply, 400, 'invalid_email', 'Enter a valid email address.');
      }
      if (name.length < 1) {
        return sendError(reply, 400, 'invalid_name', 'Tell us what to call you.');
      }
      if (password.length < 8 || password.length > 200) {
        return sendError(reply, 400, 'invalid_password', 'Passwords need at least 8 characters.');
      }

      const existing = await db.query<{ id: string }>('select id from users where email = $1', [
        email,
      ]);
      if (existing.length > 0) {
        return sendError(reply, 409, 'email_taken', 'An account with that email already exists.');
      }

      const user = { id: randomUUID(), email, name };
      await db.query(
        'insert into users (id, email, name, password_hash) values ($1, $2, $3, $4)',
        [user.id, user.email, user.name, await hashPassword(password)],
      );

      return reply.code(201).send({ token: signUserToken(user), user });
    },
  );

  app.post<{ Body: LoginBody }>(
    '/auth/login',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = request.body ?? {};
      const email = cleanString(body.email, 254).toLowerCase();
      const password = typeof body.password === 'string' ? body.password : '';

      if (!isValidEmail(email) || password.length === 0) {
        return sendError(reply, 400, 'invalid_credentials', 'Enter your email and password.');
      }

      const [row] = await db.query<UserRow>(
        'select id, email, name, password_hash from users where email = $1',
        [email],
      );

      // Compare even when the user is missing to keep the timing flat.
      const valid = await verifyPassword(
        password,
        row?.password_hash ?? '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinu',
      );
      if (!row || !valid) {
        return sendError(reply, 401, 'invalid_credentials', 'Email or password is incorrect.');
      }

      const user = { id: row.id, email: row.email, name: row.name };
      return { token: signUserToken(user), user };
    },
  );

  app.get('/auth/me', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const [row] = await db.query<{ id: string; email: string; name: string }>(
      'select id, email, name from users where id = $1',
      [user.id],
    );
    if (!row) return sendError(reply, 401, 'invalid_token', 'Your session expired. Sign in again.');

    const sessions = await db.query<{ count: number }>(
      'select count(*)::int as count from playback_sessions where user_id = $1 and expires_at > now()',
      [user.id],
    );

    return { user: row, activeStreams: Number(sessions[0]?.count ?? 0) };
  });
}
