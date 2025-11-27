# Project 3128 — REST API v1

Демо-сервис лояльности для ритейла: единый backend для интеграции с кассами (Set Retail 10 / POS), веб-кабинетом (портал) и Telegram-ботом.

Документ описывает **фактическое состояние API v1**, которое уже реализовано в `api/` проекта `project_3128`.

---

## 1. Общие сведения

### 1.1. Базовый URL

Локальная разработка (Docker-compose):

```text
http://localhost:8086/api/v1

http://localhost:8086/api/health

1.2. Формат

Запросы: application/json; charset=utf-8

Ответы: application/json; charset=utf-8

Денежные суммы: целые числа (сум, без тиинов и т.п.).

Время: ISO 8601 (UTC), например: 2025-11-27T10:42:05.104Z.

1.3. Авторизация

Для «закрытых» эндпоинтов используется заголовок:

X-API-Key: <apiKey мерчанта>


API-ключ выдаётся при регистрации мерчанта и идентифицирует магазин.

Ошибки авторизации:

// 401
{ "status": "ERROR", "message": "API Key required" }

// 403
{ "status": "ERROR", "message": "Invalid API Key" }

1.4. Формат ответов/ошибок

Успех:

{
  "status": "OK",
  "...": "payload"
}


Ошибка (бизнес/валидация):

{
  "status": "ERROR",
  "message": "Описание ошибки",
  "error": "optional_error_code",
  "meta": { "optional": "context" }
}


HTTP-коды:

200/201 — OK.

400 — неверные параметры (валидация).

401/403 — авторизация/доступ.

404 — не найдено/код истёк.

409 — конфликт (например, дублирующий код мерчанта).

500 — внутренняя ошибка.

2. Обзор эндпоинтов
2.1. Health

GET /api/health — состояние API.

2.2. Регистрация / публичные

POST /api/v1/merchants/register — регистрация мерчанта (основной поток).

POST /api/v1/public/merchants — демо-регистрация мерчанта + демо-клиента + join-token для бота.

2.3. Merchant API (по X-API-Key)

GET /api/v1/merchant — профиль и настройки лояльности мерчанта.

GET /api/v1/merchant/dashboard — дашборд (кол-во клиентов, totalEarned/totalSpent, последние транзакции).

GET /api/v1/merchant/settings — текущие правила лояльности (earn/redeem).

PATCH /api/v1/merchant/settings — изменение правил лояльности.

GET /api/v1/merchant/customers — список клиентов мерчанта с балансами.

GET /api/v1/merchant/transactions — список транзакций мерчанта.

2.4. Integration API (кассы/внешние системы)

Старый поток (по externalCustomerId):

POST /api/v1/integration/purchase — покупка (начисление).

POST /api/v1/integration/redeem — списание (по ID клиента).

Новый поток «касса ↔ Telegram-бот» (по 6-значному коду):

POST /api/v1/integration/lookup — проверка 6-значного кода, получение клиента, баланса и правил.

POST /api/v1/integration/checkout — закрытие чека: начисление и/или списание по коду.

2.5. Bot API / Loyalty API

/api/v1/bot/... — эндпоинты для Telegram-бота (регистрация, join по токену, генерация кодов).

/api/v1/loyalty/... — низкоуровневые операции лояльности (служебные, могут меняться).

Подробная спецификация Bot/Loyalty будет зафиксирована отдельно, когда протокол стабилизируется.

3. Health
3.1. GET /api/health

Простой health-check приложения.

Request

GET /api/health


Response 200

{
  "status": "OK",
  "message": "API is running",
  "timestamp": "2025-11-27T10:42:05.104Z",
  "version": "1.0.0"
}

4. Регистрация мерчанта
4.1. Основной поток — POST /api/v1/merchants/register

Регистрация мерчанта для интеграции (без Telegram-специфики).
Создаётся запись в merchants + генерируется уникальный code и apiKey.

Request

POST /api/v1/merchants/register
Content-Type: application/json

{
  "name": "Demo Shop 3",
  "code": "MC552707"
}


Поля:

name — обязательно, строка 1..100 символов.

code — опционально. Если задан:

строка ^[A-Z0-9]{3,16}$,

должен быть уникален среди merchants.code.
Если не задан — генерируется автоматически (MC + 6 hex).

Response 201

{
  "status": "OK",
  "merchant": {
    "id": 5,
    "code": "MC552707",
    "name": "Demo Shop 3",
    "createdAt": "2025-11-27T19:25:40.964Z",
    "earnRatePer1000": 1,
    "redeemMaxPercent": null,
    "minReceiptAmountForEarn": null,
    "redeemMinPoints": null,
    "redeemStep": null,
    "maxPointsPerReceipt": null,
    "maxPointsPerDay": null,
    "apiKey": "sbg_mc_mc552707_f7d1c6e2",
    "status": "active"
  }
}


Ошибки:

400 — неправильный name/code (валидация).

409 — мерчант с таким code уже существует.

500 — внутренняя ошибка.

4.2. Демо-регистрация — POST /api/v1/public/merchants

Используется порталом/ботом для быстрого поднятия демо-организации.

Создаёт:

merchant (+ apiKey);

customer (демо-клиент);

customer_merchants (связка);

customer_merchants_telegram с joinToken для привязки в Telegram.

Request

POST /api/v1/public/merchants
Content-Type: application/json

{
  "name": "Demo Shop",
  "phone": "+998901234567",
  "externalCustomerId": "DEMO_1"
}


name — обязательно.

phone, externalCustomerId — опционально.

Response 200

{
  "success": true,
  "merchant": {
    "id": 1,
    "code": "MABC123",
    "name": "Demo Shop",
    "apiKey": "sbg_xxx",
    "createdAt": "2025-11-25T14:46:28.269Z",
    "joinToken": "mj_m_abc123",
    "demoCustomerId": 1,
    "customerMerchantId": 1
  }
}

5. Merchant API

Все эндпоинты этого раздела требуют:

X-API-Key: <apiKey>

5.1. Профиль — GET /api/v1/merchant

Возвращает профиль мерчанта и его базовые настройки лояльности.

Request

GET /api/v1/merchant
X-API-Key: <apiKey>


Response 200

{
  "merchant": {
    "id": 1,
    "code": "MC4C48C",
    "name": "Demo Shop",
    "createdAt": "2025-11-25T14:42:48.506Z",
    "earnRatePer1000": 1,
    "redeemMaxPercent": 30,
    "minReceiptAmountForEarn": 10000,
    "redeemMinPoints": 100,
    "redeemStep": 50,
    "maxPointsPerReceipt": 5000,
    "maxPointsPerDay": 20000
  }
}


Ошибки: 401, 403, 500.

5.2. Дашборд — GET /api/v1/merchant/dashboard

Сводка по мерчанту: количество клиентов, суммарно начисленные/списанные баллы и последние операции (до 20).

Request

GET /api/v1/merchant/dashboard
X-API-Key: <apiKey>


Response 200

{
  "status": "OK",
  "merchant": {
    "id": 1,
    "code": "MC4C48C",
    "name": "Demo Shop",
    "createdAt": "2025-11-25T14:42:48.506Z",
    "earnRatePer1000": null,
    "redeemMaxPercent": null,
    "minReceiptAmountForEarn": null,
    "redeemMinPoints": null,
    "redeemStep": null,
    "maxPointsPerReceipt": null,
    "maxPointsPerDay": null,
    "apiKey": "sbg_demo_mc4c48c",
    "status": "active"
  },
  "dashboard": {
    "customersCount": 1,
    "totalEarned": 1999,
    "totalSpent": 1300,
    "transactions": [
      {
        "id": 19,
        "customerMerchantId": 1,
        "customerId": 1,
        "externalId": "DEMO_1",
        "phone": null,
        "amount": 20000,
        "pointsEarned": 40,
        "pointsSpent": 0,
        "transactionType": "purchase",
        "status": "completed",
        "createdAt": "2025-11-27T10:42:05.104Z"
      }
      // ... до 20 последних операций
    ]
  }
}

5.3. Настройки лояльности — GET /api/v1/merchant/settings

Возвращает текущие правила earn/redeem для мерчанта.

Request

GET /api/v1/merchant/settings
X-API-Key: <apiKey>


Response 200

{
  "status": "OK",
  "merchant": {
    "id": 5,
    "code": "MC552707",
    "name": "Demo Shop 3",
    "createdAt": "2025-11-27T19:25:40.964Z",
    "earnRatePer1000": 10,
    "redeemMaxPercent": 20,
    "minReceiptAmountForEarn": 50000,
    "redeemMinPoints": 100,
    "redeemStep": 50,
    "maxPointsPerReceipt": 10000,
    "maxPointsPerDay": 50000,
    "apiKey": "sbg_mc_mc552707_f7d1c6e2",
    "status": "active"
  }
}


Ошибки: 401, 403, 500.

5.4. Изменение настроек — PATCH /api/v1/merchant/settings

Частичное обновление правил earn/redeem.

Поля, которых нет в JSON — не меняются.

Поля со значением null — сбрасываются в NULL в БД.

Лимиты/валидация реализованы на уровне сервера, ошибки возвращаются с status = "ERROR".

Request

PATCH /api/v1/merchant/settings
X-API-Key: <apiKey>
Content-Type: application/json

{
  "earnRatePer1000": 10,
  "redeemMaxPercent": 20,
  "minReceiptAmountForEarn": 50000,
  "redeemMinPoints": 100,
  "redeemStep": 50,
  "maxPointsPerReceipt": 10000,
  "maxPointsPerDay": 50000
}


Ограничения (примерная логика):

earnRatePer1000: 0..1000

redeemMaxPercent: 0..100

minReceiptAmountForEarn: >= 0

redeemMinPoints: >= 0

redeemStep: >= 1

maxPointsPerReceipt: >= 0

maxPointsPerDay: >= 0

Response 200

{
  "status": "OK",
  "merchant": {
    "...": "как в GET /merchant/settings"
  }
}


Ошибки:

400 — validation_error, текст в message.

401/403/500.

5.5. Клиенты мерчанта — GET /api/v1/merchant/customers

Список клиентов с балансами и агрегированной статистикой.

Request

GET /api/v1/merchant/customers?limit=50&offset=0
X-API-Key: <apiKey>


Параметры:

limit — опционально, 1..200, по умолчанию 50.

offset — опционально, >=0, по умолчанию 0.

Response 200

{
  "status": "OK",
  "total": 1,
  "limit": 50,
  "offset": 0,
  "customers": [
    {
      "customerMerchantId": 1,
      "customerId": 1,
      "externalId": "DEMO_1",
      "phone": "+998900000000",
      "linkedAt": "2025-11-26T10:38:43.745Z",
      "points": 699,
      "totalEarned": 1999,
      "totalSpent": 1300,
      "lastActivity": "2025-11-27T10:42:05.104Z"
    }
  ]
}


Ошибки: 401, 403, 500.

5.6. Транзакции мерчанта — GET /api/v1/merchant/transactions

Список транзакций мерчанта с минимальной аналитикой. Используется порталом для вкладки «Транзакции».

Request

GET /api/v1/merchant/transactions?limit=50&offset=0&type=purchase&from=2025-11-25&to=2025-11-28
X-API-Key: <apiKey>


Параметры:

limit — опционально, 1..200, по умолчанию 50.

offset — опционально, >=0, по умолчанию 0.

type — опционально, purchase или points_redemption.

from — опционально, ISO-дата/дата-время (нижняя граница по created_at, включительно).

to — опционально, ISO-дата/дата-время (верхняя граница, исключительно).

Response 200

{
  "status": "OK",
  "total": 17,
  "limit": 50,
  "offset": 0,
  "transactions": [
    {
      "id": 19,
      "customerMerchantId": 1,
      "customerId": 1,
      "externalId": "DEMO_1",
      "phone": null,
      "amount": 20000,
      "pointsEarned": 40,
      "pointsSpent": 0,
      "transactionType": "purchase",
      "status": "completed",
      "createdAt": "2025-11-27T10:42:05.104Z"
    }
  ]
}


Ошибки: 401, 403, 500.

6. Integration API (старый поток по externalCustomerId)

Эндпоинты для интеграции, когда касса/ERP знает своего externalCustomerId и хочет работать с бонусами напрямую, без Telegram-бота.

Общий заголовок:

X-API-Key: <apiKey мерчанта>

6.1. Покупка — POST /api/v1/integration/purchase

Начисление баллов по факту покупки, с возможным созданием клиента/связки.

Request

POST /api/v1/integration/purchase
X-API-Key: <apiKey>
Content-Type: application/json

{
  "externalCustomerId": "EXT-123",
  "phone": "+998901234567",
  "amount": 200000
}


externalCustomerId — обязателен.

phone — опционально (может использоваться для уведомлений).

amount — сумма чека, > 0.

Сервис:

ищет/создаёт customer и customer_merchants для данного мерчанта;

применяет правило earnRatePer1000 и лимиты;

создаёт запись в transactions;

обновляет loyalty_points (points, total_earned/total_spent, last_activity).

Response 200 (упрощённо)

{
  "status": "OK",
  "merchant": { "id": 1, "code": "MC4C48C", "name": "Demo Shop" },
  "customer": {
    "id": 1,
    "externalId": "EXT-123",
    "phone": "+998901234567",
    "customerMerchantId": 1
  },
  "rule": {
    "type": "simple_rate",
    "description": "1 балл(ов) за каждые 1000 единиц суммы"
  },
  "result": {
    "transaction": {
      "id": 123,
      "customerMerchantId": 1,
      "amount": 200000,
      "pointsEarned": 200,
      "pointsSpent": 0,
      "transactionType": "purchase",
      "status": "completed",
      "createdAt": "2025-11-27T10:42:05.104Z"
    },
    "balance": {
      "points": 1500,
      "total_earned": 3000,
      "total_spent": 1500
    }
  }
}

6.2. Списание — POST /api/v1/integration/redeem

Списание баллов напрямую по externalCustomerId.

Request

POST /api/v1/integration/redeem
X-API-Key: <apiKey>
Content-Type: application/json

{
  "externalCustomerId": "EXT-123",
  "points": 300,
  "amount": 50000
}


externalCustomerId — обязателен.

points — обязательно, > 0.

amount — опционально; может использоваться для дополнительных проверок/логов.

Сервис проверяет:

наличие клиента/связки;

достаточность баланса;

применяет applyTransaction c pointsEarned = 0, pointsSpent = points.

Ответ аналогичен purchase, но с другим знаком по pointsSpent.
Ошибки: INSUFFICIENT_POINTS и т.п. — через status = "ERROR" и HTTP-код 400.

7. Integration API (новый поток: 6-значный код)

Поток «касса ↔ Telegram-бот» для магазинов, которые не хотят хранить свои идентификаторы клиентов на кассе.

Сценарий:

Клиент в боте вводит команду, бот создаёт запись в loyalty_session_codes и выдаёт 6-значный код.

Кассир на POS вводит 6-значный код и сумму чека.

POS через Integration API делает:

lookup — проверить код/получить баланс;

checkout — списать/начислить баллы и закрыть чек.

7.1. Проверка кода — POST /api/v1/integration/lookup

Request

POST /api/v1/integration/lookup
X-API-Key: <apiKey>
Content-Type: application/json

{
  "sessionCode": "123456"
}


sessionCode — строка из 1..6 цифр. Внутри нормализуется до 6 цифр с лидирующими нулями.

Response 200

{
  "status": "OK",
  "merchant": {
    "id": 1,
    "code": "MC4C48C",
    "name": "Demo Shop",
    "status": "active",
    "timezone": "Asia/Tashkent",
    "earnRatePer1000": 1,
    "redeemMaxPercent": 30,
    "minReceiptAmountForEarn": 10000,
    "redeemMinPoints": 100,
    "redeemStep": 50,
    "maxPointsPerReceipt": 5000,
    "maxPointsPerDay": 20000
  },
  "customer": {
    "id": 1,
    "customerMerchantId": 1,
    "externalId": "DEMO_1",
    "phone": "+998901234567"
  },
  "balance": {
    "points": 1500,
    "total_earned": 3000,
    "total_spent": 1500,
    "last_activity": "2025-11-27T10:40:26.834Z",
    "maxRedeemByBalance": 1500
  }
}


Ошибки:

400 — не передан/невалиден sessionCode.

404 — код не найден, просрочен или уже использован.

401/403/500 — авторизация/внутренние ошибки.

7.2. Закрытие чека — POST /api/v1/integration/checkout

Закончить чек с учётом правил лояльности мерчанта и текущего баланса клиента.

Request

POST /api/v1/integration/checkout
X-API-Key: <apiKey>
Content-Type: application/json

{
  "sessionCode": "123456",
  "receiptId": "TEST-0005",
  "amount": 200000,
  "redeemPoints": 300
}


Поля:

sessionCode — 6-значный код (как в lookup).

receiptId — опционально, строковый идентификатор чека.

amount — обязательно, сумма чека (> 0).

redeemPoints — опционально, >= 0.
0 или отсутствие поля — «не списывать, только начислить».

Логика (упрощённо):

Проверить валидность sessionCode и связку merchant + customer.

Посчитать максимум списания по:

(redeemMaxPercent) от суммы чека,

текущему балансу,

maxPointsPerReceipt,

maxPointsPerDay (если включим).

Проверить redeemPoints: минимум (redeemMinPoints), шаг (redeemStep), доступный баланс.

Посчитать начисление: earnRatePer1000 × amount / 1000, с учётом minReceiptAmountForEarn.

Вызвать applyTransaction с рассчитанными pointsEarned и pointsSpent.

Обновить loyalty_points и пометить sessionCode как использованный.

Response 200 (пример)

{
  "status": "OK",
  "merchant": {
    "id": 1,
    "code": "MC4C48C",
    "name": "Demo Shop",
    "...": "настройки"
  },
  "customer": {
    "id": 1,
    "customerMerchantId": 1,
    "externalId": "DEMO_1",
    "phone": "+998901234567"
  },
  "result": {
    "transaction": {
      "id": 25,
      "customerMerchantId": 1,
      "amount": 200000,
      "pointsEarned": 200,
      "pointsSpent": 300,
      "transactionType": "purchase",
      "status": "completed",
      "createdAt": "2025-11-27T10:55:00.000Z"
    },
    "balance": {
      "points": 1400,
      "total_earned": 3199,
      "total_spent": 1799
    }
  }
}


Ошибки:

400 — неверный sessionCode/amount/redeemPoints, нарушение правил списания/лимитов.

404 — код не найден/истёк.

401/403/500.

8. Bot API / Loyalty API (overview)

Подробно не фиксируется (часть контрактов ещё в движении).

8.1. Bot API — /api/v1/bot/...

Типичные операции:

регистрация Telegram-пользователя;

привязка к мерчанту по joinToken;

генерация 6-значного sessionCode и запись в loyalty_session_codes;

просмотр баланса/истории в боте.

8.2. Loyalty API — /api/v1/loyalty/...

Низкоуровневые сервисные операции (могут использоваться Bot API и Integration API):

генерация/валидация сессионных кодов;

внутренние операции над балансами/лимитами.

По мере стабилизации протокола бота эти эндпоинты будут задокументированы отдельным блоком.

9. Примеры (PowerShell)
9.1. Регистрация мерчанта
$body = @{
    name = "Demo Shop 3"
} | ConvertTo-Json

$response = Invoke-RestMethod `
  -Uri 'http://localhost:8086/api/v1/merchants/register' `
  -Method Post `
  -ContentType 'application/json' `
  -Body $body

$response.merchant.code
$response.merchant.apiKey

9.2. Дашборд мерчанта
$apiKey = "<apiKey>"

$response = Invoke-RestMethod `
  -Uri 'http://localhost:8086/api/v1/merchant/dashboard' `
  -Method Get `
  -Headers @{ "X-API-Key" = $apiKey }

