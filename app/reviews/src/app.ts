import express from 'express';
import { reviewsRouter } from './routes/reviews';

const app = express();
app.use(express.json());
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/reviews', reviewsRouter);

export default app;
