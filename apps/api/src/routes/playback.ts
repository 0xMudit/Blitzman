import type { FastifyInstance } from 'fastify';
import { requireUser, signPlaybackToken } from '../auth.js';
import { config } from '../config.js';
import type { Db } from '../db.js';
import { sendError } from '../errors.js';

export async function registerPlaybackRoutes(app: FastifyInstance, db: Db): Promise<void> {
  app.delete<{ Params: { sessionId: string } }>(
    '/playback/:sessionId',
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      await db.query('delete from playback_sessions where id = $1 and user_id = $2', [
        request.params.sessionId,
        user.id,
      ]);

      return reply.code(204).send();
    },
  );

  /**
   * Rotate the playback token without starting a new stream. The player calls
   * this before expiry so the edge cookie can be refreshed without
   * re-buffering or renegotiating the session.
   */
  app.post<{ Params: { sessionId: string } }>(
    '/playback/:sessionId/token',
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const [session] = await db.query<{
        id: string;
        title_id: string;
        manifest_url: string;
        expires_at: string | Date;
      }>(
        `select s.id, s.title_id, s.expires_at, t.manifest_url
           from playback_sessions s
           join titles t on t.id = s.title_id
          where s.id = $1 and s.user_id = $2`,
        [request.params.sessionId, user.id],
      );

      if (!session) {
        return sendError(reply, 404, 'session_not_found', 'That playback session no longer exists.');
      }
      if (new Date(session.expires_at).getTime() <= Date.now()) {
        return sendError(reply, 410, 'session_expired', 'This stream expired. Start playback again.');
      }

      const expiresAt = new Date(Date.now() + config.playbackTtlSecs * 1000);
      await db.query('update playback_sessions set expires_at = $2 where id = $1', [
        session.id,
        expiresAt,
      ]);

      return {
        token: signPlaybackToken({
          sid: session.id,
          uid: user.id,
          tid: session.title_id,
          src: session.manifest_url,
        }),
        expiresAt: expiresAt.toISOString(),
        ttlSecs: config.playbackTtlSecs,
      };
    },
  );
}
