import jwt from 'jsonwebtoken';

export const EDGE_COOKIE = 'blitz_edge';

export interface PlaybackClaims {
  sid: string;
  uid: string;
  tid: string;
  src: string;
}

export interface EdgeSession extends PlaybackClaims {
  pop: string;
}

export function verifyPlaybackToken(token: string, secret: string): PlaybackClaims | null {
  try {
    const payload = jwt.verify(token, secret) as jwt.JwtPayload;
    if (
      typeof payload.sid !== 'string' ||
      typeof payload.uid !== 'string' ||
      typeof payload.tid !== 'string' ||
      typeof payload.src !== 'string'
    ) {
      return null;
    }
    return { sid: payload.sid, uid: payload.uid, tid: payload.tid, src: payload.src };
  } catch {
    return null;
  }
}

export function signEdgeSession(
  session: EdgeSession,
  secret: string,
  ttlSecs: number,
): string {
  return jwt.sign(session, secret, { expiresIn: ttlSecs });
}

export function verifyEdgeSession(token: string, secret: string): EdgeSession | null {
  try {
    const payload = jwt.verify(token, secret) as jwt.JwtPayload;
    if (
      typeof payload.sid !== 'string' ||
      typeof payload.uid !== 'string' ||
      typeof payload.tid !== 'string' ||
      typeof payload.src !== 'string' ||
      typeof payload.pop !== 'string'
    ) {
      return null;
    }
    return {
      sid: payload.sid,
      uid: payload.uid,
      tid: payload.tid,
      src: payload.src,
      pop: payload.pop,
    };
  } catch {
    return null;
  }
}

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const raw = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return null;
    }
  }
  return null;
}

export function setCookieHeader(
  name: string,
  value: string,
  maxAgeSecs: number,
  secure: boolean,
): string {
  const flags = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSecs}`,
  ];
  if (secure) flags.push('Secure');
  return flags.join('; ');
}

export function clearCookieHeader(name: string, secure: boolean): string {
  const flags = [`${name}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) flags.push('Secure');
  return flags.join('; ');
}
