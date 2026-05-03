import type { FastifyReply } from 'fastify';
import type { ZodError } from 'zod';

const PROBLEM_BASE = 'https://page-cloner/errors';

export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code?: string;
  errors?: Array<{ pointer: string; message: string; code?: string }>;
}

export class HttpProblem extends Error {
  readonly status: number;
  readonly type: string;
  readonly title: string;
  readonly detail?: string;
  readonly code?: string;
  readonly errors?: Array<{ pointer: string; message: string; code?: string }>;

  constructor(args: {
    status: number;
    title: string;
    type?: string;
    detail?: string;
    code?: string;
    errors?: Array<{ pointer: string; message: string; code?: string }>;
  }) {
    super(args.detail ?? args.title);
    this.name = 'HttpProblem';
    this.status = args.status;
    this.title = args.title;
    this.type = args.type ?? `${PROBLEM_BASE}/${slug(args.title)}`;
    this.detail = args.detail;
    this.code = args.code;
    this.errors = args.errors;
  }

  toJSON(): ProblemDetail {
    return {
      type: this.type,
      title: this.title,
      status: this.status,
      ...(this.detail ? { detail: this.detail } : {}),
      ...(this.code ? { code: this.code } : {}),
      ...(this.errors ? { errors: this.errors } : {}),
    };
  }
}

export class NotFoundError extends HttpProblem {
  constructor(detail?: string) {
    super({
      status: 404,
      title: 'Not Found',
      type: `${PROBLEM_BASE}/not-found`,
      detail,
      code: 'not_found',
    });
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends HttpProblem {
  constructor(detail: string, code = 'conflict') {
    super({
      status: 409,
      title: 'Conflict',
      type: `${PROBLEM_BASE}/conflict`,
      detail,
      code,
    });
    this.name = 'ConflictError';
  }
}

export class GoneError extends HttpProblem {
  constructor(detail: string) {
    super({
      status: 410,
      title: 'Gone',
      type: `${PROBLEM_BASE}/gone`,
      detail,
      code: 'gone',
    });
    this.name = 'GoneError';
  }
}

export class BadRequestError extends HttpProblem {
  constructor(detail: string) {
    super({
      status: 400,
      title: 'Bad Request',
      type: `${PROBLEM_BASE}/bad-request`,
      detail,
      code: 'bad_request',
    });
    this.name = 'BadRequestError';
  }
}

export class PreconditionFailedError extends HttpProblem {
  constructor(detail = 'Resource was modified since last fetch.') {
    super({
      status: 412,
      title: 'Precondition Failed',
      type: `${PROBLEM_BASE}/precondition-failed`,
      detail,
      code: 'precondition_failed',
    });
    this.name = 'PreconditionFailedError';
  }
}

export function zodToProblem(err: ZodError, instance?: string): HttpProblem {
  const errors = err.issues.map((issue) => ({
    pointer: `/${issue.path.join('/')}`,
    message: issue.message,
    code: issue.code,
  }));
  return new HttpProblem({
    status: 422,
    title: 'Validation failed',
    type: `${PROBLEM_BASE}/validation`,
    detail: `One or more fields failed validation (${errors.length}).`,
    code: 'validation_failed',
    errors,
    ...(instance ? { instance } : {}),
  });
}

export function sendProblem(reply: FastifyReply, problem: HttpProblem): FastifyReply {
  return reply
    .code(problem.status)
    .header('content-type', 'application/problem+json; charset=utf-8')
    .send(problem.toJSON());
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
