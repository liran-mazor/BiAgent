require('dotenv').config();
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');
const record = require('node-record-lpcm16');
const textToSpeech = require('@google-cloud/text-to-speech');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ttsClient = new textToSpeech.TextToSpeechClient();

export function playSound(soundPath: string, description: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const player = require('play-sound')({});
    
    setTimeout(() => {
      player.play(soundPath, (err: any) => {
        if (err) {
          console.error(`Failed to play ${description}:`, err);
          reject(err);
        } else {
          resolve();
        }
      });
    }, 250);
  });
}

export async function speakText(text: string): Promise<void> {
  console.log('🔊 Converting text to speech...');

  const request = {
    input: { text },
    voice: {
      languageCode: 'en-GB',
      name: 'en-GB-Standard-D',
    },
    audioConfig: {
      audioEncoding: 'MP3',
    },
  };

  const [response] = await ttsClient.synthesizeSpeech(request);
  
  const audioPath = path.join(__dirname, '../../temp/tts-response.mp3');
  fs.writeFileSync(audioPath, response.audioContent, 'binary');
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  await playSound(audioPath, 'response');
}

export async function recordAndTranscribe(): Promise<string> {
  console.log('🎙️  Recording your question (6 seconds)...');
  
  const audioFile = path.join(__dirname, '../../temp/voice-query.wav');
  const file = fs.createWriteStream(audioFile, { encoding: 'binary' });

  const recording = record.record({
    sampleRate: 16000,
    channels: 1,
    audioType: 'wav',
    recorder: 'sox'
  });

  recording.stream().pipe(file);
  await new Promise(resolve => setTimeout(resolve, 5000));
  recording.stop();
  
  console.log('✅ Recording saved');
  
  await playSound(path.join(__dirname, '../voice/ack.mp3'), 'acknowledgment');
  
  console.log('🎧 Transcribing with Whisper...');
  
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioFile),
    model: 'whisper-1',
  });
  
  console.log('📝 You said:', transcription.text);
  
  return transcription.text;
}