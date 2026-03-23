import { Topics } from '../../kafka/topics';

export interface CustomerRegisteredEvent {
  topic: Topics.CustomerRegistered;
  data: {
    id: number;
    email: string;
    name: string;
    registeredAt: string;
  };
}
