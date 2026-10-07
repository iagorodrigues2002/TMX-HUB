import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('environment validation', () => {
  it('allows docker-compose MinIO credentials in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('S3_ACCESS_KEY', 'minioadmin');
    vi.stubEnv('S3_SECRET_KEY', 'minioadmin');
    vi.stubEnv('JWT_SECRET', 'test-only-jwt-secret-at-least-32-characters');

    const { env } = await import('../src/env.js');

    expect(env.S3_ACCESS_KEY).toBe('minioadmin');
    expect(env.S3_SECRET_KEY).toBe('minioadmin');
  });

  it('rejects docker-compose MinIO credentials in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('S3_ACCESS_KEY', 'minioadmin');
    vi.stubEnv('S3_SECRET_KEY', 'minioadmin');
    vi.stubEnv('JWT_SECRET', 'test-only-jwt-secret-at-least-32-characters');

    await expect(import('../src/env.js')).rejects.toThrow(/S3_ACCESS_KEY/);
  });
});
