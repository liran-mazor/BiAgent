import { Tool } from './types';
import { sqlTool } from './sql-tool';
import { chartTool } from './chart-tool';
import { emailTool } from './email-tool';
import { webSearchTool } from './web-search-tool';  

export const tools: Tool[] = [sqlTool, chartTool, emailTool, webSearchTool];

export function getToolByName(name: string): Tool | undefined {
  return tools.find(tool => tool.name === name);
}

export * from './types';
export { sqlTool, chartTool, emailTool, webSearchTool };