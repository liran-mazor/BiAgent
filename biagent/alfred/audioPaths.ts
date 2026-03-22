import path from 'path';

export const AUDIO_PATHS = {
  WAKE_WORD: path.join(__dirname, './audio/alfred.ppn'),
  WAKE_WORD_CONFIRMED: path.join(__dirname, './audio/wakeWordConfirmed.mp3'),
  PROCESSING: path.join(__dirname, './audio/processing.mp3'),
  CANCELLED: path.join(__dirname, './audio/cancelled.mp3'),
  TEMP_TTS_RESPONSE: path.join(process.cwd(), './src/temp/alfred/tts-response.mp3'),
  TEMP_VOICE_QUERY: path.join(process.cwd(), './src/temp/alfred/voice-query.wav'),
} as const;