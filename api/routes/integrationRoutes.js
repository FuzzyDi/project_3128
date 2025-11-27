// routes/integrationRoutes.js
'use strict';

const express = require('express');
const { Pool } = require('pg');

const router = express.Router();
const {
  getMerchantByApiKey,
  mapMerchantToPublicSettings,
} = require('../services/merchantService');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

function logError(context, err) {
  console.error(`❌ [INTEGRATION API] ${context}:`, err.message || err);
}

/**
 * Найти или создать клиента + связку customer_merchants
 * по externalCustomerId (и, опционально, phone).
 */
async function getOrCreateCustomerMerchant(client, merchantId, externalCustomerId, phone) {
  // 1) ищем / создаём клиента
  let customerRes = await client.query(
    `
    SELECT id
    FROM customers
    WHERE external_id = $1
    `,
    [externalCustomerId],
  );

  let customerId;
  if (customerRes.rowCount === 0) {
    const insertCustomer = await client.query(
      `
      INSERT INTO customers (external_id, phone, created_at)
      VALUES ($1, $2, NOW())
      RETURNING id
      `,
      [externalCustomerId, phone || null],
    );
    customerId = insertCustomer.rows[0].id;
  } else {
    customerId = customerRes.rows[0].id;

    // обновим телефон, если он передан и раньше был NULL
    if (phone) {
      await client.query(
        `
        UPDATE customers
           SET phone = COALESCE(phone, $2)
         WHERE id = $1
        `,
        [customerId, phone],
      );
    }
  }

  // 2) ищем / создаём связку customer_merchants
  let cmRes = await client.query(
    `
    SELECT id
    FROM customer_merchants
    WHERE customer_id = $1 AND merchant_id = $2
    `,
    [customerId, merchantId],
  );

  let customerMerchantId;
  if (cmRes.rowCount === 0) {
    const insertCM = await client.query(
      `
      INSERT INTO customer_merchants (customer_id, merchant_id, created_at)
      VALUES ($1, $2, NOW())
      RETURNING id
      `,
      [customerId, merchantId],
    );
    customerMerchantId = insertCM.rows[0].id;
  } else {
    customerMerchantId = cmRes.rows[0].id;
  }

  return { customerId, customerMerchantId };
}

/**
 * Общая функция применения транзакции (как в loyaltyRoutes).
 */
async function applyTransaction(client, {
  customerMerchantId,
  amount,
  pointsEarned,
  pointsSpent,
  transactionType,
  status,
}) {
  const earned = Number(pointsEarned || 0);
  const spent = Number(pointsSpent || 0);
  const amt = amount != null ? Number(amount) : 0;

  if (earned < 0 || spent < 0) {
    const err = new Error('pointsEarned/pointsSpent must be >= 0');
    err.code = 'INVALID_POINTS';
    throw err;
  }

  // читаем текущий баланс
  const lpRes = await client.query(
    `
    SELECT
      points,
      total_earned,
      total_spent
    FROM loyalty_points
    WHERE customer_merchant_id = $1
    FOR UPDATE
    `,
    [customerMerchantId],
  );

  let currentPoints = 0;
  let totalEarned = 0;
  let totalSpent = 0;

  if (lpRes.rowCount > 0) {
    const lp = lpRes.rows[0];
    currentPoints = Number(lp.points || 0);
    totalEarned = Number(lp.total_earned || 0);
    totalSpent = Number(lp.total_spent || 0);
  }

  const newPoints = currentPoints + earned - spent;
  if (newPoints < 0) {
    const err = new Error('Недостаточно баллов для списания');
    err.code = 'INSUFFICIENT_POINTS';
    err.meta = { currentPoints, requestedSpend: spent };
    throw err;
  }

  const newTotalEarned = totalEarned + earned;
  const newTotalSpent = totalSpent + spent;

  // пишем транзакцию
  const txRes = await client.query(
    `
    INSERT INTO transactions (
      customer_merchant_id,
      amount,
      points_earned,
      points_spent,
      transaction_type,
      status
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, created_at
    `,
    [
      customerMerchantId,
      amt,
      earned,
      spent,
      transactionType || 'operation',
      status || 'completed',
    ],
  );
  const tx = txRes.rows[0];

  // обновляем / создаём loyalty_points
  if (lpRes.rowCount === 0) {
    await client.query(
      `
      INSERT INTO loyalty_points (
        customer_merchant_id,
        points,
        level,
        total_earned,
        total_spent,
        last_activity
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      `,
      [
        customerMerchantId,
        newPoints,
        'bronze',
        newTotalEarned,
        newTotalSpent,
      ],
    );
  } else {
    await client.query(
      `
      UPDATE loyalty_points
         SET points        = $2,
             total_earned  = $3,
             total_spent   = $4,
             last_activity = NOW()
       WHERE customer_merchant_id = $1
      `,
      [
        customerMerchantId,
        newPoints,
        newTotalEarned,
        newTotalSpent,
      ],
    );
  }

  return {
    transaction: {
      id: tx.id,
      customerMerchantId,
      amount: amt,
      pointsEarned: earned,
      pointsSpent: spent,
      transactionType: transactionType || 'operation',
      status: status || 'completed',
      createdAt: tx.created_at,
    },
    balance: {
      points: newPoints,
      total_earned: newTotalEarned,
      total_spent: newTotalSpent,
    },
  };
}

