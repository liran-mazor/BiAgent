import Anthropic from '@anthropic-ai/sdk';
import { anthropic } from '../config/clients';
import { SYSTEM_PROMPT, createUserPrompt } from './prompts.js';
import { tools, getToolByName } from '../tools';
import { MCPTool } from '../mcp/types.js';
import { MCPClient } from '../mcp/client.js';
import { A2ATool } from '../a2a/types.js';
import { initializeA2ATools } from '../a2a/forecastClient.js';
import { initializeMCPClients, cleanupMCPClients } from '../mcp/bootstrap.js';
import { mcpServers } from '../mcp/mcpServers.js';
import { routeQuery } from '../services/routerService.js';
import { getCachedResponse, cacheResponse } from '../services/cacheService';
import { summarizeHistory } from '../services/summaryService.js';
import { getCircuitBreaker, getOpenCircuits } from '../utils/circuitBreaker';
import { zodToJsonSchema } from '../utils/zodToJsonSchema.js';

export class Agent {
  private client: Anthropic;
  private maxIterations = 15;
  private conversationHistories: Map<string, Anthropic.MessageParam[]> = new Map();
  private tokenUsageBySession: Map<string, number> = new Map();

  private a2aTools: A2ATool[] = [];
  private a2aInitPromise: Promise<void> | null = null;

  private mcpTools: MCPTool[] = [];
  private mcpClients: MCPClient[] = [];
  private mcpClientMap: Map<string, MCPClient> = new Map();
  private mcpInitPromise: Promise<void> | null = null;

  constructor() {
    this.client = anthropic;
  }

  public async run(
    question: string,
    sessionId: string
  ): Promise<string> {
    console.log(`\n🤔  ${question}\n`);

    await Promise.all([this.initializeMCP(), this.initializeA2A()]);

    const cachedResponse = await getCachedResponse(question);
    if (cachedResponse) {
      console.log(`\n${'─'.repeat(60)}\n📊  ${cachedResponse}\n`);
      return cachedResponse;
    }

    const model = await routeQuery(question);

    const formattedTools = this.formatToolsForClaude();

    let messages = this.conversationHistories.get(sessionId) || [];

    messages = await this.manageContext(messages, sessionId);

    messages.push({ role: 'user', content: createUserPrompt(question, getOpenCircuits()) });

    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      console.log(`\n  [Iteration ${iteration}]`);
      
      const response = await this.callLLM(model, messages, formattedTools);
      
      console.log(`    Stop reason : ${response.stop_reason}`);
      
      this.trackTokenUsage(sessionId, response.usage);

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      if (toolUseBlocks.length > 0) {
        for (const b of toolUseBlocks) {
          console.log(`    Tool        : ${b.name}`);
          console.log(`    Input       : ${JSON.stringify(b.input)}`);
        }
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
      } else {
        return await this.handleFinalResponse(response, messages, question, sessionId);
      }
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

  private initializeMCP(): Promise<void> {
    if (!this.mcpInitPromise) {
      this.mcpInitPromise = initializeMCPClients(mcpServers)
        .then(({ mcpClients, mcpTools, mcpClientMap }) => {
          this.mcpClients = mcpClients;
          this.mcpTools = mcpTools;
          this.mcpClientMap = mcpClientMap;
        })
        .catch(err => {
          this.mcpInitPromise = null;
          console.warn(`⚠️ MCP tools unavailable: ${err.message}`);
        });
    }
    return this.mcpInitPromise;
  }

  private initializeA2A(): Promise<void> {
    if (!this.a2aInitPromise) {
      this.a2aInitPromise = initializeA2ATools()
        .then(tools => { this.a2aTools = tools; })
        .catch(err => {
          this.a2aInitPromise = null;
          console.warn(`⚠️ A2A tools unavailable: ${err.message}`);
        });
    }
    return this.a2aInitPromise;
  }

  private formatToolsForClaude() {
    const nativeTools = tools.map(tool => {
      return {
        name: tool.name,
        description: tool.description,
        input_schema: {
          type: 'object' as const,
          properties: zodToJsonSchema(tool.parameters),
          required: Object.keys(tool.parameters.shape),
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

  private trackTokenUsage(sessionId: string, usage: { input_tokens: number; output_tokens: number }) {
    const sessionTokens = (this.tokenUsageBySession.get(sessionId) ?? 0) + usage.input_tokens + usage.output_tokens;
    this.tokenUsageBySession.set(sessionId, sessionTokens);
  }

  private async manageContext(messages: Anthropic.MessageParam[], sessionId: string) {
    if (messages.length === 0) return messages;

    const tokensUsed = this.tokenUsageBySession.get(sessionId) ?? 0;
    if (tokensUsed > 170000) {
      console.log(`\n📊 Token limit approaching (${tokensUsed} tokens), summarizing...\n`);
      const midpoint = Math.floor(messages.length / 2);
      const summary = await summarizeHistory(messages.slice(0, midpoint));
      this.tokenUsageBySession.set(sessionId, 0);
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
  
    // Native tool — in-process, no retry needed
    const nativeTool = getToolByName(toolUseBlock.name);
    if (nativeTool) {
      const result = await nativeTool.execute(toolUseBlock.input);
      if (!result.success) console.log(`    ❌  ${toolUseBlock.name}  ${result.error}`);
      return { tool_use_id: toolUseBlock.id, result };
    }
  
    // MCP tool — network call, retry with exponential backoff
    const mcpTool = this.mcpTools.find(t => t.name === toolUseBlock.name);
    if (mcpTool) {
      try {
        const client = this.mcpClientMap.get(toolUseBlock.name);
        if (!client) throw new Error(`No MCP client found for tool: ${toolUseBlock.name}`);
        
        const breaker = getCircuitBreaker(toolUseBlock.name,
          (input: any) => client.callTool(toolUseBlock.name, input)
        );
        const result = await breaker.fire(toolUseBlock.input);
        return { tool_use_id: toolUseBlock.id, result: { success: true, data: result } };
      } catch (error: any) {
        console.log(`    ❌  ${toolUseBlock.name}  ${error.message}`);
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
        return { tool_use_id: toolUseBlock.id, result };
      } catch (error: any) {
        console.log(`    ❌  ${toolUseBlock.name}  ${error.message}`);
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
    console.log(`\n${'─'.repeat(60)}\n📊  ${finalResponse}\n`);
    return finalResponse;
  }
  
  public async cleanup(): Promise<void> {
    await cleanupMCPClients(this.mcpClients);
  }

}