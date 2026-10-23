# 0002 — The edge exchanges a playback token for a scoped session cookie

**Status:** accepted · Phase 2

## Context

[ADR 0001](0001-playback-token-seam.md) establishes that every media request must
be authorized without touching the API. A short-lived playback JWT is the right
thing to mint, but it cannot be the thing every segment request carries:

- hls.js fetches manifests, keys, init segments, and media segments from URLs
  supplied by the playlist. Putting a bearer token in every rewritten URL leaks
  it into logs, browser history, and `Referer` headers.
- A token with a 120-second lifetime would have to be threaded through the
  player's request pipeline for every segment, in every worker.
- The CDN would need to validate a unique URL per session, which destroys the
  shared-cache hit ratio that makes 1B streams affordable.

## Decision

Media authorization is a **two-step exchange**, both steps at the edge:

1. The player calls `POST /v1/session` on a PoP with the playback JWT.
2. The PoP verifies the JWT locally (shared HMAC secret), then issues a
   short-lived, `HttpOnly`, `SameSite=Lax` cookie scoped to the PoP host:
   `blitz_edge`, signed with `EDGE_SESSION_SECRET`, 180 seconds by default.
3. Every manifest, key, and segment request is authorized by that cookie. The
   cookie carries `sid`, `uid`, `tid`, `src` (the manifest URL), and `pop`; no
   database lookup occurs.

The session is **bound to the manifest URL**. A request is allowed only when it
is `https`, shares the manifest's origin, and stays inside the manifest's
directory prefix. A valid cookie therefore cannot be turned into an open proxy.

The player rotates the token and cookie before expiry through
`POST /playback/:sessionId/token`. Rotation does not touch the media pipeline or
the concurrency slot.

## Consequences

- Media URLs are cacheable and contain no secrets. Multiple viewers of the same
  title share the same cache key at a PoP.
- Authorization is one local HMAC check per request — the cost scale doesn't
  care about.
- The cookie is shared by all PoPs on the same site because they share
  `EDGE_SESSION_SECRET`. In production the secret is distributed as an edge
  secret, not baked into a deploy.
- `SameSite=Lax` works when web and edge are on the same registrable site
  (`www.example.com` and `media.example.com`). An edge on a different site needs
  `SameSite=None; Secure` and should be treated as a deliberate trust decision.
- Revocation is bounded by the cookie TTL (180 s), just as token revocation is
  bounded by the playback TTL. Phase 3 narrows this with per-session keys.
- The 180-second cookie is longer than the 120-second playback token so a
  rotation can overlap safely; the player refreshes at `ttl - 40` seconds.

## Alternatives considered

- **Token in every media URL.** Simple, but leaks credentials into URLs and
  makes the cache key per-session.
- **Origin-issued session cookie.** Would work, but every segment would depend on
  a centralized cookie service; that is the database-per-segment problem in a
  different costume.
- **Signed URLs with a shared policy (CloudFront-style).** Good for public CDNs,
  but the allowlist problem moves to the signer, and rotation still needs an API
  round-trip. The edge cookie keeps the control plane out of the hot path.
