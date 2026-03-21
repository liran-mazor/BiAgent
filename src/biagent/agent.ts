import Anthropic from '@anthropic-ai/sdk';
import { anthropic } from '../config/clients';
import { SYSTEM_PROMPT, createUserPrompt } from './prompts.js';
import { MODEL } from './models.js';
import { tools, getToolByName } from '../tools/index.js';
import { MCPTool } from '../mcp/types.js';
import { MCPClient } from '../mcp/client.js';
import { initializeMCPClients, cleanupMCPClients } from '../mcp/bootstrap.js';
import { mcpServers } from '../mcp/mcpServers.js';
import { A2ATool } from '../a2a/types.js';
import { initializeA2ATools } from '../a2a/a2aClient.js';
import { a2aAgents } from '../a2a/a2aServers.js';
import { routeQuery } from '../services/router.js';
import { summarizeHistory, formatSummaryForContext } from '../services/summarizer.js';
import { getCircuitBreaker, getOpenCircuits } from '../utils/circuitBreaker';
import { zodToJsonSchema } from '../utils/zodToJsonSchema.js';

export class Agent {
  private client: Anthropic;
  private maxIterations = 15;
  private conversationHistories: Map<string, Anthropic.MessageParam[]> = new Map();
  private tokenUsageByConversation: Map<string, number> = new Map();

  private mcpTools: MCPTool[] = [];
  private mcpClients: MCPClient[] = [];
  private mcpClientMap: Map<string, MCPClient> = new Map();
  private mcpInitPromise: Promise<void> | null = null;

  private a2aTools: A2ATool[] = [];
  private a2aInitPromise: Promise<void> | null = null;

  private lastChartUrl: string | null = null;
  public getLastChartUrl(): string | null { return this.lastChartUrl; }
  public clearLastChartUrl(): void { this.lastChartUrl = null; }

  private readonly patternHandlers: Record<string, (messages: any[], formattedTools: any[], question: string, conversationId: string) => Promise<string>> = {
    FUNCTION_CALL: this.runFunctionCall.bind(this),
    REACT:         this.runReact.bind(this),
  };

  constructor() {
    this.client = anthropic;
  }

  public async run(
    question: string,
    conversationId: string
  ): Promise<string> {
    console.log(`\n🤔  Question: ${question}\n`);

    await this.initializeMCP();
    await this.initializeA2A();

    const openCircuits = getOpenCircuits();
    const route = await routeQuery(question, openCircuits);

    if (!route.available) return route.response;

    const handler = this.patternHandlers[route.pattern];
    const formattedTools = this.formatToolsForClaude();

    let messages = this.conversationHistories.get(conversationId) || [];

    messages = await this.summarizeIfNeeded(messages, conversationId, question);
    messages = this.markHistoryCacheBoundary(messages);

    messages.push({ role: 'user', content: createUserPrompt(question, openCircuits) });

    return await handler(messages, formattedTools, question, conversationId);
  }

  private async runFunctionCall(
    messages: Anthropic.MessageParam[],
    formattedTools: any[],
    question: string,
    conversationId: string
  ): Promise<string> {
    console.log(`\n  ◈ Function call (single pass)`);

    const response = await this.callLLM(MODEL.Simple, messages, formattedTools);
    this.trackTokenUsage(conversationId, response.usage);

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    if (toolUseBlocks.length === 0) {
      return await this.handleFinalResponse(response, messages, conversationId);
    }

    for (const b of toolUseBlocks) {
      console.log(`    Tool        : ${b.name}`);
      console.log(`    Input       : ${JSON.stringify(b.input)}\n`);
    }

    const toolResults = await Promise.all(toolUseBlocks.map(block => this.executeTool(block)));

    messages.push({ role: 'assistant', content: response.content });
    messages.push({
      role: 'user',
      content: toolResults.map(({ tool_use_id, result }) => ({
        type: 'tool_result' as const,
        tool_use_id,
        content: JSON.stringify(result),
      })),
    });

    const finalResponse = await this.callLLM(MODEL.Simple, messages, formattedTools);
    this.trackTokenUsage(conversationId, finalResponse.usage);
    return await this.handleFinalResponse(finalResponse, messages, conversationId);
  }

