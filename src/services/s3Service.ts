import { PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';
import path from 'path';
import { S3Client } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function uploadChartToS3(localPath: string): Promise<string> {
  try {
    const fileContent = readFileSync(localPath);
    const fileName = path.basename(localPath);
    
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: `charts/${fileName}`,
      Body: fileContent,
      ContentType: 'image/png',
    });

    await s3.send(command);
    
    const url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/charts/${fileName}`;
    
    return url;
  } catch (error) {
    console.error('❌ S3 upload failed:', error);
    throw error;
  }
}