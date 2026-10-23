<div align="center">

<h1>Blitzman</h1>

**A streaming platform engineered for one billion concurrent viewers — built in public, phase by phase.**

Not another Netflix clone. The point is to design and implement the systems that survive 1,000,000,000 simultaneous streams — edge delivery, multi-CDN steering, adaptive bitrate, DRM, concurrency policing, and planetary-scale operations — starting from a working product and scaling the architecture in the open.

<p>
<img src="https://github.com/0xMudit/Blitzman/actions/workflows/ci.yml/badge.svg" alt="CI" />
<img src="https://img.shields.io/badge/Node.js-%E2%89%A522-339933.svg?logo=nodedotjs&logoColor=white" alt="Node.js 22 or newer" />
<img src="https://img.shields.io/badge/TypeScript-5.9-3178C6.svg?logo=typescript&logoColor=white" alt="TypeScript 5.9" />
<img src="https://img.shields.io/badge/Fastify-5-000000.svg?logo=fastify&logoColor=white" alt="Fastify 5" />
<img src="https://img.shields.io/badge/Next.js-16-000000.svg?logo=nextdotjs&logoColor=white" alt="Next.js 16" />
<img src="https://img.shields.io/badge/PostgreSQL-PGlite%20%2F%20PG17-4169E1.svg?logo=postgresql&logoColor=white" alt="PostgreSQL 17 or embedded PGlite" />
<img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="MIT License" />
</p>

</div>

---

> **Status — Phase 2 is live.** Phase 1 shipped email/password auth, catalog, a custom HLS player with adaptive bitrate and quality selection, signed short-TTL playback sessions, per-account concurrency limits, and continue-watching. Phase 2 adds two local edge PoPs with manifest rewriting, HMAC edge-session cookies, deterministic multi-PoP steering with client failover, token/cookie rotation, and a QoE telemetry pipeline with a live `/status` dashboard. Later phases — real multi-CDN, P2P offload, DRM, billing, live — are specified below and not yet built.

## Why

Building a streaming service that works is easy. Building one that survives a *global final* is a distributed-systems problem disguised as a video app. At scale, the product is the infrastructure:

- **Bits, not servers, are the bottleneck.** One billion streams at 5 Mbps is **4.8 Petabits per second** — more than the total traffic of the open internet. You do not serve this from origin. You serve it from caches inside ISPs, from peers, and from multicast.
- **Every database call is a budget line.** Playback must be authorized by an edge-validated, short-lived token — never a per-segment origin lookup.
- **Failure is the normal state.** A CDN region, a database shard, or an ISP cache will be down during your biggest event. The design question is always "what degrades, and how gracefully?"
- **Concurrency is a product feature.** Account sharing, device limits, and stream policing are enforced in real time at a billion-session scale.

Blitzman starts with the smallest honest version of that architecture: **real auth, real signed playback authorization, real concurrency enforcement, real adaptive streaming** — and then scales each layer in public, with the trade-offs documented.

## The scale math

| Metric | At 1B concurrent streams | Consequence |
| --- | --- | --- |
| Average bitrate | 5 Mbps | 4.8 **Pb/s** aggregate egress |
| Daily traffic | ~2 **EB/day** | CDN spend measured in billions/year |
| Manifest requests | 1B+ per session | Auth must happen at the edge, not in a database |
| Concurrent sessions | 1B rows of state | In-memory/edge validation, sharded writes |
| Cache hit ratio | **> 99%** | Origin sees < 1% of requests, or you are offline |

The architecture goal that follows from this table: **95%+ of bits must never leave an edge cache or a peer.**

## Feature map

Checkboxes are implemented code. Everything unchecked is specified but not built yet.

### 1. Delivery & network — *the layer that decides whether 1B is possible*

