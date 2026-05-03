import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../env.js';
import { NotFoundError } from '../lib/problem.js';

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
