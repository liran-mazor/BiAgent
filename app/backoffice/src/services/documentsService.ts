import { DocumentUploadedEvent } from '@biagent/common';
import { saveDocument } from '../db/documentsRepository';

type UploadDocumentInput = DocumentUploadedEvent['data'];

export async function uploadDocument(input: UploadDocumentInput): Promise<void> {
  await saveDocument(input);
}
