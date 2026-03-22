import express from 'express';
import { customersRouter } from './routes/customers';

const app = express();
app.use(express.json());
app.use('/customers', customersRouter);

export default app;