  private async runReact(
    messages: Anthropic.MessageParam[],
    formattedTools: any[],
    question: string,
    conversationId: string
  ): Promise<string> {
    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      console.log(`\n  ◈ Iteration ${iteration}`);

      const response = await this.callLLM(MODEL.Smart, messages, formattedTools);
      console.log(`    Stop reason : ${response.stop_reason}`);
      this.trackTokenUsage(conversationId, response.usage);

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      if (toolUseBlocks.length === 0) {
        return await this.handleFinalResponse(response, messages, conversationId);
      }

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
          this.mcpInitPromise = null; // null allows the next run() to retry
          console.warn(`⚠️ MCP tools unavailable: ${err.message}`);
        });
    }
    return this.mcpInitPromise;
  }

  private initializeA2A(): Promise<void> {
    if (!this.a2aInitPromise) {
      this.a2aInitPromise = initializeA2ATools(a2aAgents)
        .then(tools => { this.a2aTools = tools; })
        .catch(err => {
          this.a2aInitPromise = null; // null allows the next run() to retry
          console.warn(`⚠️ A2A tools unavailable: ${err.message}`);
        });
    }
    return this.a2aInitPromise;
  }

  private formatToolsForClaude() {
    const nativeToolsFormatted = tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object' as const,
        properties: zodToJsonSchema(tool.parameters),
        required: Object.keys(tool.parameters.shape),
      },
    }));

    const mcpToolsFormatted = this.mcpTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));

    const a2aToolsFormatted = this.a2aTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema,
    }));

    const allTools = [...nativeToolsFormatted, ...mcpToolsFormatted, ...a2aToolsFormatted];

    // Prompt cache slot 2: cache boundary on last tool so the full tool list is cached
    return allTools.map((tool, index) =>
      index === allTools.length - 1
        ? { ...tool, cache_control: { type: 'ephemeral' as const } }
        : tool
    );
  }

  private trackTokenUsage(conversationId: string, usage: { input_tokens: number; output_tokens: number }) {
    const sessionTokens = (this.tokenUsageByConversation.get(conversationId) ?? 0) + usage.input_tokens + usage.output_tokens;
    this.tokenUsageByConversation.set(conversationId, sessionTokens);
  }

  private async summarizeIfNeeded(messages: Anthropic.MessageParam[], conversationId: string, question: string) {
    if (messages.length === 0) return messages;

    const tokensUsed = this.tokenUsageByConversation.get(conversationId) ?? 0;
    if (tokensUsed > 170000) {
      console.log(`\n📊 Token limit approaching (${tokensUsed} tokens), summarizing...\n`);
      const keepCount = 5;
      const summary = await summarizeHistory(messages.slice(0, -keepCount));
      const contextBlock = formatSummaryForContext(summary, question);
      this.tokenUsageByConversation.set(conversationId, 0);
      messages = [
        { role: 'user', content: `Previous conversation summary:\n${contextBlock}` },
        ...messages.slice(-keepCount)
      ];
    }

    return messages;
  }

  // Prompt cache slot 3: marks the last history message so everything up to here is cached
  private markHistoryCacheBoundary(messages: Anthropic.MessageParam[]) {
    if (messages.length === 0) return messages;
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

    // Native tool — in-process
    const nativeTool = getToolByName(toolUseBlock.name);
    if (nativeTool) {
      const result = await nativeTool.execute(toolUseBlock.input as any);
      if (result?.data?.chartUrl) this.lastChartUrl = result.data.chartUrl;
      if (!result.success) console.log(`    ❌  ${toolUseBlock.name}  ${result.error}`);
      return { tool_use_id: toolUseBlock.id, result };
    }

    // MCP tool — STDIO via circuit breaker
    const mcpTool = this.mcpTools.find(t => t.name === toolUseBlock.name);
    if (mcpTool) {
      try {
        const client = this.mcpClientMap.get(toolUseBlock.name);
        if (!client) throw new Error(`No MCP client found for tool: ${toolUseBlock.name}`);
        const breaker = getCircuitBreaker(toolUseBlock.name,
          (input: any) => client.callTool(toolUseBlock.name, input)
        );
        const result = await breaker.fire(toolUseBlock.input);
        return { tool_use_id: toolUseBlock.id, result };
      } catch (error: any) {
        console.log(`    ❌  ${toolUseBlock.name}  ${error.message}`);
        return { tool_use_id: toolUseBlock.id, result: { success: false, error: error.message } };
      }
    }

    // A2A tool — HTTP via circuit breaker, envelope unwrapped
    const a2aTool = this.a2aTools.find(t => t.name === toolUseBlock.name);
    if (a2aTool) {
      try {
        const breaker = getCircuitBreaker(toolUseBlock.name,
          (input: any) => a2aTool.execute(input),
          true  // A2A tools need a longer timeout
        );
        const envelope = await breaker.fire(toolUseBlock.input) as any;
        if (envelope?.status === 'failed') {
          const { status: _, ...failureDetails } = envelope;
          return { tool_use_id: toolUseBlock.id, result: failureDetails };
        }
        const result = envelope?.data ?? envelope;
        if (result?.chartUrl) this.lastChartUrl = result.chartUrl;
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
    conversationId: string
  ): Promise<string> {
    messages.push({ role: 'assistant', content: response.content });
    this.conversationHistories.set(conversationId, messages);
    
    const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === 'text'
    );
    const finalResponse = textBlock?.text || 'No response generated';
    console.log(`\n${'─'.repeat(60)}\n📊  Answer: ${finalResponse}\n`);

    return finalResponse;
  }

  public async cleanup(): Promise<void> {
    await cleanupMCPClients(this.mcpClients);
  }

}
