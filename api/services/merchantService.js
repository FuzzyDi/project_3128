'use strict';

const { Pool } = require('pg');

// Делаем свой пул, как в integrationRoutes.js
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Преобразуем строку мерчанта из БД в “публичный” вид
 * (то, что будем отдавать в API и использовать во фронте/боте).
 */
function mapMerchantToPublicSettings(row) {
  if (!row) return null;

  const earnRatePer1000 =
    row.earn_rate_per_1000 != null ? Number(row.earn_rate_per_1000) : 1;

  const redeemMaxPercent =
    row.redeem_max_percent != null ? Number(row.redeem_max_percent) : 100;

  const minReceiptAmountForEarn =
    row.min_receipt_amount_for_earn != null
      ? Number(row.min_receipt_amount_for_earn)
      : 0;

  const redeemMinPoints =
    row.redeem_min_points != null ? Number(row.redeem_min_points) : 0;

  const redeemStep =
    row.redeem_step != null ? Number(row.redeem_step) : 1;

  const maxPointsPerReceipt =
    row.max_points_per_receipt != null
      ? Number(row.max_points_per_receipt)
      : null;

  const maxPointsPerDay =
    row.max_points_per_day != null ? Number(row.max_points_per_day) : null;

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    timezone: row.timezone || null,
    createdAt: row.created_at,
    // настройки лояльности
    earnRatePer1000,
    redeemMaxPercent,
    minReceiptAmountForEarn,
    redeemMinPoints,
    redeemStep,
    maxPointsPerReceipt,
    maxPointsPerDay,
  };
}

/**
 * Получить мерчанта по API-ключу.
 * Ищем в merchant_api_keys, чтобы поддерживать несколько ключей на мерчанта.
 *
 * Если передан client — используем его (внутри транзакции),
 * иначе используем pool напрямую.
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
      m.*,
      k.id AS api_key_id
    FROM merchant_api_keys k
    JOIN merchants m ON m.id = k.merchant_id
    WHERE k.api_key = $1
      AND k.is_active = TRUE
    LIMIT 1
    `,
    [apiKey],
  );

  if (res.rowCount === 0) {
    const err = new Error('Invalid API Key');
    err.code = 'FORBIDDEN';
    throw err;
  }

  const row = res.rows[0];

  // обновим last_used_at для ключа (best-effort)
  const updateQuery = 'UPDATE merchant_api_keys SET last_used_at = NOW() WHERE id = $1';

  if (client) {
    // если мы уже в транзакции — обновляем в ней же
    await client.query(updateQuery, [row.api_key_id]);
  } else {
    // если нет — fire-and-forget через pool
    pool
      .query(updateQuery, [row.api_key_id])
      .catch((e) =>
        console.error('[merchantService] failed to update last_used_at:', e.message || e),
      );
  }

  // убираем служебное поле api_key_id
  const { api_key_id, ...merchantRow } = row;

  return merchantRow;
}

module.exports = {
  getMerchantByApiKey,
  mapMerchantToPublicSettings,
};
