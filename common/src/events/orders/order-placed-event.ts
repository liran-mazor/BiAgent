import { Topics } from '../../kafka/topics';

export interface OrderPlacedEvent {
  topic: Topics.OrderPlaced;
  data: {
    id: number;
    customerId: number;
    items: Array<{
      productId: number;
      quantity: number;
      price: number;
    }>;
    totalAmount: number;
    placedAt: string;
  };
}
