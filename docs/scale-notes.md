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
| Playback authorization | Signed JWT, 120 s TTL | Edge HMAC validation |
| Concurrency state | Postgres table, TTL rows | Redis + regional counters |
| Delivery | Single public CDN | Multi-CDN steering + origin shield |
| Metadata reads | Postgres | Read replicas + edge cache |
| Watch progress | Postgres upsert | Kafka → time-series store |
