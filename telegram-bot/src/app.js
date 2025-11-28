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

// Простой HTTP-сервер для внутренних нотификаций
const app = express();
app.use(express.json());

bot
  .getMe()
  .then((me) => {
    console.log(`🤖 Bot started as @${me.username} (id=${me.id})`);
  })
  .catch((err) => {
    console.error('❌ getMe error:', err.message || err);
  });

// =========================
// /start с поддержкой payload (QR mc_<код>)
// =========================

async function sendDefaultStartMessage(chatId) {
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
        'Как подключиться:',
        '• Отсканируйте QR-код в магазине — вы попадёте в бота;',
        '• Либо используйте /join <токен>, если магазин выдал вам токен.',
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
    console.error('❌ [sendDefaultStartMessage] error:', err);
  }
}

// /start [payload]
bot.onText(/^\/start(?:@.+)?(?:\s+(.+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const from = msg.from || {};
  const payloadRaw = (match && match[1] ? match[1] : '').trim();

  // Есть payload (deep-link)
  if (payloadRaw) {
    console.log('[/start] payload:', payloadRaw);

    // Формат QR: mc_<merchantCode>
    if (/^mc_/i.test(payloadRaw)) {
      const merchantCodePart = payloadRaw.slice(3).trim();
      const merchantCode = merchantCodePart.toUpperCase();

      if (!merchantCode) {
        await bot.sendMessage(
          chatId,
          '❌ Некорректная ссылка. Попросите у персонала новый QR-код.',
        );
        return sendDefaultStartMessage(chatId);
      }

      try {
        await bot.sendChatAction(chatId, 'typing');

        // 1) Проверяем, что мерчант существует
        const merchRes = await fetch(
          `${API_BASE_URL}/api/v1/public/merchants/by-code/${encodeURIComponent(
            merchantCode,
          )}`,
        );
        const merchData = await merchRes.json();

        if (!merchRes.ok || merchData.status !== 'OK' || !merchData.merchant) {
          const msgText =
            merchData && merchData.message
              ? merchData.message
              : 'Не удалось найти магазин по этому QR-коду.';
          await bot.sendMessage(
            chatId,
            `❌ Ошибка при обработке QR-кода.\n${msgText}`,
          );
          return sendDefaultStartMessage(chatId);
        }

        const merchant = merchData.merchant;

        // 2) Автопривязка: POST /api/v1/bot/join-by-merchant-code
        const joinRes = await fetch(
          `${API_BASE_URL}/api/v1/bot/join-by-merchant-code`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              telegram_id: from.id,
              username: from.username || null,
              first_name: from.first_name || null,
              last_name: from.last_name || null,
              phone_number: null,
              merchant_code: merchant.code,
            }),
          },
        );

        let joinData = null;
        try {
          joinData = await joinRes.json();
        } catch (e) {
          joinData = null;
        }

        if (!joinRes.ok || !joinData || joinData.status !== 'OK') {
          const msgText =
            joinData && joinData.message
              ? joinData.message
              : 'Не удалось автоматически привязать аккаунт.';
          await bot.sendMessage(
            chatId,
            [
              `⚠ Магазин: ${merchant.name} (${merchant.code})`,
              '',
              '❌ ' + msgText,
              '',
              'Вы всё равно можете подключиться вручную, если у вас есть токен:',
              '/join <токен>',
            ].join('\n'),
          );
          return;
        }

        const linkedMerchant = joinData.merchant || merchant;
        const customer = joinData.customer;

        const lines = [
          '✅ Вы подключены к программе лояльности магазина.',
          '',
          `Магазин: ${linkedMerchant.name} (${linkedMerchant.code})`,
        ];

        if (customer && customer.id) {
          lines.push(`ID клиента: ${customer.id}`);
        }

        lines.push(
          '',
          'Теперь доступны команды:',
          '/balance — баланс и уровень',
          '/history — последние операции',
          '/code — временный код для оплаты',
          '/health — проверить, что бот жив',
        );

        await bot.sendMessage(chatId, lines.join('\n'));
        return;
      } catch (err) {
        console.error('❌ [/start mc_] error:', err);
        await bot.sendMessage(
          chatId,
          '❌ Внутренняя ошибка при обработке QR-ссылки. Попробуйте ещё раз позже.',
        );
        return sendDefaultStartMessage(chatId);
      }
    }

    // Payload есть, но формат не поддерживается
    console.log('[/start] unknown payload, fallback to default');
    return sendDefaultStartMessage(chatId);
  }

  // Обычный /start без payload
  return sendDefaultStartMessage(chatId);
});

