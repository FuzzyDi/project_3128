(function () {
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.section');
  const topbarTitle = document.querySelector('.topbar-title');
  const topbarSub = document.querySelector('.topbar-sub');

  // === Конфиг проекта из backend ===
  const CONFIG = window.PROJECT_3128_CONFIG || {};
  const API_BASE = (CONFIG.apiBaseUrl || '').replace(/\/+$/, '');
  const MERCHANT_API_KEY = CONFIG.merchantApiKey || 'sbg_demo_mc4c48c';

  const titles = {
    dashboard: {
      title: 'Дашборд мерчанта (demo)',
      sub: 'Оборот, начисление и списание баллов, активность клиентов — поверх API v1.'
    },
    clients: {
      title: 'Клиенты (demo)',
      sub: 'Список клиентов сервиса лояльности — позже привяжем к API v1.'
    },
    transactions: {
      title: 'Транзакции (demo)',
      sub: 'История purchase / points_redemption — подключим реальные данные API v1.'
    },
    program: {
      title: 'Правила программы лояльности',
      sub: 'Текущие параметры earn/redeem, ограничения и политика сгорания баллов (demo).'
    },
    integrations: {
      title: 'Интеграции',
      sub: 'API v1, Telegram-бот, POS-интеграция и точки входа.'
    },
    pos: {
      title: 'POS Demo',
      sub: 'Упрощённая виртуальная касса. Сейчас mock-логика, позже API-запросы.'
    },
    docs: {
      title: 'API & Документация',
      sub: 'Контракт API v1 и сценарии интеграции (касса, Telegram-бот, внешние системы).'
    },
    about: {
      title: 'О демо-проекте Project 3128',
      sub: 'Архитектурный playground для сценариев лояльности в ритейле.'
    }
  };

  function switchSection(key) {
    navItems.forEach((item) => {
      item.classList.toggle('active', item.dataset.page === key);
    });
    sections.forEach((section) => {
      section.classList.toggle('active', section.dataset.section === key);
    });

    const meta = titles[key] || titles.dashboard;
    topbarTitle.textContent = meta.title;
    topbarSub.textContent = meta.sub;
  }

  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      switchSection(page);
    });
  });

  // === MOCK: дашборд ===
  function initMockDashboard() {
    const kpiTurnover = document.getElementById('kpiTurnover');
    const kpiTurnoverTrend = document.getElementById('kpiTurnoverTrend');
    const kpiEarned = document.getElementById('kpiEarned');
    const kpiEarnedTrend = document.getElementById('kpiEarnedTrend');
    const kpiRedeemed = document.getElementById('kpiRedeemed');
    const kpiRedeemedTrend = document.getElementById('kpiRedeemedTrend');
    const kpiActiveClients = document.getElementById('kpiActiveClients');
    const kpiActiveClientsMeta = document.getElementById('kpiActiveClientsMeta');

    kpiTurnover.textContent = '1 248 300 сум';
    kpiTurnoverTrend.textContent = '+12% к прошлой неделе';

    kpiEarned.textContent = '62 400 баллов';
    kpiEarnedTrend.textContent = '+8% начислений';

    kpiRedeemed.textContent = '41 900 баллов';
    kpiRedeemedTrend.textContent = '–3% списаний';

    kpiActiveClients.textContent = '327';
    kpiActiveClientsMeta.textContent = 'из 1020 зарегистрированных';

    const chartPlaceholder = document.getElementById('chartPlaceholder');
    if (chartPlaceholder && !chartPlaceholder.dataset.init) {
      chartPlaceholder.dataset.init = '1';
      for (let i = 0; i < 12; i++) {
        const bar = document.createElement('div');
        const alt = i % 3 === 0;
        bar.className = 'chart-bar' + (alt ? ' alt' : '');
        bar.style.height = (30 + Math.random() * 70) + '%';
        chartPlaceholder.appendChild(bar);
      }
    }
  }

  // === MOCK: клиенты ===
  function initMockClients() {
    const clientsBody = document.getElementById('clientsTableBody');
    const demoClients = [
      { id: 'C-1001', name: 'Алиша', phone: '+998 90 123-45-67', balance: '52 300', last: 'сегодня', status: 'Active' },
      { id: 'C-1002', name: 'Рашид', phone: '+998 97 765-43-21', balance: '8 700', last: 'вчера', status: 'Active' },
      { id: 'C-1003', name: 'Сардор', phone: '+998 91 111-22-33', balance: '0', last: '7 дней назад', status: 'Dormant' },
      { id: 'C-1004', name: 'Нилуфар', phone: '+998 93 555-66-77', balance: '120 000', last: '2 дня назад', status: 'VIP' },
    ];

    clientsBody.innerHTML = '';
    demoClients.forEach((c) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${c.id}</td>
        <td>${c.name}</td>
        <td>${c.phone}</td>
        <td>${c.balance} баллов</td>
        <td>${c.last}</td>
        <td>
          <span class="pill-soft ${
            c.status === 'VIP' ? 'amber' :
            c.status === 'Active' ? 'green' :
            ''
          }">${c.status}</span>
        </td>
      `;
      clientsBody.appendChild(tr);
    });
  }

  // === MOCK: транзакции ===
  function initMockTransactions() {
    const txBody = document.getElementById('transactionsTableBody');
    const demoTx = [
      { id: 'TX-2001', type: 'purchase', amount: '250 000', points: '+12 500', client: 'C-1001', date: 'сегодня, 12:30' },
      { id: 'TX-2002', type: 'points_redemption', amount: '80 000', points: '–16 000', client: 'C-1004', date: 'сегодня, 11:05' },
      { id: 'TX-2003', type: 'purchase', amount: '120 000', points: '+6 000', client: 'C-1002', date: 'вчера, 18:10' },
      { id: 'TX-2004', type: 'purchase', amount: '60 000', points: '+3 000', client: 'C-1003', date: '4 дня назад' },
    ];

    txBody.innerHTML = '';
    demoTx.forEach((t) => {
      const pillClass = t.type === 'purchase' ? 'blue' : 'amber';
      const label = t.type === 'purchase' ? 'Purchase' : 'Redeem';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${t.id}</td>
        <td><span class="pill-soft ${pillClass}">${label}</span></td>
        <td>${t.amount} сум</td>
        <td>${t.points}</td>
        <td>${t.client}</td>
        <td>${t.date}</td>
      `;
      txBody.appendChild(tr);
    });
  }

  // === Лог для POS demo ===
  function logPos(message, type) {
    const area = document.getElementById('posLog');
    if (!area) return;
    const line = document.createElement('div');
    line.className = 'log-line';
    const time = new Date().toLocaleTimeString();
    line.innerHTML = `<span class="time">[${time}]</span> <span class="tag">[${type || 'INFO'}]</span> ${message}`;
    area.appendChild(line);
    area.scrollTop = area.scrollHeight;
  }

  // === POS Demo (mock) ===
  function initPosDemo() {
    const clientInput = document.getElementById('posClientId');
    const amountInput = document.getElementById('posAmount');
    const purchaseBtn = document.getElementById('posPurchaseBtn');
    const redeemBtn = document.getElementById('posRedeemBtn');
    const clearBtn = document.getElementById('posClearLogBtn');
    const logArea = document.getElementById('posLog');

    if (logArea && !logArea.dataset.init) {
      logArea.dataset.init = '1';
      logPos('POS Demo готов. Введите клиента и сумму чека, затем выберите действие.', 'INFO');
      logPos(
        'CONFIG: apiBaseUrl=' + (API_BASE || '***not set***') +
        ', merchantApiKey=' + (MERCHANT_API_KEY ? '***set***' : '***empty***'),
        'CONFIG'
      );
    }

    purchaseBtn?.addEventListener('click', () => {
      const client = clientInput.value || 'C-1001';
      const amount = amountInput.value || '250000';
      logPos(`Имитация PURCHASE: client=${client}, amount=${amount}`, 'PURCHASE');
      logPos(`(TODO) Здесь будет реальный POST /transactions/purchase → API v1`, 'TODO');
    });

    redeemBtn?.addEventListener('click', () => {
      const client = clientInput.value || 'C-1001';
      const amount = amountInput.value || '50000';
      logPos(`Имитация REDEEM: client=${client}, amount=${amount}`, 'REDEEM');
      logPos(`(TODO) Здесь будет реальный POST /transactions/redeem → API v1`, 'TODO');
    });

    clearBtn?.addEventListener('click', () => {
      if (logArea) {
        logArea.innerHTML = '';
      }
    });
  }

  // === Скелет интеграции с API v1 (dashboard) + dev-панель ===
  async function loadDashboardFromApi() {
    const rawEl = document.getElementById('dashboardRawPayload');

    if (!API_BASE) {
      console.warn('[dashboard] API_BASE не задан, работаем в mock-режиме');
      if (rawEl) {
        rawEl.textContent = '// API_BASE не задан, запрос не выполнялся';
      }
      return;
    }

    const url = API_BASE + '/api/v1/merchant/dashboard';

    try {
      console.log('[dashboard] fetch', url);
      if (rawEl) {
        rawEl.textContent = '// выполняем запрос к ' + url + ' ...';
      }

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': MERCHANT_API_KEY,
        },
      });

      if (!res.ok) {
        console.warn('[dashboard] API ответ не OK:', res.status, res.statusText);
        if (rawEl) {
          rawEl.textContent =
            '// ошибка HTTP ' + res.status + ' ' + res.statusText +
            '\n// проверь API v1 и X-API-KEY';
        }
        return;
      }

      const data = await res.json();
      console.log('[dashboard] данные из API v1:', data);

      if (rawEl) {
        rawEl.textContent = JSON.stringify(data, null, 2);
      }

      // здесь позже подвяжем реальные KPI
    } catch (err) {
      console.error('[dashboard] ошибка запроса к API v1:', err);
      if (rawEl) {
        rawEl.textContent =
          '// ошибка при запросе к API v1:\n' +
          String(err);
      }
    }
  }

  // === Интеграции: заполняем блоки ===
  function initIntegrationsSection() {
    const apiBaseEl = document.getElementById('integrationsApiBase');
    const apiKeyEl = document.getElementById('integrationsApiKey');
    const curlEl = document.getElementById('integrationsCurlExample');

    if (apiBaseEl) {
      apiBaseEl.textContent = API_BASE || 'не задан (см. переменную API_BASE_URL в окружении frontend)';
    }
    if (apiKeyEl) {
      apiKeyEl.textContent = MERCHANT_API_KEY
        ? '*** установлен (X-API-KEY) ***'
        : 'не задан';
    }
    if (curlEl) {
      const base = API_BASE || 'http://api:8086';
      const key = MERCHANT_API_KEY || 'YOUR_MERCHANT_API_KEY';
      curlEl.textContent =
`curl -X GET \
  '${base}/api/v1/merchant/dashboard' \
  -H 'Content-Type: application/json' \
  -H 'X-API-KEY: ${key}'`;
    }
  }

  // === Dev-панель: переключатель JSON-блока ===
  function initDashboardRawToggle() {
    const toggle = document.getElementById('toggleDashboardRaw');
    const block = document.getElementById('dashboardRawBlock');
    if (!toggle || !block) return;

    toggle.addEventListener('click', () => {
      block.classList.toggle('hidden');
    });
  }

  // === Кнопка "Обновить" ===
  const refreshBtn = document.getElementById('refreshDashboard');
  refreshBtn?.addEventListener('click', () => {
    initMockDashboard();
    initMockClients();
    initMockTransactions();
    loadDashboardFromApi();
  });

  // === Первичная инициализация страницы ===
  initMockDashboard();
  initMockClients();
  initMockTransactions();
  initPosDemo();
  initIntegrationsSection();
  initDashboardRawToggle();
  loadDashboardFromApi();

  console.log('PROJECT_3128_CONFIG:', CONFIG);
})();
