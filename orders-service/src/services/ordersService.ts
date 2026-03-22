import { OrderPlacedEvent } from '@biagent/common';
import { saveOrder } from '../db/ordersRepository';

type PlaceOrderInput = OrderPlacedEvent['data'];

export async function placeOrder(input: PlaceOrderInput): Promise<void> {
  await saveOrder(input);
}
