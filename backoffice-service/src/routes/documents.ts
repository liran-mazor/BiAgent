import { Router } from 'express';
import multer from 'multer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { uploadDocument } from '../services/documentsService';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'eu-north-1' });
const BUCKET = process.env.AWS_S3_BUCKET!;

/**
 * POST /documents
 * Accepts a file upload (multipart/form-data, field: "file").
 * Uploads to S3 → saves metadata to DB + outbox → Kafka delivers to knowledge-agent.
 */
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Missing file — send as multipart/form-data field "file"' });
    return;
  }

  const id          = uuidv4();
  const ext         = req.file.originalname.split('.').pop() ?? 'bin';
  const s3Key       = `documents/${id}.${ext}`;
  const contentType = req.file.mimetype;

  try {
    await s3.send(new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         s3Key,
      Body:        req.file.buffer,
      ContentType: contentType,
    }));

    const s3Url      = `https://${BUCKET}.s3.amazonaws.com/${s3Key}`;
    const uploadedAt = new Date().toISOString();

    await uploadDocument({ id, s3Key, s3Url, contentType, uploadedAt });

    res.status(201).json({ id, s3Url });
  } catch (err: any) {
    console.error('[documents] error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

export { router as documentsRouter };
