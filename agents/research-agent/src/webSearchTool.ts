import { tavily } from '@tavily/core';
import { z } from 'zod';

const WebSearchToolParams = z.object({
  query: z.string(),
  max_results: z.number().optional().default(5),
});

export async function executeWebSearch(input: unknown): Promise<{ query: string; answer: any; results: any[]; resultsCount: number; message: string }> {
  const params = WebSearchToolParams.parse(input);

  const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });

  const response = await tvly.search(params.query, {
    maxResults: params.max_results,
    searchDepth: 'basic',
    includeAnswer: true,
    includeRawContent: false,
  });

  const results = response.results.map((result: any) => ({
    title: result.title,
    url: result.url,
    content: result.content,
    score: result.score,
  }));

  return {
    query: params.query,
    answer: response.answer,
    results,
    resultsCount: results.length,
    message: `Found ${results.length} results for: "${params.query}"`,
  };
}
