import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import type { Db } from '../db.js';

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
}
