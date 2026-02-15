require('dotenv').config();

import { Agent } from '../agent/agent';
import { initializeMCPClients } from '../mcp/bootstrap';
import { mcpServers } from '../config/mcpServers';
import { playSound, recordAndTranscribe, speakText } from '../utils/voiceHelpers';

const { Porcupine } = require('@picovoice/porcupine-node');
const { PvRecorder } = require('@picovoice/pvrecorder-node');
const path = require('path');

async function startVoiceInterface() {
  console.log('🎤 Initializing voice interface...');

  // Initialize MCP clients and agent
  const { tools, clientMap } = await initializeMCPClients(mcpServers);
  const agent = new Agent(
    process.env.ANTHROPIC_API_KEY!,
    tools,
    clientMap
  );

  const keywordPath = path.join(__dirname, '../voice/alfred.ppn');

  const handle = new Porcupine(
    process.env.PICOVOICE_ACCESS_KEY!,
    [keywordPath],
    [0.9]
  );

  const recorder = new PvRecorder(handle.frameLength);
  recorder.start();

  console.log('✅ Listening for wake word "Alfred"...\n');

  while (true) {
    const pcm = await recorder.read();
    const keywordIndex = handle.process(pcm);

    if (keywordIndex >= 0) {
      console.log('🔥 Wake word detected!');
      
      recorder.stop();
      
      await new Promise(resolve => setTimeout(resolve, 400));

      await playSound(path.join(__dirname, '../voice/confirmation.mp3'), 'confirmation sound');
      
      const query = await recordAndTranscribe();

      console.log('🤖 Processing with agent...');

      // Add voice interface prefix for short responses
      const voiceQuery = `[VOICE_INTERFACE] ${query}`;
      const response = await agent.run(voiceQuery);

      console.log('✅ Agent response:', response);
      await speakText(response);
      
      recorder.start();
      console.log('✅ Listening for wake word "Alfred"...\n');
    }
  }
}

startVoiceInterface().catch(console.error);