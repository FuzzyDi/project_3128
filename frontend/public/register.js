(function () {
  const CONFIG = window.PROJECT_3128_CONFIG || {};
  const API_BASE = (CONFIG.apiBaseUrl || "").replace(/\/+$/, "");
  const BOT_URL_BASE = (CONFIG.telegramBotUrl || "").replace(/\/+$/, "");

  const form = document.getElementById("merchantRegisterForm");
  const nameInput = document.getElementById("merchantName");
  const codeInput = document.getElementById("merchantCode");
  const btn = document.getElementById("registerBtn");
  const statusEl = document.getElementById("registerStatus");

  const card = document.getElementById("registerResult");
  const resId = document.getElementById("resultMerchantId");
  const resCode = document.getElementById("resultMerchantCode");
  const resKey = document.getElementById("resultApiKey");
  const resCreated = document.getElementById("resultCreatedAt");
  const resCurl = document.getElementById("resultCurlExample");

  const qrSection = document.getElementById("qrSection");
  const qrImg = document.getElementById("merchantQr");
  const qrLink = document.getElementById("merchantQrLink");
  const qrCaptionText = document.getElementById("qrCaptionText");

  function setStatus(msg, type) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.classList.remove("error", "success");
    if (type === "error") statusEl.classList.add("error");
    if (type === "success") statusEl.classList.add("success");
  }

  function formatDate(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleString("ru-RU");
    } catch (_) {
      return iso;
    }
  }

  function buildBotDeepLink(merchant) {
    if (!BOT_URL_BASE || !merchant || !merchant.code) {
      return null;
    }
    // payload вида "mc_<код>", бот по нему понимает, к какому мерчанту привязывать клиента
    const payload = "mc_" + String(merchant.code).toLowerCase();
    const sep = BOT_URL_BASE.includes("?") ? "&" : "?";
    return BOT_URL_BASE + sep + "start=" + encodeURIComponent(payload);
  }

  function fillQrBlock(merchant) {
    if (!qrSection || !qrImg || !qrLink) return;

    const deepLink = buildBotDeepLink(merchant);
    if (!deepLink) {
      qrSection.style.display = "none";
      return;
    }

    qrLink.textContent = deepLink;
    qrLink.href = deepLink;

    if (qrCaptionText) {
      const name = merchant.name || "вашего магазина";
      qrCaptionText.textContent =
        "Клиенты сканируют этот QR-код, переходят в Telegram-бот и " +
        "регистрируются в программе лояльности «" + name + "». " +
        "QR можно распечатать и повесить в зале, на кассе или у входа.";
    }

    // Используем Google Chart API для генерации QR (достаточно для демо)
    const qrApiUrl =
      "https://chart.googleapis.com/chart?cht=qr&chs=260x260&chl=" +
      encodeURIComponent(deepLink);

    qrImg.src = qrApiUrl;
    qrSection.style.display = "grid";
  }

  function fillResult(merchant) {
    if (!merchant || !card) return;

    resId.textContent = "ID: " + merchant.id;
    resCode.textContent = "Code: " + (merchant.code || "—");
    resKey.textContent = merchant.apiKey || "—";
    resCreated.textContent = formatDate(merchant.createdAt);

    const base = API_BASE || "http://localhost:8086";
    const key = merchant.apiKey || "YOUR_MERCHANT_API_KEY";

    resCurl.textContent =
`curl -X GET ^
  "${base}/api/v1/merchant/dashboard" ^
  -H "Content-Type: application/json" ^
  -H "X-API-Key: ${key}"`;

    fillQrBlock(merchant);

    card.style.display = "block";
  }

  if (!API_BASE) {
    setStatus("API_BASE_URL не задан (config.js). Регистрация работать не будет.", "error");
  } else {
    if (!BOT_URL_BASE) {
      // Не критично, просто предупреждаем, что QR не появится
      setStatus(
        "Внимание: telegramBotUrl не задан в config.js — QR для бота не будет сформирован.",
        null
      );
    }
  }

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!API_BASE) {
      setStatus("API_BASE_URL не задан. Проверь config.js.", "error");
      return;
    }

    const name = (nameInput.value || "").trim();
    const codeRaw = (codeInput.value || "").trim();

    if (!name) {
      setStatus("Укажите название мерчанта.", "error");
      nameInput.focus();
      return;
    }
    if (name.length > 100) {
      setStatus("Название должно быть не длиннее 100 символов.", "error");
      nameInput.focus();
      return;
    }

    let code = null;
    if (codeRaw) {
      const normalized = codeRaw.toUpperCase();
      if (!/^[A-Z0-9]{3,16}$/.test(normalized)) {
        setStatus(
          'Код должен соответствовать ^[A-Z0-9]{3,16}$. Латинские буквы и цифры, без пробелов.',
          "error"
        );
        codeInput.focus();
        return;
      }
      code = normalized;
    }

    const payload = { name };
    if (code !== null) payload.code = code;

    const url = API_BASE + "/api/v1/merchants/register";

    setStatus("Отправляем запрос к " + url + " ...", null);
    btn.disabled = true;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.status === "ERROR") {
        const msg =
          (data && data.message) ||
          `Ошибка HTTP ${res.status} ${res.statusText}`;
        setStatus("Регистрация не удалась: " + msg, "error");
        return;
      }

      if (!data.merchant) {
        setStatus("Ответ без данных мерчанта.", "error");
        return;
      }

      fillResult(data.merchant);
      setStatus("Мерчант успешно создан.", "success");
    } catch (err) {
      console.error("[register] error:", err);
      setStatus("Ошибка запроса: " + String(err), "error");
    } finally {
      btn.disabled = false;
    }
  });
})();
