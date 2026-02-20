import path from 'path';

export const AUDIO_PATHS = {
  CONFIRMATION: path.join(__dirname, './audio/confirmation.mp3'),
  ACK: path.join(__dirname, './audio/ack.mp3'),
  WAKE_WORD: path.join(__dirname, './audio/alfred.ppn'),
  TEMP_TTS_RESPONSE: path.join(__dirname, './temp/tts-response.mp3'),
  TEMP_VOICE_QUERY: path.join(__dirname, './temp/voice-query.wav'),
} as const;