import { Router } from 'express';
import { createProduct } from '../services/catalogService';

const router = Router();

router.post('/', async (req, res) => {
  const { id, name, category, price, createdAt } = req.body;

  if (!id || !name || !category || price == null || !createdAt) {
    res.status(400).json({ error: 'Missing required fields: id, name, category, price, createdAt' });
    return;
  }

  try {
    await createProduct({ id, name, category, price, createdAt });
    res.status(201).json({ id });
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'Product already exists' });
    } else {
      console.error('[products] error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

export { router as productsRouter };
