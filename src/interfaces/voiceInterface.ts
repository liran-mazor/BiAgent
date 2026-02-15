require('dotenv').config();
import { Agent } from '../agent/agent';
import { initializeMCPClients } from '../mcp/bootstrap';
import { mcpServers } from '../config/mcpServers';
import { playSound, speakText, transcribeAudio, recordUserQuery } from '../utils/voiceHelpers';
import { AUDIO_PATHS } from '../voice/audioPaths';
const { Porcupine } = require('@picovoice/porcupine-node');
const { PvRecorder } = require('@picovoice/pvrecorder-node');

const WAKE_WORD_SENSITIVITY = 0.9;

async function startVoiceInterface() {
  console.log('🎤 Initializing voice interface...');

  const { tools, clientMap } = await initializeMCPClients(mcpServers);
  const agent = new Agent(
    process.env.ANTHROPIC_API_KEY!,
    tools,
    clientMap
  );

  const handle = new Porcupine(
    process.env.PICOVOICE_ACCESS_KEY!,
    [AUDIO_PATHS.WAKE_WORD],
    [WAKE_WORD_SENSITIVITY]
  );

  const recorder = new PvRecorder(handle.frameLength);
  recorder.start();

  console.log('✅ Listening for wake word "Alfred"...\n');

  while (true) {
    const pcm = await recorder.read();
    const keywordIndex = handle.process(pcm);

    if (keywordIndex >= 0) {
      
      recorder.stop();
      
      await playSound(AUDIO_PATHS.CONFIRMATION);
      
      const audioFile = await recordUserQuery();
      
      await playSound(AUDIO_PATHS.ACK);
      
      const query = await transcribeAudio(audioFile);
      
      const response = await agent.run(query);
    
      await speakText(response);
      
      recorder.start();
      console.log('✅ Listening for wake word "Alfred"...\n');
    }
  }
}

startVoiceInterface().catch(console.error);