/**
 * === ИНТЕГРАЦИЯ ПО externalCustomerId (старый поток) ===
 */

router.post('/purchase', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  const { externalCustomerId, phone, amount } = req.body || {};

  if (!externalCustomerId || amount == null) {
    return res.status(400).json({
      status: 'ERROR',
      message: 'externalCustomerId и amount обязательны',
    });
  }

  const amt = Number(amount);
  if (Number.isNaN(amt) || amt <= 0) {
    return res.status(400).json({
      status: 'ERROR',
      message: 'amount должен быть положительным числом',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // используем общий сервис мерчанта
    const merchantRow = await getMerchantByApiKey(apiKey, client);
    const merchant = mapMerchantToPublicSettings(merchantRow);
    const earnRate = merchant.earnRatePer1000 || 1;

    const { customerId, customerMerchantId } =
      await getOrCreateCustomerMerchant(client, merchant.id, externalCustomerId, phone);

    // правило: earnRate баллов за каждые 1000 единиц суммы
    const pointsEarned = Math.floor((amt / 1000) * earnRate);

    const result = await applyTransaction(client, {
      customerMerchantId,
      amount: amt,
      pointsEarned,
      pointsSpent: 0,
      transactionType: 'purchase',
      status: 'completed',
    });

    await client.query('COMMIT');

    return res.json({
      status: 'OK',
      merchant: {
        id: merchant.id,
        code: merchant.code,
        name: merchant.name,
        earnRatePer1000: earnRate,
      },
      customer: {
        id: customerId,
        externalId: externalCustomerId,
        phone: phone || null,
        customerMerchantId,
      },
      rule: {
        type: 'simple_rate',
        description: `${earnRate} балл(ов) за каждые 1000 единиц суммы`,
      },
      ...result,
    });
  } catch (err) {
    await client.query('ROLLBACK');

    if (err.code === 'UNAUTHORIZED') {
      return res.status(401).json({ status: 'ERROR', message: 'API Key required' });
    }
    if (err.code === 'FORBIDDEN') {
      return res.status(403).json({ status: 'ERROR', message: err.message });
    }

    logError('purchase', err);
    return res.status(500).json({
      status: 'ERROR',
      message: 'Ошибка при обработке покупки',
    });
  } finally {
    client.release();
  }
});

router.post('/redeem', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  const { externalCustomerId, phone, points, amount } = req.body || {};

  if (!externalCustomerId || points == null) {
    return res.status(400).json({
      status: 'ERROR',
      message: 'externalCustomerId и points обязательны',
    });
  }

  const pts = Number(points);
  if (Number.isNaN(pts) || pts <= 0) {
    return res.status(400).json({
      status: 'ERROR',
      message: 'points должен быть положительным числом',
    });
  }

  const amt = amount != null ? Number(amount) : 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const merchantRow = await getMerchantByApiKey(apiKey, client);
    const merchant = mapMerchantToPublicSettings(merchantRow);

    const { customerId, customerMerchantId } =
      await getOrCreateCustomerMerchant(client, merchant.id, externalCustomerId, phone);

    const result = await applyTransaction(client, {
      customerMerchantId,
      amount: amt,
      pointsEarned: 0,
      pointsSpent: pts,
      transactionType: 'points_redemption',
      status: 'completed',
    });

    await client.query('COMMIT');

    return res.json({
      status: 'OK',
      merchant: {
        id: merchant.id,
        code: merchant.code,
        name: merchant.name,
      },
      customer: {
        id: customerId,
        externalId: externalCustomerId,
        phone: phone || null,
        customerMerchantId,
      },
      ...result,
    });
  } catch (err) {
    await client.query('ROLLBACK');

    if (err.code === 'UNAUTHORIZED') {
      return res.status(401).json({ status: 'ERROR', message: 'API Key required' });
    }
    if (err.code === 'FORBIDDEN') {
      return res.status(403).json({ status: 'ERROR', message: err.message });
    }
    if (err.code === 'INSUFFICIENT_POINTS') {
      return res.status(400).json({
        status: 'ERROR',
        message: 'Недостаточно баллов для списания',
        ...err.meta,
      });
    }

    logError('redeem', err);
    return res.status(500).json({
      status: 'ERROR',
      message: 'Ошибка при списании баллов',
    });
  } finally {
    client.release();
  }
});

