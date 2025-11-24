const { Telegraf, session } = require('telegraf');
const config = require('../config');

class TelegramBot {
    constructor() {
        if (!config.telegramBotToken) {
            throw new Error('TELEGRAM_BOT_TOKEN is required');
        }
        
        this.bot = new Telegraf(config.telegramBotToken);
        this.setupMiddlewares();
        this.setupHandlers();
    }

    setupMiddlewares() {
        this.bot.use(session());
        // Добавим дополнительные middleware позже
    }

    setupHandlers() {
        // Стартовая команда
        this.bot.start((ctx) => {
            ctx.reply(
                '🎯 Добро пожаловать в систему лояльности!\\n\\n' +
                'Доступные команды:\\n' +
                '/join - Присоединиться к программе\\n' +
                '/balance - Проверить баланс баллов\\n' +
                '/history - История операций\\n\\n' +
                'Для присоединения отправьте мне код вида: mj\\\\_m\\\\_xxxxx'
            );
        });

        // Команда присоединения
        this.bot.command('join', (ctx) => {
            ctx.reply(
                '🔗 Для присоединения к программе лояльности:\\n\\n' +
                '1. Получите QR-код у сотрудника\\n' +
                '2. Или введите код присоединения в формате: mj\\\\_m\\\\_xxxxx\\n\\n' +
                'Просто отправьте мне код присоединения!'
            );
        });

        // Обработка текстовых сообщений (join tokens)
        this.bot.on('text', (ctx) => {
            const text = ctx.message.text;
            
            if (text.startsWith('mj_m_')) {
                this.handleJoinToken(ctx, text);
            } else {
                ctx.reply('Отправьте мне код присоединения или используйте команды: /join, /balance');
            }
        });

        // Баланс (заглушка)
        this.bot.command('balance', (ctx) => {
            ctx.reply('💰 Функция проверки баланса скоро будет доступна!');
        });

        // История (заглушка)
        this.bot.command('history', (ctx) => {
            ctx.reply('📊 Функция истории операций скоро будет доступна!');
        });
    }

    async handleJoinToken(ctx, token) {
        try {
            // Временная заглушка - будет интегрирована с API
            console.log('Join token received:', token);
            
            await ctx.reply(
                '✅ Отлично! Код присоединения принят: ' + token + '\\n\\n' +
                'Система регистрации находится в разработке. Скоро вы сможете присоединиться к программе лояльности!'
            );
        } catch (error) {
            console.error('Join error:', error);
            await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
        }
    }

    async launch() {
        await this.bot.launch();
        console.log('🤖 Telegram Bot запущен');
        
        // Graceful shutdown
        process.once('SIGINT', () => this.bot.stop('SIGINT'));
        process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
    }
}

module.exports = TelegramBot;
