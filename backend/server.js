const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 8080;

// Подключение к базе данных
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'sbgloyalty',
  user: process.env.DB_USER || 'sbguser',
  password: process.env.DB_PASSWORD || 'sbgpass',
});

app.use(cors());
app.use(express.json());

// Генерация случайного API ключа
function generateApiKey() {
  return 'sbg_' + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
}

// Генерация merchant_code из названия
function generateMerchantCode(name) {
  const cleanName = name.replace(/[^a-zA-Zа-яА-Я0-9]/g, '').toUpperCase();
  return cleanName.substring(0, 4) + Math.floor(Math.random() * 100).toString().padStart(2, '0');
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'SBGLoyalty API is running', timestamp: new Date().toISOString() });
});

// Регистрация мерчанта
app.post('/api/v1/public/merchants', async (req, res) => {
  try {
    const { name, email, phone, business_type } = req.body;

    // Проверка обязательных полей
    if (!name || !email || !phone || !business_type) {
      return res.status(400).json({
        error: 'MISSING_FIELDS',
        message: 'Все поля обязательны: name, email, phone, business_type'
      });
    }

    // Генерация данных мерчанта
    const merchantId = 'm_' + uuidv4().substring(0, 8);
    const apiKey = generateApiKey();
    const joinToken = 'mj_' + merchantId;
    const merchantCode = generateMerchantCode(name);

    // Сохранение в базу данных
    const query = `
      INSERT INTO merchants (id, name, email, phone, business_type, api_key, join_token, merchant_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, name, email, phone, business_type, join_token, merchant_code, created_at
    `;

    const result = await pool.query(query, [
      merchantId, name, email, phone, business_type, apiKey, joinToken, merchantCode
    ]);

    // Ответ с данными мерчанта (API ключ только при создании)
    res.status(201).json({
      success: true,
      merchant: result.rows[0],
      credentials: {
        api_key: apiKey,
        join_token: joinToken
      },
      message: 'Мерчант успешно зарегистрирован'
    });

  } catch (error) {
    console.error('Error creating merchant:', error);
    
    if (error.code === '23505') { // duplicate key
      return res.status(400).json({
        error: 'DUPLICATE_EMAIL',
        message: 'Мерчант с таким email уже существует'
      });
    }

    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Ошибка при создании мерчанта'
    });
  }
});

// Получить список мерчантов (для тестирования)
app.get('/api/v1/public/merchants', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, email, business_type, merchant_code, created_at FROM merchants ORDER BY created_at DESC');
    res.json({
      success: true,
      merchants: result.rows,
      count: result.rowCount
    });
  } catch (error) {
    console.error('Error fetching merchants:', error);
    res.status(500).json({ error: 'Failed to fetch merchants' });
  }
});

// Информация о мерчанте по API ключу
app.get('/api/v1/merchant', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      return res.status(401).json({ error: 'API_KEY_REQUIRED', message: 'API ключ обязателен' });
    }

    const result = await pool.query(
      'SELECT id, name, email, phone, business_type, merchant_code, join_token, created_at FROM merchants WHERE api_key = $1',
      [apiKey]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'MERCHANT_NOT_FOUND', message: 'Мерчант не найден' });
    }

    res.json({
      success: true,
      merchant: result.rows[0]
    });

  } catch (error) {
    console.error('Error fetching merchant:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Ошибка сервера' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ SBGLoyalty API Server running on port ${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/api/health`);
  console.log(`👥 Merchants API: http://localhost:${PORT}/api/v1/public/merchants`);
});