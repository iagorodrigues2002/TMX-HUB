import type { FastifyError, FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ZodError } from 'zod';
import { HttpProblem, NotFoundError, sendProblem, zodToProblem } from '../lib/problem.js';

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.setNotFoundHandler((req, reply) => {
    sendProblem(reply, new NotFoundError(`Route not found: ${req.method} ${req.url}`));
  });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err instanceof HttpProblem) {
      return sendProblem(reply, err);
    }

    if (err instanceof ZodError) {
      return sendProblem(reply, zodToProblem(err, req.url));
    }

    // Fastify validation error
    if (err.validation) {
      const detail = err.validation.map((v) => `${v.instancePath} ${v.message}`).join('; ');
      const problem = new HttpProblem({
        status: 422,
        title: 'Validation failed',
        detail,
        code: 'validation_failed',
        errors: err.validation.map((v) => ({
          pointer: v.instancePath || '/',
          message: v.message ?? 'invalid',
          code: v.keyword,
        })),
      });
      return sendProblem(reply, problem);
    }

    // S3 NoSuchKey
    const named = err as unknown as { name?: string; Code?: string };
    if (named.name === 'NoSuchKey' || named.Code === 'NoSuchKey') {
      return sendProblem(reply, new NotFoundError('Underlying object not found.'));
    }

    // Rate-limit plugin sends its own 429; if it ever throws, fall through.
    const status = (err.statusCode ?? 500) as number;
    if (status >= 400 && status < 500) {
      return sendProblem(
        reply,
        new HttpProblem({
          status,
          title: err.name || 'Bad Request',
          detail: err.message,
          code: err.code,
        }),
      );
    }

    req.log.error({ err }, 'unhandled error');
    return sendProblem(
      reply,
      new HttpProblem({
        status: 500,
        title: 'Internal Server Error',
        detail: 'An unexpected error occurred.',
        code: 'internal_error',
      }),
    );
  });
};

export default plugin;