- [x] Adaptive bitrate HLS playback with manual quality override *(P1)*
- [x] Signed, short-TTL playback tokens *(P1)*
- [x] Two-PoP edge delivery with deterministic steering, client failover, and direct-origin fallback *(P2)*
- [x] Edge manifest rewriting plus a scoped, short-lived HMAC session cookie *(P2)*
- [ ] Multi-CDN traffic steering (Akamai / Fastly / CloudFront / Cloudflare) with health-based failover
- [ ] Open Caching / ISP-embedded cache nodes (Netflix Open Connect model)
- [ ] P2P offload (WebRTC/HTTP mesh) for peak events — target 30–50% egress reduction
- [ ] IP multicast / carrier simulcast for live
- [ ] Origin-shield hierarchy so cache misses never reach origin
- [ ] Predictive pre-warming of the next episode before the user clicks play
- [ ] Regional degradation modes (drop to 480p before dropping the stream)
- [x] Edge compute for manifest rewriting and token validation *(P2)*
- [ ] Edge-side ad insertion

### 2. Media pipeline

- [ ] Ingest + automated QC (checksums, frame-accurate validation, loudness)
- [ ] GPU transcoding farm — AV1 / HEVC / H.264 ABR ladders
- [ ] Per-title and per-scene encoding optimization
- [ ] CMAF + chunked transfer (2–5 s live latency)
- [ ] Low-latency HLS/DASH for live and co-watching
- [ ] Subtitles/captions pipeline — WebVTT/TTML, 40+ languages
- [ ] AI dubbing with voice cloning and lip-sync
- [ ] HDR pipeline — Dolby Vision / HDR10+ / HLG with tone-mapped fallbacks
- [ ] Forensic watermarking (per-session, per-device)
- [ ] Content fingerprinting for piracy takedowns

### 3. DRM, security & anti-piracy

- [x] Playback sessions tied to a user and device, with TTL and revocation *(P1)*
- [x] Per-account concurrent-stream enforcement *(P1)*
- [x] Manifest token validation at the CDN edge, not just at origin *(P2)*
- [ ] Multi-DRM: Widevine (L1/L3), FairPlay, PlayReady from one licensing service
- [ ] Device provisioning, attestation, and revocation
- [ ] Bot and credential-stuffing detection
- [ ] VPN/proxy detection for geo-enforcement

### 4. Client apps

- [x] Web app (Next.js 16) with a custom HLS player *(P1)*
- [x] Client-side ABR, quality menu, keyboard shortcuts, fullscreen *(P1)*
- [x] Cross-device "continue watching" resume *(P1)*
- [x] QoE instrumentation: startup time, rebuffer duration, bitrate, fatal errors *(P2)*
- [ ] Native SDKs: Android, Android TV, iOS, tvOS, Roku, Fire TV, Tizen, webOS, consoles
- [ ] Offline downloads with expiring licenses
- [ ] Background audio, picture-in-picture, casting (Chromecast/AirPlay)
- [ ] Low-end device ladder (audio-only and 1 Mbps tier for 2G/3G markets)

### 5. Identity & accounts

- [x] Email/password auth with bcrypt + JWT *(P1)*
- [x] Edge-validated playback sessions, with no per-segment database lookup *(P2)*
- [ ] OAuth / SSO (Google, Apple), phone OTP, passkeys
- [ ] Profiles (kids mode, per-profile recommendations)
- [ ] Household model, device registry, stream limits per tier
- [ ] Edge-cached user sessions (no per-request database lookup)

### 6. Catalog & discovery

- [x] Catalog API with featured title and artwork metadata *(P1)*
- [x] Client-side search and continue-watching shelf *(P1)*
- [ ] Global CMS with per-region rights windows
- [ ] Vector/semantic search, multi-language typo tolerance
- [ ] Recommendation ranking (billions of impressions/day)
- [ ] Personalized homepage rows and A/B experimentation
- [ ] Skip-intro markers, X-Ray trivia, parental controls

### 7. Monetization

