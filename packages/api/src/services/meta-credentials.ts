export interface MetaGraphError {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
}

export function readMetaGraphError(payload: unknown): MetaGraphError | null {
  if (!payload || typeof payload !== 'object') return null;
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return null;
  const value = error as Record<string, unknown>;
  return {
    ...(typeof value.message === 'string' ? { message: value.message } : {}),
    ...(typeof value.type === 'string' ? { type: value.type } : {}),
    ...(typeof value.code === 'number' ? { code: value.code } : {}),
    ...(typeof value.error_subcode === 'number' ? { error_subcode: value.error_subcode } : {}),
  };
}

export function isDefinitelyInvalidMetaToken(error: MetaGraphError | null): boolean {
  return error?.code === 190 || error?.code === 102;
}

export function metaCredentialDetail(status: number, error: MetaGraphError | null): string {
  if (isDefinitelyInvalidMetaToken(error)) {
    return 'Token inválido ou expirado. Gere um novo token em Events Manager → Configurações → Conversions API.';
  }
  if (error?.message) {
    return `Meta HTTP ${status}: ${error.message}`;
  }
  return `A Meta respondeu HTTP ${status} sem fornecer detalhes.`;
}
