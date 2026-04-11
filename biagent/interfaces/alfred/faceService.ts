import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 3006 });
let faceClient: any = null;

wss.on('connection', (ws) => {
  console.log('\n🖥️  Face renderer connected');
  faceClient = ws;
});

function send(payload: object) {
  if (faceClient && faceClient.readyState === 1) {
    faceClient.send(JSON.stringify(payload));
  }
}

export function sendState(state: 'idle' | 'listening' | 'processing' | 'thinking' | 'speaking') {
  send({ type: 'state', value: state });
  console.log(`\n🎭 Face: ${state}`);
}

export function sendQuickMouth(durationMs: number) {
  send({ type: 'quickmouth', duration: durationMs });
}

export function sendSpeak(durationMs: number) {
  send({ type: 'speak', duration: durationMs, fast: true });
}

export function sendListening() {
  sendState('listening');
  sendQuickMouth(600);
}

export function sendProcessing(durationMs = 800) {
  sendState('processing');
  sendQuickMouth(durationMs);
}

export function sendSpeaking(durationMs: number) {
  sendState('speaking');
  sendSpeak(durationMs);
}

export function sendChart(url: string) {
  send({ type: 'chart', url });
}