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

// Главная страница (статус + ссылка в портал)
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
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container { 
      max-width: 900px; 
      width: 100%;
      margin: 0 auto; 
      background: white; 
      padding: 30px; 
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    }
    h1 { 
      color: #333; 
      text-align: center;
      margin-bottom: 20px;
    }
    .status { 
      padding: 15px; 
      border-radius: 8px; 
      margin: 10px 0; 
      border-left: 4px solid;
      font-size: 14px;
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
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
      gap: 15px; 
      margin-top: 20px;
    }
    .service { 
      background: #f8f9fa; 
      padding: 15px; 
      border-radius: 8px; 
      text-align: center;
      font-size: 14px;
    }
    .service strong {
      display: block;
      margin-bottom: 6px;
    }
    .portal-link {
      margin-top: 25px;
      text-align: center;
    }
    .portal-link a {
      display: inline-block;
      padding: 12px 24px;
      border-radius: 999px;
      text-decoration: none;
      font-weight: 600;
      background: #4f46e5;
      color: #fff;
      box-shadow: 0 8px 20px rgba(79,70,229,0.4);
      transition: transform 0.1s ease, box-shadow 0.1s ease, background 0.1s ease;
    }
    .portal-link a:hover {
      transform: translateY(-1px);
      box-shadow: 0 10px 24px rgba(79,70,229,0.5);
      background: #4338ca;
    }
    .portal-link small {
      display: block;
      margin-top: 8px;
      font-size: 12px;
      color: #555;
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
      <div>localhost:8086 - Работает (см. docker-compose)</div>
    </div>
    
    <div class="status info">
      <strong>🗄️ База данных</strong>
      <div>PostgreSQL:5433 - Работает</div>
    </div>
    
    <div class="status warning">
      <strong>📱 Telegram Bot</strong>
      <div>Требуется настройка токена и webhook</div>
    </div>
    
    <div class="services">
      <div class="service">
        <strong>API Endpoints</strong>
        <div>/api/health</div>
        <div>/api/v1/merchant</div>
      </div>
      <div class="service">
        <strong>Демо касса</strong>
        <div>Virtual POS: /pos</div>
      </div>
      <div class="service">
        <strong>Портал мерчанта</strong>
        <div>/portal</div>
      </div>
      <div class="service">
        <strong>Документация API</strong>
        <div>docs/api_v1.md (GitHub)</div>
      </div>
    </div>

    <div class="portal-link">
      <a href="/portal">Открыть портал демо-мерчанта</a>
      <small>Единый вход: дашборд, клиенты, транзакции, POS-демо, API-доки</small>
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

// Портал (SPA-шаблон). Все /portal* отдаются как единая страница.
app.get(['/portal', '/portal/*'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'portal.html'));
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
