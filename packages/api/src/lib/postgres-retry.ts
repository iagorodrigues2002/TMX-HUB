import type { Sql } from 'postgres';

const RETRY_DELAYS_MS = [100, 500, 2_000] as const;
const CONNECTION_ERROR_CODES = new Set([
  'CONNECT_TIMEOUT',
  'CONNECTION_CLOSED',
  'CONNECTION_DESTROYED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'ETIMEDOUT',
  '57P01',
  '57P02',
  '57P03',
]);
const CONNECTION_ERROR_MESSAGE =
  /connection (?:closed|ended|reset|terminated)|database system is starting up|server (?:closed the connection|is not ready)/i;

type ErrorLike = {
  code?: unknown;
  message?: unknown;
  cause?: unknown;
  errors?: unknown;
};

type RetryOptions = {
  delaysMs?: readonly number[];
  sleep?: (delayMs: number) => Promise<void>;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
};

function errorChain(error: unknown, seen = new Set<unknown>()): ErrorLike[] {
  if (!error || (typeof error !== 'object' && typeof error !== 'function') || seen.has(error)) {
    return [];
  }
  seen.add(error);
  const current = error as ErrorLike;
  const nested = Array.isArray(current.errors) ? current.errors : [];
  return [
    current,
    ...nested.flatMap((item) => errorChain(item, seen)),
    ...errorChain(current.cause, seen),
  ];
}

export function isRetryablePostgresError(error: unknown): boolean {
  return errorChain(error).some((candidate) => {
    const code = typeof candidate.code === 'string' ? candidate.code.toUpperCase() : '';
    if (CONNECTION_ERROR_CODES.has(code) || code.startsWith('08')) return true;
    return (
      typeof candidate.message === 'string' && CONNECTION_ERROR_MESSAGE.test(candidate.message)
    );
  });
}

const defaultSleep = (delayMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });

export async function withPostgresConnectionRetry<T>(
  operation: () => PromiseLike<T>,
  options: RetryOptions = {},
): Promise<T> {
  const delaysMs = options.delaysMs ?? RETRY_DELAYS_MS;
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const delayMs = delaysMs[attempt];
      if (delayMs === undefined || !isRetryablePostgresError(error)) throw error;
      options.onRetry?.(error, attempt + 1, delayMs);
      await sleep(delayMs);
    }
  }
}

function isTemplateStringsArray(value: unknown): value is TemplateStringsArray {
  return Array.isArray(value) && Object.hasOwn(value, 'raw');
}

export function createResilientPostgresClient(client: Sql, options: RetryOptions = {}): Sql {
  return new Proxy(client, {
    apply(target, _thisArg, argumentsList) {
      if (!isTemplateStringsArray(argumentsList[0])) {
        return Reflect.apply(target, client, argumentsList);
      }
      return withPostgresConnectionRetry(
        () => Reflect.apply(target, client, argumentsList),
        options,
      );
    },
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(client) : value;
    },
  }) as Sql;
}
