# project_3128 — демо-сервис лояльности для ритейла

Проект `project_3128` — это демонстрационная система лояльности для магазина:

- единый **backend API** (Node.js / Express + PostgreSQL);
- простой **frontend** для POS/витрины;
- **Telegram-бот** для взаимодействия с клиентами;
- инфраструктура через **Docker Compose** и **nginx**.

Цель — показать минимальный боевой контур:
мерчант → касса/бот → API → база → начисление/списание баллов → отчётность.

---

## Структура проекта

```text
project_3128/
├── api/                 # Backend API (Node.js / Express)
│   ├── server.js        # Точка входа API
│   ├── db.js            # Подключение к PostgreSQL
│   ├── routes/          # Маршруты HTTP API
│   │   ├── botRoutes.js
│   │   ├── integrationRoutes.js
│   │   ├── loyaltyRoutes.js
│   │   ├── merchantRoutes.js
│   │   └── merchantSettingsRoutes.js
│   └── services/        # Бизнес-логика
│       └── merchantService.js
│
├── database/
│   └── init.sql         # Схема БД и демо-данные
│
├── frontend/            # Простой фронтенд
│   ├── server.js        # Небольшой Node-сервер для статики
│   ├── package.json
│   └── public/
│       ├── pos.html     # Демо-страница для POS-интеграции
│       └── static.html  # Статическая страница (витрина/документация)
│
├── telegram-bot/        # Телеграм-бот
│   ├── src/
│   │   └── app.js       # Логика бота
│   ├── package.json
│   ├── package-lock.json
│   └── Dockerfile
│
├── nginx/
│   └── nginx.conf       # Конфигурация nginx (роутинг фронта и API)
│
├── docker-compose.yml   # Все сервисы: db, api, frontend, bot, nginx
└── README.md
