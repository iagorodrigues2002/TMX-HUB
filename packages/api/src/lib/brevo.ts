const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

export interface BrevoEmailPayload {
  to: Array<{ email: string; name?: string }>;
  subject: string;
  htmlContent: string;
  textContent: string;
  replyTo?: { email: string; name?: string };
}

export interface BrevoSendResult {
  messageId: string;
}

export async function sendTransactionalEmail(
  apiKey: string,
  senderEmail: string,
  senderName: string,
  payload: BrevoEmailPayload,
): Promise<BrevoSendResult> {
  const body = JSON.stringify({
    sender: { email: senderEmail, name: senderName },
    to: payload.to,
    subject: payload.subject,
    htmlContent: payload.htmlContent,
    textContent: payload.textContent,
    ...(payload.replyTo ? { replyTo: payload.replyTo } : {}),
  });

  const attempt = async (): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(BREVO_API_URL, {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body,
        signal: controller.signal,
      });
      return res;
    } finally {
      clearTimeout(timer);
    }
  };

  let res = await attempt();

  // Retry once on 5xx
  if (res.status >= 500) {
    res = await attempt();
  }

  if (!res.ok) {
    if (res.status >= 400 && res.status < 500) {
      throw new Error(`Brevo rejected the request (HTTP ${res.status}).`);
    }
    throw new Error(`Brevo API error (HTTP ${res.status}).`);
  }

  const data = (await res.json()) as { messageId?: string };
  return { messageId: data.messageId ?? '' };
}
