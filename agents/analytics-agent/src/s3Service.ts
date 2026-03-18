import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';
import path from 'path';

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function uploadChartToS3(localPath: string): Promise<string> {
  const fileContent = readFileSync(localPath);
  const fileName = path.basename(localPath);

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET!,
    Key: `charts/${fileName}`,
    Body: fileContent,
    ContentType: 'image/png',
  });

  await s3.send(command);

  return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/charts/${fileName}`;
}
