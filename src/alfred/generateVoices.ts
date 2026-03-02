require('dotenv').config();
const textToSpeech = require('@google-cloud/text-to-speech');
const fs = require('fs');
const path = require('path');

const client = new textToSpeech.TextToSpeechClient();

async function generateSound(text: string, filename: string) {
  console.log(`🔊 Generating "${text}"...`);
  
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

  const [response] = await client.synthesizeSpeech(request);
  
  const audioPath = path.join(__dirname, `../voice/audio/${filename}`);
  fs.writeFileSync(audioPath, response.audioContent, 'binary');
  
  console.log(`✅ Saved ${filename}`);
}

async function main() {
  await generateSound("yeah?", "wakeWordConfirmed.mp3");
  await generateSound("On it!", "processing.mp3");
  await generateSound("OK!", "cancelled.mp3");
  console.log('\n✅ Voice assets generated!');
}

main().catch(console.error);