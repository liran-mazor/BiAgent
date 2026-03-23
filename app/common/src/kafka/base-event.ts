import { Topics } from './topics';

export interface KafkaEvent {
  topic: Topics;
  data: any;
}