- [ ] SVOD tiers (ads / standard / premium 4K), AVOD, TVOD
- [ ] Global payments — cards, UPI, PayPal, carrier billing, local wallets
- [ ] Server-side ad insertion (SSAI), frequency capping, brand safety
- [ ] Telco bundling and revenue share

### 8. Backend core

- [x] Fastify 5 API with PostgreSQL (embedded PGlite for zero-setup dev) *(P1)*
- [x] Schema auto-migration and idempotent catalog seeding *(P1)*
- [x] Input validation, rate limiting, structured error responses *(P1)*
- [ ] Microservices split, multi-region active-active
- [ ] Sharded Postgres / Spanner-class metadata, Cassandra-class playback events
- [ ] Kafka event backbone (10M+ events/sec)
- [ ] Predictive autoscaling (scale 60 minutes before the match, not after)
- [ ] Chaos engineering and regional game days

### 9. Observability & QoE

- [x] Live QoE dashboard: startup latency, rebuffer ratio, bitrate, errors, per-PoP cache health *(P2, local simulator)*
- [ ] Per-region, per-device-class QoE breakdowns with anomaly alerting
- [ ] Billions of time-series metrics with anomaly-based alerting
- [ ] Synthetic playback probes in every region
- [ ] 24/7 NOC runbooks and incident automation

### 10. Legal & compliance

- [ ] Geo-licensed availability, DMCA automation
- [ ] GDPR / DPDP data residency
- [ ] Sanctions-aware region blocking

## Phase 1 architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser — Next.js 16 (App Router, React 19)                        │
│  Browse · Search · Auth · Custom HLS player (hls.js, ABR + manual)  │
└───────────────┬─────────────────────────────────────────────────────┘
                │ JWT (7 d)                     │ signed playback token (120 s)
                ▼                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Fastify 5 API — rate limited, validated, typed                     │
│  /auth  /catalog  /me  /playback                                    │
└───────────────┬─────────────────────────────────────────────────────┘
                │ SQL
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PGlite (dev, embedded)  ·  PostgreSQL 17 (prod, docker-compose)    │
│  users · titles · watch_progress · playback_sessions                │
└─────────────────────────────────────────────────────────────────────┘

Streaming: HLS ABR ladder (public test streams) ──► edge PoP (Phase 2)
```

**Phase 1 deliberately ships two "scale seams":**

1. **Playback authorization is a signed token, not a session cookie.** The token carries `sessionId`, `userId`, `titleId`, the manifest URL, and a 120-second expiry, signed with HMAC-SHA256. Phase 2 moves validation to the CDN edge — the API keeps issuing, the edge keeps enforcing.
2. **Concurrency is enforced at session creation.** Every play creates a `playback_sessions` row; exceeding `MAX_CONCURRENT_STREAMS` returns a `409 concurrency_limit` instead of silently over-serving. This is the seam where household/device policy becomes real.

## Phase 2 architecture

```
              control plane                                data plane
┌──────────────────────────────┐              ┌───────────────────────────────────┐
│ Fastify API :4000            │              │ Browser (Next.js :3000)           │
│ auth · catalog · sessions    │  signed JWT  │ custom HLS player · QoE batch     │
│ concurrency · token rotation │─────────────►│ edge failover · origin fallback   │
└───────────────┬──────────────┘              └──────────────┬────────────────────┘
                │ SQL                                        │ 1. POST /v1/session (JWT)
                ▼                                            │ 2. HttpOnly cookie
┌──────────────────────────────┐                             │ 3. manifest/segments
│ PGlite / PostgreSQL          │                             ▼
│ users · titles · sessions    │              ┌───────────────────────────────────┐
│ watch_progress · qoe_events  │◄─────────────┤ Edge PoPs (same process, local)   │
└──────────────────────────────┘  QoE batch   │ edge-iad :4100 · edge-fra :4101   │
                                               │ verify HMAC · rewrite URIs        │
                                               │ LRU byte cache · single-flight    │
                                               └──────────────┬────────────────────┘
                                                              │ cache miss
                                                              ▼
                                               public HLS test origins
