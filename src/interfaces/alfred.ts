require('dotenv').config();
import { Agent } from '../biagent/agent';
import { Porcupine } from '@picovoice/porcupine-node';
import { PvRecorder } from '@picovoice/pvrecorder-node';
import { AUDIO_PATHS } from '../alfred/audioPaths';
import { playSound, transcribeAudio, recordUserQuery, isCancelCommand, prepareSpeech, /*recordAndTranscribe*/ } from '../alfred/voiceService';
import { sendState, sendSpeaking, sendListening, sendProcessing, sendChart } from '../alfred/faceService';
import { initializeTempDirectory } from '../utils/fileSystem';

const WAKE_WORD_SENSITIVITY = 0.8;

initializeTempDirectory();

async function startVoiceInterface() {
  let isProcessing = false;

  const agent = new Agent();

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

      // LISTENING state - wake word detected
      sendListening();
      await playSound(AUDIO_PATHS.WAKE_WORD_CONFIRMED);

      const audioFile = await recordUserQuery();
      const rawQuery = await transcribeAudio(audioFile);

      if (isCancelCommand(rawQuery)) {
        // PROCESSING state - say "ok" quickly
        sendProcessing(600);
        await playSound(AUDIO_PATHS.CANCELLED);

        // Back to IDLE
        sendState('idle');
        recorder.start();
        console.log('✅ Listening for wake word "Alfred"...\n');
        isProcessing = false;
        continue;
      }

      // PROCESSING state - say "on it"
      sendProcessing()
      await playSound(AUDIO_PATHS.PROCESSING);

      // THINKING state - agent running
      sendState('thinking');
      const response = await agent.run(`[VOICE_INTERFACE] ${rawQuery}`, 'alfred');

      // SPEAKING state - prepare TTS, send duration, play
      const { durationMs, play } = await prepareSpeech(response);
      sendSpeaking(durationMs);
      const chartUrl = agent.getLastChartUrl();
      agent.clearLastChartUrl();
      if (chartUrl) sendChart(chartUrl); // send before play() so chart appears as Alfred starts speaking
      await play();

      // Back to IDLE
      sendState('idle');
      recorder.start();
      console.log('✅ Listening for wake word "Alfred"...\n');
      isProcessing = false;
    }
  }
}

startVoiceInterface().catch(console.error);
