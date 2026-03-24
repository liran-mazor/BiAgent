import express from 'express';
import { documentsRouter } from './routes/documents';

const app = express();
app.use(express.json());
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/documents', documentsRouter);

export default app;
