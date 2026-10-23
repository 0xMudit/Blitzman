import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import { config } from '../config.js';
import type { Db } from '../db.js';
import { sendError } from '../errors.js';
import { cleanString, isFiniteNumber } from '../validation.js';

const KINDS = new Set(['session_start', 'rebuffer', 'bitrate', 'error', 'session_end']);

interface QoeBody {
  sessionId?: unknown;
  titleSlug?: unknown;
  events?: unknown;
}

interface RawEvent {
  kind?: unknown;
  valueNum?: unknown;
  valueText?: unknown;
}

interface SummaryRow {
  events: number;
  starts: number;
  rebuffers: number;
  errors: number;
  startup_avg_ms: string | number | null;
  startup_max_ms: string | number | null;
  avg_bitrate_bps: string | number | null;
  rebuffer_ms: string | number | null;
  watch_secs: string | number | null;
}

export async function registerTelemetryRoutes(app: FastifyInstance, db: Db): Promise<void> {
  /**
   * Player telemetry is batched client-side and written point-by-point here.
   * At scale this is a Kafka producer and a time-series store, not Postgres —
   * the shape of the payload is what matters at this phase.
   */
  app.post<{ Body: QoeBody }>(
    '/telemetry/qoe',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const body = request.body ?? {};
      if (!Array.isArray(body.events) || body.events.length === 0) {
        return sendError(reply, 400, 'invalid_events', 'Send at least one telemetry event.');
      }
      if (body.events.length > 25) {
        return sendError(reply, 400, 'too_many_events', 'Send at most 25 events per request.');
      }

      const sessionId = cleanString(body.sessionId, 80) || null;
      const titleSlug = cleanString(body.titleSlug, 120);
      let titleId: string | null = null;

      if (titleSlug) {
        const [title] = await db.query<{ id: string }>(
          'select id from titles where slug = $1',
          [titleSlug],
        );
        titleId = title?.id ?? null;
      }

      let accepted = 0;
      for (const event of body.events as RawEvent[]) {
        const kind = cleanString(event?.kind, 40);
        if (!KINDS.has(kind)) continue;

        const valueNum = isFiniteNumber(event.valueNum)
          ? Math.max(-1e9, Math.min(1e12, event.valueNum))
          : null;
        const valueText =
          event.valueText === undefined ? null : cleanString(event.valueText, 200) || null;

        await db.query(
          `insert into qoe_events (id, user_id, session_id, title_id, kind, value_num, value_text)
           values ($1, $2, $3, $4, $5, $6, $7)`,
          [randomUUID(), user.id, sessionId, titleId, kind, valueNum, valueText],
        );
        accepted += 1;
      }

      return reply.code(202).send({ accepted });
    },
  );

  app.get<{ Querystring: { windowMins?: string } }>(
    '/telemetry/summary',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request) => {
      const windowMins = Math.min(
        1440,
        Math.max(1, Math.round(Number(request.query.windowMins) || 60)),
      );
      const cutoff = new Date(Date.now() - windowMins * 60_000);

      const [totals] = await db.query<SummaryRow>(
        `select
           count(*)::int as events,
           count(*) filter (where kind = 'session_start')::int as starts,
           count(*) filter (where kind = 'rebuffer')::int as rebuffers,
           count(*) filter (where kind = 'error')::int as errors,
           avg(value_num) filter (where kind = 'session_start') as startup_avg_ms,
           max(value_num) filter (where kind = 'session_start') as startup_max_ms,
           avg(value_num) filter (where kind = 'bitrate') as avg_bitrate_bps,
           coalesce(sum(value_num) filter (where kind = 'rebuffer'), 0) as rebuffer_ms,
           coalesce(sum(value_num) filter (where kind = 'session_end'), 0) as watch_secs
         from qoe_events
         where created_at > $1`,
        [cutoff],
      );

      const active = await db.query<{ count: number }>(
        'select count(*)::int as count from playback_sessions where expires_at > now()',
      );

      const top = await db.query<{
        name: string;
        starts: number;
        rebuffers: number;
        rebuffer_ms: string | number | null;
      }>(
        `select t.name,
                count(*) filter (where q.kind = 'session_start')::int as starts,
                count(*) filter (where q.kind = 'rebuffer')::int as rebuffers,
                coalesce(sum(q.value_num) filter (where q.kind = 'rebuffer'), 0) as rebuffer_ms
           from qoe_events q
           join titles t on t.id = q.title_id
          where q.created_at > $1
          group by t.name
          order by rebuffers desc, starts desc
          limit 6`,
        [cutoff],
      );

      const watchSecs = Number(totals?.watch_secs ?? 0);
      const rebufferMs = Number(totals?.rebuffer_ms ?? 0);

      return {
        windowMins,
        generatedAt: new Date().toISOString(),
        activeStreams: Number(active[0]?.count ?? 0),
        sessionsStarted: Number(totals?.starts ?? 0),
        rebuffers: Number(totals?.rebuffers ?? 0),
        rebufferMs,
        // Share of play time spent rebuffering. 0 if no session has ended yet.
        rebufferRatio: watchSecs > 0 ? rebufferMs / (watchSecs * 1000) : 0,
        startupMs: {
          avg: Number(totals?.startup_avg_ms ?? 0),
          max: Number(totals?.startup_max_ms ?? 0),
        },
        avgBitrateBps: Number(totals?.avg_bitrate_bps ?? 0),
        errors: Number(totals?.errors ?? 0),
        watchSecs,
        events: Number(totals?.events ?? 0),
        edges: config.edgeUrls,
        topTitles: top.map((row) => ({
          name: row.name,
          starts: Number(row.starts),
          rebuffers: Number(row.rebuffers),
          rebufferMs: Number(row.rebuffer_ms ?? 0),
        })),
      };
    },
  );
}
