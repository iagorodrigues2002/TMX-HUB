const SENSITIVE_KEY =
  /^(?:e-?mail|emailaddress|customeremail|customer_email|cpf|customer_cpf|phone|phone_number|phonenumber|telephone|telefone|customerphone|customer_phone)$/i;

function normalizedKey(key: string) {
  return key.replace(/[\s.-]/g, '_');
}

function isSensitiveKey(key: string) {
  return (
    SENSITIVE_KEY.test(normalizedKey(key)) ||
    /(?:^|_)(?:email|cpf|phone|telefone)$/.test(normalizedKey(key).toLowerCase())
  );
}

/**
 * Produces a deep copy safe for durable webhook receipts. Business
 * normalization must run before this function so transient PII can still be
 * transformed into the minimum fields required by downstream workflows.
 */
export function scrubWebhookPayload(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw.map(scrubWebhookPayload);
  if (!raw || typeof raw !== 'object') return raw;
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>)
      .filter(([key]) => !isSensitiveKey(key))
      .map(([key, value]) => [key, scrubWebhookPayload(value)]),
  );
}

export function scrubWebhookRawPayload(raw: string, contentType: string): string {
  if (contentType.toLowerCase().includes('application/json')) {
    try {
      return JSON.stringify(scrubWebhookPayload(JSON.parse(raw)));
    } catch {
      return raw;
    }
  }
  const params = new URLSearchParams(raw);
  for (const key of [...params.keys()]) {
    if (isSensitiveKey(key)) params.delete(key);
  }
  return params.toString();
}

export function webhookPayloadForStorage(raw: unknown, enabled: boolean): unknown {
  return enabled ? scrubWebhookPayload(raw) : raw;
}
