require('dotenv').config();
import { Agent } from '../agent/agent';
import { mcpServers } from '../mcp/mcpServers';
import { initializeMCPClients } from '../mcp/bootstrap';
import { initializeA2ATools } from '../a2a/forecastClient';
import { Porcupine } from '@picovoice/porcupine-node';
import { PvRecorder } from '@picovoice/pvrecorder-node';
import { AUDIO_PATHS } from '../voice/audioPaths';
import { playSound, speakText, transcribeAudio, recordUserQuery, isCancelCommand } from '../services/voiceService';
import { initializeTempDirectory } from '../utils/fileSystem';

initializeTempDirectory();

const WAKE_WORD_SENSITIVITY = 0.8;

async function startVoiceInterface() {
  const { mcpTools, mcpClientMap } = await initializeMCPClients(mcpServers);
  const a2aTools = await initializeA2ATools();
  let isProcessing = false;
  
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
    if (handle.process(pcm) >= 0 && !isProcessing) {
      isProcessing = true;
      recorder.stop();
      await playSound(AUDIO_PATHS.WAKE_WORD_CONFIRMED);
      
      const audioFile = await recordUserQuery();
      const rawQuery = await transcribeAudio(audioFile);
    
      if (isCancelCommand(rawQuery)) {
        await playSound(AUDIO_PATHS.CANCELLED);
        recorder.start();
        console.log('✅ Listening for wake word "Alfred"...\n');
        isProcessing = false;
        continue;
      }
    
      await playSound(AUDIO_PATHS.PROCESSING);
      const response = await agent.run(`[VOICE_INTERFACE] ${rawQuery}`);
      await speakText(response);
      recorder.start();
      console.log('✅ Listening for wake word "Alfred"...\n');
      isProcessing = false;
    }
  }
}

startVoiceInterface().catch(console.error);