export type ResourceRoute = 'manifest' | 'segment' | 'key';

/**
 * Rewrite every URI in a playlist so playback traffic goes back through this
 * PoP instead of leaking to the upstream origin. Handles relative and absolute
 * URIs, alternate renditions, init segments, encryption keys, and LL-HLS parts.
 */
export function rewriteManifest(text: string, manifestUrl: string): string {
  const base = new URL(manifestUrl);

  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith('#')) {
        const colon = trimmed.indexOf(':');
        const tag = (colon === -1 ? trimmed : trimmed.slice(0, colon + 1)).toUpperCase();
        return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => {
          if (uri.startsWith('data:')) return `URI="${uri}"`;
          const absolute = new URL(uri, base).toString();
          return `URI="${proxyPath(routeForTag(tag), absolute)}"`;
        });
      }

      const absolute = new URL(trimmed, base).toString();
      const route: ResourceRoute = isPlaylistUrl(absolute) ? 'manifest' : 'segment';
      return proxyPath(route, absolute);
    })
    .join('\n');
}

export function proxyPath(route: ResourceRoute, upstream: string): string {
  return `/v1/${route}?u=${encodeURIComponent(upstream)}`;
}

function routeForTag(tag: string): ResourceRoute {
  if (tag === '#EXT-X-KEY:' || tag === '#EXT-X-SESSION-KEY:') return 'key';
  if (tag === '#EXT-X-MAP:' || tag === '#EXT-X-PART:' || tag === '#EXT-X-PRELOAD-HINT:') {
    return 'segment';
  }
  return 'manifest';
}

function isPlaylistUrl(url: string): boolean {
  return new URL(url).pathname.toLowerCase().endsWith('.m3u8');
}
