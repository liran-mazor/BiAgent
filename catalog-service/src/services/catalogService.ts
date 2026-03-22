import { ProductCreatedEvent } from '@biagent/common';
import { saveProduct } from '../db/productsRepository';

type CreateProductInput = ProductCreatedEvent['data'];

export async function createProduct(input: CreateProductInput): Promise<void> {
  await saveProduct(input);
}
