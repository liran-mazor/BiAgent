import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import TelegramBot from 'node-telegram-bot-api';
import { AgentIQ } from '../agent/agent';
import { downloadFile, initializeTempDirectory, getLatestChart } from './utils';

initializeTempDirectory();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, { polling: true });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const agent = new AgentIQ(process.env.ANTHROPIC_API_KEY!);

bot.on('text', async (msg) => {
  if (!msg.text) return;
  const { chat: { id: chatId }, text: question } = msg;
  
  try {
    await bot.sendChatAction(chatId, 'typing');

    const answer = await agent.run(question);
    
    const latestChart = await getLatestChart();
    if (latestChart) {
      await bot.sendPhoto(chatId, latestChart);
    }
    
    await bot.sendMessage(chatId, answer);
    
  } catch (error) {
    console.error('❌ Error:', error);
    await bot.sendMessage(chatId, 'Sorry, I encountered an error processing your request.');
  }
});

bot.on('voice', async (msg) => {
  if (!msg.voice) return;
  const chatId = msg.chat.id;
  const voiceFileId = msg.voice.file_id;
  
  try {
    await bot.sendChatAction(chatId, 'typing');
    
    const file = await bot.getFile(voiceFileId);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const localPath = path.join('temp', `voice_${Date.now()}.ogg`);
    
    await downloadFile(fileUrl, localPath); 
    
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(localPath),
      model: 'whisper-1',
    });
    
    await bot.sendMessage(chatId, `🎤 I heard: "${transcription.text}"\n\nProcessing...`);
    
    await bot.sendChatAction(chatId, 'typing');
    const answer = await agent.run(transcription.text);
    
    const latestChart = await getLatestChart();
    if (latestChart) {
      await bot.sendPhoto(chatId, latestChart);
    }
    
    await bot.sendMessage(chatId, answer);
    
  } catch (error) {
    console.error('❌ Error processing voice:', error);
    await bot.sendMessage(chatId, 'Sorry, I encountered an error processing your voice message.');
  }
});

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down bot...');
  bot.stopPolling();
  process.exit(0);
});

console.log('🤖 Telegram bot is running...');

