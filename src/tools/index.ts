import { Tool } from './types';
import { chartTool } from './chartTool';
import { emailTool } from './emailTool';
import { webSearchTool } from './webSearchTool';
import { forecastTool } from './forecastTool';

export const tools: Tool[] =
[
  chartTool,
  emailTool,
  webSearchTool,
  forecastTool,
];

export function getToolByName(name: string): Tool | undefined {
  return tools.find(tool => tool.name === name);
}

export * from './types';