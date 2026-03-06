import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../lib/errors.js';
import { ZodError } from 'zod';

export function errorHandler(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: error.code || error.name,
      message: error.message,
      ...(error instanceof AppError && 'details' in error ? { details: (error as any).details } : {}),
    });
  }

  if (error instanceof ZodError) {
    const details: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const path = issue.path.join('.') || '_root';
      if (!details[path]) details[path] = [];
      details[path].push(issue.message);
    }
    return reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: 'Données invalides',
      details,
    });
  }

  if ('statusCode' in error && typeof error.statusCode === 'number') {
    return reply.status(error.statusCode).send({
      error: error.code || 'ERROR',
      message: error.message,
    });
  }

  request.log.error(error);
  return reply.status(500).send({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'Erreur interne du serveur',
  });
}
