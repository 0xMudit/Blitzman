import type { FastifyInstance } from 'fastify';
import { requireUser, signPlaybackToken } from '../auth.js';
import { config } from '../config.js';
import type { Db } from '../db.js';
import { sendError } from '../errors.js';
import { toTitleSummary, type TitleRow } from '../titles.js';

interface PlaybackBody {
  device?: unknown;
}

export async function registerCatalogRoutes(app: FastifyInstance, db: Db): Promise<void> {
  app.get('/catalog', async () => {
    const rows = await db.query<TitleRow>(
      'select * from titles order by sort_order asc, name asc',
    );
    const titles = rows.map(toTitleSummary);
    return {
      featured: titles.find((title) => title.featured) ?? titles[0] ?? null,
      titles,
    };
  });

  app.get<{ Params: { slug: string } }>('/catalog/:slug', async (request, reply) => {
    const [row] = await db.query<TitleRow>('select * from titles where slug = $1', [
      request.params.slug,
    ]);
    if (!row) return sendError(reply, 404, 'title_not_found', 'That title does not exist.');
    return { title: toTitleSummary(row) };
  });

  /**
   * Mint a playback session. This is where concurrency policy is enforced:
   * a new stream either fits inside the account's limit or is refused.
   */
  app.post<{ Params: { slug: string }; Body: PlaybackBody }>(
    '/catalog/:slug/playback',
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const [title] = await db.query<TitleRow>('select * from titles where slug = $1', [
        request.params.slug,
      ]);
      if (!title) return sendError(reply, 404, 'title_not_found', 'That title does not exist.');

      await db.query('delete from playback_sessions where user_id = $1 and expires_at <= now()', [
        user.id,
      ]);

      const active = await db.query<{ id: string }>(
        'select id from playback_sessions where user_id = $1 and expires_at > now() order by created_at asc',
        [user.id],
      );

      if (active.length >= config.maxConcurrentStreams) {
        return reply.code(409).send({
          error: {
            code: 'concurrency_limit',
            message: `Your account is already streaming on ${active.length} devices. Stop one to keep watching.`,
            details: {
              activeStreams: active.length,
              maxConcurrentStreams: config.maxConcurrentStreams,
            },
          },
        });
      }

      const sessionId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + config.playbackTtlSecs * 1000);
      const device =
        typeof request.body?.device === 'string' && request.body.device.trim().length > 0
          ? request.body.device.trim().slice(0, 80)
          : 'web';

      await db.query(
        'insert into playback_sessions (id, user_id, title_id, device, expires_at) values ($1, $2, $3, $4, $5)',
        [sessionId, user.id, title.id, device, expiresAt],
      );

      const token = signPlaybackToken({ sid: sessionId, uid: user.id, tid: title.id });

      return reply.code(201).send({
        sessionId,
        token,
        manifestUrl: title.manifest_url,
        expiresAt: expiresAt.toISOString(),
        ttlSecs: config.playbackTtlSecs,
        title: toTitleSummary(title),
      });
    },
  );
}
