'use strict';

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const { pool } = require('./db'); // общий пул БД для всех модулей

const botRoutes = require('./routes/botRoutes');
const loyaltyRoutes = require('./routes/loyaltyRoutes');
const integrationRoutes = require('./routes/integrationRoutes');
const merchantSettingsRoutes = require('./routes/merchantSettingsRoutes');

const app = express();
const PORT = process.env.PORT || 8086;

app.use(cors());
app.use(express.json());

/**
 * Локальный helper: загрузить мерчанта по API-ключу
 */
async function loadMerchantByApiKey(apiKey) {
  if (!apiKey) {
    const err = new Error('API Key required');
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  const res = await pool.query(
    `
    SELECT
      id,
      code,
      name,
      api_key,
      created_at,
      earn_rate_per_1000,
      redeem_max_percent,
      min_receipt_amount_for_earn,
      redeem_min_points,
      redeem_step,
      max_points_per_receipt,
      max_points_per_day
    FROM merchants
    WHERE api_key = $1
    LIMIT 1
    `,
    [apiKey],
  );

  if (res.rowCount === 0) {
    const err = new Error('Invalid API Key');
    err.code = 'FORBIDDEN';
    throw err;
  }

  return res.rows[0];
}

/**
 * Маппинг строки мерчанта в JSON-объект для ответа
 */
function mapMerchantRowToJson(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    createdAt: row.created_at,
    earnRatePer1000: row.earn_rate_per_1000 ?? null,
    redeemMaxPercent: row.redeem_max_percent ?? null,
    minReceiptAmountForEarn: row.min_receipt_amount_for_earn ?? null,
    redeemMinPoints: row.redeem_min_points ?? null,
    redeemStep: row.redeem_step ?? null,
    maxPointsPerReceipt: row.max_points_per_receipt ?? null,
    maxPointsPerDay: row.max_points_per_day ?? null,
  };
}

/**
 * POST /api/v1/merchants/register
 *
 * Регистрация мерчанта (demo). Возвращает merchant в том же формате,
 * что и /api/v1/merchant/dashboard.
 */
app.post('/api/v1/merchants/register', async (req, res) => {
  const { name, code } = req.body || {};

  // Валидация name
  if (!name || typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
    return res.status(400).json({
      status: 'ERROR',
      error: 'validation_error',
      message: 'Field "name" is required and must be 1..100 chars',
    });
  }

  let normalizedCode = null;

  if (code != null) {
    if (typeof code !== 'string') {
      return res.status(400).json({
        status: 'ERROR',
        error: 'validation_error',
        message: 'Field "code" must be a string',
      });
    }
    normalizedCode = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,16}$/.test(normalizedCode)) {
      return res.status(400).json({
        status: 'ERROR',
        error: 'validation_error',
        message: 'Field "code" must match ^[A-Z0-9]{3,16}$',
      });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Генерация/проверка уникальности кода
    let finalCode = normalizedCode;
    const maxAttempts = normalizedCode ? 1 : 5;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (!finalCode) {
        finalCode = 'MC' + crypto.randomBytes(3).toString('hex').toUpperCase(); // MC + 6 HEX
      }

      const existsRes = await client.query(
        'SELECT 1 FROM merchants WHERE code = $1 LIMIT 1',
        [finalCode],
      );

      if (existsRes.rowCount === 0) {
        break; // код свободен
      }

      if (normalizedCode) {
        // Пользователь задал code сам — конфликт
        await client.query('ROLLBACK');
        return res.status(409).json({
          status: 'ERROR',
          error: 'conflict',
          message: 'Merchant with this code already exists',
        });
      }

      // Иначе пробуем сгенерировать новый
      finalCode = null;
    }

    if (!finalCode) {
      throw new Error('Failed to generate unique merchant code');
    }

    const apiKeySuffix = crypto.randomBytes(4).toString('hex'); // 8 hex
    const apiKey = `sbg_mc_${finalCode.toLowerCase()}_${apiKeySuffix}`;

    const insertRes = await client.query(
      `
      INSERT INTO merchants (
        code,
        name,
        api_key,
        created_at
      ) VALUES ($1, $2, $3, NOW())
      RETURNING
        id,
        code,
        name,
        api_key,
        created_at,
        earn_rate_per_1000,
        redeem_max_percent,
        min_receipt_amount_for_earn,
        redeem_min_points,
        redeem_step,
        max_points_per_receipt,
        max_points_per_day
      `,
      [finalCode, name.trim(), apiKey],
    );

    await client.query('COMMIT');

    const row = insertRes.rows[0];
    const merchant = mapMerchantRowToJson(row);

    return res.status(201).json({
      status: 'OK',
      merchant: {
        ...merchant,
        apiKey: row.api_key,
        status: 'active',
      },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[POST /api/v1/merchants/register] error:', err);
    return res.status(500).json({
      status: 'ERROR',
      error: 'internal_error',
      message: 'Failed to register merchant',
    });
  } finally {
    client.release();
  }
});

// === Health check ===
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

/**
 * POST /api/v1/public/merchants
 *
 * Регистрация тестового мерчанта (старый demo-эндпоинт)
 */
