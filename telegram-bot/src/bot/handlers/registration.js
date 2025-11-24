const { registrationService } = require('../../services/registrationService');

class RegistrationHandler {
    async join(ctx) {
        await ctx.reply(
            '🎯 Для присоединения к программе лояльности:\n\n' +
            '1. Попросите QR-код у сотрудника\n' +
            '2. Или введите код присоединения в формате: mj_m_xxxxx\n\n' +
            'Просто отправьте мне код присоединения!'
        );
    }

    async handleJoinToken(ctx, token) {
        try {
            const telegramUser = {
                id: ctx.from.id,
                username: ctx.from.username,
                firstName: ctx.from.first_name,
                lastName: ctx.from.last_name
            };

            const result = await registrationService.registerCustomer(telegramUser, token);
            
            if (result.success) {
                await ctx.reply(
                    `✅ Отлично! Вы присоединились к программе лояльности ${result.merchantName}\n\n` +
                    `Ваш ID: ${result.customerCode}\n` +
                    `Баланс: ${result.points} баллов\n\n` +
                    `Используйте /balance для проверки баланса`
                );
            } else {
                await ctx.reply('❌ Не удалось присоединиться. Проверьте код или обратитесь к сотруднику.');
            }
        } catch (error) {
            console.error('Join error:', error);
            await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
        }
    }
}

module.exports = new RegistrationHandler();