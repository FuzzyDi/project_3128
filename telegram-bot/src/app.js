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
  DATABASE_URL: process.env.DATABASE_URL ? '***' : undefined,
  REDIS_URL: process.env.REDIS_URL ? '***' : undefined,
});

const bot = new TelegramBot(TOKEN, { polling: true });
const app = express();
app.use(express.json());

// Утилита для логирования входящих апдейтов (минимально)
bot.on('message', (msg) => {
  console.log(
    `[TG] message from ${msg.from.id} (${msg.from.username || 'no-username'}): ${msg.text}`
  );
});

// /start с поддержкой payload (deep-link)
bot.onText(/^\/start(?:@.+)?(?:\s+(.+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const payloadRaw = (match && match[1] ? match[1] : '').trim();

  // Если есть payload из deep-link
  if (payloadRaw) {
    console.log('[/start] payload:', payloadRaw);

    // Формат mc_<merchantCode>
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

        const url = `${API_BASE_URL}/api/v1/public/merchants/by-code/${encodeURIComponent(
          merchantCode,
        )}`;
        const res = await fetch(url);
        const data = await res.json();

        if (!res.ok || data.status !== 'OK' || !data.merchant) {
          const msgText =
            data && data.message
              ? data.message
              : 'Не удалось найти магазин по этому QR-коду.';
          await bot.sendMessage(
            chatId,
            `❌ Ошибка при обработке QR-кода.\n${msgText}`,
          );
          return sendDefaultStartMessage(chatId);
        }

        const merchant = data.merchant;

        const lines = [
          '👋 Привет! Вы открыли бота программы лояльности.',
          '',
          `Магазин: ${merchant.name} (${merchant.code})`,
          '',
          'Чтобы привязать ваш Telegram к этой программе:',
          '• получите токен у кассира или в личном кабинете;',
          '• отправьте команду:',
          '/join <полученный_токен>',
          '',
          'Основные команды:',
          '/balance — баланс и уровень',
          '/history — последние операции',
          '/code — временный код для оплаты',
          '/health — проверить, что бот жив',
        ];

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

    // Payload есть, но формат не поддерживаем — просто покажем базовое приветствие
    console.log('[/start] unknown payload, fallback to default');
    return sendDefaultStartMessage(chatId);
  }

  // Обычный /start без параметров
  return sendDefaultStartMessage(chatId);
});

// Базовое приветствие /start без привязки к конкретному магазину
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
        telegram_id: telegramUserId,
        join_token: joinToken,
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
        `Магазин: ${data.merchant?.name || '—'}`,
        `Ваш ID в системе: ${data.customer?.id || '—'}`,
        '',
        'Доступные команды:',
        '/balance — баланс и уровень',
        '/history — последние операции',
        '/code — временный код для оплаты',
      ].join('\n')
    );
  } catch (err) {
    console.error('❌ [/join] error:', err);
    await bot.sendMessage(
      chatId,
      '❌ Внутренняя ошибка при привязке. Попробуйте позже.'
    );
  }
});

// /balance
bot.onText(/^\/balance(?:@.+)?$/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramUserId = msg.from.id;

  try {
    await bot.sendChatAction(chatId, 'typing');

    const url = `${API_BASE_URL}/api/v1/bot/balance?telegram_id=${encodeURIComponent(
      telegramUserId
    )}`;
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
      `• Клиент: ${b.customerName || '—'}`,
      `• Телеграм ID: ${telegramUserId}`,
      '',
      `• Текущий баланс: ${b.points ?? 0} баллов`,
      `• Суммарно начислено: ${b.totalEarned ?? 0} баллов`,
      `• Суммарно списано: ${b.totalSpent ?? 0} баллов`,
      '',
      b.level
        ? `• Уровень: ${b.level.name} (скидка ${b.level.discountPercent}%)`
        : '• Уровень: базовый',
    ].join('\n');

    await bot.sendMessage(chatId, text);
  } catch (err) {
    console.error('❌ [/balance] error:', err);
    await bot.sendMessage(
      chatId,
      '❌ Внутренняя ошибка при получении баланса. Попробуйте позже.'
    );
  }
});

