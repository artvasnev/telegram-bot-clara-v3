const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const fs = require('fs');

class MultiChatNotificationBot {
    constructor(token) {
        this.bot = new TelegramBot(token, { polling: true });
        this.clients = new Map();
        this.scheduledTasks = new Map();
        this.dataFile = 'clients_data.json';
        
        this.loadClientsData();
        this.setupCommands();
        this.restoreScheduledTasks();
    }

    setupCommands() {
        // Команда для настройки нового чата с клиентом
        this.bot.onText(/\/setup (.+) (\d+)/, (msg, match) => {
            const chatId = msg.chat.id;
            const clientName = match[1];
            const practiceCount = parseInt(match[2]);
            
            if (msg.chat.type === 'private') {
                this.bot.sendMessage(chatId, 'Добро пожаловать! Эта команда предназначена для групповых чатов. Пожалуйста, добавьте меня в групповой чат для работы с практиками ✨');
                return;
            }
            
            this.setupClientChat(clientName, practiceCount, chatId);
        });

        // Команда для просмотра информации о текущем чате
        this.bot.onText(/\/info/, (msg) => {
            const chatId = msg.chat.id;
            this.showChatInfo(chatId);
        });

        // Команда для остановки уведомлений
        this.bot.onText(/\/stop/, (msg) => {
            const chatId = msg.chat.id;
            this.stopChatNotifications(chatId);
        });

        // Приветствие при добавлении в группу
        this.bot.on('new_chat_members', (msg) => {
            const newMembers = msg.new_chat_members;
            const botAdded = newMembers.some(member => member.is_bot);
            
            if (botAdded) {
                const welcomeMessage = `Приветствую вас, волшебный мастер! Меня зовут Клара, я буду напоминать вам о сроках, чтобы у нас всё произошло в нужное время и в нашей с вами практике вы вышли вовремя.

Почему это так важно? Потому что когда абонемент закончится, чат автоматически архивируется и мы идём праздновать выпускной с тем количеством практик, которые успели сделать!

Для начала работы используйте:
/setup Имя_участника Количество_практик

Например: /setup Анна 4

Дополнительные команды:
/info - информация о текущих практиках
/stop - завершить напоминания

Буду рада помочь в организации вашего волшебного пути 🌟`;

                this.bot.sendMessage(msg.chat.id, welcomeMessage);
            }
        });
    }

    setupClientChat(clientName, practiceCount, chatId) {
        const startDate = new Date();
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + (practiceCount * 12));

        const client = {
            name: clientName,
            practiceCount: practiceCount,
            startDate: startDate,
            endDate: endDate,
            chatId: chatId
        };

        this.clients.set(chatId, client);
        this.saveClientsData();
        this.scheduleNotifications(client);
        
        const welcomeMessage = `Приветствую вас, волшебный мастер! Меня зовут Клара, я буду напоминать вам о сроках, чтобы у нас всё произошло в нужное время и в нашей с вами практике вы вышли вовремя.

Почему это так важно? Потому что когда абонемент закончится, чат автоматически архивируется и мы идём праздновать выпускной с тем количеством практик, которые успели сделать!

Итак, вот что у нас запланировано:

Участник: ${clientName}
Количество практик: ${practiceCount}
Дата начала пути: ${this.formatDate(startDate)}
${practiceCount === 1 ? 'Финальный дедлайн' : 'Завершение последней практики'}: ${this.formatDate(endDate)}

${practiceCount === 1 ? 'Это единственная практика - её дедлайн является финальным сроком разработки.' : 'Буду присылать дружеские напоминания за 3 дня до каждого ориентира. Последняя практика - это финальный важный дедлайн!'}

Желаю вдохновляющего путешествия 🎭`;

