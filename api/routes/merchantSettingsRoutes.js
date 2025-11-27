'use strict';

const express = require('express');
const { Pool } = require('pg');
const {
  getMerchantByApiKey,
  mapMerchantToPublicSettings,
} = require('../services/merchantService');

const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Нормализация числового параметра.
 * Возвращает либо целое число (с учётом min/max), либо null (если не задан).
 */
function normalizeInt(value, { min = null, max = null, allowNull = true } = {}) {
  if (value === undefined || value === null || value === '') {
    return allowNull ? null : null;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error('NOT_NUMBER');
  }
  const intVal = Math.trunc(n);

  if (min != null && intVal < min) {
    throw new Error('TOO_SMALL');
  }
  if (max != null && intVal > max) {
    throw new Error('TOO_LARGE');
  }
  return intVal;
}

/**
 * GET /api/v1/merchant/settings
 * Возвращает настройки лояльности мерчанта (по API Key).
 */
router.get('/', async (req, res) => {
  const apiKey = req.headers['x-api-key'];

  try {
    const merchantRow = await getMerchantByApiKey(apiKey);
    const merchant = mapMerchantToPublicSettings(merchantRow);

    return res.json({
      status: 'OK',
      settings: merchant,
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

    console.error('[GET /api/v1/merchant/settings] error:', err);
    return res.status(500).json({
      status: 'ERROR',
      message: 'Internal server error',
    });
  }
});

/**
 * PUT /api/v1/merchant/settings
 * Обновляет настройки лояльности мерчанта.
 *
 * Ожидаемый body (любое поле опционально, если не передано — остаётся как было):
 * {
 *   "earnRatePer1000": 1,
 *   "redeemMaxPercent": 50,
 *   "minReceiptAmountForEarn": 0,
 *   "redeemMinPoints": 0,
 *   "redeemStep": 1,
 *   "maxPointsPerReceipt": 10000,
 *   "maxPointsPerDay": 50000
 * }
 */
router.put('/', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  const body = req.body || {};

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const merchantRow = await getMerchantByApiKey(apiKey, client);

    // Нормализуем и валидируем значения (если поля есть в body)
    const updates = {};
    const errors = {};

    function handleField(fieldName, columnName, opts) {
      if (body[fieldName] === undefined) return;
      try {
        const val = normalizeInt(body[fieldName], opts);
        updates[columnName] = val;
      } catch (e) {
        errors[fieldName] = e.message;
      }
    }

    handleField('earnRatePer1000', 'earn_rate_per_1000', {
      min: 0,
      max: 100000,
      allowNull: false,
    });

    handleField('redeemMaxPercent', 'redeem_max_percent', {
      min: 0,
      max: 100,
      allowNull: false,
    });

    handleField(
      'minReceiptAmountForEarn',
      'min_receipt_amount_for_earn',
      {
        min: 0,
        max: 1_000_000_000,
        allowNull: false,
      },
    );

    handleField('redeemMinPoints', 'redeem_min_points', {
      min: 0,
      max: 1_000_000_000,
      allowNull: false,
    });

    handleField('redeemStep', 'redeem_step', {
      min: 1,
      max: 1_000_000_000,
      allowNull: false,
    });

    handleField('maxPointsPerReceipt', 'max_points_per_receipt', {
      min: 0,
      max: 1_000_000_000,
      allowNull: true,
    });

    handleField('maxPointsPerDay', 'max_points_per_day', {
      min: 0,
      max: 1_000_000_000,
      allowNull: true,
    });

    if (Object.keys(errors).length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: 'ERROR',
        message: 'Validation error',
        details: errors,
      });
    }

    if (Object.keys(updates).length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: 'ERROR',
        message: 'No settings provided',
      });
    }

    const setClauses = [];
    const values = [];
    let idx = 1;

    for (const [col, val] of Object.entries(updates)) {
      setClauses.push(`${col} = $${idx++}`);
      values.push(val);
    }

    values.push(merchantRow.id);

    const updateSql = `
      UPDATE merchants
         SET ${setClauses.join(', ')}
       WHERE id = $${idx}
       RETURNING *
    `;

    const updatedRes = await client.query(updateSql, values);
    const updated = updatedRes.rows[0];

    await client.query('COMMIT');

    const settings = mapMerchantToPublicSettings(updated);

    return res.json({
      status: 'OK',
      settings,
    });
  } catch (err) {
    await client.query('ROLLBACK');

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

    console.error('[PUT /api/v1/merchant/settings] error:', err);
    return res.status(500).json({
      status: 'ERROR',
      message: 'Internal server error',
    });
  } finally {
    client.release();
  }
});

module.exports = router;
