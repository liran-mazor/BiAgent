require('dotenv').config();
const fs = require('fs');
const { spawn } = require('child_process');
const textToSpeech = require('@google-cloud/text-to-speech');
import { AUDIO_PATHS } from "../voice/audioPaths";
import { openai } from '../config/clients';

const ttsClient = new textToSpeech.TextToSpeechClient();

export function playSound(soundPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const player = require('play-sound')({});
    setTimeout(() => {
      player.play(soundPath, (err: any) => {
        if (err) { console.error(`Failed to play ${soundPath}:`, err); reject(err); }
        else { resolve(); }
      });
    }, 250);
  });
}

async function generateSpeech(text: string): Promise<void> {
  const clean = text
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/#{1,6} /g, '')
    .replace(/`/g, '');

  const request = {
    input: { text: clean },
    voice: { languageCode: 'en-GB', name: 'en-GB-Standard-D' },
    audioConfig: { audioEncoding: 'MP3' },
  };

  const [response] = await ttsClient.synthesizeSpeech(request);
  fs.writeFileSync(AUDIO_PATHS.TEMP_TTS_RESPONSE, response.audioContent, 'binary');
}

export async function prepareSpeech(text: string): Promise<{ durationMs: number; play: () => Promise<void> }> {
  console.log('🔊 Converting text to speech...');
  await generateSpeech(text);

  const bytes = fs.statSync(AUDIO_PATHS.TEMP_TTS_RESPONSE).size;
  const durationMs = Math.round((bytes / 4000) * 1000);

  return {
    durationMs,
    play: () => playSound(AUDIO_PATHS.TEMP_TTS_RESPONSE),
  };
}

export async function speakText(text: string): Promise<void> {
  const { play } = await prepareSpeech(text);
  await play();
}

export async function recordUserQuery(): Promise<string> {
  console.log('🎙️  Recording your question (6 seconds)...');
  const audioFile = AUDIO_PATHS.TEMP_VOICE_QUERY;

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('pw-record', [
      '--rate', '16000',
      '--channels', '1',
      '--media-category=Capture',
      '--target=alsa_input.usb-C-Media_Electronics_Inc._USB_PnP_Sound_Device-00.analog-mono',
      audioFile
    ]);

    proc.stderr.on('data', (data: Buffer) => {
      console.error('pw-record error:', data.toString());
    });

    proc.on('error', reject);
    setTimeout(() => { proc.kill(); resolve(); }, 6000);
  });

  console.log('✅ Recording saved');
  return audioFile;
}

export async function transcribeAudio(audioFilePath: string): Promise<string> {
  console.log('🎧 Transcribing with Whisper...');
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioFilePath),
    model: 'whisper-1',
  });
  console.log(transcription.text);
  return transcription.text;
}

export function isCancelCommand(query: string): boolean {
  const normalized = query.toLowerCase().trim().replace(/[.,!?]$/, '');
  return normalized === 'stop';
}