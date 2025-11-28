// routes/botRoutes.js
'use strict';

const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');

const router = express.Router();

// Пул к БД через DATABASE_URL (как в API)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

function logAndWrap(context, err) {
  console.error(`❌ [BOT API] ${context}:`, err.message || err);
  const error = new Error('Internal server error');
  error.status = 500;
  return error;
}

// --- HEALTHCHECK ДЛЯ ВЕТКИ БОТА ---
//
// GET /api/v1/bot/health
router.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'OK',
      message: 'Bot API is healthy',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('❌ [BOT API] health error:', err.message || err);
    res.status(500).json({
      status: 'ERROR',
      message: 'Bot API health check failed',
    });
  }
});

/**
 * POST /api/v1/bot/join
 *
 * body: {
 *   telegram_id: number,
 *   username?: string,
 *   first_name?: string,
 *   last_name?: string,
 *   phone_number?: string,
 *   join_token: string
 * }
 *
 * Логика:
 * 1) Находим запись в customer_merchants_telegram по join_token.
 *    - join_token уникален логически, берём первую запись.
 *    - если telegram_user_id уже не NULL → токен уже использован.
 * 2) Создаём/обновляем telegram_users.
 * 3) Проверяем/создаём customer_merchants (по customer_id + merchant_id).
 * 4) Обновляем customer_merchants_telegram.telegram_user_id + joined_at.
 */
