import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import TelegramBot from 'node-telegram-bot-api';
import { Agent } from '../agent/agent';
import { mcpServers } from '../mcp/mcpServers';
import { downloadFile, initializeTempDirectory } from '../utils/fileSystem';
import { initializeMCPClients, cleanupMCPClients } from '../mcp/bootstrap';

initializeTempDirectory();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, { polling: true });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function startBot() {
  console.log('🔄 Initializing MCP clients...');
  
  const { mcpClients, mcpTools, mcpClientMap } = await initializeMCPClients(mcpServers);

  const agent = new Agent(mcpTools, mcpClientMap);
  
  console.log('✅ Agent initialized');
  console.log('🤖 Telegram bot is running...');
  
  // Add cleanup handler for graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down bot...');
    await cleanupMCPClients(mcpClients);
    bot.stopPolling();
    process.exit(0);
  });

  bot.on('text', async (msg) => {
    if (!msg.text) return;
    const { chat: { id: chatId }, text: question } = msg;
    
    try {
      await bot.sendChatAction(chatId, 'typing');

      const answer = await agent.run(question, chatId.toString());
      
      const chartUrlMatch = answer.match(/Chart uploaded to S3: (https:\/\/[^\s]+)/);
      if (chartUrlMatch) {
        await bot.sendPhoto(chatId, chartUrlMatch[1]);
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
      const localPath = path.join(process.cwd(), 'src/temp/telegram', `voice_${Date.now()}.ogg`);
      
      await downloadFile(fileUrl, localPath); 
      
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(localPath),
        model: 'whisper-1',
      });
      
      await bot.sendMessage(chatId, `🎤 I heard: "${transcription.text}"\n\nProcessing...`);
      
      await bot.sendChatAction(chatId, 'typing');
      const answer = await agent.run(transcription.text, chatId.toString());
      
      const chartUrlMatch = answer.match(/Chart uploaded to S3: (https:\/\/[^\s]+)/);
      if (chartUrlMatch) {
        await bot.sendPhoto(chatId, chartUrlMatch[1]);
      }
      
      await bot.sendMessage(chatId, answer);
      
    } catch (error) {
      console.error('❌ Error processing voice:', error);
      await bot.sendMessage(chatId, 'Sorry, I encountered an error processing your voice message.');
    }
  });
}

// Start the bot with initialization
startBot().catch((error) => {
  console.error('❌ Failed to start bot:', error);
  process.exit(1);
});

