const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Строим конфиг для фронта из переменных окружения.
 * Улетит в window.PROJECT_3128_CONFIG через /config.js
 */
function buildConfig() {
  return {
    apiBaseUrl: process.env.API_BASE_URL || 'http://api:8086',
    merchantApiKey: process.env.MERCHANT_API_KEY || '',
  };
}

// Главная страница (просто статусная, можешь потом заменить/убрать)
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Project 3128 - Система лояльности</title>
  <style>
    body { 
      font-family: Arial, sans-serif; 
      margin: 0; 
      padding: 20px; 
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
    }
    .container { 
      max-width: 800px; 
      margin: 0 auto; 
      background: white; 
      padding: 30px; 
      border-radius: 10px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    }
    h1 { 
      color: #333; 
      text-align: center;
      margin-bottom: 30px;
    }
    .status { 
      padding: 15px; 
      border-radius: 8px; 
      margin: 15px 0; 
      border-left: 4px solid;
    }
    .success { 
      background: #d4edda; 
      color: #155724; 
      border-left-color: #28a745;
    }
    .info { 
      background: #d1ecf1; 
      color: #0c5460; 
      border-left-color: #17a2b8;
    }
    .warning { 
      background: #fff3cd; 
      color: #856404; 
      border-left-color: #ffc107;
    }
    .services { 
      display: grid; 
      grid-template-columns: 1fr 1fr; 
      gap: 15px; 
      margin-top: 25px;
    }
    .service { 
      background: #f8f9fa; 
      padding: 15px; 
      border-radius: 8px; 
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎯 Project 3128 - Система лояльности</h1>
    
    <div class="status success">
      <strong>✅ Frontend работает</strong>
      <div>Порт: ${PORT}</div>
    </div>
    
    <div class="status info">
      <strong>🚀 API Status</strong>
      <div>localhost:8086 - Работает</div>
    </div>
    
    <div class="status info">
      <strong>🗄️ База данных</strong>
      <div>PostgreSQL:5433 - Работает</div>
    </div>
    
    <div class="status warning">
      <strong>📱 Telegram Bot</strong>
      <div>Требуется настройка токена</div>
    </div>
    
    <div class="services">
      <div class="service">
        <strong>API Endpoints</strong>
        <div>/api/health</div>
        <div>/api/v1/merchant</div>
      </div>
      <div class="service">
        <strong>Тестовые данные</strong>
        <div>Demo POS: /pos</div>
      </div>
    </div>
  </div>
</body>
</html>`);
});

// Health check endpoint фронта
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'frontend',
    timestamp: new Date().toISOString(),
    port: PORT,
  });
});

// Конфиг для фронта — будет доступен как /config.js
app.get('/config.js', (req, res) => {
  const config = buildConfig();
  res.type('application/javascript');
  res.send('window.PROJECT_3128_CONFIG = ' + JSON.stringify(config) + ';');
});

// Страница виртуальной кассы
app.get('/pos', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pos.html'));
});

// Статика (CSS/JS/картинки и т.п.)
app.use(express.static(path.join(__dirname, 'public')));

// Один нормальный listen
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Frontend server running on port ${PORT}`);
  console.log('Config for client:', buildConfig());
});
