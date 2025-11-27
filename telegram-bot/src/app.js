'use strict';

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_BASE_URL = process.env.API_BASE_URL || 'http://api:8086';

if (!TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN is not set');
  process.exit(1);
}

console.log('🔧 Telegram bot starting with config:', {
  NODE_ENV: process.env.NODE_ENV,
  API_BASE_URL,
  hasDatabaseUrl: !!process.env.DATABASE_URL,
  hasRedisUrl: !!process.env.REDIS_URL,
});

// Инициализация бота (long polling)
const bot = new TelegramBot(TOKEN, { polling: true });

bot.getMe().then((me) => {
  console.log(`🤖 Bot started as @${me.username} (id=${me.id})`);
}).catch((err) => {
  console.error('❌ getMe error:', err.message || err);
});

// =========================
// Команды бота
// =========================

// /start
bot.onText(/^\/start(?:@.+)?$/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    await bot.sendMessage(
      chatId,
      [
        '👋 Привет! Я бот системы лояльности PROJECT_3128.',
        '',
        `• Окружение: ${process.env.NODE_ENV || 'development'}`,
        `• API: ${API_BASE_URL}`,
        '• DB url: ' + (process.env.DATABASE_URL ? 'задан' : '—'),
        '• Redis url: ' + (process.env.REDIS_URL ? 'задан' : '—'),
        '',
        'Команды:',
        '/join <токен> — привязать ваш Telegram к программе лояльности',
        '/balance — показать баланс и уровень',
        '/history — последние операции',
        '/code — получить временный код для оплаты',
        '/health — проверить, что бот жив',
      ].join('\n'),
    );
  } catch (err) {
    console.error('❌ [/start] error:', err);
  }
});

// /health
bot.onText(/^\/health(?:@.+)?$/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, '✅ Bot is running.');
});

// /join <token>
bot.onText(/^\/join\s+(\S+)(?:@.+)?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const telegramUserId = msg.from.id;
  const joinToken = match[1];

  try {
    await bot.sendChatAction(chatId, 'typing');

    const res = await fetch(`${API_BASE_URL}/api/v1/bot/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegramUserId,
        joinToken,
      }),
    });

    const data = await res.json();

    if (!res.ok || data.status !== 'OK') {
      const msgText =
        data && data.message
          ? data.message
          : 'Не удалось привязать аккаунт. Попробуйте ещё раз.';
      await bot.sendMessage(chatId, `❌ Ошибка при привязке аккаунта.\n${msgText}`);
      return;
    }

    await bot.sendMessage(
      chatId,
      [
        '✅ Аккаунт успешно привязан к программе лояльности.',
        '',
        `Мерчант: ${data.merchant.name} (${data.merchant.code})`,
        `ID клиента: ${data.customer.id}`,
        '',
        'Теперь вы можете использовать команды:',
        '/balance — показать баланс',
        '/history — показать последние операции',
      ].join('\n'),
    );
  } catch (err) {
    console.error('❌ [/join] error:', err);
    await bot.sendMessage(
      chatId,
      '❌ Внутренняя ошибка при привязке аккаунта. Попробуйте ещё раз позже.',
    );
  }
});

// /balance
bot.onText(/^\/balance(?:@.+)?$/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramUserId = msg.from.id;

  try {
    await bot.sendChatAction(chatId, 'typing');

    // API ждёт GET /api/v1/bot/balance?telegram_id=...
    const url = `${API_BASE_URL}/api/v1/bot/balance?telegram_id=${telegramUserId}`;

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok || data.status !== 'OK') {
      const msgText =
        data && data.message
          ? data.message
          : 'Не удалось получить баланс. Попробуйте ещё раз.';
      await bot.sendMessage(chatId, `❌ Ошибка при получении баланса.\n${msgText}`);
      return;
    }

    const b = data.balance;
    const text = [
      '💳 Ваш баланс по программе лояльности:',
      '',
      `Мерчант: ${data.merchant.name} (${data.merchant.code})`,
      `Текущий уровень: ${b.level || 'bronze'}`,
      '',
      `Баланс: ${b.points} бонусов`,
      `Всего начислено: ${b.total_earned}`,
      `Всего списано: ${b.total_spent}`,
      `Последняя активность: ${b.last_activity || '—'}`,
    ].join('\n');

    await bot.sendMessage(chatId, text);
  } catch (err) {
    console.error('❌ [/balance] error:', err);
    await bot.sendMessage(
      chatId,
      '❌ Внутренняя ошибка при получении баланса. Попробуйте ещё раз позже.',
    );
  }
});

// /history
bot.onText(/^\/history(?:@.+)?$/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramUserId = msg.from.id;

  try {
    await bot.sendChatAction(chatId, 'typing');

    // API ждёт GET /api/v1/bot/history?telegram_id=...&limit=10
    const url = `${API_BASE_URL}/api/v1/bot/history?telegram_id=${telegramUserId}&limit=10`;

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok || data.status !== 'OK') {
      const msgText =
        data && data.message
          ? data.message
          : 'Не удалось получить историю. Попробуйте ещё раз.';
      await bot.sendMessage(chatId, `❌ Ошибка при получении истории.\n${msgText}`);
      return;
    }

    if (!data.items || data.items.length === 0) {
      await bot.sendMessage(chatId, '📜 История операций пуста.');
      return;
    }

    const lines = data.items.map((tx) => {
      const dt = tx.created_at || tx.createdAt;
      const sign = tx.points_earned > 0 ? '+' : '-';
      const pts =
        tx.points_earned > 0 ? tx.points_earned : tx.points_spent || 0;
      return `• ${dt} — ${tx.transaction_type} (${tx.status}), ${sign}${pts} бонусов`;
    });

    const text = ['📜 Последние операции:', '', ...lines].join('\n');
    await bot.sendMessage(chatId, text);
  } catch (err) {
    console.error('❌ [/history] error:', err);
    await bot.sendMessage(
      chatId,
      '❌ Внутренняя ошибка при получении истории. Попробуйте ещё раз позже.',
    );
  }
});

// /code — временный код для оплаты
bot.onText(/^\/code(?:@.+)?$/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramUserId = msg.from.id;

  try {
    await bot.sendChatAction(chatId, 'typing');

    const res = await fetch(`${API_BASE_URL}/api/v1/bot/session-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegramUserId,
      }),
    });

    const data = await res.json();

    if (!res.ok || data.status !== 'OK') {
      const msgText =
        data && data.message
          ? data.message
          : 'Не удалось получить код. Попробуйте ещё раз.';
      await bot.sendMessage(
        chatId,
        `❌ Ошибка при генерации кода.\n${msgText}`,
      );
      return;
    }

    const code = data.sessionCode;
    const merchantName = data.merchant.name;
    const merchantCode = data.merchant.code;
    const ttlSec = data.expiresInSeconds || 180;
    const ttlMin = Math.max(1, Math.round(ttlSec / 60));

    const text = [
      '🔑 Код для оплаты',
      '',
      `Магазин: ${merchantName} (${merchantCode})`,
      '',
      `Ваш код: ${code}`,
      '',
      `⏱ Действует примерно ${ttlMin} мин.`,
      '',
      'Покажите этот код кассиру или продиктуйте.',
    ].join('\n');

    await bot.sendMessage(chatId, text);
  } catch (err) {
    console.error('❌ [/code] error:', err);
    await bot.sendMessage(
      chatId,
      '❌ Внутренняя ошибка при генерации кода. Попробуйте ещё раз позже.',
    );
  }
});