```

**What Phase 2 actually does:**

- `POST /catalog/:slug/playback` now returns `edgeUrls` in a deterministic order derived from the session id. The browser opens an edge session on the first reachable PoP; if one is down it tries the next, then falls back to playing the origin manifest directly.
- The edge verifies the playback JWT locally. It then issues `blitz_edge`, a 180-second `HttpOnly` cookie signed with `EDGE_SESSION_SECRET`, and rewrites every playlist URI (renditions, keys, init segments, LL-HLS parts) through `/v1/manifest`, `/v1/key`, and `/v1/segment`.
- The cookie is bound to the manifest origin and directory prefix. A valid cookie is not an open proxy.
- Before the cookie expires, the player calls `POST /playback/:sessionId/token` and exchanges the rotated JWT for a fresh cookie without interrupting playback.
- The player batches QoE events (startup, rebuffer, bitrate, error, session end) to `POST /telemetry/qoe`. `/status` renders the rolling hour and each PoP's cache hit ratio.

> **Honest scope:** the two PoPs and their caches are local processes. Steering is deterministic, not geographic; the cache is per-process, not shared. This is a faithful simulator of the edge contract — the interfaces `apps/edge` exposes are the ones a real CDN edge would implement — not a claim of production scale. See [`docs/scale-notes.md`](docs/scale-notes.md) and [ADR 0002](docs/0002-edge-session-cookie.md).

## Quickstart

Requirements: **Node.js ≥ 22** (24 recommended). No database setup required — the API embeds PGlite.

```bash
git clone https://github.com/0xMudit/Blitzman.git
cd Blitzman
npm install
npm run dev
```

Open **http://localhost:3000**, create an account, and press play. The catalog seeds itself on first boot.

`npm run dev` starts four processes: the API (`:4000`), two edge PoPs (`:4100` and `:4101`), and the web app (`:3000`). The watch page shows which PoP served the session and its cache hit ratio; **http://localhost:3000/status** shows the QoE dashboard.

| Command | What it does |
| --- | --- |
| `npm run dev` | API `:4000` + edge-iad `:4100` + edge-fra `:4101` + web `:3000` (hot reload) |
| `npm run seed` | Re-seed the catalog |
| `npm test` | API integration tests + edge proxy tests (in-memory PGlite, injected upstream) |
| `npm run typecheck` | Strict TypeScript across all three apps |
| `npm run build` | Production build of all three apps |
| `npm start` | Run the production builds (API, both PoPs, web) |

### Using PostgreSQL instead of PGlite

```bash
docker compose up -d
export DATABASE_URL=postgres://blitzman:blitzman@localhost:5432/blitzman
npm run dev
```

The schema migrates and seeds automatically on boot either way.

### Environment

Copy [`.env.example`](.env.example) to `.env`. Every value has a development default; secrets must be changed outside local dev.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | API port |
| `WEB_ORIGIN` | `http://localhost:3000` | CORS allowlist |
| `JWT_SECRET` | dev placeholder | Signs user sessions |
| `PLAYBACK_SECRET` | dev placeholder | Signs playback tokens |
| `DATABASE_URL` | *(empty → PGlite)* | PostgreSQL connection string |
| `PGLITE_DIR` | `.data/pglite` | Embedded database directory |
| `MAX_CONCURRENT_STREAMS` | `2` | Streams per account |
| `PLAYBACK_TTL_SECS` | `120` | Playback token lifetime |
| `EDGE_URLS` | two localhost PoPs | PoP preference list returned by the control plane |
| `EDGE_SESSION_SECRET` | dev placeholder | Signs the edge session cookie |
| `EDGE_SESSION_TTL_SECS` | `180` | Edge cookie lifetime |
| `EDGE_CACHE_BYTES` | `100663296` (96 MB) | Per-PoP byte cache |
| `EDGE_UPSTREAM_TIMEOUT_MS` | `20000` | Origin fetch timeout |
| `EDGE_COOKIE_SECURE` | `false` | Add `Secure` when serving over HTTPS |