app.post('/api/v1/public/merchants', async (req, res) => {
  const { name, phone, externalCustomerId } = req.body || {};

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const code = 'M' + crypto.randomBytes(3).toString('hex').toUpperCase(); // M + 6 HEX
    const apiKey = 'sbg_' + crypto.randomBytes(12).toString('hex');
    const joinToken = 'mj_m_' + crypto.randomBytes(6).toString('hex');

    const merchantRes = await client.query(
      `
      INSERT INTO merchants (code, name, api_key, created_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING id, code, name, api_key, created_at
      `,
      [code, name, apiKey],
    );
    const merchant = merchantRes.rows[0];

    const customerRes = await client.query(
      `
      INSERT INTO customers (external_id, phone, created_at)
      VALUES ($1, $2, NOW())
      RETURNING id
      `,
      [
        externalCustomerId || `DEMO_${merchant.id}`,
        phone || null,
      ],
    );
    const customer = customerRes.rows[0];

    const cmRes = await client.query(
      `
      INSERT INTO customer_merchants (customer_id, merchant_id, created_at)
      VALUES ($1, $2, NOW())
      RETURNING id
      `,
      [customer.id, merchant.id],
    );
    const customerMerchant = cmRes.rows[0];

    await client.query(
      `
      INSERT INTO customer_merchants_telegram (
        customer_id,
        merchant_id,
        telegram_user_id,
        join_token,
        joined_at
      ) VALUES ($1, $2, NULL, $3, NULL)
      `,
      [customer.id, merchant.id, joinToken],
    );

    await client.query('COMMIT');

    return res.json({
      success: true,
      merchant: {
        id: merchant.id,
        code: merchant.code,
        name: merchant.name,
        apiKey: merchant.api_key,
        createdAt: merchant.created_at,
        joinToken,
        demoCustomerId: customer.id,
        customerMerchantId: customerMerchant.id,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error registering merchant:', err.message || err);
    return res.status(500).json({ error: 'Failed to register merchant' });
  } finally {
    client.release();
  }
});

// === MERCHANT API (по apiKey) ===

/**
 * GET /api/v1/merchant
 * Профиль/настройки мерчанта по X-API-Key
 */
app.get('/api/v1/merchant', async (req, res) => {
  const apiKey = req.headers['x-api-key'];

  try {
    const merchantRow = await loadMerchantByApiKey(apiKey);
    const merchant = mapMerchantRowToJson(merchantRow);

    return res.json({ merchant });
  } catch (err) {
    if (err.code === 'UNAUTHORIZED') {
      return res.status(401).json({
        status: 'ERROR',
        message: 'API Key required',
      });
    }
    if (err.code === 'FORBIDDEN') {
      return res.status(403).json({
        status: 'ERROR',
        message: 'Invalid API Key',
      });
    }

    console.error('[GET /api/v1/merchant] error:', err);
    return res.status(500).json({
      status: 'ERROR',
      message: 'Internal server error',
    });
  }
});

/**
 * GET /api/v1/merchant/dashboard
 * Сводка по мерчанту:
 *  - количество клиентов
 *  - суммарно начисленные/списанные баллы
 *  - последние операции
 */
app.get('/api/v1/merchant/dashboard', async (req, res) => {
  const apiKey = req.headers['x-api-key'];

  try {
    const merchantRow = await loadMerchantByApiKey(apiKey);
    const merchant = mapMerchantRowToJson(merchantRow);

    // 1) Кол-во клиентов
    const customersRes = await pool.query(
      `
      SELECT COUNT(*)::int AS cnt
        FROM customer_merchants
       WHERE merchant_id = $1
      `,
      [merchantRow.id],
    );
    const customersCount = customersRes.rows[0]?.cnt ?? 0;

    // 2) Общая статистика баллов
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
      [merchantRow.id],
    );

    const totalEarned = Number(statsRes.rows[0]?.total_earned ?? 0);
    const totalSpent  = Number(statsRes.rows[0]?.total_spent  ?? 0);

    // 3) Последние операции (20 шт)
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
      [merchantRow.id],
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
        ...merchant,
        apiKey: merchantRow.api_key,
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
      return res.status(401).json({
        status: 'ERROR',
        message: 'API Key required',
      });
    }
    if (err.code === 'FORBIDDEN') {
      return res.status(403).json({
        status: 'ERROR',
        message: 'Invalid API Key',
      });
    }

    console.error('[GET /api/v1/merchant/dashboard] error:', err);
    return res.status(500).json({
      status: 'ERROR',
      message: 'Internal server error',
    });
  }
});

// === INTEGRATION API (для касс / внешних систем) ===
app.use('/api/v1/integration', integrationRoutes);

// === Настройки мерчанта ===
app.use('/api/v1/merchant/settings', merchantSettingsRoutes);

// === BOT API маршруты ===
app.use('/api/v1/bot', botRoutes);

// === LOYALTY API маршруты ===
app.use('/api/v1/loyalty', loyaltyRoutes);

app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 API Server running on port ' + PORT);
});

module.exports = app;