// =========================
// HTTP-сервер для внутренних уведомлений
// =========================

const app = express();
app.use(express.json());

app.post('/internal/notify/checkout', async (req, res) => {
  const {
    telegramUserId,
    merchant,
    customer,
    amount,
    pointsEarned,
    pointsSpent,
    balance,
    receiptId,
  } = req.body || {};

  if (!telegramUserId || !merchant || !balance) {
    console.warn('⚠️ /internal/notify/checkout: invalid payload', req.body);
    return res.status(400).json({ status: 'ERROR', message: 'Invalid payload' });
  }

  try {
    const chatId = telegramUserId; // для private-чата это корректно

    const parts = [];

    parts.push('🧾 Операция по программе лояльности завершена.');
    parts.push('');
    parts.push(`Магазин: ${merchant.name} (${merchant.code})`);

    if (receiptId) {
      parts.push(`Чек: ${receiptId}`);
    }

    parts.push(`Сумма чека: ${amount} (условные единицы)`);

    if (pointsSpent && pointsSpent > 0) {
      parts.push(`Списано: ${pointsSpent} бонусов`);
    }
    if (pointsEarned && pointsEarned > 0) {
      parts.push(`Начислено: ${pointsEarned} бонусов`);
    }

    parts.push('');
    parts.push(`Текущий баланс: ${balance.points} бонусов`);
    parts.push(`Всего начислено: ${balance.total_earned}`);
    parts.push(`Всего списано: ${balance.total_spent}`);

    const text = parts.join('\n');

    await bot.sendMessage(chatId, text);
    res.json({ status: 'OK' });
  } catch (err) {
    console.error('❌ [/internal/notify/checkout] send error:', err);
    res.status(500).json({ status: 'ERROR', message: 'Send failed' });
  }
});

const HTTP_PORT = process.env.BOT_HTTP_PORT || 3001;
app.listen(HTTP_PORT, () => {
  console.log(`🌐 Bot internal HTTP server listening on port ${HTTP_PORT}`);
});
