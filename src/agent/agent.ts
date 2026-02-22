import Anthropic from '@anthropic-ai/sdk';
import { anthropic } from '../config/clients';
import { SYSTEM_PROMPT, createUserPrompt } from './prompts.js';
import { tools, getToolByName } from '../tools';
import { MCPTool } from '../mcp/types.js';
import { MCPClient } from '../mcp/client.js';
import { A2ATool } from '../a2a/types.js';
import { routeQuery } from '../services/routerService.js';
import { getCachedResponse, cacheResponse } from '../services/cacheService';
import { summarizeHistory } from '../services/summaryService.js';
import { getCircuitBreaker } from '../utils/circuitBreaker';
import { zodToJsonSchema } from '../utils/zodToJsonSchema.js';

export class Agent {
  private client: Anthropic;
  private maxIterations = 15;
  private conversationHistories: Map<string, Anthropic.MessageParam[]> = new Map();
  private totalTokensUsed = 0;

  constructor(
    private mcpTools: MCPTool[] = [],
    private mcpClientMap: Map<string, MCPClient> = new Map(),
    private a2aTools: A2ATool[] = []
  ) {
    this.client = anthropic;
  }

  public async run(
    question: string,
    sessionId?: string
  ): Promise<string> {
    console.log(`\n🤔 Question: ${question}\n`);
  
    // semantic cache 
    console.log('🔍 Checking cache...');
    const cachedResponse = await getCachedResponse(question);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Route query to Haiku or Sonnet based on complexity analysis
    const model = await routeQuery(question);
    console.log(`🤖 Using model: ${model}\n`);

    const formattedTools = this.formatToolsForClaude();

    const actualSessionId = sessionId || `session_${Date.now()}`;

    let messages = this.conversationHistories.get(actualSessionId) || [];

    // count tokens, summarize if approaching limit, mark cache boundary
    messages = await this.manageContext(messages);

    messages.push({ role: 'user', content: createUserPrompt(question) });

    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      console.log(`\n--- Iteration ${iteration} ---`);

      const response = await this.callLLM(model, messages, formattedTools);
      this.totalTokensUsed += response.usage.input_tokens + response.usage.output_tokens;

      console.log(`Stop reason: ${response.stop_reason}`);

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      // laude has a final answer
      if (toolUseBlocks.length === 0) {
        return await this.handleFinalResponse(response, messages, question, actualSessionId);
      }

      console.log(`🔧 Using ${toolUseBlocks.length} tool(s): ${toolUseBlocks.map(b => b.name).join(', ')}`);

      // Execute all tool calls in parallel
      const toolResults = await Promise.all(
        toolUseBlocks.map(block => this.executeTool(block))
      );

      messages.push({ role: 'assistant', content: response.content });
      messages.push({
        role: 'user',
        content: toolResults.map(({ tool_use_id, result }) => ({
          type: 'tool_result' as const,
          tool_use_id,
          content: JSON.stringify(result),
        })),
      });

      const failureMessage = this.checkToolFailures(toolResults, response.stop_reason);
      if (failureMessage) return failureMessage;
    }

