require('dotenv').config();
import { Agent } from '../agent/agent';
import { mcpServers } from '../mcp/mcpServers';
import { initializeMCPClients } from '../mcp/bootstrap';
import { initializeA2ATools } from '../a2a/forecastClient';
import { Porcupine } from '@picovoice/porcupine-node';
import { PvRecorder } from '@picovoice/pvrecorder-node';
import { AUDIO_PATHS } from '../voice/audioPaths';
import { playSound, speakText, transcribeAudio, recordUserQuery } from '../services/voiceService';

const WAKE_WORD_SENSITIVITY = 0.8;

async function startVoiceInterface() {
  const { mcpTools, mcpClientMap } = await initializeMCPClients(mcpServers);
  const a2aTools = await initializeA2ATools();

  const agent = new Agent(
    mcpTools,
    mcpClientMap,
    a2aTools
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