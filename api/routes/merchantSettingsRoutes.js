'use strict';

const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// --- helpers ---

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

function parseIntOrNull(raw) {
  if (raw === null) return null;
  if (raw === undefined) return undefined; // «нет поля»
  const n = Number(raw);
  if (!Number.isFinite(n)) return NaN;
  return Math.trunc(n);
}

// --- GET /api/v1/merchant/settings ---
// Вернуть текущие настройки лояльности мерчанта по X-API-KEY
router.get('/', async (req, res) => {
  const apiKey = req.headers['x-api-key'];

  try {
    const row = await loadMerchantByApiKey(apiKey);
    const merchant = mapMerchantRowToJson(row);

    return res.json({
      status: 'OK',
      merchant: {
        ...merchant,
        apiKey: row.api_key,
        status: 'active',
      },
    });
  } catch (err) {
    if (err.code === 'UNAUTHORIZED') {
      return res.status(401).json({
        status: 'ERROR',
        error: 'unauthorized',
        message: 'X-API-KEY header is required',
      });
    }
    if (err.code === 'FORBIDDEN') {
      return res.status(403).json({
        status: 'ERROR',
        error: 'forbidden',
        message: 'Invalid API Key',
      });
    }

    console.error('[GET /api/v1/merchant/settings] error:', err);
    return res.status(500).json({
      status: 'ERROR',
      error: 'internal_error',
      message: 'Failed to load merchant settings',
    });
  }
});

// --- PATCH /api/v1/merchant/settings ---
// Частичное обновление настроек earn/redeem по X-API-KEY
router.patch('/', async (req, res) => {
  const apiKey = req.headers['x-api-key'];

  let merchantRow;
  try {
    merchantRow = await loadMerchantByApiKey(apiKey);
  } catch (err) {
    if (err.code === 'UNAUTHORIZED') {
      return res.status(401).json({
        status: 'ERROR',
        error: 'unauthorized',
        message: 'X-API-KEY header is required',
      });
    }
    if (err.code === 'FORBIDDEN') {
      return res.status(403).json({
        status: 'ERROR',
        error: 'forbidden',
        message: 'Invalid API Key',
      });
    }
    console.error('[PATCH /api/v1/merchant/settings] load error:', err);
    return res.status(500).json({
      status: 'ERROR',
      error: 'internal_error',
      message: 'Failed to load merchant',
    });
  }

  const body = req.body || {};

  // Разбираем каждое поле.
  // undefined -> поле не меняем
  // null      -> очищаем в БД (NULL)
  // число     -> записываем
  const rawEarnRatePer1000 = parseIntOrNull(body.earnRatePer1000);
  const rawRedeemMaxPercent = parseIntOrNull(body.redeemMaxPercent);
  const rawMinReceiptAmountForEarn = parseIntOrNull(body.minReceiptAmountForEarn);
  const rawRedeemMinPoints = parseIntOrNull(body.redeemMinPoints);
  const rawRedeemStep = parseIntOrNull(body.redeemStep);
  const rawMaxPointsPerReceipt = parseIntOrNull(body.maxPointsPerReceipt);
  const rawMaxPointsPerDay = parseIntOrNull(body.maxPointsPerDay);

  const updates = [];
  const params = [];
  let idx = 1;

  function pushUpdate(columnName, rawValue, validator) {
    if (rawValue === undefined) return; // поле не передано
    if (Number.isNaN(rawValue)) {
      throw {
        code: 'VALIDATION',
        message: `Invalid value for ${columnName}`,
      };
    }
    if (rawValue !== null && typeof validator === 'function') {
      const ok = validator(rawValue);
      if (!ok) {
        throw {
          code: 'VALIDATION',
          message: `Out of range value for ${columnName}`,
        };
      }
    }
    updates.push(`${columnName} = $${idx}`);
    params.push(rawValue);
    idx += 1;
  }

  try {
    // earnRatePer1000: >=0 и <= 1000 (защита от "100% за чек")
    pushUpdate(
      'earn_rate_per_1000',
      rawEarnRatePer1000,
      (v) => v >= 0 && v <= 1000,
    );

    // redeemMaxPercent: 0..100
    pushUpdate(
      'redeem_max_percent',
      rawRedeemMaxPercent,
      (v) => v >= 0 && v <= 100,
    );

    // minReceiptAmountForEarn: >=0
    pushUpdate(
      'min_receipt_amount_for_earn',
      rawMinReceiptAmountForEarn,
      (v) => v >= 0,
    );

    // redeemMinPoints: >=0
    pushUpdate(
      'redeem_min_points',
      rawRedeemMinPoints,
      (v) => v >= 0,
    );

    // redeemStep: >=1
    pushUpdate(
      'redeem_step',
      rawRedeemStep,
      (v) => v >= 1,
    );

    // maxPointsPerReceipt: >=0
    pushUpdate(
      'max_points_per_receipt',
      rawMaxPointsPerReceipt,
      (v) => v >= 0,
    );

    // maxPointsPerDay: >=0
    pushUpdate(
      'max_points_per_day',
      rawMaxPointsPerDay,
      (v) => v >= 0,
    );
  } catch (e) {
    if (e && e.code === 'VALIDATION') {
      return res.status(400).json({
        status: 'ERROR',
        error: 'validation_error',
        message: e.message,
      });
    }
    console.error('[PATCH /api/v1/merchant/settings] validation error:', e);
    return res.status(400).json({
      status: 'ERROR',
      error: 'validation_error',
      message: 'Invalid settings payload',
    });
  }

  if (updates.length === 0) {
    return res.status(400).json({
      status: 'ERROR',
      error: 'validation_error',
      message: 'No settings fields provided',
    });
  }

  params.push(merchantRow.id);

  const sql = `
    UPDATE merchants
       SET ${updates.join(', ')}
     WHERE id = $${idx}
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
  `;

  try {
    const updateRes = await pool.query(sql, params);
    const row = updateRes.rows[0];
    const merchant = mapMerchantRowToJson(row);

    return res.json({
      status: 'OK',
      merchant: {
        ...merchant,
        apiKey: row.api_key,
        status: 'active',
      },
    });
  } catch (err) {
    console.error('[PATCH /api/v1/merchant/settings] db error:', err);
    return res.status(500).json({
      status: 'ERROR',
      error: 'internal_error',
      message: 'Failed to update merchant settings',
    });
  }
});

module.exports = router;
