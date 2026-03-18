require('dotenv').config();
const fs = require('fs');
const record = require('node-record-lpcm16');
const textToSpeech = require('@google-cloud/text-to-speech');
import { AUDIO_PATHS } from "../alfred/audioPaths";
import { openai } from '../config/clients';
// import { createClient } from '@deepgram/sdk';
// import mic from 'mic';

const ttsClient = new textToSpeech.TextToSpeechClient();

export function playSound(soundPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const player = require('play-sound')({});
    
    setTimeout(() => {
      player.play(soundPath, (err: any) => {
        if (err) {
          console.error(`Failed to play ${soundPath}:`, err);
          reject(err);
        } else {
          resolve();
        }
      });
    }, 250);
  });
}

export async function prepareSpeech(text: string): Promise<{ durationMs: number; play: () => Promise<void> }> {
  console.log('🔊 Converting text to speech...');

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

  const bytes = fs.statSync(AUDIO_PATHS.TEMP_TTS_RESPONSE).size;
  const durationMs = Math.round((bytes / 4000) * 1000);

  return {
    durationMs,
    play: () => playSound(AUDIO_PATHS.TEMP_TTS_RESPONSE),
  };
}

// Convenience wrapper used by alfred.ts (no lip sync needed there yet)
export async function speakText(text: string): Promise<void> {
  const { play } = await prepareSpeech(text);
  await play();
}


export async function recordUserQuery(): Promise<string> {
  console.log('🎙️  Recording your question (7 seconds)...');
  
  const audioFile = AUDIO_PATHS.TEMP_VOICE_QUERY;
  const file = fs.createWriteStream(audioFile, { encoding: 'binary' });

  const recording = record.record({
    sampleRate: 16000,
    channels: 1,
    audioType: 'wav',
    recorder: 'sox'
  });

  recording.stream().pipe(file);
  await new Promise(resolve => setTimeout(resolve, 7000));
  recording.stop();
  
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

// export async function recordAndTranscribe(): Promise<string> {
//   console.log('🎙️ Listening... (speak now, will stop automatically)');

//   const deepgram = createClient(process.env.DEEPGRAM_API_KEY!);

//   return new Promise((resolve, reject) => {
//     const connection = deepgram.listen.live({
//       model: 'nova-2',
//       language: 'en-US',
//       smart_format: true,
//       vad_events: true,
//       utterance_end_ms: 1500,
//       interim_results: true,
//     });

//     const microphone = mic({
//       rate: '16000',
//       channels: '1',
//       encoding: 'signed-integer',
//       bitwidth: '16',
//       device: 'default',
//     });

//     const micStream = microphone.getAudioStream();
//     let finalTranscript = '';

//     connection.on(LiveTranscriptionEvents.Open, () => {
//       setTimeout(() => {
//         micStream.on('data', (chunk: any) => connection.send(chunk));
//         microphone.start();
//       }, 1000);
//     });

//     connection.on(LiveTranscriptionEvents.Transcript, (data) => {
//       const transcript = data.channel.alternatives[0].transcript;
//       if (data.is_final && transcript) {
//         finalTranscript += transcript + ' ';
//         console.log('📝 Heard:', transcript);
//       }
//     });

//     connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
//       microphone.stop();
//       connection.finish();
//       resolve(finalTranscript.trim());
//     });

//     connection.on(LiveTranscriptionEvents.Error, reject);
//   });
// }