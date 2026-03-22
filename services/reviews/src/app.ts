import express from 'express';
import { reviewsRouter } from './routes/reviews';

const app = express();
app.use(express.json());
app.use('/reviews', reviewsRouter);

export default app;
