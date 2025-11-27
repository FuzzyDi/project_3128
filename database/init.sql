-- =========================
-- БАЗОВЫЕ ТАБЛИЦЫ
-- =========================

-- Мерчанты
CREATE TABLE IF NOT EXISTS merchants (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
	api_key VARCHAR(255) UNIQUE,
	earn_rate_per_1000 INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Клиенты
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    external_id VARCHAR(255),
    phone VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Связка клиент ↔ мерчант
CREATE TABLE IF NOT EXISTS customer_merchants (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (customer_id, merchant_id)
);

-- =========================
-- TELEGRAM
-- =========================

-- Telegram-пользователи
CREATE TABLE IF NOT EXISTS telegram_users (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    phone_number VARCHAR(50),
    language_code VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Связи клиент-мерчант в Telegram + join_token
CREATE TABLE IF NOT EXISTS customer_merchants_telegram (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    telegram_user_id INTEGER REFERENCES telegram_users(id) ON DELETE SET NULL,
    join_token VARCHAR(100) NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (customer_id, merchant_id),
    UNIQUE (join_token)
);

-- =========================
-- ЛОЯЛЬНОСТЬ: БАЛАНС И ТРАНЗАКЦИИ
-- =========================

-- Баланс по связке client↔merchant
CREATE TABLE IF NOT EXISTS loyalty_points (
    id SERIAL PRIMARY KEY,
    customer_merchant_id INTEGER NOT NULL REFERENCES customer_merchants(id) ON DELETE CASCADE,
    points INTEGER DEFAULT 0,
    level VARCHAR(50) DEFAULT 'bronze',
    total_earned INTEGER DEFAULT 0,
    total_spent INTEGER DEFAULT 0,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Транзакции по связке client↔merchant
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    customer_merchant_id INTEGER NOT NULL REFERENCES customer_merchants(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    points_earned INTEGER DEFAULT 0,
    points_spent INTEGER DEFAULT 0,
    transaction_type VARCHAR(50) NOT NULL, -- 'purchase', 'refund', 'points_redemption'
    status VARCHAR(50) DEFAULT 'completed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Временные коды (одноразовые/краткоживущие) для операций на кассе
CREATE TABLE IF NOT EXISTS loyalty_session_codes (
    id SERIAL PRIMARY KEY,
    merchant_id INTEGER NOT NULL REFERENCES merchants(id),
    customer_merchant_id INTEGER NOT NULL REFERENCES customer_merchants(id),
    telegram_user_id BIGINT,
    session_code CHAR(6) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_loyalty_session_codes_active
ON loyalty_session_codes(merchant_id, session_code)
WHERE status = 'active';


-- =========================
-- ИНДЕКСЫ
-- =========================

-- Быстрый поиск телеграм-пользователей
CREATE INDEX IF NOT EXISTS idx_telegram_users_telegram_id
    ON telegram_users(telegram_id);

-- Быстрая навигация по связям телега↔мерчант
CREATE INDEX IF NOT EXISTS idx_customer_merchants_telegram
    ON customer_merchants_telegram(telegram_user_id, merchant_id);

-- Баланс по связке client↔merchant
CREATE INDEX IF NOT EXISTS idx_loyalty_points_customer
    ON loyalty_points(customer_merchant_id);

-- Транзакции по связке client↔merchant и дате
CREATE INDEX IF NOT EXISTS idx_transactions_customer
    ON transactions(customer_merchant_id);

CREATE INDEX IF NOT EXISTS idx_transactions_created_at
    ON transactions(created_at);
