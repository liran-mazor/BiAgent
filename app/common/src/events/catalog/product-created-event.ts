import { Topics } from '../../kafka/topics';

export interface ProductCreatedEvent {
  topic: Topics.ProductCreated;
  data: {
    id: number;
    name: string;
    category: string;
    price: number;
    createdAt: string;
  };
}
