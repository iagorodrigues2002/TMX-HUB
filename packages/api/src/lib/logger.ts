import pino, { type DestinationStream, type LoggerOptions } from 'pino';
import { env } from '../env.js';

const isDev = env.NODE_ENV !== 'production';
const REDACTED = '[REDACTED]';

const piiFields = [
  'email',
  'phone',
  'cpf',
  'cnpj',
  'document',
  'ip',
  'ip_address',
  'client_ip',
  'user_agent',
  'userAgent',
  'address',
  'authorization',
  'cookie',
  'cookies',
] as const;

const secretFields = ['password', 'secret', 'token', 'access_token', 'webhook', 'webhookUrl'];
const redactFieldPaths = [...piiFields, ...secretFields].flatMap((field) => [
  field,
  `*.${field}`,
  `*.*.${field}`,
  `*.*.*.${field}`,
]);

const sensitiveUrlParameters = new Set([
  'email',
  'phone',
  'cpf',
  'cnpj',
  'document',
  'ip',
  'user_agent',
  'address',
  'authorization',
  'cookie',
  'cookies',
  'token',
  'access_token',
  'password',
]);

export function sanitizeLogUrl(value: string): string {
  const absolute = /^[a-z][a-z\d+.-]*:\/\//i.test(value);
  try {
    const url = new URL(value, 'http://logger.invalid');
    for (const key of [...url.searchParams.keys()]) {
      if (sensitiveUrlParameters.has(key.toLowerCase())) {
        url.searchParams.set(key, REDACTED);
      }
    }
    return absolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value.replace(
      /([?&](?:email|phone|cpf|cnpj|document|ip|user_agent|address|authorization|cookies?|token|access_token|password)=)[^&#]*/gi,
      `$1${REDACTED}`,
    );
  }
}

function loggerOptions(pretty: boolean): LoggerOptions {
  return {
    level: env.LOG_LEVEL,
    redact: {
      paths: [
        ...redactFieldPaths,
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
        'headers.authorization',
        'headers.cookie',
        'headers["set-cookie"]',
        'env.S3_SECRET_KEY',
        'env.WEBHOOK_SECRET',
      ],
      censor: REDACTED,
    },
    serializers: {
      req(request) {
        const serialized = pino.stdSerializers.req(request) as unknown as Record<string, unknown>;
        if (typeof serialized.url === 'string') serialized.url = sanitizeLogUrl(serialized.url);
        return serialized;
      },
      url(value) {
        return typeof value === 'string' ? sanitizeLogUrl(value) : value;
      },
      requestUrl(value) {
        return typeof value === 'string' ? sanitizeLogUrl(value) : value;
      },
    },
    ...(pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:HH:MM:ss.l',
              ignore: 'pid,hostname',
            },
          },
        }
      : {}),
  };
}

export function createLogger(options: { destination?: DestinationStream; pretty?: boolean } = {}) {
  return pino(loggerOptions(options.pretty ?? isDev), options.destination);
}

export const logger = createLogger();

export type Logger = typeof logger;
