import Anthropic from '@anthropic-ai/sdk';
import { tools, getToolByName, ToolResult } from '../tools';
import { SYSTEM_PROMPT, createUserPrompt } from './prompts';

export class AgentIQ {
  private client: Anthropic;
  private maxIterations = 10;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async run(question: string): Promise<string> {
    console.log(`\n🤔 Question: ${question}\n`);

    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: createUserPrompt(question) }
    ];

    let iteration = 0;

    while (iteration < this.maxIterations) {
      iteration++;
      console.log(`\n--- Iteration ${iteration} ---`);

      // Call Claude with tools
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages,
        tools: this.formatToolsForClaude(),
      });

      console.log(`Stop   reason: ${response.stop_reason}`);

      // Check if Claude wants to use a tool
      const toolUseBlock = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      if (!toolUseBlock) {
        // No tool use - Claude has final answer
        const textBlock = response.content.find(
          (block): block is Anthropic.TextBlock => block.type === 'text'
        );
        return textBlock?.text || 'No response generated';
      }

      // Execute the tool
      console.log(`🔧 Using tool: ${toolUseBlock.name}`);
      console.log(`Parameters:`, JSON.stringify(toolUseBlock.input, null, 2));

      const tool = getToolByName(toolUseBlock.name);
      if (!tool) {
        throw new Error(`Tool ${toolUseBlock.name} not found`);
      }

      const toolResult: ToolResult = await tool.execute(toolUseBlock.input);
      console.log(`Result:`, toolResult.success ? '✅ Success' : '❌ Failed');

      // Add assistant response and tool result to messages
      messages.push({ role: 'assistant', content: response.content });
      messages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUseBlock.id,
            content: JSON.stringify(toolResult),
          },
        ],
      });

      // If tool failed and no more content, return error
      if (!toolResult.success && response.stop_reason === 'end_turn') {
        return `Tool execution failed: ${toolResult.error}`;
      }
    }

    return `Max iterations (${this.maxIterations}) reached without final answer`;
  }

  private formatToolsForClaude() {
    return tools.map(tool => {
      // Get shape directly as property, not function call
      const shape = (tool.parameters as any)._def.shape;
      
      return {
        name: tool.name,
        description: tool.description,
        input_schema: {
          type: 'object' as const,
          properties: this.zodToJsonSchema(tool.parameters),
          required: Object.keys(shape),
        },
      };
    });
  }

  private zodToJsonSchema(schema: any): Record<string, any> {
    // Access shape as property, not function
    const shape = schema._def.shape;
    
    const properties: Record<string, any> = {};
  
    for (const [key, zodType] of Object.entries(shape)) {
      const typeDef = (zodType as any)._def;
      
      // Handle different Zod types
      if (typeDef.typeName === 'ZodString') {
        properties[key] = { 
          type: 'string',
          description: typeDef.description || undefined
        };
      } else if (typeDef.typeName === 'ZodNumber') {
        properties[key] = { 
          type: 'number',
          description: typeDef.description || undefined
        };
      } else if (typeDef.typeName === 'ZodArray') {
        properties[key] = { 
          type: 'array',
          description: typeDef.description || undefined,
          items: { type: 'object' }
        };
      } else if (typeDef.typeName === 'ZodEnum') {
        properties[key] = { 
          type: 'string',
          enum: typeDef.values,
          description: typeDef.description || undefined
        };
      } else if (typeDef.typeName === 'ZodOptional') {
        const innerType = typeDef.innerType._def;
        properties[key] = { 
          type: innerType.typeName === 'ZodString' ? 'string' : 'object',
          description: innerType.description || undefined
        };
      } else {
        properties[key] = { type: 'string' };
      }
    }
  
    return properties;
  }
}