import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.js';
import { sendError } from './errors.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface PlaybackTokenPayload {
  sid: string;
  uid: string;
  tid: string;
}

export const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, 10);

export const verifyPassword = (password: string, hash: string): Promise<boolean> =>
  bcrypt.compare(password, hash);

export function signUserToken(user: AuthUser): string {
  return jwt.sign({ email: user.email, name: user.name }, config.jwtSecret, {
    subject: user.id,
    expiresIn: '7d',
  });
}

/**
 * Verifies the bearer token and returns the caller. On failure it writes a
 * consistent 401 response and returns null, so handlers can `if (!user) return`.
 */
export async function requireUser(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthUser | null> {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    sendError(reply, 401, 'unauthorized', 'Sign in to continue.');
    return null;
  }

  try {
    const payload = jwt.verify(header.slice('Bearer '.length), config.jwtSecret) as jwt.JwtPayload;
    if (typeof payload.sub !== 'string') throw new Error('missing subject');
    return {
      id: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : '',
      name: typeof payload.name === 'string' ? payload.name : '',
    };
  } catch {
    sendError(reply, 401, 'invalid_token', 'Your session expired. Sign in again.');
    return null;
  }
}

/**
 * Playback tokens are deliberately short-lived and carry the session, user,
 * and title. Phase 2 validates these at the CDN edge; the API only mints them.
 */
export function signPlaybackToken(payload: PlaybackTokenPayload): string {
  return jwt.sign(payload, config.playbackSecret, { expiresIn: config.playbackTtlSecs });
}

export function verifyPlaybackToken(token: string): PlaybackTokenPayload | null {
  try {
    const payload = jwt.verify(token, config.playbackSecret) as jwt.JwtPayload;
    if (
      typeof payload.sid !== 'string' ||
      typeof payload.uid !== 'string' ||
      typeof payload.tid !== 'string'
    ) {
      return null;
    }
    return { sid: payload.sid, uid: payload.uid, tid: payload.tid };
  } catch {
    return null;
  }
}
