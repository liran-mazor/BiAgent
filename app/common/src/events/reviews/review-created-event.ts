import { Topics } from '../../kafka/topics';

export interface ReviewCreatedEvent {
  topic: Topics.ReviewCreated;
  data: {
    id: number;
    productId: number;
    customerId: number;
    rating: number;
    comment?: string;
    createdAt: string;
  };
}
