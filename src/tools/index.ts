import { Tool } from './types';
import { sqlTool } from './sql-tool';
import { chartTool } from './chart-tool';
import { emailTool } from './email-tool';
import { webSearchTool } from './web-search-tool';  
import { calculatorTool } from './calculator-tool';
import { monitoringTool } from './monitoring-tool';

export const tools: Tool[] = [sqlTool, chartTool, emailTool, webSearchTool, calculatorTool, monitoringTool];

export function getToolByName(name: string): Tool | undefined {
  return tools.find(tool => tool.name === name);
}

export * from './types';
export { sqlTool, chartTool, emailTool, webSearchTool, calculatorTool, monitoringTool };