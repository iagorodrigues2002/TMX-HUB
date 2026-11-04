export function loginDestination(value: string | null) {
  return value?.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !Array.from(value).some((character) => character.charCodeAt(0) <= 32)
    ? value
    : '/';
}

export function loginFailure(error: unknown) {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number(error.status)
      : Number(
          error instanceof Error ? error.message.match(/\bHTTP\s+(\d{3})\b/i)?.[1] : Number.NaN,
        );
  if (status === 401) return 'E-mail ou senha não conferem. Revise os dados e tente novamente.';
  if (status === 403)
    return 'Seu acesso não foi autorizado. Fale com o administrador da sua empresa.';
  if (status === 429)
    return 'Muitas tentativas de acesso. Aguarde alguns instantes antes de tentar novamente.';
  if (status >= 500)
    return 'O serviço de acesso encontrou um problema. Tente novamente em instantes. Se continuar, fale com o administrador.';
  return 'Não foi possível entrar. Verifique sua conexão e tente novamente. Se continuar, fale com o administrador.';
}
