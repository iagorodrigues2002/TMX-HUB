import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { HttpProblem, NotFoundError, zodToProblem } from '../src/lib/problem.js';

describe('Problem helpers', () => {
  it('NotFoundError serializes to RFC 7807 shape', () => {
    const err = new NotFoundError('thing missing');
    const json = err.toJSON();
    expect(json.status).toBe(404);
    expect(json.title).toBe('Not Found');
    expect(json.detail).toBe('thing missing');
    expect(json.code).toBe('not_found');
    expect(json.type).toMatch(/not-found/);
  });

  it('HttpProblem accepts custom code and errors', () => {
    const err = new HttpProblem({
      status: 422,
      title: 'Validation failed',
      code: 'validation_failed',
      errors: [{ pointer: '/url', message: 'required', code: 'required' }],
    });
    const json = err.toJSON();
    expect(json.errors).toHaveLength(1);
    expect(json.errors?.[0]?.pointer).toBe('/url');
  });

  it('zodToProblem maps every issue to a pointer', () => {
    const schema = z.object({ url: z.string().url(), n: z.number().min(1) });
    const result = schema.safeParse({ url: 'not-a-url', n: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const problem = zodToProblem(result.error);
      expect(problem.status).toBe(422);
      expect(problem.errors?.length).toBeGreaterThanOrEqual(2);
    }
  });
});
