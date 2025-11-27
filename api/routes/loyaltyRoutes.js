// routes/loyaltyRoutes.js
'use strict';

const express = require('express');
const { Pool } = require('pg');

const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

function logAndWrap(context, err) {
  console.error(`❌ [LOYALTY API] ${context}:`, err.message || err);
  const error = new Error('Internal server error');
  error.status = 500;
  return error;
}

// --- HEALTHCHECK ДЛЯ ВЕТКИ LOYALTY ---
//
// GET /api/v1/loyalty/health
router.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'OK',
      message: 'Loyalty API is healthy',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('❌ [LOYALTY API] health error:', err.message || err);
    res.status(500).json({
      status: 'ERROR',
      message: 'Loyalty API health check failed',
    });
  }
});

/**
 * Получить мерчанта по X-API-Key.
 * Бросает ошибку с code='UNAUTHORIZED' или 'FORBIDDEN' при проблемах.
 */
async function getMerchantByApiKey(client, apiKey) {
  if (!apiKey) {
    const err = new Error('API Key required');
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  const res = await client.query(
    `
    SELECT
      id,
      code,
      name,
      api_key,
      earn_rate_per_1000
    FROM merchants
    WHERE api_key = $1
    `,
    [apiKey],
  );

  if (res.rowCount === 0) {
    const err = new Error('Merchant not found for provided API key');
    err.code = 'FORBIDDEN';
    throw err;
  }

  return res.rows[0]; // { id, code, name, api_key, earn_rate_per_1000 }
}

/**
 * Проверить, что customer_merchant_id принадлежит этому мерчанту.
 * Бросает ошибку с code='FORBIDDEN', если нет.
 */
async function ensureCustomerMerchantBelongsToMerchant(client, customerMerchantId, merchantId) {
  const res = await client.query(
    `
    SELECT id
    FROM customer_merchants
    WHERE id = $1 AND merchant_id = $2
    `,
    [customerMerchantId, merchantId],
  );

  if (res.rowCount === 0) {
    const err = new Error('customerMerchantId does not belong to this merchant');
    err.code = 'FORBIDDEN';
    throw err;
  }
}

/**
 * Внутренняя функция: применить транзакцию
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

  // 1) Читаем текущий баланс
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

  // 2) Пишем транзакцию
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

  // 3) Обновляем / создаём запись в loyalty_points
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
 * POST /api/v1/loyalty/transactions
 *
 * Универсальный endpoint: начисление/списание баллов.
 * Требует X-API-Key и customerMerchantId, который принадлежит этому мерчанту.
 */
router.post('/transactions', async (req, res) => {
  const {
    customerMerchantId,
    amount,
    pointsEarned,
    pointsSpent,
    transactionType,
    status,
  } = req.body || {};

  if (!customerMerchantId) {
    return res.status(400).json({
      status: 'ERROR',
      message: 'customerMerchantId обязателен',
    });
  }

  const apiKey = req.headers['x-api-key'];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const merchant = await getMerchantByApiKey(client, apiKey);
    await ensureCustomerMerchantBelongsToMerchant(client, customerMerchantId, merchant.id);

    const result = await applyTransaction(client, {
      customerMerchantId,
      amount,
      pointsEarned,
      pointsSpent,
      transactionType,
      status,
    });

    await client.query('COMMIT');

    return res.json({
      status: 'OK',
      merchant: {
        id: merchant.id,
        code: merchant.code,
        name: merchant.name,
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
    if (err.code === 'INVALID_POINTS') {
      return res.status(400).json({
        status: 'ERROR',
        message: 'pointsEarned и pointsSpent должны быть >= 0',
      });
    }
    if (err.code === 'INSUFFICIENT_POINTS') {
      return res.status(400).json({
        status: 'ERROR',
        message: 'Недостаточно баллов для списания',
        ...err.meta,
      });
    }

    logAndWrap('transactions', err);
    return res.status(500).json({
      status: 'ERROR',
      message: 'Ошибка при обработке транзакции',
    });
  } finally {
    client.release();
  }
});

/**
 * POST /api/v1/loyalty/purchase
 *
 * Начисление баллов по сумме покупки.
 * Правило: 1 балл за каждые 1000 единиц суммы.
 * Требует X-API-Key + правильного customerMerchantId.
 */
router.post('/purchase', async (req, res) => {
  const { customerMerchantId, amount } = req.body || {};

  if (!customerMerchantId || amount == null) {
    return res.status(400).json({
      status: 'ERROR',
      message: 'customerMerchantId и amount обязательны',
    });
  }

  const amt = Number(amount);
  if (Number.isNaN(amt) || amt <= 0) {
    return res.status(400).json({
      status: 'ERROR',
      message: 'amount должен быть положительным числом',
    });
  }

  const apiKey = req.headers['x-api-key'];
  const client = await pool.connect();
	try {
	  await client.query('BEGIN');

	  const merchant = await getMerchantByApiKey(client, apiKey);
	  await ensureCustomerMerchantBelongsToMerchant(client, customerMerchantId, merchant.id);

	  // коэффициент мерчанта, по умолчанию 1
	  const earnRate = Number(merchant.earn_rate_per_1000 || 1);

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
		rule: {
		  type: 'simple_rate',
		  description: `${earnRate} балл(ов) за каждые 1000 единиц суммы`,
		},
		...result,
	  });

    await client.query('COMMIT');

    return res.json({
      status: 'OK',
      merchant: {
        id: merchant.id,
        code: merchant.code,
        name: merchant.name,
      },
      rule: {
        type: 'simple_rate',
        description: '1 балл за каждые 1000 единиц суммы',
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

    logAndWrap('purchase', err);
    return res.status(500).json({
      status: 'ERROR',
      message: 'Ошибка при обработке покупки',
    });
  } finally {
    client.release();
  }
});

/**
 * POST /api/v1/loyalty/redeem
 *
 * Списание баллов.
 * Требует X-API-Key + customerMerchantId, принадлежащий мерчанту.
 */
router.post('/redeem', async (req, res) => {
  const { customerMerchantId, points, amount } = req.body || {};

  if (!customerMerchantId || points == null) {
    return res.status(400).json({
      status: 'ERROR',
      message: 'customerMerchantId и points обязательны',
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
  const apiKey = req.headers['x-api-key'];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const merchant = await getMerchantByApiKey(client, apiKey);
    await ensureCustomerMerchantBelongsToMerchant(client, customerMerchantId, merchant.id);

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

    logAndWrap('redeem', err);
    return res.status(500).json({
      status: 'ERROR',
      message: 'Ошибка при списании баллов',
    });
  } finally {
    client.release();
  }
});

module.exports = router;