    return `Max iterations (${this.maxIterations}) reached without final answer`;
  }

  private async callLLM(
    model: string,
    messages: Anthropic.MessageParam[],
    formattedTools: any[]
  ): Promise<Anthropic.Message> {
    return this.client.messages.create({
      model,
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' }
        }
      ],
      messages,
      tools: formattedTools,
    });
  }

  private formatToolsForClaude() {
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
  
    const mcpToolsFormatted = this.mcpTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));
  
    const a2aToolsFormatted = this.a2aTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));
  
    const allTools = [...nativeTools, ...mcpToolsFormatted, ...a2aToolsFormatted];
  
    return allTools.map((tool, index) => 
      index === allTools.length - 1
        ? { ...tool, cache_control: { type: 'ephemeral' as const } }
        : tool
    );
  }

  private async manageContext(messages: Anthropic.MessageParam[]) {
    if (messages.length === 0) return messages;
  
    if (this.totalTokensUsed > 170000) {
      console.log(`📊 Token limit approaching (${this.totalTokensUsed} tokens), summarizing...`);
      const midpoint = Math.floor(messages.length / 2);
      const summary = await summarizeHistory(messages.slice(0, midpoint));
      this.totalTokensUsed = 0;
      messages = [
        { role: 'user', content: `Previous conversation summary: ${summary}` },
        ...messages.slice(midpoint)
      ];
    }
  
    return this.markHistoryCacheBoundary(messages);
  }
  
  private markHistoryCacheBoundary(messages: Anthropic.MessageParam[]) {
    const lastMessage = messages[messages.length - 1];
    const contentBlocks = typeof lastMessage.content === 'string'
      ? [{ type: 'text' as const, text: lastMessage.content }]
      : [...lastMessage.content as any[]];
  
    contentBlocks[contentBlocks.length - 1] = {
      ...contentBlocks[contentBlocks.length - 1],
      cache_control: { type: 'ephemeral' as const }
    };
  
    messages[messages.length - 1] = { ...lastMessage, content: contentBlocks };
    return messages;
  }

  private async executeTool(toolUseBlock: Anthropic.ToolUseBlock): Promise<{ tool_use_id: string; result: any }> {
    console.log(`  → ${toolUseBlock.name}:`, JSON.stringify(toolUseBlock.input, null, 2));
  
    // Native tool — in-process, no retry needed
    const nativeTool = getToolByName(toolUseBlock.name);
    if (nativeTool) {
      const result = await nativeTool.execute(toolUseBlock.input);
      console.log(`  ← ${toolUseBlock.name} (native):`, result.success ? '✅ Success' : '❌ Failed');
      return { tool_use_id: toolUseBlock.id, result };
    }
  
    // MCP tool — network call, retry with exponential backoff
    const mcpTool = this.mcpTools.find(t => t.name === toolUseBlock.name);
    if (mcpTool) {
      try {
        const client = this.mcpClientMap.get(toolUseBlock.name);
        if (!client) throw new Error(`No MCP client found for tool: ${toolUseBlock.name}`);
        
        const breaker = getCircuitBreaker(toolUseBlock.name, 
          (name: string, input: any) => client.callTool(name, input)
        );// MCP tool — network call, retry with exponential backoff
        const result = await breaker.fire(toolUseBlock.name, toolUseBlock.input);
        console.log(`  ← ${toolUseBlock.name} (MCP): ✅ Success`);
        return { tool_use_id: toolUseBlock.id, result: { success: true, data: result } };
      } catch (error: any) {
        console.log(`  ← ${toolUseBlock.name} (MCP): ❌ Failed`);
        return { tool_use_id: toolUseBlock.id, result: { success: false, error: error.message } };
      }
    }

    // A2A tool — network call, retry with exponential backoff
    const a2aTool = this.a2aTools.find(t => t.name === toolUseBlock.name);
    if (a2aTool) {
      try {
        const breaker = getCircuitBreaker(toolUseBlock.name,
          (input: any) => a2aTool.execute(input)
        );
        const result = await breaker.fire(toolUseBlock.input);
        console.log(`  ← ${toolUseBlock.name} (A2A): ✅ Success`);
        return { tool_use_id: toolUseBlock.id, result };
      } catch (error: any) {
        console.log(`  ← ${toolUseBlock.name} (A2A): ❌ Failed`);
        return { tool_use_id: toolUseBlock.id, result: { success: false, error: error.message } };
      }
    }
  
    throw new Error(`Tool ${toolUseBlock.name} not found in native, MCP, or A2A tools`);
  }

  private async handleFinalResponse(
    response: Anthropic.Message,
    messages: Anthropic.MessageParam[],
    question: string,
    sessionId: string
  ): Promise<string> {
    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );
  
    messages.push({ role: 'assistant', content: response.content });
    this.conversationHistories.set(sessionId, messages);
  
    const finalResponse = textBlock?.text || 'No response generated';
    await cacheResponse(question, finalResponse);
    return finalResponse;
  }
  
  private checkToolFailures(
    toolResults: { tool_use_id: string; result: any }[],
    stopReason: Anthropic.Messages.StopReason | null
  ): string | null {
    const anyFailed = toolResults.some(({ result }) => !result.success);
    if (anyFailed && stopReason === 'end_turn') {
      const failedTools = toolResults.filter(({ result }) => !result.success);
      return `Tool execution failed: ${failedTools.map(({ result }) => result.error).join(', ')}`;
    }
    return null;
  }
}