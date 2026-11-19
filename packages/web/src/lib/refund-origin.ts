export function refundOriginLabel(origin?: string | null) {
  return origin === 'assisted' ? 'Com clique' : origin === 'natural' ? 'Sem clique' : 'Não identificado';
}
