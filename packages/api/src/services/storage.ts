import { Transform, type TransformCallback } from 'node:stream';
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';
import { env } from '../env.js';
import { BadRequestError, NotFoundError } from '../lib/problem.js';

export interface StorageObject {
  body: Buffer;
  contentType?: string;
  contentLength?: number;
}

export interface PutOptions {
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
}

export class StorageService {
  readonly client: S3Client;
  readonly bucket: string;

  constructor() {
    this.client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
      },
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    });
    this.bucket = env.S3_BUCKET;
  }

  async ping(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  async put(key: string, body: Buffer | string, opts: PutOptions = {}): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: opts.contentType,
        CacheControl: opts.cacheControl,
        Metadata: opts.metadata,
      }),
    );
  }

  /**
   * Streaming upload com multipart paralelo. Pra arquivos grandes (>10MB)
   * é ~2-3x mais rápido que `put` porque parts vão em paralelo enquanto
   * o stream da requisição ainda está chegando.
   *
   * Conta bytes inline e força aborto quando excede `maxBytes` (defesa
   * contra requests sem Content-Length confiável).
   */
  async putStream(
    key: string,
    body: Readable,
    opts: PutOptions & { maxBytes?: number; partSize?: number; queueSize?: number } = {},
  ): Promise<{ bytes: number }> {
    const counter = new ByteCounterTransform(opts.maxBytes);
    body.pipe(counter);

    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: counter,
        ContentType: opts.contentType,
        CacheControl: opts.cacheControl,
        Metadata: opts.metadata,
      },
      partSize: opts.partSize ?? 5 * 1024 * 1024, // 5MB
      queueSize: opts.queueSize ?? 4,             // 4 parts em paralelo
      leavePartsOnError: false,
    });

    try {
      await upload.done();
    } catch (err) {
      // Se o counter abortou por exceder limite, propaga como 400.
      if (err instanceof Error && err.message.startsWith('STREAM_LIMIT_EXCEEDED')) {
        throw new BadRequestError(err.message.replace('STREAM_LIMIT_EXCEEDED:', '').trim());
      }
      throw err;
    }

    return { bytes: counter.bytes };
  }

  async get(key: string): Promise<StorageObject> {
    try {
      const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const body = await streamToBuffer(out.Body);
      return {
        body,
        contentType: out.ContentType,
        contentLength: out.ContentLength,
      };
    } catch (err) {
      if (isNoSuchKey(err)) {
        throw new NotFoundError(`Object not found: ${key}`);
      }
      throw err;
    }
  }

  async getJson<T>(key: string): Promise<T> {
    const obj = await this.get(key);
    return JSON.parse(obj.body.toString('utf-8')) as T;
  }

  async putJson(key: string, value: unknown): Promise<void> {
    await this.put(key, Buffer.from(JSON.stringify(value), 'utf-8'), {
      contentType: 'application/json; charset=utf-8',
    });
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async deletePrefix(prefix: string): Promise<number> {
    let total = 0;
    let continuationToken: string | undefined;
    do {
      const listed = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      const objects =
        listed.Contents?.filter((o): o is { Key: string } => Boolean(o.Key)).map((o) => ({
          Key: o.Key,
        })) ?? [];
      if (objects.length > 0) {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: objects, Quiet: true },
          }),
        );
        total += objects.length;
      }
      continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (continuationToken);
    return total;
  }

  async presignGet(key: string, expiresInSec: number, downloadFilename?: string): Promise<string> {
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(downloadFilename
        ? { ResponseContentDisposition: `attachment; filename="${downloadFilename}"` }
        : {}),
    });
    return getSignedUrl(this.client, cmd, { expiresIn: expiresInSec });
  }

  async close(): Promise<void> {
    this.client.destroy();
  }
}

/**
 * Transform que conta bytes e aborta o stream se exceder o limite.
 * Erro carrega prefixo "STREAM_LIMIT_EXCEEDED:" pra ser mapeado em 400.
 */
class ByteCounterTransform extends Transform {
  bytes = 0;
  constructor(private readonly maxBytes?: number) {
    super();
  }
  override _transform(chunk: Buffer, _enc: BufferEncoding, cb: TransformCallback): void {
    this.bytes += chunk.length;
    if (this.maxBytes !== undefined && this.bytes > this.maxBytes) {
      cb(
        new Error(
          `STREAM_LIMIT_EXCEEDED: arquivo excedeu o limite de ${this.maxBytes} bytes`,
        ),
      );
      return;
    }
    cb(null, chunk);
  }
}

async function streamToBuffer(stream: unknown): Promise<Buffer> {
  if (!stream) return Buffer.alloc(0);
  if (Buffer.isBuffer(stream)) return stream;
  if (stream instanceof Uint8Array) return Buffer.from(stream);
  // Node Readable stream
  const chunks: Buffer[] = [];
  const asyncIter = stream as AsyncIterable<Buffer | Uint8Array | string>;
  for await (const chunk of asyncIter) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function isNoSuchKey(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === 'NoSuchKey' || e.Code === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404;
}