// /history
bot.onText(/^\/history(?:@.+)?$/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramUserId = msg.from.id;

  try {
    await bot.sendChatAction(chatId, 'typing');

    const url = `${API_BASE_URL}/api/v1/bot/history?telegram_id=${encodeURIComponent(
      telegramUserId
    )}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok || data.status !== 'OK') {
      const msgText =
        data && data.message
          ? data.message
          : 'Не удалось получить историю операций.';
      await bot.sendMessage(chatId, `❌ Ошибка при получении истории.\n${msgText}`);
      return;
    }

    const txs = data.transactions || [];
    if (!txs.length) {
      await bot.sendMessage(chatId, '📭 У вас пока нет операций по программе лояльности.');
      return;
    }

    const lines = ['📜 Последние операции:'];

    for (const tx of txs) {
      const dt = tx.createdAt || tx.created_at;
      const amount = tx.amount ?? 0;
      const earned = tx.pointsEarned ?? 0;
      const spent = tx.pointsSpent ?? 0;
      const type = tx.transactionType || tx.type || 'unknown';

      let typeLabel = 'операция';
      if (type === 'purchase') typeLabel = 'покупка';
      if (type === 'points_redemption') typeLabel = 'списание баллов';
      if (type === 'adjustment') typeLabel = 'корректировка';

      lines.push(
        [
          '',
          `• ${typeLabel}`,
          `  Сумма: ${amount}`,
          `  Начислено: ${earned}`,
          `  Списано: ${spent}`,
          dt ? `  Дата: ${dt}` : '',
        ].join('\n')
      );
    }

    await bot.sendMessage(chatId, lines.join('\n'));
  } catch (err) {
    console.error('❌ [/history] error:', err);
    await bot.sendMessage(
      chatId,
      '❌ Внутренняя ошибка при получении истории. Попробуйте позже.'
    );
  }
});

// /code — получение временного кода для оплаты
bot.onText(/^\/code(?:@.+)?$/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramUserId = msg.from.id;

  try {
    await bot.sendChatAction(chatId, 'typing');

    const res = await fetch(`${API_BASE_URL}/api/v1/bot/session-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_id: telegramUserId }),
    });

    const data = await res.json();

    if (!res.ok || data.status !== 'OK') {
      const msgText =
        data && data.message
          ? data.message
          : 'Не удалось сгенерировать код. Попробуйте ещё раз.';
      await bot.sendMessage(chatId, `❌ Ошибка при генерации кода.\n${msgText}`);
      return;
    }

    const c = data.code;
    const text = [
      '🔐 Ваш временный код для оплаты:',
      '',
      `• Код: ${c.code}`,
      `• Истекает через: ${c.expiresInSeconds} сек.`,
      '',
      'Сообщите этот код кассиру, чтобы провести оплату с использованием баллов.',
    ].join('\n');

    await bot.sendMessage(chatId, text);
  } catch (err) {
    console.error('❌ [/code] error:', err);
    await bot.sendMessage(
      chatId,
      '❌ Внутренняя ошибка при генерации кода. Попробуйте позже.'
    );
  }
});

/**
 * Внутренний HTTP-эндпоинт для уведомлений от API (например, когда прошла покупка).
 * Пример: POST /internal/notify/checkout
 */
app.post('/internal/notify/checkout', async (req, res) => {
  try {
    const { telegram_id, amount, points_earned, points_spent, merchant_name } = req.body;

    if (!telegram_id) {
      return res.status(400).json({
        status: 'ERROR',
        message: 'telegram_id is required',
      });
    }

    const chatId = telegram_id;
    const parts = [
      '🧾 Покупка по программе лояльности',
      '',
      merchant_name ? `Магазин: ${merchant_name}` : '',
      `Сумма чека: ${amount ?? 0}`,
      `Начислено баллов: ${points_earned ?? 0}`,
      `Списано баллов: ${points_spent ?? 0}`,
    ].filter(Boolean);

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
