import { ApiError } from './query-client';

export function financeValidationError(error: unknown) {
  if (!(error instanceof ApiError)) return 'Falha inesperada ao validar. Tente novamente.';
  const detail = (error.problem as { detail?: unknown } | undefined)?.detail;
  const messages: Record<string, string> = {
    invalid_key: 'O provedor recusou a chave. Confira se ela está ativa.',
    permission_required: 'O provedor recusou esta consulta por falta de permissão de leitura.',
    network_unavailable: 'Não foi possível conectar ao provedor. Tente novamente em instantes.',
    invalid_response: 'O provedor respondeu em um formato que o TMX não conseguiu interpretar.',
    invalid_provider_response:
      'O formato dos dados retornados pelo provedor não foi reconhecido pelo TMX.',
    provider_tool_error: 'A consulta MCP foi recusada pelo provedor. A conta não foi salva.',
    profile_not_authorized: 'A conta selecionada não pertence à chave informada.',
  };
  if (typeof detail === 'string' && messages[detail]) return messages[detail];
  if (error.status === 409)
    return 'Conflito ao vincular a conta. Ela pode estar vinculada ou diferir da conta já salva. Nenhum histórico foi substituído.';
  if (error.status === 401) return 'Sua sessão expirou. Entre novamente no TMX.';
  if (error.status === 403)
    return 'Seu usuário não tem permissão para configurar o financeiro desta empresa.';
  if (error.status === 429)
    return 'Muitas tentativas. Aguarde um minuto antes de validar novamente.';
  return `Não foi possível concluir a validação (HTTP ${error.status}). A conta não foi salva.`;
}
