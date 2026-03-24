import { Topics, DocumentUploadedEvent } from '@biagent/common';
import { pool } from './pool';

type Document = DocumentUploadedEvent['data'];

export async function saveDocument(doc: Document): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO documents(id, s3_key, s3_url, content_type, uploaded_at)
       VALUES($1, $2, $3, $4, $5)`,
      [doc.id, doc.s3Key, doc.s3Url, doc.contentType, doc.uploadedAt],
    );

    await client.query(
      `INSERT INTO outbox(aggregate_type, aggregate_id, type, payload) VALUES($1, $2, $3, $4)`,
      [Topics.DocumentUploaded, String(doc.id), 'DocumentUploaded', JSON.stringify(doc)],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
