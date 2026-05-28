const { Telegraf } = require('telegraf');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
if (!TELEGRAM_BOT_TOKEN) {
  throw new Error('Missing TELEGRAM_BOT_TOKEN environment variable.');
}

if (!GEMINI_API_KEY) {
  throw new Error('Missing GEMINI_API_KEY environment variable.');
}

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

function buildPrompt(userMessage) {
  return [
    'អ្នកគឺជាជំនួយការផ្ទាល់ខ្លួនរបស់ខ្ញុំ។',
    `មានគេឆាតមកខ្ញុំថា: "${userMessage}"`,
    'សូមជួយតបសារនេះទៅកាន់ពួកគេវិញជាភាសាខ្មែរ ដោយភាពគួរសម រួសរាយ និងខ្លីខ្លឹម។',
  ].join('\n');
}

async function generateReply(userMessage) {
  const result = await model.generateContent(buildPrompt(userMessage));
  const text = result.response.text().trim();
  return text || 'សូមទោស ខ្ញុំមិនអាចបង្កើតចម្លើយបានទេ។';
}

async function handleUserText(ctx, message, options = {}) {
  const userMessage = message.text;
  if (!userMessage) return;

  const chatId = message.chat.id;
  const extra = options.businessConnectionId
    ? { business_connection_id: options.businessConnectionId }
    : {};

  try {
    await ctx.telegram.sendChatAction(chatId, 'typing', extra);

    const aiResponse = await generateReply(userMessage);
    await ctx.telegram.sendMessage(chatId, aiResponse, extra);

    console.log(`[reply sent] ${userMessage} -> ${aiResponse}`);
  } catch (error) {
    console.error('[reply failed]', error);
    await ctx.telegram
      .sendMessage(chatId, 'សូមទោស មានបញ្ហាក្នុងការឆ្លើយតប។', extra)
      .catch((sendError) => console.error('[error reply failed]', sendError));
  }
}

bot.start((ctx) => {
  return ctx.reply('Bot is running. Send a message and I will reply in Khmer.');
});

bot.on('text', async (ctx) => {
  await handleUserText(ctx, ctx.message);
});

bot.on('business_message', async (ctx) => {
  const message = ctx.update.business_message;
  await handleUserText(ctx, message, {
    businessConnectionId: message.business_connection_id,
  });
});

bot.catch((error, ctx) => {
  console.error(`[bot error] update ${ctx.update.update_id}`, error);
});

bot
  .launch(
    {
      allowedUpdates: ['message', 'business_message'],
      dropPendingUpdates: true,
    },
    () => {
      console.log('Bot is running and waiting for messages...');
    },
  )
  .catch((error) => {
    console.error('[startup failed]', error);
    process.exitCode = 1;
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
// --- Render Web Service Fix ---
// This creates a fake web server so Render doesn't crash the bot
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot is alive!');
});

app.listen(port, () => {
  console.log(`Web server listening on port ${port}`);
});
// ------------------------------