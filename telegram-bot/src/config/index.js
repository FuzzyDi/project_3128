require('dotenv').config();

module.exports = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  database: {
    host: process.env.POSTGRES_HOST || 'postgres',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://redis:6379'
  },
  api: {
    baseUrl: process.env.API_BASE_URL || 'http://api:8086'
  }
};
