import Anthropic from '@anthropic-ai/sdk';
import { tools, getToolByName } from '../tools';
import { SYSTEM_PROMPT, createUserPrompt } from './prompts';
import { getCachedResponse, cacheResponse } from '../services/cacheService';
import { MCPClient } from '../mcp/client.js';
import { MCPTool } from '../mcp/types.js';
import { zodToJsonSchema } from '../utils/zodToJsonSchema.js';
import { routeQuery } from '../services/routerService.js';

export class Agent {
  private client: Anthropic;
  private maxIterations = 10;
  private conversationHistories: Map<string, Anthropic.MessageParam[]> = new Map();

  constructor(
    apiKey: string,
    private mcpTools: MCPTool[] = [],
    private mcpClientMap: Map<string, MCPClient> = new Map()
  ) {
    this.client = new Anthropic({ apiKey });
  }

  public async run(
    question: string,
    sessionId: string,
    maxHistoryMessages?: number
  ): Promise<string> {
    console.log(`\n🤔 Question: ${question}\n`);
  
    // Check cache first
    console.log('🔍 Checking cache...');
    const cachedResponse = await getCachedResponse(question);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const complexity = await routeQuery(question);
    const model = complexity === 'simple' 
      ? 'claude-3-5-haiku-20241022' 
      : 'claude-sonnet-4-20250514';
    console.log(`🤖 Using model: ${model}\n`);

    let messages = this.conversationHistories.get(sessionId) || [];
    
    // Apply sliding window if maxHistoryMessages is set
    if (maxHistoryMessages && messages.length > maxHistoryMessages) {
      console.log(`📊 Trimming conversation history: ${messages.length} -> ${maxHistoryMessages} messages`);
      messages = messages.slice(-maxHistoryMessages);
    }
    
    messages.push({ role: 'user', content: createUserPrompt(question) });
  
    let iteration = 0;
  
    while (iteration < this.maxIterations) {
      iteration++;
      console.log(`\n--- Iteration ${iteration} ---`);
  
      // Call Claude with tools (native + MCP)
      const response = await this.client.messages.create({
        model: model,
        max_tokens: 4096,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' }
          }
        ],
        messages,
        tools: this.formatToolsForClaude(),
      });
  
      console.log(`Stop reason: ${response.stop_reason}`);
  
      // Check if Claude wants to use tools (can be multiple)
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );
  
      if (toolUseBlocks.length === 0) {
        // No tool use - Claude has final answer
        const textBlock = response.content.find(
          (block): block is Anthropic.TextBlock => block.type === 'text'
        );
        
        messages.push({ role: 'assistant', content: response.content });
        
        this.conversationHistories.set(sessionId, messages);
        
        const finalResponse = textBlock?.text || 'No response generated';
        
        // Cache the final response
        await cacheResponse(question, finalResponse);
        
        return finalResponse;
      }
  
      // Execute tools in parallel (both native and MCP)
      console.log(`🔧 Using ${toolUseBlocks.length} tool(s): ${toolUseBlocks.map(b => b.name).join(', ')}`);
  
      const toolExecutions = toolUseBlocks.map(async (toolUseBlock) => {
        console.log(`  → ${toolUseBlock.name}:`, JSON.stringify(toolUseBlock.input, null, 2));
        
        // Check if it's a native tool
        const nativeTool = getToolByName(toolUseBlock.name);
        if (nativeTool) {
          const result = await nativeTool.execute(toolUseBlock.input);
          console.log(`  ← ${toolUseBlock.name} (native):`, result.success ? '✅ Success' : '❌ Failed');
          
          return {
            tool_use_id: toolUseBlock.id,
            result
          };
        }
        
        // Check if it's an MCP tool
        const mcpTool = this.mcpTools.find(t => t.name === toolUseBlock.name);
        if (mcpTool) {
          try {
            // Find the client that has this tool
            const client = this.mcpClientMap.get(toolUseBlock.name);
            if (!client) {
              throw new Error(`No MCP client found for tool: ${toolUseBlock.name}`);
            }
            
            const mcpResult = await client.callTool(toolUseBlock.name, toolUseBlock.input);
            
            console.log(`  ← ${toolUseBlock.name} (MCP):`, '✅ Success');
            
            return {
              tool_use_id: toolUseBlock.id,
              result: {
                success: true,
                data: mcpResult
              }
            };
          } catch (error: any) {
            console.log(`  ← ${toolUseBlock.name} (MCP):`, '❌ Failed');
            
            return {
              tool_use_id: toolUseBlock.id,
              result: {
                success: false,
                error: error.message
              }
            };
          }
        }
        
        throw new Error(`Tool ${toolUseBlock.name} not found in native or MCP tools`);
      });
  
      const toolResults = await Promise.all(toolExecutions);
  
      // Add assistant response and all tool results to messages
      messages.push({ role: 'assistant', content: response.content });
      messages.push({
        role: 'user',
        content: toolResults.map(({ tool_use_id, result }) => ({
          type: 'tool_result' as const,
          tool_use_id,
          content: JSON.stringify(result),
        })),
      });
  
      // Check if any tool failed
      const anyFailed = toolResults.some(({ result }) => !result.success);
      if (anyFailed && response.stop_reason === 'end_turn') {
        const failedTools = toolResults.filter(({ result }) => !result.success);
        return `Tool execution failed: ${failedTools.map(({ result }) => result.error).join(', ')}`;
      }
    }
  
    return `Max iterations (${this.maxIterations}) reached without final answer`;
  }

  private formatToolsForClaude() {
    // Native tools
    const nativeTools = tools.map(tool => {
      const shape = (tool.parameters as any)._def.shape;
      
      return {
        name: tool.name,
        description: tool.description,
        input_schema: {
          type: 'object' as const,
          properties: zodToJsonSchema(tool.parameters),
          required: Object.keys(shape),
        },
      };
    });

    // MCP tools (already in correct format)
    const mcpToolsFormatted = this.mcpTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));

    return [...nativeTools, ...mcpToolsFormatted];
  }
}