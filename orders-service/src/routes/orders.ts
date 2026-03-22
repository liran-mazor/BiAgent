import { Router } from 'express';
import { placeOrder } from '../services/ordersService';

const router = Router();

router.post('/', async (req, res) => {
  const { id, customerId, items, totalAmount, placedAt } = req.body;

  if (!id || !customerId || !Array.isArray(items) || !totalAmount || !placedAt) {
    res.status(400).json({ error: 'Missing required fields: id, customerId, items, totalAmount, placedAt' });
    return;
  }

  await placeOrder({ id, customerId, items, totalAmount, placedAt });
  res.status(201).json({ id });
});

export { router as ordersRouter };