// =========================
// /health
// =========================

bot.onText(/^\/health(?:@.+)?$/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, '✅ Bot is running.');
});

// =========================
// /join <token>
// =========================

bot.onText(/^\/join\s+(\S+)(?:@.+)?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const from = msg.from || {};
  const telegramId = from.id;
  const joinToken = match[1];

  try {
    await bot.sendChatAction(chatId, 'typing');

    const res = await fetch(`${API_BASE_URL}/api/v1/bot/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegram_id: telegramId,
        join_token: joinToken,
        username: from.username || null,
        first_name: from.first_name || null,
        last_name: from.last_name || null,
        phone_number: null,
      }),
    });

    const data = await res.json();

    if (!res.ok || data.status !== 'OK') {
      const msgText =
        data && data.message
          ? data.message
          : 'Не удалось привязать аккаунт. Попробуйте ещё раз.';
      await bot.sendMessage(
        chatId,
        `❌ Ошибка при привязке аккаунта.\n${msgText}`,
      );
      return;
    }

    await bot.sendMessage(
      chatId,
      [
        '✅ Аккаунт успешно привязан к программе лояльности.',
        '',
        `Магазин: ${data.merchant.name} (${data.merchant.code})`,
        `ID клиента: ${data.customer.id}`,
        '',
        'Теперь вы можете использовать команды:',
        '/balance — баланс и уровень',
        '/history — последние операции',
        '/code — временный код для оплаты',
      ].join('\n'),
    );
  } catch (err) {
    console.error('❌ [/join] error:', err);
    await bot.sendMessage(
      chatId,
      '❌ Внутренняя ошибка при привязке аккаунта. Попробуйте позже.',
    );
  }
});

// =========================
// /balance
// =========================

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
      await bot.sendMessage(
        chatId,
        `❌ Ошибка при получении баланса.\n${msgText}`,
      );
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

// =========================
// /history
// =========================

bot.onText(/^\/history(?:@.+)?$/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramUserId = msg.from.id;

  try {
    await bot.sendChatAction(chatId, 'typing');

    const url = `${API_BASE_URL}/api/v1/bot/history?telegram_id=${telegramUserId}&limit=10`;

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok || data.status !== 'OK') {
      const msgText =
        data && data.message
          ? data.message
          : 'Не удалось получить историю. Попробуйте ещё раз.';
      await bot.sendMessage(
        chatId,
        `❌ Ошибка при получении истории.\n${msgText}`,
      );
      return;
    }

    if (!data.items || data.items.length === 0) {
      await bot.sendMessage(chatId, '📜 История операций пуста.');
      return;
    }

    const lines = ['📜 Последние операции:', ''];

    for (const tx of data.items) {
      const dt = tx.created_at || tx.createdAt;
      const type = tx.transaction_type || tx.transactionType;
      const amount = tx.amount;
      const earned = tx.points_earned || 0;
      const spent = tx.points_spent || 0;

      let typeLabel = type;
      if (type === 'purchase') typeLabel = 'покупка';
      if (type === 'points_redemption') typeLabel = 'списание баллов';

      lines.push(
        [
          `• ${dt || ''}`,
          `  Тип: ${typeLabel}`,
          `  Сумма: ${amount}`,
          `  Начислено: ${earned}`,
          `  Списано: ${spent}`,
        ].join('\n'),
      );
    }

    await bot.sendMessage(chatId, lines.join('\n'));
  } catch (err) {
    console.error('❌ [/history] error:', err);
    await bot.sendMessage(
      chatId,
      '❌ Внутренняя ошибка при получении истории. Попробуйте ещё раз позже.',
    );
  }
});

// =========================
// /code — временный код
// =========================

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
// Внутренний HTTP-эндпоинт для уведомлений от API
// =========================

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
    return res
      .status(400)
      .json({ status: 'ERROR', message: 'Invalid payload' });
  }

  try {
    const chatId = telegramUserId;

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