/**
 * === НОВОЕ: интеграция по временным 6-значным кодам (касса/QR) ===
 */

router.post('/lookup', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  const { sessionCode } = req.body || {};

  if (sessionCode == null) {
    return res.status(400).json({
      status: 'ERROR',
      message: 'sessionCode обязателен',
    });
  }

  const raw = String(sessionCode).trim();
  if (!/^\d{1,6}$/.test(raw)) {
    return res.status(400).json({
      status: 'ERROR',
      message: 'sessionCode должен содержать от 1 до 6 цифр',
    });
  }
  const code = raw.padStart(6, '0');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const merchantRow = await getMerchantByApiKey(apiKey, client);
    const merchant = mapMerchantToPublicSettings(merchantRow);

    const sessRes = await client.query(
      `
      SELECT
        lsc.id,
        lsc.merchant_id,
        lsc.customer_merchant_id,
        lsc.telegram_user_id,
        lsc.session_code,
        lsc.expires_at,
        lsc.used_at,
        lsc.status,
        cm.customer_id,
        c.external_id,
        c.phone
      FROM loyalty_session_codes lsc
      JOIN customer_merchants cm
        ON cm.id = lsc.customer_merchant_id
      JOIN customers c
        ON c.id = cm.customer_id
      WHERE lsc.merchant_id = $1
        AND lsc.session_code = $2
        AND lsc.status = 'active'
        AND lsc.expires_at > NOW()
      LIMIT 1
      `,
      [merchant.id, code],
    );

    if (sessRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        status: 'ERROR',
        message: 'Код не найден или истёк',
      });
    }

    const sess = sessRes.rows[0];

    const lpRes = await client.query(
      `
      SELECT
        points,
        total_earned,
        total_spent,
        last_activity
      FROM loyalty_points
      WHERE customer_merchant_id = $1
      `,
      [sess.customer_merchant_id],
    );

    let points = 0;
    let totalEarned = 0;
    let totalSpent = 0;
    let lastActivity = null;

    if (lpRes.rowCount > 0) {
      const lp = lpRes.rows[0];
      points = Number(lp.points || 0);
      totalEarned = Number(lp.total_earned || 0);
      totalSpent = Number(lp.total_spent || 0);
      lastActivity = lp.last_activity;
    }

    await client.query('COMMIT');

    return res.json({
      status: 'OK',
      // отдаём мерчанта с полными настройками, как в /api/v1/merchant
      merchant: {
        id: merchant.id,
        code: merchant.code,
        name: merchant.name,
        status: merchant.status,
        timezone: merchant.timezone,
        earnRatePer1000: merchant.earnRatePer1000,
        redeemMaxPercent: merchant.redeemMaxPercent,
        minReceiptAmountForEarn: merchant.minReceiptAmountForEarn,
        redeemMinPoints: merchant.redeemMinPoints,
        redeemStep: merchant.redeemStep,
        maxPointsPerReceipt: merchant.maxPointsPerReceipt,
        maxPointsPerDay: merchant.maxPointsPerDay,
      },
      customer: {
        id: sess.customer_id,
        customerMerchantId: sess.customer_merchant_id,
        externalId: sess.external_id,
        phone: sess.phone,
      },
      balance: {
        points,
        total_earned: totalEarned,
        total_spent: totalSpent,
        last_activity: lastActivity,
        // для удобства фронта/кассы: максимум по текущему балансу
        maxRedeemByBalance: points,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');

    if (err.code === 'UNAUTHORIZED') {
      return res.status(401).json({ status: 'ERROR', message: 'API Key required' });
    }
    if (err.code === 'FORBIDDEN') {
      return res.status(403).json({ status: 'ERROR', message: err.message });
    }

    logError('lookup', err);
    return res.status(500).json({
      status: 'ERROR',
      message: 'Ошибка при получении баланса',
    });
  } finally {
    client.release();
  }
});

