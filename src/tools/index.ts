import { Tool } from './types';
import { sqlTool } from './sqlTool';
import { chartTool } from './chartTool';
import { emailTool } from './emailTool';
import { webSearchTool } from './webSearchTool';  
import { calculatorTool } from './calculatorTool';
import { monitoringTool } from './monitoringTool';

export const tools: Tool[] = [sqlTool, chartTool, emailTool, webSearchTool, calculatorTool, monitoringTool];

export function getToolByName(name: string): Tool | undefined {
  return tools.find(tool => tool.name === name);
}

export * from './types';
export { sqlTool, chartTool, emailTool, webSearchTool, calculatorTool, monitoringTool };