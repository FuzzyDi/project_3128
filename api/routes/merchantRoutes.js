const express = require('express');
const router = express.Router();

const { pool } = require('../db');
const { getMerchantByApiKey } = require('../services/merchantService');
const { logError } = require('../utils/logger');

/**
 * GET /api/v1/merchant
 * Профиль и настройки мерчанта по X-API-Key
 */
router.get('/', async (req, res) => {
  const apiKey = req.headers['x-api-key'];

  try {
    const merchant = await getMerchantByApiKey(apiKey);

    return res.json({
      merchant: {
        id: merchant.id,
        code: merchant.code,
        name: merchant.name,
        timezone: merchant.timezone,
        createdAt: merchant.created_at,
        earnRatePer1000: merchant.earn_rate_per_1000,
        redeemMaxPercent: merchant.redeem_max_percent,
        minReceiptAmountForEarn: merchant.min_receipt_amount_for_earn,
        redeemMinPoints: merchant.redeem_min_points,
        redeemStep: merchant.redeem_step,
        maxPointsPerReceipt: merchant.max_points_per_receipt,
        maxPointsPerDay: merchant.max_points_per_day,
      },
    });
  } catch (err) {
    if (err.code === 'UNAUTHORIZED') {
      return res.status(401).json({ error: 'API Key required' });
    }
    if (err.code === 'FORBIDDEN') {
      return res.status(403).json({ error: err.message });
    }
    logError('get /merchant', err);
    return res.status(500).json({ error: 'Failed to fetch merchant' });
  }
});

/**
 * GET /api/v1/merchant/customers
 * Список клиентов, привязанных к мерчанту
 */
