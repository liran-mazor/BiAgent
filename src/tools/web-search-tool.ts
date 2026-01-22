import { tavily } from '@tavily/core';
import { z } from 'zod';
import { Tool, ToolResult } from './types';

export const WebSearchToolParams = z.object({
  query: z.string().describe('Search query to find information on the web'),
  max_results: z.number().optional().default(5).describe('Maximum number of results to return (default: 5)'),
});

export type WebSearchToolInput = z.infer<typeof WebSearchToolParams>;

export const webSearchTool: Tool = {
  name: 'web_search',
  description: 'Search the web for current information, industry benchmarks, statistics, news, or any information not available in the database. Use this when you need external data to compare with internal metrics or answer questions requiring current information.',
  parameters: WebSearchToolParams,
  execute: async (params: WebSearchToolInput): Promise<ToolResult> => {
    try {
      // Initialize Tavily client
      const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });
  
      // Perform search
      const response = await tvly.search(params.query, {
        maxResults: params.max_results,
        searchDepth: 'basic', // 'basic' or 'advanced'
        includeAnswer: true,  // Get AI-generated answer summary
        includeRawContent: false,
      });
  
      // Extract relevant information
      const results = response.results.map((result: any) => ({
        title: result.title,
        url: result.url,
        content: result.content,
        score: result.score,
      }));
  
      return {
        success: true,
        data: {
          query: params.query,
          answer: response.answer, // AI-generated summary answer
          results: results,
          resultsCount: results.length,
          message: `Found ${results.length} results for: "${params.query}"`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to perform web search',
      };
    }
  },
};