## API

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/health` | — | Liveness + database driver |
| `POST` | `/auth/register` | — | Create account, returns JWT |
| `POST` | `/auth/login` | — | Sign in, returns JWT |
| `GET` | `/auth/me` | Bearer | Current user + active streams |
| `GET` | `/catalog` | — | Featured title + full catalog |
| `GET` | `/catalog/:slug` | — | Title detail |
| `POST` | `/catalog/:slug/playback` | Bearer | Create session, return signed token + steered PoPs |
| `POST` | `/playback/:sessionId/token` | Bearer | Rotate the playback token without renegotiating |
| `DELETE` | `/playback/:sessionId` | Bearer | End a playback session |
| `GET` | `/me/continue` | Bearer | Continue-watching shelf |
| `PUT` | `/me/progress/:slug` | Bearer | Upsert watch progress, extend session |
| `POST` | `/telemetry/qoe` | Bearer | Batched player QoE events |
| `GET` | `/telemetry/summary` | — | Rolling QoE summary for `/status` |

Edge PoP API (`apps/edge`):

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/health` | — | Liveness + cache stats |
| `POST` | `/v1/session` | Playback JWT | Exchange token for `blitz_edge` cookie |
| `DELETE` | `/v1/session` | Cookie | Clear the edge cookie |
| `GET` | `/v1/manifest?u=` | Cookie | Rewritten playlist |
| `GET` | `/v1/segment?u=` | Cookie | Cached media segment |
| `GET` | `/v1/key?u=` | Cookie | Cached encryption key |

Errors are consistent: `{ "error": { "code": "concurrency_limit", "message": "..." } }`.

## Repository layout

```
apps/
  api/    Fastify 5 + PostgreSQL/PGlite — auth, catalog, playback, telemetry
  edge/   Edge PoP simulator — JWT/cookie auth, manifest rewriting, LRU cache
  web/    Next.js 16 — browse, auth, custom HLS player, /status QoE dashboard
.github/  CI: typecheck, integration tests, production builds
docs/     Scale notes and architecture decision records
```

## Roadmap

| Phase | Target | Focus |
| --- | --- | --- |
| **1 — Play** ✅ | Working VOD product | Auth, catalog, HLS ABR, signed sessions, concurrency, resume |
| **2 — Survive** 🚧 | 1M concurrent | Edge delivery + token validation ✅, PoP steering + failover ✅, QoE telemetry ✅; Redis sessions, real multi-CDN, and origin shield next |
| **3 — Afford** | 100M concurrent | Open Caching/ISP caches, P2P offload, predictive pre-warm, ad tier |
| **4 — Planet** | 1B concurrent | Multicast, edge compute everywhere, multi-region active-active, live simulcast |

Phase 2 is live from the product surface: sessions are steered to two PoPs, enforced at the edge with a scoped cookie, and measured end to end. The remaining Phase 2 work is replacing the local simulator's per-process state with shared infrastructure — Redis/HMAC key distribution for edge sessions and real multi-CDN steering from the control plane.

## Testing

```bash
npm test
```

**11 tests.** The API suite runs the real Fastify app against an in-memory PGlite database and covers registration, login, unauthorized access, catalog reads, signed playback sessions, the concurrency limit, token rotation, progress upserts, and QoE ingest/summary. The edge suite injects a fake upstream and covers JWT verification, cookie issuance, manifest URI rewriting (renditions, keys, init segments), cache hits, request coalescing, session/source allowlisting, tampered cookies, and upstream error mapping.

## License

[MIT](LICENSE) © 2026 Mudit (0xMudit)
