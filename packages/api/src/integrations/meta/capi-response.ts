export type MetaCapiResponse = {
  events_received?: unknown;
  fbtrace_id?: unknown;
  messages?: unknown;
  error?: {
    message?: unknown;
    type?: unknown;
    code?: unknown;
    error_subcode?: unknown;
  };
};

export function metaEventsReceived(result: unknown) {
  if (!result || typeof result !== 'object') return 0;
  const value = Number((result as MetaCapiResponse).events_received);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

export function metaCapiErrorDetail(status: number, result: unknown) {
  const response = result && typeof result === 'object' ? (result as MetaCapiResponse) : {};
  const graphError = response.error;
  const message =
    typeof graphError?.message === 'string' && graphError.message.trim()
      ? graphError.message.trim()
      : undefined;
  const code = Number(graphError?.code);
  const subcode = Number(graphError?.error_subcode);
  const identifiers = [
    Number.isFinite(code) ? `code ${code}` : null,
    Number.isFinite(subcode) ? `subcode ${subcode}` : null,
  ].filter(Boolean);
  return [
    `Meta HTTP ${status}`,
    identifiers.length ? `(${identifiers.join(', ')})` : null,
    message ? `: ${message}` : null,
  ]
    .filter(Boolean)
    .join(' ');
}

export function assertMetaCapiAccepted(status: number, result: unknown) {
  if (status < 200 || status >= 300) {
    throw new Error(metaCapiErrorDetail(status, result));
  }
  const eventsReceived = metaEventsReceived(result);
  if (eventsReceived < 1) {
    throw new Error(
      `Meta HTTP ${status}, mas events_received=${eventsReceived}. O evento não foi confirmado.`,
    );
  }
  return eventsReceived;
}
