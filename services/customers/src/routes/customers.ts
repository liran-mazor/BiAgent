import { Router } from 'express';
import { registerCustomer } from '../services/customersService';

const router = Router();

router.post('/', async (req, res) => {
  const { id, email, name, registeredAt } = req.body;

  if (!id || !email || !name || !registeredAt) {
    res.status(400).json({ error: 'Missing required fields: id, email, name, registeredAt' });
    return;
  }

  await registerCustomer({ id, email, name, registeredAt });
  res.status(201).json({ id });
});

export { router as customersRouter };
