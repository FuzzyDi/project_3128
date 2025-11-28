// api/services/merchantService.js
const { pool } = require('../db');

/**
 * Загрузка мерчанта по apiKey.
 * Используется во всех интеграционных эндпоинтах.
 */
async function getMerchantByApiKey(apiKey, client) {
  if (!apiKey) {
    const err = new Error('API Key required');
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  const db = client || pool;

  const res = await db.query(
    `
    SELECT
      id,
      code,
      name,
      api_key,
      created_at,
      earn_rate_per_1000
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
 * Приведение строки мерчанта к «публичному» виду
 * для интеграции кассы, lookup/checkout и т.п.
 */
function mapMerchantToPublicSettings(row) {
  if (!row) return null;

  const earnRate = row.earn_rate_per_1000 ?? 1;

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    createdAt: row.created_at,

    // Пока в схеме нет — используем дефолты.
    status: row.status || 'active',
    timezone: row.timezone || 'Asia/Tashkent',

    earnRatePer1000: earnRate,
    redeemMaxPercent: row.redeem_max_percent ?? 100,
    minReceiptAmountForEarn: row.min_receipt_amount_for_earn ?? 0,
    redeemMinPoints: row.redeem_min_points ?? 0,
    redeemStep: row.redeem_step ?? 1,
    maxPointsPerReceipt: row.max_points_per_receipt ?? null,
    maxPointsPerDay: row.max_points_per_day ?? null,
  };
}

module.exports = {
  getMerchantByApiKey,
  mapMerchantToPublicSettings,
};