router.get('/customers', async (req, res) => {
  const apiKey = req.headers['x-api-key'];

  try {
    const merchant = await getMerchantByApiKey(apiKey);

    const result = await pool.query(
      `
      SELECT
        cm.id        AS customer_merchant_id,
        c.id         AS customer_id,
        c.external_id,
        c.phone,
        cm.joined_at
      FROM customer_merchants cm
      JOIN customers c
        ON c.id = cm.customer_id
      WHERE cm.merchant_id = $1
      ORDER BY cm.joined_at DESC
      LIMIT 200
      `,
      [merchant.id],
    );

    return res.json({
      merchant: {
        id: merchant.id,
        code: merchant.code,
        name: merchant.name,
      },
      customers: result.rows.map((row) => ({
        customerMerchantId: row.customer_merchant_id,
        customerId: row.customer_id,
        externalId: row.external_id,
        phone: row.phone,
        joinedAt: row.joined_at,
      })),
    });
  } catch (err) {
    if (err.code === 'UNAUTHORIZED') {
      return res.status(401).json({ error: 'API Key required' });
    }
    if (err.code === 'FORBIDDEN') {
      return res.status(403).json({ error: err.message });
    }
    logError('get /merchant/customers', err);
    return res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

/**
 * GET /api/v1/merchant/transactions?limit=50
 * Последние транзакции по мерчанту
 */
router.get('/transactions', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  let limit = parseInt(req.query.limit, 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = 50;
  if (limit > 200) limit = 200;

  try {
    const merchant = await getMerchantByApiKey(apiKey);

    const result = await pool.query(
      `
      SELECT
        t.id,
        t.customer_merchant_id,
        c.id          AS customer_id,
        c.external_id,
        c.phone,
        t.amount,
        t.points_earned,
        t.points_spent,
        t.transaction_type,
        t.status,
        t.created_at
      FROM transactions t
      JOIN customer_merchants cm
        ON cm.id = t.customer_merchant_id
      JOIN customers c
        ON c.id = cm.customer_id
      WHERE cm.merchant_id = $1
      ORDER BY t.created_at DESC
      LIMIT $2
      `,
      [merchant.id, limit],
    );

    return res.json({
      merchant: {
        id: merchant.id,
        code: merchant.code,
        name: merchant.name,
      },
      limit,
      transactions: result.rows.map((row) => ({
        id: row.id,
        customerMerchantId: row.customer_merchant_id,
        customerId: row.customer_id,
        externalId: row.external_id,
        phone: row.phone,
        amount: Number(row.amount || 0),
        pointsEarned: Number(row.points_earned || 0),
        pointsSpent: Number(row.points_spent || 0),
        transactionType: row.transaction_type,
        status: row.status,
        createdAt: row.created_at,
      })),
    });
  } catch (err) {
    if (err.code === 'UNAUTHORIZED') {
      return res.status(401).json({ error: 'API Key required' });
    }
    if (err.code === 'FORBIDDEN') {
      return res.status(403).json({ error: err.message });
    }
    logError('get /merchant/transactions', err);
    return res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

/**
 * GET /api/v1/merchant/dashboard
 * Сводка по мерчанту:
 * - профиль
 * - количество клиентов
 * - суммарно начисленные/списанные баллы
 * - последние операции
 */
router.get('/dashboard', async (req, res) => {
  const apiKey = req.headers['x-api-key'];

  try {
    const merchant = await getMerchantByApiKey(apiKey);

    // 1) Кол-во клиентов
    const customersRes = await pool.query(
      `
      SELECT COUNT(*)::int AS cnt
        FROM customer_merchants
       WHERE merchant_id = $1
      `,
      [merchant.id],
    );
    const customersCount = customersRes.rows[0]?.cnt ?? 0;

    // 2) Общая статистика баллов по транзакциям
    const statsRes = await pool.query(
      `
      SELECT
        COALESCE(SUM(t.points_earned), 0)::bigint AS total_earned,
        COALESCE(SUM(t.points_spent),  0)::bigint AS total_spent
      FROM transactions t
      JOIN customer_merchants cm
        ON cm.id = t.customer_merchant_id
      WHERE cm.merchant_id = $1
      `,
      [merchant.id],
    );

    const totalEarned = Number(statsRes.rows[0]?.total_earned ?? 0);
    const totalSpent  = Number(statsRes.rows[0]?.total_spent  ?? 0);

    // 3) Последние операции (20 штук)
    const lastTxRes = await pool.query(
      `
      SELECT
        t.id,
        t.customer_merchant_id,
        c.id          AS customer_id,
        c.external_id,
        c.phone,
        t.amount,
        t.points_earned,
        t.points_spent,
        t.transaction_type,
        t.status,
        t.created_at
      FROM transactions t
      JOIN customer_merchants cm
        ON cm.id = t.customer_merchant_id
      JOIN customers c
        ON c.id = cm.customer_id
      WHERE cm.merchant_id = $1
      ORDER BY t.created_at DESC
      LIMIT 20
      `,
      [merchant.id],
    );

    const transactions = lastTxRes.rows.map((row) => ({
      id: row.id,
      customerMerchantId: row.customer_merchant_id,
      customerId: row.customer_id,
      externalId: row.external_id,
      phone: row.phone,
      amount: Number(row.amount || 0),
      pointsEarned: Number(row.points_earned || 0),
      pointsSpent: Number(row.points_spent || 0),
      transactionType: row.transaction_type,
      status: row.status,
      createdAt: row.created_at,
    }));

    return res.json({
      status: 'OK',
      merchant: {
        id: merchant.id,
        code: merchant.code,
        name: merchant.name,
        apiKey: merchant.api_key,
        createdAt: merchant.created_at,
        status: 'active',
      },
      dashboard: {
        customersCount,
        totalEarned,
        totalSpent,
        transactions,
      },
    });
  } catch (err) {
    if (err.code === 'UNAUTHORIZED') {
      return res.status(401).json({ status: 'ERROR', message: 'API Key required' });
    }
    if (err.code === 'FORBIDDEN') {
      return res.status(403).json({ status: 'ERROR', message: err.message });
    }
    logError('get /merchant/dashboard', err);
    return res.status(500).json({
      status: 'ERROR',
      message: 'Ошибка при получении дашборда мерчанта',
    });
  }
});

module.exports = router;
