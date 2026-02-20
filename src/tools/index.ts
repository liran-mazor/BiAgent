import { Tool } from './types';
import { chartTool } from './chartTool';
import { emailTool } from './emailTool';
import { webSearchTool } from './webSearchTool';  
import { calculatorTool } from './calculatorTool';

export const tools: Tool[] = 
[
  chartTool, 
  emailTool, 
  webSearchTool, 
  calculatorTool,
];

export function getToolByName(name: string): Tool | undefined {
  return tools.find(tool => tool.name === name);
}

export * from './types';