router.post('/checkout', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  const { sessionCode, receiptId, amount, redeemPoints } = req.body || {};

  // 0) Базовая валидация входа
  if (sessionCode == null || amount == null) {
    return res.status(400).json({
      status: 'ERROR',
      message: 'sessionCode и amount обязательны',
    });
  }

  const raw = String(sessionCode).trim();
  if (!/^\d{1,6}$/.test(raw)) {
    return res.status(400).json({
      status: 'ERROR',
      message: 'sessionCode должен содержать от 1 до 6 цифр',
    });
  }
  const code = raw.padStart(6, '0');

  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({
      status: 'ERROR',
      message: 'amount должен быть положительным числом',
    });
  }

  const redeem = redeemPoints != null ? Number(redeemPoints) : 0;
  if (!Number.isFinite(redeem) || redeem < 0) {
    return res.status(400).json({
      status: 'ERROR',
      message: 'redeemPoints должен быть неотрицательным числом',
    });
  }

  const client = await pool.connect();
  let resultPayload = null;
  let telegramUserId = null;

  try {
    await client.query('BEGIN');

    // 1) Мерчант + его настройки
    const merchantRow = await getMerchantByApiKey(apiKey, client);
    const merchant = mapMerchantToPublicSettings(merchantRow);

    const {
      earnRatePer1000,
      redeemMaxPercent,
      minReceiptAmountForEarn,
      redeemMinPoints,
      redeemStep,
      maxPointsPerReceipt,
      // maxPointsPerDay пока не используем
    } = merchant;

    // 2) Находим и блокируем код
    const sessRes = await client.query(
      `
      SELECT
        lsc.id,
        lsc.merchant_id,
        lsc.customer_merchant_id,
        lsc.telegram_user_id,
        lsc.session_code,
        lsc.expires_at,
        lsc.used_at,
        lsc.status,
        cm.customer_id,
        c.external_id,
        c.phone
      FROM loyalty_session_codes lsc
      JOIN customer_merchants cm
        ON cm.id = lsc.customer_merchant_id
      JOIN customers c
        ON c.id = cm.customer_id
      WHERE lsc.merchant_id = $1
        AND lsc.session_code = $2
      FOR UPDATE
      `,
      [merchant.id, code],
    );

    if (sessRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        status: 'ERROR',
        message: 'Код не найден',
      });
    }

    const sess = sessRes.rows[0];

    if (sess.status !== 'active' || sess.expires_at <= new Date()) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: 'ERROR',
        message: 'Код уже использован или истёк',
      });
    }

    const customerMerchantId = sess.customer_merchant_id;
    telegramUserId = sess.telegram_user_id;
    const transactions = [];

    // 3) Бизнес-валидация списания
    if (redeem > 0) {
      if (redeemMinPoints > 0 && redeem < redeemMinPoints) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          status: 'ERROR',
          message: `Минимальное списание: ${redeemMinPoints} баллов`,
        });
      }

      if (redeemStep > 1 && redeem % redeemStep !== 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          status: 'ERROR',
          message: `Сумма списания должна быть кратна ${redeemStep} баллам`,
        });
      }

      if (redeemMaxPercent != null && redeemMaxPercent >= 0 && redeemMaxPercent <= 100) {
        const maxByPercent = Math.floor((amt * redeemMaxPercent) / 100);
        if (redeem > maxByPercent) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            status: 'ERROR',
            message: `Нельзя списать больше ${maxByPercent} баллов (${redeemMaxPercent}% от суммы чека)`,
            meta: {
              maxByPercent,
              redeemRequested: redeem,
            },
          });
        }
      }

      if (maxPointsPerReceipt != null && maxPointsPerReceipt >= 0 && redeem > maxPointsPerReceipt) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          status: 'ERROR',
          message: `Нельзя списать больше ${maxPointsPerReceipt} баллов за один чек`,
          meta: {
            maxPointsPerReceipt,
            redeemRequested: redeem,
          },
        });
      }
    }

    // 4) Списание (если надо)
    if (redeem > 0) {
      const redeemResult = await applyTransaction(client, {
        customerMerchantId,
        amount: amt,
        pointsEarned: 0,
        pointsSpent: redeem,
        transactionType: 'points_redemption',
        status: 'completed',
      });
      transactions.push(redeemResult.transaction);
    }

    // 5) Начисление по сумме покупки
    let pointsEarned = 0;
    if (!minReceiptAmountForEarn || amt >= minReceiptAmountForEarn) {
      const rate = earnRatePer1000 || 1;
      pointsEarned = Math.floor((amt / 1000) * rate);
    }

    const purchaseResult = await applyTransaction(client, {
      customerMerchantId,
      amount: amt,
      pointsEarned,
      pointsSpent: 0,
      transactionType: 'purchase',
      status: 'completed',
    });

    transactions.push(purchaseResult.transaction);

    // 6) Пометить код использованным
    await client.query(
      `
      UPDATE loyalty_session_codes
         SET status = 'used',
             used_at = NOW()
       WHERE id = $1
      `,
      [sess.id],
    );

    await client.query('COMMIT');

    resultPayload = {
      status: 'OK',
      merchant: {
        id: merchant.id,
        code: merchant.code,
        name: merchant.name,
        earnRatePer1000,
        redeemMaxPercent,
        minReceiptAmountForEarn,
        redeemMinPoints,
        redeemStep,
        maxPointsPerReceipt,
      },
      customer: {
        id: sess.customer_id,
        customerMerchantId,
        externalId: sess.external_id,
        phone: sess.phone,
      },
      transactions,
      balance: purchaseResult.balance,
      receiptId: receiptId || null,
      summary: {
        amount: amt,
        pointsEarned,
        pointsSpent: redeem,
      },
    };

    res.json(resultPayload);
  } catch (err) {
    await client.query('ROLLBACK');

    if (err.code === 'UNAUTHORIZED') {
      return res.status(401).json({ status: 'ERROR', message: 'API Key required' });
    }
    if (err.code === 'FORBIDDEN') {
      return res.status(403).json({ status: 'ERROR', message: err.message });
    }
    if (err.code === 'INSUFFICIENT_POINTS') {
      return res.status(400).json({
        status: 'ERROR',
        message: 'Недостаточно баллов для списания',
        ...(err.meta || {}),
      });
    }

    logError('checkout', err);
    return res.status(500).json({
      status: 'ERROR',
      message: 'Ошибка при закрытии чека',
    });
  } finally {
    client.release();
  }

  // 7) Фоновое уведомление бота
  try {
    if (telegramUserId && resultPayload) {
      const notifyBody = {
        telegramUserId,
        merchant: resultPayload.merchant,
        customer: resultPayload.customer,
        amount: resultPayload.summary.amount,
        pointsEarned: resultPayload.summary.pointsEarned,
        pointsSpent: resultPayload.summary.pointsSpent,
        balance: resultPayload.balance,
        receiptId: resultPayload.receiptId,
      };

      await fetch('http://telegram-bot:3001/internal/notify/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notifyBody),
      }).catch((err) => {
        console.error('⚠️ [CHECKOUT] notify bot error (fetch catch):', err.message || err);
      });
    }
  } catch (err) {
    console.error('⚠️ [CHECKOUT] notify bot outer error:', err.message || err);
  }
});

module.exports = router;
