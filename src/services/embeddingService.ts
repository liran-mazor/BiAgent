import { openai } from '../config/clients';

export async function embedQuery(query: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: query,
   
  });
  const embedding = response.data[0].embedding;
  return embedding;
}