import { Tool } from './types';
import { chartTool } from './chartTool';
import { emailTool } from './emailTool';
import { webSearchTool } from './webSearchTool';
import { forecastTool } from './forecastTool';
import { queryAnalyticsTool } from './queryAnalyticsTool';

export const tools: Tool[] =
[
  chartTool,
  emailTool,
  webSearchTool,
  forecastTool,
  queryAnalyticsTool,
];

export function getToolByName(name: string): Tool | undefined {
  return tools.find(tool => tool.name === name);
}

export * from './types';