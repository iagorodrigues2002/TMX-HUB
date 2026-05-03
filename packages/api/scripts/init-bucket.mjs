import { S3Client, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  endpoint: 'http://localhost:9000',
  region: 'us-east-1',
  credentials: { accessKeyId: 'minioadmin', secretAccessKey: 'minioadmin' },
  forcePathStyle: true,
});

const Bucket = 'clones';

try {
  await s3.send(new HeadBucketCommand({ Bucket }));
  console.log(`bucket "${Bucket}" already exists`);
} catch {
  await s3.send(new CreateBucketCommand({ Bucket }));
  console.log(`bucket "${Bucket}" created`);
}
