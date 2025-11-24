const TelegramBot = require('./bot/bot');

async function startBot() {
    try {
        const bot = new TelegramBot();
        await bot.launch();
        console.log('🚀 Telegram Bot успешно запущен');
    } catch (error) {
        console.error('❌ Ошибка запуска бота:', error);
        process.exit(1);
    }
}

// Запускаем бота если файл запущен напрямую
if (require.main === module) {
    startBot();
}

module.exports = startBot;
