# 0001 — Playback authorization is a signed token, not a session lookup

**Status:** accepted · Phase 1

## Context

A streaming service has two entirely different authorization problems:

1. **Who is this user?** Answered once per session. A database lookup (or an
   edge-cached session) is acceptable.
2. **May this player fetch this bit of video, right now?** Answered thousands of
   times per second per viewer — once per manifest, per segment, per key request.

At one billion concurrent viewers, the second question arrives as tens of
millions of requests per second. A database round-trip per request is not a cost
optimization problem; it is physically impossible.

## Decision

Issue a **short-lived signed token** at the moment playback starts:

- JWT signed with HMAC-SHA256, containing `sid` (playback session), `uid`
  (account), and `tid` (title).
- Lifetime is 120 seconds by default (`PLAYBACK_TTL_SECS`).
- The token is minted by the API only after the concurrency policy check passes.
- The catalog API never exposes `manifest_url`; it is released only alongside a
  token.

Phase 2 will move token verification to the CDN edge. The important property is
that **the edge can validate the token without calling the API** — the secret is
shared with the edge function, and the check is a local HMAC computation.

## Consequences

- Playback authorization scales horizontally with the edge, not with the
  database.
- Revocation is bounded by the TTL: ending a stream is immediate locally, and
  global within two minutes. Phase 3 narrows this with per-session keys.
- Tokens are bearer credentials. They must be short-lived, bound to a device
  fingerprint, and never logged.
- The concurrency check remains a database write at session creation. That is
  one write per play, not one per segment — three to four orders of magnitude
  fewer requests, and the correct place to pay for consistency.
