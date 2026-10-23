# Scale notes

Working numbers behind the architecture decisions. Update this file when a
decision changes.

## The delivery budget

| Input | Value |
| --- | --- |
| Concurrent streams | 1,000,000,000 |
| Average bitrate | 5 Mbps |
| Aggregate egress | **4.8 Pb/s** (600 TB/s) |
| Per hour | ~2.16 EB |
| Per day | ~51.8 EB |
| Origin budget (0.5% of requests) | must remain cache-resident at the edge |

Reference points: Netflix's global peak concurrency is in the low tens of
millions; the largest live cricket streams have crossed 50–60 million. One
billion concurrent is roughly **20× the largest audience ever streamed** and
requires the bit-rate efficiency, caching, and multicast techniques listed in the
roadmap — not simply more servers.

## What this forces

1. **More than 99% cache hit ratio at the edge.** Origin traffic is a rounding
   error by design.
2. **Authorization at the edge.** See [ADR 0001](0001-playback-token-seam.md).
3. **Bitrate discipline.** Every 1 Mbps removed from the average saves ~1 Pb/s
   at this concurrency. AV1 and scene-aware encoding are delivery features, not
   codec vanity.
4. **Graceful degradation is a product requirement.** Under regional failure,
   drop rendition quality before dropping the stream.
5. **Per-stream state must be disposable.** Sessions expire by TTL; no cleanup
   job is on the critical path of a new play.

## Phase 1 mapping

| Scale concern | Phase 1 implementation | Phase 2 replacement |
| --- | --- | --- |
| Playback authorization | Signed JWT, 120 s TTL | Edge HMAC validation (shipped) |
| Concurrency state | Postgres table, TTL rows | Redis + regional counters |
| Delivery | Single public CDN | Two-PoP steering + failover (shipped locally) |
| Metadata reads | Postgres | Read replicas + edge cache |
| Watch progress | Postgres upsert | Kafka → time-series store |

## What Phase 2 actually implements

| Piece | Local number | Production target |
| --- | --- | --- |
| Playback token | 120 s HMAC JWT, verified at the edge | Same contract, key distribution service |
| Edge session cookie | 180 s, `HttpOnly`, scoped to manifest directory | Same, distributed secret, `SameSite=None` if cross-site |
| PoPs | 2 processes (`edge-iad`, `edge-fra`), per-process LRU | Hundreds of PoPs, shared cache tier |
| Cache | 96 MB per PoP, 60 s manifest TTL, 1 h segment TTL | Multi-TB per PoP, origin shield |
| Steering | Deterministic from session id, client failover | Geo/DNS + real-time health and load |
| QoE | Batched events, 8 s dashboard refresh | Kafka → time-series store, alerting |
| Origin traffic | One miss per object per PoP | < 1% of requests |

The important honesty constraint: **two localhost processes are not a CDN.** What
is real is the contract — short-lived tokens, local HMAC verification, URI
rewriting, byte/object caching, request coalescing, source allowlisting, and QoE
instrumentation. Those are the seams a production edge plugs into.

## Why the edge cookie is not a URL token

A manifest can contain hundreds of URIs. Putting a bearer token in each one
leaks it into logs and history, makes every URL unique per session, and destroys
the shared-cache hit ratio. The exchange in
[ADR 0002](0002-edge-session-cookie.md) keeps media URLs cacheable and moves
authorization to an `HttpOnly` cookie that is checked locally at the edge.
