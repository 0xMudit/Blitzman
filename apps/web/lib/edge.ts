export interface EdgeSession {
  pop: string;
  ttlSecs: number;
  expiresAt: string;
}

export interface EdgeHealth {
  ok: boolean;
  pop: string;
  uptimeSecs: number;
  cache: {
    entries: number;
    bytes: number;
    maxBytes: number;
    hits: number;
    misses: number;
    hitRatio: number;
  };
}

/**
 * Exchange a playback token for an edge session cookie. The cookie is
 * HttpOnly and sent automatically to every manifest and segment request from
 * the player, so no token ever appears in a media URL.
 */
export async function openEdgeSession(edgeUrl: string, token: string): Promise<EdgeSession> {
  const response = await fetch(`${edgeUrl}/v1/session`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) {
    throw new Error(`edge session rejected (${response.status})`);
  }
  return (await response.json()) as EdgeSession;
}

export async function closeEdgeSession(edgeUrl: string): Promise<void> {
  try {
    await fetch(`${edgeUrl}/v1/session`, { method: 'DELETE', credentials: 'include' });
  } catch {
    // Best effort; the cookie expires on its own.
  }
}

export async function edgeHealth(edgeUrl: string): Promise<EdgeHealth | null> {
  try {
    const response = await fetch(`${edgeUrl}/health`, { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as EdgeHealth;
  } catch {
    return null;
  }
}

export function edgeManifestUrl(edgeUrl: string, upstreamManifest: string): string {
  return `${edgeUrl}/v1/manifest?u=${encodeURIComponent(upstreamManifest)}`;
}
