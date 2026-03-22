import express from 'express';
import { documentsRouter } from './routes/documents';

const app = express();
app.use('/documents', documentsRouter);

export default app;
