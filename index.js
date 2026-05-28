const { Telegraf } = require('telegraf');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8774577870:AAGlx1spyevXb0Cjcm1s4tXBk9DzSNX_GAk';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyBmm1eMDHVKWAShcjua9MHvKCemlxoRxn0';
const GEMINI_MODELS = (
  process.env.GEMINI_MODELS ||
  process.env.GEMINI_MODEL ||
  'gemini-2.5-flash-lite,gemini-2.0-flash-lite,gemini-flash-lite-latest,gemini-2.5-flash'
)
  .split(',')
  .map((modelName) => modelName.trim())
  .filter(Boolean);

if (!TELEGRAM_BOT_TOKEN) {
  throw new Error('Missing TELEGRAM_BOT_TOKEN environment variable.');
}

if (!GEMINI_API_KEY) {
  throw new Error('Missing GEMINI_API_KEY environment variable.');
}

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

function buildPrompt(userMessage) {
  return [
    'You are my personal auto-reply assistant for Telegram.',
    'Understand messages written in any language, including mixed-language messages.',
    'Detect the language, tone, and intent of the incoming message.',
    'Reply in the same language as the user.',
    'If the user mixes languages, reply naturally with the same language mix.',
    'If the message is ambiguous, ask one short clarifying question in the user\'s language.',
    'Keep the reply polite, friendly, helpful, and concise.',
    'Do not mention that you are an AI unless the user asks.',
    `Incoming message: "${userMessage}"`,
  ].join('\n');
}

function hasKhmerText(text) {
  return /[\u1780-\u17FF]/.test(text);
}

function quotaFallbackReply(userMessage) {
  if (hasKhmerText(userMessage)) {
    return '\u179F\u17BC\u1798\u1791\u17C4\u179F \u1781\u17D2\u1789\u17BB\u17C6\u1794\u17B6\u1793\u1791\u1791\u17BD\u179B\u179F\u17B6\u179A\u179A\u1794\u179F\u17CB\u17A2\u17D2\u1793\u1780\u17A0\u17BE\u1799\u17D4 \u1781\u17D2\u1789\u17BB\u17C6\u1793\u17B9\u1784\u178F\u1794\u1791\u17C5\u17A2\u17D2\u1793\u1780\u179C\u17B7\u1789\u1786\u17B6\u1794\u17CB\u17D7\u1793\u17C1\u17C7\u17D4';
  }

  return 'Thanks, I received your message. I will reply to you soon.';
}

async function generateReply(userMessage) {
  const prompt = buildPrompt(userMessage);
  let lastError;

  for (const modelName of GEMINI_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      console.log(`[gemini model] ${modelName}`);
      return text || 'Sorry, I could not create a reply.';
    } catch (error) {
      lastError = error;
      if (error.status !== 429 && error.status !== 404) {
        throw error;
      }

      console.warn(`[gemini skipped] ${modelName}: ${error.status} ${error.statusText || error.message}`);
    }
  }

  if (lastError && lastError.status === 429) {
    console.warn('[gemini quota exhausted] using local fallback reply');
    return quotaFallbackReply(userMessage);
  }

  throw lastError || new Error('No Gemini models are configured.');
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
      .sendMessage(chatId, 'Sorry, there was a problem replying. Please try again soon.', extra)
      .catch((sendError) => console.error('[error reply failed]', sendError));
  }
}

bot.start((ctx) => {
  return ctx.reply('Bot is running. Send any language, and I will reply in the same language.');
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
