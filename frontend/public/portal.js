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
      title: 'Клиенты',
      sub: 'Агрегация по клиентам на основе /api/v1/merchant/dashboard.'
    },
    transactions: {
      title: 'Транзакции',
      sub: 'Реальные purchase / points_redemption из /api/v1/merchant/dashboard.'
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

  // === MOCK: дашборд (до прихода данных из API) ===
  function initMockDashboard() {
    const kpiTurnover = document.getElementById('kpiTurnover');
    const kpiTurnoverTrend = document.getElementById('kpiTurnoverTrend');
    const kpiEarned = document.getElementById('kpiEarned');
    const kpiEarnedTrend = document.getElementById('kpiEarnedTrend');
    const kpiRedeemed = document.getElementById('kpiRedeemed');
    const kpiRedeemedTrend = document.getElementById('kpiRedeemedTrend');
    const kpiActiveClients = document.getElementById('kpiActiveClients');
    const kpiActiveClientsMeta = document.getElementById('kpiActiveClientsMeta');

    if (kpiTurnover) kpiTurnover.textContent = '—';
    if (kpiTurnoverTrend) kpiTurnoverTrend.textContent = 'ожидание данных';

    if (kpiEarned) kpiEarned.textContent = '—';
    if (kpiEarnedTrend) kpiEarnedTrend.textContent = 'ожидание данных';

    if (kpiRedeemed) kpiRedeemed.textContent = '—';
    if (kpiRedeemedTrend) kpiRedeemedTrend.textContent = 'ожидание данных';

    if (kpiActiveClients) kpiActiveClients.textContent = '—';
    if (kpiActiveClientsMeta) kpiActiveClientsMeta.textContent = 'ожидание данных';

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

  // === MOCK: клиенты (fallback, пока нет данных) ===
  function initMockClients() {
    const clientsBody = document.getElementById('clientsTableBody');
    if (!clientsBody) return;

    const demoClients = [
      { id: 'C-1001', name: 'Demo Client', phone: '+998 90 000-00-00', balance: '0', last: '—', status: 'Active' },
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

  // === MOCK: транзакции (до первой загрузки dashboard) ===
  function initMockTransactions() {
    const txBody = document.getElementById('transactionsTableBody');
    if (!txBody) return;

    const demoTx = [
      { id: 'TX-DEMO', type: 'purchase', amount: '0', points: '0', client: '—', date: '—' },
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

  // === Загрузка dashboard из API v1 + мэппинг на KPI, транзакции и клиентов ===
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

      const d = data.dashboard || {};
	  applyMerchantSettings(data.merchant);

      // --- KPI из dashboard ---
      const kpiTurnover = document.getElementById('kpiTurnover');
      const kpiTurnoverTrend = document.getElementById('kpiTurnoverTrend');
      const kpiEarned = document.getElementById('kpiEarned');
      const kpiEarnedTrend = document.getElementById('kpiEarnedTrend');
      const kpiRedeemed = document.getElementById('kpiRedeemed');
      const kpiRedeemedTrend = document.getElementById('kpiRedeemedTrend');
      const kpiActiveClients = document.getElementById('kpiActiveClients');
      const kpiActiveClientsMeta = document.getElementById('kpiActiveClientsMeta');

      // Оборот считаем по всем purchase-транзакциям
      let turnover = 0;
      if (Array.isArray(d.transactions)) {
        d.transactions.forEach((t) => {
          if (t.transactionType === 'purchase' && t.status === 'completed') {
            turnover += Number(t.amount || 0);
          }
        });
      }

      if (kpiTurnover) {
        kpiTurnover.textContent =
          turnover > 0 ? turnover.toLocaleString('ru-RU') + ' сум' : '0 сум';
      }
      if (kpiTurnoverTrend) {
        kpiTurnoverTrend.textContent = 'по всем покупкам (purchase)';
      }

      if (kpiEarned) {
        const totalEarned = Number(d.totalEarned || 0);
        kpiEarned.textContent =
          totalEarned.toLocaleString('ru-RU') + ' баллов';
      }
      if (kpiEarnedTrend) {
        kpiEarnedTrend.textContent = 'всего начислено (totalEarned)';
      }

      if (kpiRedeemed) {
        const totalSpent = Number(d.totalSpent || 0);
        kpiRedeemed.textContent =
          totalSpent.toLocaleString('ru-RU') + ' баллов';
      }
      if (kpiRedeemedTrend) {
        kpiRedeemedTrend.textContent = 'всего списано (totalSpent)';
      }

      if (kpiActiveClients) {
        const cc = Number(d.customersCount || 0);
        kpiActiveClients.textContent = cc.toLocaleString('ru-RU');
      }
      if (kpiActiveClientsMeta) {
        const cc = Number(d.customersCount || 0);
        kpiActiveClientsMeta.textContent =
          cc > 0
            ? 'клиентов в программе'
            : 'пока нет клиентов';
      }

      // --- Таблица транзакций ---
      const txBody = document.getElementById('transactionsTableBody');
      if (txBody && Array.isArray(d.transactions)) {
        txBody.innerHTML = '';
        d.transactions.forEach((t) => {
          const pillClass =
            t.transactionType === 'purchase' ? 'blue' : 'amber';
          const label =
            t.transactionType === 'purchase' ? 'Purchase' : 'Redeem';

          const amount = Number(t.amount || 0);
          const pEarned = Number(t.pointsEarned || 0);
          const pSpent = Number(t.pointsSpent || 0);
          const delta = pEarned - pSpent;
          const deltaStr =
            delta > 0 ? '+' + delta : delta < 0 ? String(delta) : '0';

          let dateStr = '';
          try {
            dateStr = t.createdAt
              ? new Date(t.createdAt).toLocaleString('ru-RU')
              : '';
          } catch (_) {
            dateStr = t.createdAt || '';
          }

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${t.id}</td>
            <td><span class="pill-soft ${pillClass}">${label}</span></td>
            <td>${amount.toLocaleString('ru-RU')} сум</td>
            <td>${deltaStr}</td>
            <td>${t.customerId ?? ''}</td>
            <td>${dateStr}</td>
          `;
          txBody.appendChild(tr);
        });
      }

      // --- Таблица клиентов (агрегация по customerId) ---
      const clientsBody = document.getElementById('clientsTableBody');
      if (clientsBody && Array.isArray(d.transactions)) {
        const byCustomer = new Map();

        d.transactions.forEach((t) => {
          const cid = t.customerId;
          if (cid == null) return;

          let entry = byCustomer.get(cid);
          if (!entry) {
            entry = {
              customerId: cid,
              externalId: t.externalId || null,
              phone: t.phone || null,
              totalEarned: 0,
              totalSpent: 0,
              lastDate: null,
            };
            byCustomer.set(cid, entry);
          }

          entry.totalEarned += Number(t.pointsEarned || 0);
          entry.totalSpent += Number(t.pointsSpent || 0);

          const created = t.createdAt ? new Date(t.createdAt) : null;
          if (created && (!entry.lastDate || created > entry.lastDate)) {
            entry.lastDate = created;
            // обновляем phone / externalId последним известным
            entry.phone = t.phone || entry.phone;
            entry.externalId = t.externalId || entry.externalId;
          }
        });

        clientsBody.innerHTML = '';

        byCustomer.forEach((entry) => {
          const balance = entry.totalEarned - entry.totalSpent;
          const balanceStr = balance.toLocaleString('ru-RU');
          const lastStr = entry.lastDate
            ? entry.lastDate.toLocaleString('ru-RU')
            : '—';

          // crude статус: пока всех считаем Active
          const status = 'Active';

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${entry.customerId}</td>
            <td>${entry.externalId || '—'}</td>
            <td>${entry.phone || '—'}</td>
            <td>${balanceStr} баллов</td>
            <td>${lastStr}</td>
            <td>
              <span class="pill-soft green">${status}</span>
            </td>
          `;
          clientsBody.appendChild(tr);
        });

        // если dashboard.customersCount не совпадает с размером map — это тоже ок,
        // просто разная логика подсчёта; ничего не ломаем.
      }
    } catch (err) {
      console.error('[dashboard] ошибка запроса к API v1:', err);
      if (rawEl) {
        rawEl.textContent =
          '// ошибка при запросе к API v1:\n' +
          String(err);
      }
    }
  }
    // === Применение настроек программы лояльности из merchant ===
  function applyMerchantSettings(merchant) {
    if (!merchant) return;

    const earnRateEl = document.getElementById('cfgEarnRatePer1000');
    const redeemMaxPercentEl = document.getElementById('cfgRedeemMaxPercent');
    const minReceiptEl = document.getElementById('cfgMinReceiptAmountForEarn');
    const redeemMinPointsEl = document.getElementById('cfgRedeemMinPoints');
    const redeemStepEl = document.getElementById('cfgRedeemStep');
    const maxPerReceiptEl = document.getElementById('cfgMaxPointsPerReceipt');
    const maxPerDayEl = document.getElementById('cfgMaxPointsPerDay');

    const fmtNotSet = 'не настроено';

    if (earnRateEl) {
      if (merchant.earnRatePer1000 == null) {
        earnRateEl.textContent = fmtNotSet;
      } else {
        earnRateEl.textContent =
          `${merchant.earnRatePer1000} баллов за 1 000 сум`;
      }
    }

    if (redeemMaxPercentEl) {
      redeemMaxPercentEl.textContent =
        merchant.redeemMaxPercent == null
          ? fmtNotSet
          : `${merchant.redeemMaxPercent}%`;
    }

    if (minReceiptEl) {
      if (merchant.minReceiptAmountForEarn == null) {
        minReceiptEl.textContent = fmtNotSet;
      } else {
        const v = Number(merchant.minReceiptAmountForEarn);
        minReceiptEl.textContent = v.toLocaleString('ru-RU') + ' сум';
      }
    }

    if (redeemMinPointsEl) {
      redeemMinPointsEl.textContent =
        merchant.redeemMinPoints == null
          ? fmtNotSet
          : `${merchant.redeemMinPoints} баллов`;
    }

    if (redeemStepEl) {
      redeemStepEl.textContent =
        merchant.redeemStep == null
          ? fmtNotSet
          : `${merchant.redeemStep} баллов`;
    }

    if (maxPerReceiptEl) {
      maxPerReceiptEl.textContent =
        merchant.maxPointsPerReceipt == null
          ? fmtNotSet
          : `${merchant.maxPointsPerReceipt} баллов`;
    }

    if (maxPerDayEl) {
      maxPerDayEl.textContent =
        merchant.maxPointsPerDay == null
          ? fmtNotSet
          : `${merchant.maxPointsPerDay} баллов в сутки`;
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

  // === API-тестер (generic) ===
  function initApiTester() {
    const methodEl = document.getElementById('apiTesterMethod');
    const pathEl = document.getElementById('apiTesterPath');
    const bodyEl = document.getElementById('apiTesterBody');
    const btn = document.getElementById('apiTesterSendBtn');
    const resultEl = document.getElementById('apiTesterResult');

    if (!btn || !pathEl || !resultEl || !methodEl) {
      return;
    }

    if (!pathEl.value) {
      pathEl.value = '/api/v1/merchant/dashboard';
    }

    btn.addEventListener('click', async () => {
      if (!API_BASE) {
        resultEl.textContent =
          '// API_BASE не задан (см. переменную окружения API_BASE_URL для frontend)';
        return;
      }

      const method = (methodEl.value || 'GET').toUpperCase();
      const rawPath = pathEl.value.trim() || '/';
      const url =
        API_BASE +
        (rawPath.startsWith('/') ? rawPath : '/' + rawPath.replace(/^\/+/, ''));

      const headers = {
        'Content-Type': 'application/json',
      };
      if (MERCHANT_API_KEY) {
        headers['X-API-KEY'] = MERCHANT_API_KEY;
      }

      const options = { method, headers };

      if (method !== 'GET' && method !== 'HEAD') {
        const raw = bodyEl.value.trim();
        if (raw) {
          try {
            JSON.parse(raw);
          } catch (e) {
            console.warn('[apiTester] тело невалидный JSON:', e);
          }
          options.body = raw;
        }
      }

      resultEl.textContent = '// запрос к ' + url + ' ...';

      try {
        const res = await fetch(url, options);
        const text = await res.text();

        let parsed = null;
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          // не JSON — оставим как есть
        }

        let out = `// HTTP ${res.status} ${res.statusText}\n`;
        if (parsed !== null) {
          out += JSON.stringify(parsed, null, 2);
        } else {
          out += text;
        }
        resultEl.textContent = out;
      } catch (err) {
        console.error('[apiTester] ошибка запроса:', err);
        resultEl.textContent =
          '// ошибка запроса:\n' +
          String(err);
      }
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
  initApiTester();
  loadDashboardFromApi();

  console.log('PROJECT_3128_CONFIG:', CONFIG);
})();
