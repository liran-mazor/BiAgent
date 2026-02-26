require('dotenv').config();
import { WebSocketServer } from 'ws';
import { prepareSpeech, playSound } from '../services/voiceService';
import { AUDIO_PATHS } from '../voice/audioPaths';

const TEST_RESPONSE = 'This is a test, 1, 2, 3.';


const wss = new WebSocketServer({ port: 3001 });
let faceClient: any = null;

wss.on('connection', (ws) => {
  console.log('🖥️  Face renderer connected');
  faceClient = ws;
});

function sendState(state: string) {
  if (faceClient && faceClient.readyState === 1) {
    faceClient.send(JSON.stringify({ type: 'state', value: state }));
  }
  console.log(`➡️  State: ${state}`);
}

function sendQuickMouth(durationMs: number) {
  if (faceClient && faceClient.readyState === 1) {
    faceClient.send(JSON.stringify({ type: 'quickmouth', duration: durationMs }));
  }
}

function sendSpeak(durationMs: number, fast = false) {
  if (faceClient && faceClient.readyState === 1) {
    faceClient.send(JSON.stringify({ type: 'speak', duration: durationMs, fast }));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  // 1. IDLE - alfred sleeping
  console.log('🌙 [IDLE] Alfred is waiting...');
  sendState('idle');
  await sleep(3000);

  // 2. LISTENING - wake word detected, alfred says "yeah"
  console.log('👂 [LISTENING] Wake word detected!');
  sendState('listening');
  sendQuickMouth(600);
  await playSound(AUDIO_PATHS.WAKE_WORD_CONFIRMED); // "All ears" / "yeah"

  // 3. PROCESSING - user gave command, alfred says "on it"
  console.log('⚙️  [PROCESSING] Got command...');
  sendState('processing');
  sendQuickMouth(800);
  await playSound(AUDIO_PATHS.PROCESSING); // "On it"
  await sleep(500);

  // 4. THINKING - alfred thinking
  console.log('🤔 [THINKING] Thinking...');
  sendState('thinking');
  await sleep(4000);

  // 5. SPEAKING - alfred answers
  console.log('🗣️  [SPEAKING] Alfred says:', TEST_RESPONSE);
  sendState('speaking');
  const { durationMs, play } = await prepareSpeech(TEST_RESPONSE);
  sendSpeak(durationMs, true);
  await play();

  // 6. Back to IDLE
  console.log('🌙 [IDLE] Back to waiting...');
  sendState('idle');

  await sleep(1000);
  process.exit(0);
}

console.log('🔌 WebSocket server started on ws://localhost:3001');
console.log('⏳ Waiting 2 seconds for face renderer to connect...');
sleep(2000).then(() => runTest().catch(console.error));