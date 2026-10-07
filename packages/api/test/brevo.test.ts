import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendTransactionalEmail } from '../src/lib/brevo.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const MOCK_PAYLOAD = {
  to: [{ email: 'test@example.com', name: 'Test User' }],
  subject: 'Test invite',
  htmlContent: '<p>Hello</p>',
  textContent: 'Hello',
};

function makeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sendTransactionalEmail', () => {
  it('returns messageId on success', async () => {
    mockFetch.mockResolvedValue(makeResponse(201, { messageId: 'msg-abc-123' }));

    const result = await sendTransactionalEmail(
      'test-api-key',
      'sender@example.com',
      'Sender',
      MOCK_PAYLOAD,
    );

    expect(result.messageId).toBe('msg-abc-123');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws immediately on 4xx without retry', async () => {
    mockFetch.mockResolvedValue(makeResponse(400, { message: 'Bad request' }));

    await expect(
      sendTransactionalEmail('bad-key', 'sender@example.com', 'Sender', MOCK_PAYLOAD),
    ).rejects.toThrow(/400/);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries once on 5xx then throws if still failing', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(503, {}))
      .mockResolvedValueOnce(makeResponse(503, {}));

    await expect(
      sendTransactionalEmail('key', 'sender@example.com', 'Sender', MOCK_PAYLOAD),
    ).rejects.toThrow(/503/);

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('succeeds on second attempt after a 5xx', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(500, {}))
      .mockResolvedValueOnce(makeResponse(201, { messageId: 'retry-ok' }));

    const result = await sendTransactionalEmail(
      'key',
      'sender@example.com',
      'Sender',
      MOCK_PAYLOAD,
    );

    expect(result.messageId).toBe('retry-ok');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
