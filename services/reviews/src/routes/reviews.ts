import { Router } from 'express';
import { createReview } from '../services/reviewsService';

const router = Router();

router.post('/', async (req, res) => {
  const { id, productId, customerId, rating, comment, createdAt } = req.body;

  if (!id || !productId || !customerId || rating == null || !createdAt) {
    res.status(400).json({ error: 'Missing required fields: id, productId, customerId, rating, createdAt' });
    return;
  }

  if (rating < 1 || rating > 5) {
    res.status(400).json({ error: 'rating must be between 1 and 5' });
    return;
  }

  await createReview({ id, productId, customerId, rating, comment, createdAt });
  res.status(201).json({ id });
});

export { router as reviewsRouter };
