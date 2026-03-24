import express from 'express';
import { productsRouter } from './routes/products';

const app = express();
app.use(express.json());
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/products', productsRouter);

export default app;