        this.bot.sendMessage(chatId, welcomeMessage);
    }

    scheduleNotifications(client) {
        this.stopChatTasks(client.chatId);
        
        const notifications = this.generateNotifications(client);
        const clientTasks = [];

        notifications.forEach(notification => {
            const task = cron.schedule(this.dateToCron(notification.date), () => {
                this.bot.sendMessage(client.chatId, notification.message);
            }, {
                scheduled: false
            });
            
            clientTasks.push(task);
            task.start();
        });

        this.scheduledTasks.set(client.chatId, clientTasks);
    }

    generateNotifications(client) {
        const notifications = [];
        const { name, practiceCount, startDate, endDate } = client;

        // Уведомления за 3 дня до каждой практики
        for (let i = 1; i <= practiceCount; i++) {
            const practiceDeadline = new Date(startDate);
            practiceDeadline.setDate(startDate.getDate() + (i * 12));
            
            const threeDaysBefore = new Date(practiceDeadline);
            threeDaysBefore.setDate(practiceDeadline.getDate() - 3);

            // Уведомление за 3 дня
            if (threeDaysBefore > new Date()) {
                notifications.push({
                    date: threeDaysBefore,
                    message: this.createThreeDayMessage(name, i, practiceDeadline, endDate, practiceCount)
                });
            }
        }

        // Убираем отдельное напоминание о финальном дедлайне, 
        // так как оно теперь встроено в напоминание о последней практике

        return notifications;
    }

    createThreeDayMessage(clientName, practiceNumber, practiceDeadline, finalDeadline, practiceCount) {
        // Если это последняя практика - это финальный важный дедлайн
        if (practiceNumber === practiceCount) {
            return `ВАЖНОЕ напоминание о финальном дедлайне разработки

${clientName}, через 3 дня наступает финальный дедлайн ${practiceNumber}-й (последней) практики - ${this.formatDate(practiceDeadline)}.

Это критически важная дата завершения всей разработки. В отличие от промежуточных ориентиров, этот срок нельзя нарушать.

После этой даты продление возможно только за дополнительную оплату +20% от стоимости абонемента.

Команда и проводник готовы оказать максимальную поддержку на финальном этапе! 💎`;
        } 
        // Напоминание о выпускном через одну практику
        else if (practiceNumber % 2 === 0 && practiceNumber < practiceCount) {
            return `Дружеское напоминание для команды и проводника

${clientName}, через 3 дня у нас приблизительный ориентир по ${practiceNumber}-й практике - ${this.formatDate(practiceDeadline)}.

Это промежуточный этап для сверки с планом. Практика может быть готова чуть раньше или немного позже - это естественно и нормально.

Напоминаем: выпускной и архивация чата запланированы на ${this.formatDate(finalDeadline)}. До этого дня нужно завершить все ${practiceCount} практик.

Команда и проводник могут ориентироваться на этот чекпоинт для планирования 🌸`;
        }
        else {
            // Промежуточные практики - мягкие ориентиры
            return `Дружеское напоминание для команды и проводника

${clientName}, через 3 дня у нас приблизительный ориентир по ${practiceNumber}-й практике - ${this.formatDate(practiceDeadline)}.

Это промежуточный этап для сверки с планом. Практика может быть готова чуть раньше или немного позже - это естественно и нормально.

Это просто контрольная точка для удобства отслеживания пути. Главное - движение к финальному дедлайну ${practiceNumber === 1 ? 'единственной' : 'последней'} практики ${this.formatDate(finalDeadline)}.

Команда и проводник могут ориентироваться на этот чекпоинт для планирования 🌱`;
        }
    }

    stopChatNotifications(chatId) {
        this.stopChatTasks(chatId);
        const client = this.clients.get(chatId);
        
        if (client) {
            this.clients.delete(chatId);
            this.saveClientsData();
            this.bot.sendMessage(chatId, `Напоминания для ${client.name} завершены. Благодарим за совместный путь 💫`);
        } else {
            this.bot.sendMessage(chatId, 'В данном чате напоминания не активированы ✨');
        }
    }

    stopChatTasks(chatId) {
        const tasks = this.scheduledTasks.get(chatId);
        if (tasks) {
            tasks.forEach(task => task.stop());
            this.scheduledTasks.delete(chatId);
        }
    }

    showChatInfo(chatId) {
        const client = this.clients.get(chatId);
        
        if (!client) {
            this.bot.sendMessage(chatId, 'Чат пока не настроен. Используйте /setup Имя Количество для начала пути ✨');
            return;
        }

        const now = new Date();
        const daysLeft = Math.ceil((client.endDate - now) / (1000 * 60 * 60 * 24));
        
        const infoMessage = `Информация о текущем пути:

Участник: ${client.name}
Количество практик: ${client.practiceCount}
Дата начала: ${this.formatDate(client.startDate)}
Ориентировочное завершение: ${this.formatDate(client.endDate)}
Времени в пути: ${daysLeft > 0 ? daysLeft + ' дней' : 'Путь завершён'}

Напоминания активны и работают с заботой о вас ✨`;

        this.bot.sendMessage(chatId, infoMessage);
    }

    saveClientsData() {
        const data = {};
        this.clients.forEach((client, chatId) => {
            data[chatId] = {
                ...client,
                startDate: client.startDate.toISOString(),
                endDate: client.endDate.toISOString()
            };
        });
        
        try {
            fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Ошибка сохранения:', error);
        }
    }

    loadClientsData() {
        try {
            if (fs.existsSync(this.dataFile)) {
                const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
                Object.entries(data).forEach(([chatId, clientData]) => {
                    const client = {
                        ...clientData,
                        startDate: new Date(clientData.startDate),
                        endDate: new Date(clientData.endDate),
                        chatId: parseInt(chatId)
                    };
                    this.clients.set(parseInt(chatId), client);
                });
                console.log(`✅ Загружено ${this.clients.size} участников`);
            }
        } catch (error) {
            console.error('Ошибка загрузки:', error);
        }
    }

    restoreScheduledTasks() {
        this.clients.forEach(client => {
            this.scheduleNotifications(client);
        });
        console.log(`✅ Восстановлены напоминания для ${this.clients.size} участников`);
    }

    formatDate(date) {
        return date.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }

    dateToCron(date) {
        const minutes = date.getMinutes();
        const hours = date.getHours();
        const day = date.getDate();
        const month = date.getMonth() + 1;
        
        return `${minutes} ${hours} ${day} ${month} *`;
    }
}

// ВАЖНО: Для облака используем переменную окружения, для локального запуска - прямой токен
const BOT_TOKEN = process.env.BOT_TOKEN || '8024864374:AAFMYhdKrfulQCAO6ZvEoRf8peU2CgifPwc';

try {
    const notificationBot = new MultiChatNotificationBot(BOT_TOKEN);
    console.log('🌟 Бот-помощник запущен с теплотой и заботой!');
} catch (error) {
    console.error('❌ Ошибка запуска бота:', error.message);
    console.log('Пожалуйста, проверьте токен бота');
}

module.exports = MultiChatNotificationBot;
