import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { CLAUDE } from '../agent/models';
import { emailTool } from '../tools/emailTool';
import { Client } from 'langsmith';
import { ANOMALY_PROMPT } from '../agent/prompts.js';

async function fetchRecentTraces() {
  const client = new Client({ apiKey: process.env.LANGSMITH_API_KEY! });
  
  const runs: any[] = [];
  for await (const run of client.listRuns({
    projectName: process.env.LANGSMITH_PROJECT!,
    runType: 'llm',
    limit: 20,
  })) {
    runs.push(run);
  }
  return runs;
}

function summarizeTraces(traces: any[]) {
  return traces.map(t => ({
    name: t.name,
    latency_ms: t.end_time ? Math.round(new Date(t.end_time).getTime() - new Date(t.start_time).getTime()) : null,
    total_tokens: t.total_tokens || 0,
    prompt_tokens: t.prompt_tokens || 0,
    completion_tokens: t.completion_tokens || 0,
    status: t.status,
    error: t.error || null,
  }));
}

async function detectAnomalies(summary: any[]) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  
  const response = await client.messages.create({
    model: CLAUDE.Haiku,
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `${ANOMALY_PROMPT}${JSON.stringify(summary, null, 2)}`
    }]
  });

  return (response.content[0] as Anthropic.TextBlock).text;
}

async function main() {
  console.log('\n🔍 Fetching recent traces...');
  const traces = await fetchRecentTraces();
  
  if (!traces.length) {
    console.log('\nNo traces found.');
    return;
  }

  const summary = summarizeTraces(traces);
  console.log(`\n📊 Analyzing ${summary.length} traces...`);
  
  const anomalies = await detectAnomalies(summary);

  const hasIssues = anomalies.toLowerCase().includes('zero') || 
                    anomalies.toLowerCase().includes('spike') || 
                    anomalies.toLowerCase().includes('fail') ||
                    anomalies.toLowerCase().includes('error');

  if (hasIssues) {
  console.log('\n🚨 Anomaly Report:\n', anomalies);
    await emailTool.execute({
      recipient: 'team_leader',
      subject: '🚨 BiAgent Anomaly Detected',
      body: `Automated anomaly detection report:\n\n🚨 Action required:\n\n${anomalies}`,
      attachments: []
    });
    console.log('\n📧 Alert sent to team leader.');
  } else {
    console.log('\n✅ No anomalies detected — no email sent.');
  }
}

main().catch(console.error);