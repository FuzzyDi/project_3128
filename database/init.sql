-- Таблица для хранения Telegram пользователей
CREATE TABLE IF NOT EXISTS telegram_users (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    phone_number VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица связей клиент-мерчант в Telegram
CREATE TABLE IF NOT EXISTS customer_merchants_telegram (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id),
    merchant_id INTEGER REFERENCES merchants(id),
    telegram_user_id INTEGER REFERENCES telegram_users(id),
    join_token VARCHAR(100) NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(customer_id, merchant_id)
);

-- Таблица баллов лояльности
CREATE TABLE IF NOT EXISTS loyalty_points (
    id SERIAL PRIMARY KEY,
    customer_merchant_id INTEGER REFERENCES customer_merchants(id),
    points INTEGER DEFAULT 0,
    level VARCHAR(50) DEFAULT 'bronze',
    total_earned INTEGER DEFAULT 0,
    total_spent INTEGER DEFAULT 0,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица транзакций
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    customer_merchant_id INTEGER REFERENCES customer_merchants(id),
    amount DECIMAL(10,2) NOT NULL,
    points_earned INTEGER DEFAULT 0,
    points_spent INTEGER DEFAULT 0,
    transaction_type VARCHAR(50) NOT NULL, -- 'purchase', 'refund', 'points_redemption'
    status VARCHAR(50) DEFAULT 'completed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);-- Дополняем существующий init.sql

-- Таблица для хранения Telegram пользователей
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

-- Таблица связей клиент-мерчант в Telegram
CREATE TABLE IF NOT EXISTS customer_merchants_telegram (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id),
    merchant_id INTEGER REFERENCES merchants(id),
    telegram_user_id INTEGER REFERENCES telegram_users(id),
    join_token VARCHAR(100) NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(customer_id, merchant_id)
);

-- Таблица баллов лояльности
CREATE TABLE IF NOT EXISTS loyalty_points (
    id SERIAL PRIMARY KEY,
    customer_merchant_id INTEGER REFERENCES customer_merchants(id),
    points INTEGER DEFAULT 0,
    level VARCHAR(50) DEFAULT 'bronze',
    total_earned INTEGER DEFAULT 0,
    total_spent INTEGER DEFAULT 0,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица транзакций
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    customer_merchant_id INTEGER REFERENCES customer_merchants(id),
    amount DECIMAL(10,2) NOT NULL,
    points_earned INTEGER DEFAULT 0,
    points_spent INTEGER DEFAULT 0,
    transaction_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'completed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для улучшения производительности
CREATE INDEX IF NOT EXISTS idx_telegram_users_telegram_id ON telegram_users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_customer_merchants_telegram ON customer_merchants_telegram(telegram_user_id, merchant_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_points_customer ON loyalty_points(customer_merchant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions(customer_merchant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
