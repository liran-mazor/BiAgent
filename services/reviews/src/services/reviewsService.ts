import { ReviewCreatedEvent } from '@biagent/common';
import { saveReview } from '../db/reviewsRepository';

type CreateReviewInput = ReviewCreatedEvent['data'];

export async function createReview(input: CreateReviewInput): Promise<void> {
  await saveReview(input);
}
