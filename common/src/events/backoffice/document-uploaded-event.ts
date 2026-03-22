import { Topics } from '../../kafka/topics';

export interface DocumentUploadedEvent {
  topic: Topics.DocumentUploaded;
  data: {
    id: string;          // uuid
    s3Key: string;       // S3 object key — used by knowledge-agent to download + ingest
    s3Url: string;
    contentType: string;
    uploadedAt: string;
  };
}