$response.dashboard

9.3. Клиенты и транзакции
$apiKey = "<apiKey>"

Invoke-RestMethod `
  -Uri 'http://localhost:8086/api/v1/merchant/customers?limit=50' `
  -Method Get `
  -Headers @{ "X-API-Key" = $apiKey }

Invoke-RestMethod `
  -Uri 'http://localhost:8086/api/v1/merchant/transactions?limit=50&offset=0' `
  -Method Get `
  -Headers @{ "X-API-Key" = $apiKey }

9.4. Поток с 6-значным кодом
$apiKey = "<apiKey>"
$code   = "123456"

# lookup
$bodyLookup = @{ sessionCode = $code } | ConvertTo-Json

$lookup = Invoke-RestMethod `
  -Uri 'http://localhost:8086/api/v1/integration/lookup' `
  -Method Post `
  -ContentType 'application/json' `
  -Headers @{ "X-API-Key" = $apiKey } `
  -Body $bodyLookup

# checkout
$bodyCheckout = @{
    sessionCode  = $code
    receiptId    = "DEMO-001"
    amount       = 200000
    redeemPoints = 300
} | ConvertTo-Json

$checkout = Invoke-RestMethod `
  -Uri 'http://localhost:8086/api/v1/integration/checkout' `
  -Method Post `
  -ContentType 'application/json' `
  -Headers @{ "X-API-Key" = $apiKey } `
  -Body $bodyCheckout

::contentReference[oaicite:0]{index=0}