router.post('/join', async (req, res) => {
  const {
    telegram_id,
    username,
    first_name,
    last_name,
    phone_number,
    join_token,
  } = req.body || {};

  if (!telegram_id || !join_token) {
    return res.status(400).json({
      status: 'ERROR',
      message: 'telegram_id и join_token обязательны',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) Ищем связь по join_token
    const cmtRes = await client.query(
      `
      SELECT
        cmt.id,
        cmt.customer_id,
        cmt.merchant_id,
        cmt.telegram_user_id,
        m.code AS merchant_code,
        m.name AS merchant_name
      FROM customer_merchants_telegram cmt
      JOIN merchants m ON m.id = cmt.merchant_id
      WHERE cmt.join_token = $1
      FOR UPDATE
      `,
      [join_token],
    );

    if (cmtRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        status: 'ERROR',
        message: 'Неверный или устаревший join_token',
      });
    }

    const cmt = cmtRes.rows[0];

    if (cmt.telegram_user_id) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        status: 'ERROR',
        message: 'Этот join_token уже использован',
      });
    }

    const customerId = cmt.customer_id;
    const merchantId = cmt.merchant_id;

    // 2) Создаём/обновляем telegram_users
    let telegramUserId;
    const tgRes = await client.query(
      `SELECT id
         FROM telegram_users
        WHERE telegram_id = $1`,
      [telegram_id],
    );

    if (tgRes.rowCount === 0) {
      const insertTg = await client.query(
        `
        INSERT INTO telegram_users (
          telegram_id, username, first_name, last_name,
          phone_number, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        RETURNING id
        `,
        [
          telegram_id,
          username || null,
          first_name || null,
          last_name || null,
          phone_number || null,
        ],
      );
      telegramUserId = insertTg.rows[0].id;
    } else {
      telegramUserId = tgRes.rows[0].id;
      await client.query(
        `
        UPDATE telegram_users
           SET username    = COALESCE($2, username),
               first_name  = COALESCE($3, first_name),
               last_name   = COALESCE($4, last_name),
               phone_number = COALESCE($5, phone_number),
               updated_at  = NOW()
         WHERE id = $1
        `,
        [
          telegramUserId,
          username || null,
          first_name || null,
          last_name || null,
          phone_number || null,
        ],
      );
    }

    // 3) Проверяем/создаём customer_merchants
    const cmRes = await client.query(
      `
      SELECT id
        FROM customer_merchants
       WHERE customer_id = $1
         AND merchant_id = $2
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

    // 4) Обновляем customer_merchants_telegram
    await client.query(
      `
      UPDATE customer_merchants_telegram
         SET telegram_user_id = $1,
             joined_at = NOW()
       WHERE id = $2
      `,
      [telegramUserId, cmt.id],
    );

    await client.query('COMMIT');

    return res.json({
      status: 'OK',
      message: 'Клиент успешно привязан к мерчанту через Telegram',
      merchant: {
        id: merchantId,
        code: cmt.merchant_code,
        name: cmt.merchant_name,
      },
      customer: {
        id: customerId,
      },
      telegram_user: {
        id: telegramUserId,
        telegram_id,
      },
      customer_merchant: {
        id: customerMerchantId,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logAndWrap('join', err);
    return res.status(500).json({
      status: 'ERROR',
      message: 'Ошибка при обработке join',
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/v1/bot/balance?telegram_id=...
 *
 * Возвращает баланс и уровень для текущего мерчанта (первого по связке).
 * Использует:
 * - telegram_users
 * - customer_merchants_telegram
 * - customer_merchants
 * - loyalty_points
 */
router.get('/balance', async (req, res) => {
  const { telegram_id } = req.query;

  if (!telegram_id) {
    return res.status(400).json({
      status: 'ERROR',
      message: 'telegram_id обязателен',
    });
  }

  try {
	const baseRes = await pool.query(
	  `
	  SELECT
		tu.id AS telegram_user_id,
		cmt.customer_id,
		cmt.merchant_id,
		cm.id AS customer_merchant_id,
		m.code AS merchant_code,
		m.name AS merchant_name
	  FROM telegram_users tu
	  JOIN customer_merchants_telegram cmt
		ON cmt.telegram_user_id = tu.id
	  JOIN customer_merchants cm
		ON cm.customer_id = cmt.customer_id
	   AND cm.merchant_id = cmt.merchant_id
	  JOIN merchants m
		ON m.id = cmt.merchant_id
	  WHERE tu.telegram_id = $1
	  ORDER BY cmt.joined_at DESC NULLS LAST, cm.created_at DESC
	  LIMIT 1
	  `,
	  [telegram_id],
	);


    if (baseRes.rowCount === 0) {
      return res.status(404).json({
        status: 'ERROR',
        message: 'Клиент по telegram_id не найден или не привязан к мерчанту',
      });
    }

    const row = baseRes.rows[0];
    const customerMerchantId = row.customer_merchant_id;

    const lpRes = await pool.query(
      `
      SELECT
        points,
        level,
        total_earned,
        total_spent,
        last_activity
      FROM loyalty_points
      WHERE customer_merchant_id = $1
      LIMIT 1
      `,
      [customerMerchantId],
    );

    let points = 0;
    let level = 'bronze';
    let totalEarned = 0;
    let totalSpent = 0;
    let lastActivity = null;

    if (lpRes.rowCount > 0) {
      const lp = lpRes.rows[0];
      points = Number(lp.points || 0);
      level = lp.level || 'bronze';
      totalEarned = Number(lp.total_earned || 0);
      totalSpent = Number(lp.total_spent || 0);
      lastActivity = lp.last_activity;
    }

    return res.json({
      status: 'OK',
      merchant: {
        id: row.merchant_id,
        code: row.merchant_code,
        name: row.merchant_name,
      },
      customer: {
        id: row.customer_id,
      },
      customer_merchant_id: customerMerchantId,
      balance: {
        points,
        level,
        total_earned: totalEarned,
        total_spent: totalSpent,
        last_activity: lastActivity,
      },
    });
  } catch (err) {
    logAndWrap('balance', err);
    return res.status(500).json({
      status: 'ERROR',
      message: 'Ошибка при получении баланса',
    });
  }
});

/**
 * GET /api/v1/bot/history?telegram_id=...&limit=10
 *
 * История транзакций по связке customer_merchant.
 */
router.get('/history', async (req, res) => {
  const { telegram_id } = req.query;
  const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);

  if (!telegram_id) {
    return res.status(400).json({
      status: 'ERROR',
      message: 'telegram_id обязателен',
    });
  }

  try {
	const baseRes = await pool.query(
	  `
	  SELECT
		tu.id AS telegram_user_id,
		cmt.customer_id,
		cmt.merchant_id,
		cm.id AS customer_merchant_id
	  FROM telegram_users tu
	  JOIN customer_merchants_telegram cmt
		ON cmt.telegram_user_id = tu.id
	  JOIN customer_merchants cm
		ON cm.customer_id = cmt.customer_id
	   AND cm.merchant_id = cmt.merchant_id
	  WHERE tu.telegram_id = $1
	  ORDER BY cmt.joined_at DESC NULLS LAST, cm.created_at DESC
	  LIMIT 1
	  `,
	  [telegram_id],
	);

    if (baseRes.rowCount === 0) {
      return res.status(404).json({
        status: 'ERROR',
        message: 'Клиент по telegram_id не найден или не привязан к мерчанту',
      });
    }

    const { customer_merchant_id } = baseRes.rows[0];

    const txRes = await pool.query(
      `
      SELECT
        id,
        amount,
        points_earned,
        points_spent,
        transaction_type,
        status,
        created_at
      FROM transactions
      WHERE customer_merchant_id = $1
      ORDER BY created_at DESC
      LIMIT $2
      `,
      [customer_merchant_id, limit],
    );

    return res.json({
      status: 'OK',
      items: txRes.rows,
    });
  } catch (err) {
    logAndWrap('history', err);
    return res.status(500).json({
      status: 'ERROR',
      message: 'Ошибка при получении истории',
    });
  }
});

/**
 * POST /api/v1/bot/session-code
 *
 * Генерация временного 6-значного кода для оплаты на кассе.
 *
 * body:
 * {
 *   "telegramUserId": 33182944
 * }
 *
 * Логика:
 *  - по telegramUserId находим последнюю привязку к мерчанту
 *    (customer_merchants_telegram.joined_at DESC)
 *  - по этой связке берём customer_merchant_id и merchant
 *  - генерируем 6-значный код, уникальный среди активных для этого merchant_id
 *  - создаём запись в loyalty_session_codes
 */
router.post('/session-code', async (req, res) => {
  const { telegramUserId } = req.body || {};

  if (!telegramUserId) {
    return res.status(400).json({
      status: 'ERROR',
      message: 'telegramUserId обязателен',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) Находим пользователя в telegram_users по telegram_id
    const baseRes = await client.query(
      `
      SELECT
        tu.id             AS telegram_user_db_id,
        cmt.customer_id,
        cmt.merchant_id,
        cm.id             AS customer_merchant_id,
        m.code            AS merchant_code,
        m.name            AS merchant_name,
        c.external_id,
        c.phone
      FROM telegram_users tu
      JOIN customer_merchants_telegram cmt
        ON cmt.telegram_user_id = tu.id
      JOIN customer_merchants cm
        ON cm.customer_id = cmt.customer_id
       AND cm.merchant_id = cmt.merchant_id
      JOIN customers c
        ON c.id = cm.customer_id
      JOIN merchants m
        ON m.id = cmt.merchant_id
      WHERE tu.telegram_id = $1
        AND cmt.joined_at IS NOT NULL
      ORDER BY cmt.joined_at DESC
      LIMIT 1
      `,
      [telegramUserId],
    );

    if (baseRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: 'ERROR',
        message: 'Пользователь не привязан ни к одной программе лояльности',
      });
    }

    const row = baseRes.rows[0];
    const merchantId = row.merchant_id;
    const customerMerchantId = row.customer_merchant_id;

    // 2) Генерируем 6-значный код, уникальный для этого мерчанта среди активных
    let sessionCode = null;
    for (let i = 0; i < 10; i++) {
      const n = Math.floor(Math.random() * 1000000);
      const code = n.toString().padStart(6, '0');

      const check = await client.query(
        `
        SELECT 1
        FROM loyalty_session_codes
        WHERE merchant_id = $1
          AND session_code = $2
          AND status = 'active'
          AND expires_at > NOW()
        `,
        [merchantId, code],
      );

      if (check.rowCount === 0) {
        sessionCode = code;
        break;
      }
    }

    if (!sessionCode) {
      await client.query('ROLLBACK');
      return res.status(500).json({
        status: 'ERROR',
        message: 'Не удалось сгенерировать уникальный код, попробуйте ещё раз',
      });
    }

    const expiresMinutes = 3;

    // 3) Сохраняем в loyalty_session_codes
    await client.query(
      `
      INSERT INTO loyalty_session_codes (
        merchant_id,
        customer_merchant_id,
        telegram_user_id,
        session_code,
        expires_at,
        status,
        created_at
      ) VALUES (
        $1, $2, $3, $4,
        NOW() + ($5 || ' minutes')::INTERVAL,
        'active',
        NOW()
      )
      `,
      [
        merchantId,
        customerMerchantId,
        telegramUserId,   // здесь именно реальный Telegram ID, а не telegram_users.id
        sessionCode,
        expiresMinutes,
      ],
    );

    await client.query('COMMIT');

    return res.json({
      status: 'OK',
      merchant: {
        id: merchantId,
        code: row.merchant_code,
        name: row.merchant_name,
      },
      customer: {
        id: row.customer_id,
        customerMerchantId,
        externalId: row.external_id,
        phone: row.phone,
      },
      sessionCode,
      expiresInSeconds: expiresMinutes * 60,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logAndWrap('session-code', err);
    return res.status(500).json({
      status: 'ERROR',
      message: 'Ошибка при генерации временного кода',
    });
  } finally {
    client.release();
  }
});

/**
 * POST /api/v1/bot/join-by-merchant-code
 *
 * Автоматическая привязка по коду мерчанта (для QR-ссылок).
 */
router.post('/join-by-merchant-code', async (req, res) => {
  const {
    telegram_id,
    merchant_code,
    username,
    first_name,
    last_name,
    phone_number,
  } = req.body || {};

  if (!telegram_id || !merchant_code) {
    return res.status(400).json({
      status: 'ERROR',
      message: 'telegram_id и merchant_code обязательны',
    });
  }

  const trimmedCode = String(merchant_code).trim();
  if (!trimmedCode) {
    return res.status(400).json({
      status: 'ERROR',
      message: 'merchant_code пуст',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) Находим мерчанта по коду
    const merchantRes = await client.query(
      `
      SELECT id, code, name
        FROM merchants
       WHERE UPPER(code) = UPPER($1)
       LIMIT 1
      `,
      [trimmedCode],
    );

    if (merchantRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        status: 'ERROR',
        message: 'Мерчант с таким кодом не найден',
      });
    }

    const merchant = merchantRes.rows[0];
    const merchantId = merchant.id;

    // 2) Создаём/обновляем telegram_users
    let telegramUserDbId;
    const tgRes = await client.query(
      `SELECT id
         FROM telegram_users
        WHERE telegram_id = $1`,
      [telegram_id],
    );

    if (tgRes.rowCount === 0) {
      const insertTg = await client.query(
        `
        INSERT INTO telegram_users (
          telegram_id, username, first_name, last_name,
          phone_number, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        RETURNING id
        `,
        [
          telegram_id,
          username || null,
          first_name || null,
          last_name || null,
          phone_number || null,
        ],
      );
      telegramUserDbId = insertTg.rows[0].id;
    } else {
      telegramUserDbId = tgRes.rows[0].id;
      await client.query(
        `
        UPDATE telegram_users
           SET username     = COALESCE($2, username),
               first_name   = COALESCE($3, first_name),
               last_name    = COALESCE($4, last_name),
               phone_number = COALESCE($5, phone_number),
               updated_at   = NOW()
         WHERE id = $1
        `,
        [
          telegramUserDbId,
          username || null,
          first_name || null,
          last_name || null,
          phone_number || null,
        ],
      );
    }

    // 3) Проверяем, не привязан ли уже этот телеграм к этому мерчанту
    const existingRes = await client.query(
      `
      SELECT
        cmt.id,
        cmt.customer_id,
        cmt.merchant_id,
        cm.id AS customer_merchant_id
      FROM customer_merchants_telegram cmt
      JOIN customer_merchants cm
        ON cm.customer_id = cmt.customer_id
       AND cm.merchant_id = cmt.merchant_id
      WHERE cmt.merchant_id = $1
        AND cmt.telegram_user_id = $2
      LIMIT 1
      `,
      [merchantId, telegramUserDbId],
    );

    let customerId;
    let customerMerchantId;
    let cmtId;

    if (existingRes.rowCount > 0) {
      // Уже привязан — idempotent-ответ
      const ex = existingRes.rows[0];
      customerId = ex.customer_id;
      customerMerchantId = ex.customer_merchant_id;
      cmtId = ex.id;
    } else {
      // 4) Создаём нового клиента
      const insertCustomer = await client.query(
        `
        INSERT INTO customers (external_id, phone, created_at)
        VALUES ($1, $2, NOW())
        RETURNING id
        `,
        [null, null],
      );
      customerId = insertCustomer.rows[0].id;

      // 5) Создаём связку customer↔merchant
      const insertCM = await client.query(
        `
        INSERT INTO customer_merchants (customer_id, merchant_id, created_at)
        VALUES ($1, $2, NOW())
        RETURNING id
        `,
        [customerId, merchantId],
      );
      customerMerchantId = insertCM.rows[0].id;

      // 6) Создаём запись в customer_merchants_telegram
      const joinToken = 'qr_' + crypto.randomBytes(16).toString('hex');

      const insertCmt = await client.query(
        `
        INSERT INTO customer_merchants_telegram (
          customer_id,
          merchant_id,
          telegram_user_id,
          join_token,
          joined_at
        ) VALUES ($1, $2, $3, $4, NOW())
        RETURNING id
        `,
        [customerId, merchantId, telegramUserDbId, joinToken],
      );
      cmtId = insertCmt.rows[0].id;
    }

    await client.query('COMMIT');

    return res.json({
      status: 'OK',
      message: 'Клиент привязан к мерчанту по коду',
      merchant: {
        id: merchantId,
        code: merchant.code,
        name: merchant.name,
      },
      customer: {
        id: customerId,
      },
      telegram_user: {
        id: telegramUserDbId,
        telegram_id,
      },
      customer_merchant: {
        id: customerMerchantId,
      },
      link_id: cmtId,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logAndWrap('join-by-merchant-code', err);
    return res.status(500).json({
      status: 'ERROR',
      message: 'Ошибка при привязке по коду мерчанта',
    });
  } finally {
    client.release();
  }
});

module.exports = router;
