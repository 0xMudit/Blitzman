import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import { config } from '../config.js';
import type { Db } from '../db.js';
import { sendError } from '../errors.js';
import { toTitleSummary, type TitleRow } from '../titles.js';
import { isFiniteNumber } from '../validation.js';

interface ContinueRow extends TitleRow {
  position_secs: number;
  duration_secs: number;
  updated_at: string | Date;
}

interface ProgressBody {
  positionSecs?: unknown;
  durationSecs?: unknown;
  sessionId?: unknown;
}

export async function registerMeRoutes(app: FastifyInstance, db: Db): Promise<void> {
  app.get('/me/continue', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const rows = await db.query<ContinueRow>(
      `select t.*, p.position_secs, p.duration_secs, p.updated_at
         from watch_progress p
         join titles t on t.id = p.title_id
        where p.user_id = $1 and p.completed = false and p.position_secs > 0
        order by p.updated_at desc
        limit 12`,
      [user.id],
    );

    return {
      items: rows.map((row) => ({
        title: toTitleSummary(row),
        positionSecs: row.position_secs,
        durationSecs: row.duration_secs,
        progress: row.duration_secs > 0 ? row.position_secs / row.duration_secs : 0,
        updatedAt: new Date(row.updated_at).toISOString(),
      })),
    };
  });

  app.put<{ Params: { slug: string }; Body: ProgressBody }>(
    '/me/progress/:slug',
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const body = request.body ?? {};
      if (
        !isFiniteNumber(body.positionSecs) ||
        !isFiniteNumber(body.durationSecs) ||
        body.durationSecs <= 0
      ) {
        return sendError(reply, 400, 'invalid_progress', 'positionSecs and durationSecs are required.');
      }

      const [title] = await db.query<{ id: string }>('select id from titles where slug = $1', [
        request.params.slug,
      ]);
      if (!title) return sendError(reply, 404, 'title_not_found', 'That title does not exist.');

      const durationSecs = Math.round(body.durationSecs);
      const positionSecs = Math.max(
        0,
        Math.min(Math.round(body.positionSecs), durationSecs),
      );
      const completed = positionSecs >= durationSecs * 0.95;

      await db.query(
        `insert into watch_progress (user_id, title_id, position_secs, duration_secs, completed, updated_at)
         values ($1, $2, $3, $4, $5, now())
         on conflict (user_id, title_id) do update set
           position_secs = excluded.position_secs,
           duration_secs = excluded.duration_secs,
           completed = excluded.completed,
           updated_at = now()`,
        [user.id, title.id, positionSecs, durationSecs, completed],
      );

      // Watching is a heartbeat: an active stream keeps its session alive.
      if (typeof body.sessionId === 'string' && body.sessionId.length > 0) {
        const expiresAt = new Date(Date.now() + config.playbackTtlSecs * 1000);
        await db.query(
          'update playback_sessions set expires_at = $3 where id = $1 and user_id = $2',
          [body.sessionId, user.id, expiresAt],
        );
      }

      return {
        slug: request.params.slug,
        positionSecs,
        durationSecs,
        completed,
      };
    },
  );
}
