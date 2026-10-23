import type { FastifyReply } from 'fastify';

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export function sendError(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): FastifyReply {
  const body: ErrorBody = { error: { code, message, ...(details ? { details } : {}) } };
  return reply.code(status).send(body);
}
