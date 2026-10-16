/* ============================================================
   DeepSeek+ — клиент чата с нейросетью
   Работает в двух режимах:
   1) Live-режим — если пользователь ввёл свой ключ DeepSeek API,
      запросы идут на https://api.deepseek.com/chat/completions
   2) Демо-режим — ответы генерируются локально (имитация ИИ),
      чтобы сайт работал на GitHub Pages без бэкенда и без ключа.
   ============================================================ */

const $ = (id) => document.getElementById(id);

const els = {
    welcome: $("welcome-screen"),
    chat: $("chat-app"),
    startBtn: $("start-chat-btn"),
    apiKey: $("api-key"),
    sidebarApiKey: $("sidebar-api-key"),
    modelSelect: $("model-select"),
    saveSettings: $("save-settings"),
    menuBtn: $("menu-btn"),
    clearBtn: $("clear-btn"),
    messages: $("messages"),
    form: $("chat-form"),
    input: $("user-input"),
    sendBtn: $("send-btn"),
    suggestions: $("suggestions"),
    statusDot: $("status-dot"),
    modeLabel: $("mode-label"),
    sidebar: $("sidebar"),
};

// ---------- Состояние ----------
let history = []; // контекст разговора для API
let busy = false;

const settings = {
    get apiKey() { return localStorage.getItem("ds_api_key") || ""; },
    set apiKey(v) { localStorage.setItem("ds_api_key", v.trim()); },
    get model() { return localStorage.getItem("ds_model") || "deepseek-chat"; },
    set model(v) { localStorage.setItem("ds_model", v); },
};

// ---------- Инициализация ----------
function init() {
    if (settings.apiKey) {
        els.apiKey.value = settings.apiKey;
        els.sidebarApiKey.value = settings.apiKey;
    }
    els.modelSelect.value = settings.model;
    updateModeUI();

    els.startBtn.addEventListener("click", () => {
        const key = els.apiKey.value.trim();
        if (key) settings.apiKey = key;
        startChat();
    });
    els.form.addEventListener("submit", onSubmit);
    els.menuBtn.addEventListener("click", () => els.sidebar.classList.toggle("hidden"));
    els.clearBtn.addEventListener("click", clearChat);
    els.saveSettings.addEventListener("click", () => {
        settings.apiKey = els.sidebarApiKey.value.trim();
        settings.model = els.modelSelect.value;
        updateModeUI();
        els.sidebar.classList.add("hidden");
        addBotNote(settings.apiKey
            ? "✅ Настройки сохранены. DeepSeek API подключён."
            : "✅ Ключ удалён. Включён демо-режим.");
    });

    els.suggestions.querySelectorAll(".chip").forEach((chip) => {
        chip.addEventListener("click", () => {
            els.input.value = chip.textContent;
            els.form.requestSubmit();
        });
    });

    // Enter — отправить, Shift+Enter — перенос строки
    els.input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            els.form.requestSubmit();
        }
    });

    // Автоувеличение высоты поля ввода
    els.input.addEventListener("input", autosize);
}

function autosize() {
    els.input.style.height = "auto";
    els.input.style.height = Math.min(els.input.scrollHeight, 140) + "px";
}

function startChat() {
    els.welcome.classList.add("hidden");
    els.chat.classList.remove("hidden");
    els.input.focus();
    updateModeUI();
}

function updateModeUI() {
    const live = !!settings.apiKey;
    els.statusDot.className = "status-dot " + (live ? "live" : "demo");
    els.modeLabel.textContent = live ? "DeepSeek API" : "Демо-режим";
}

// ---------- Отправка сообщения ----------
async function onSubmit(e) {
    e.preventDefault();
    const text = els.input.value.trim();
    if (!text || busy) return;

    addUserMessage(text);
    els.input.value = "";
    autosize();
    els.suggestions.classList.add("hidden");

    busy = true;
    els.sendBtn.disabled = true;
    const typingEl = showTyping();

    try {
        let reply;
        if (settings.apiKey) {
            reply = await askDeepSeek(text);
        } else {
            reply = demoAnswer(text);
            await sleep(700 + Math.random() * 900); // имитация «раздумий»
        }
        typingEl.remove();
        addBotMessage(reply);
        history.push({ role: "assistant", content: reply });
        if (history.length > 20) history = history.slice(-20);
    } catch (err) {
        typingEl.remove();
        addBotNote("⚠️ Ошибка: " + err.message + "\nПроверьте API-ключ в настройках (☰).");
    } finally {
        busy = false;
        els.sendBtn.disabled = false;
        els.input.focus();
    }
}

// ---------- Запрос к DeepSeek API ----------
async function askDeepSeek(userText) {
    history.push({ role: "user", content: userText });
    const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + settings.apiKey,
        },
        body: JSON.stringify({
            model: settings.model,
            messages: [
                { role: "system", content: "Ты — DeepSeek+, дружелюбный и умный ассистент. Отвечай кратко и по делу. Язык ответа — как у вопроса." },
                ...history,
            ],
            stream: false,
        }),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}. ${body.slice(0, 160)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "Пустой ответ от модели.";
}

// ---------- Демо-движок (локальная имитация нейросети) ----------
function demoAnswer(qRaw) {
    const q = qRaw.toLowerCase();
    const has = (...words) => words.some((w) => q.includes(w));

    if (has("привет", "здравств", "хай", "добрый день", "доброе утро", "добрый вечер"))
        return "Привет! 👋 Я DeepSeek+ в демо-режиме. Чем могу помочь? Могу написать код, объяснить тему или поболтать.";

    if (has("как дела", "как ты"))
        return "У меня всё отлично — нейроны активны, токены текут! 🚀 А у вас как? Чем помочь?";

    if (has("кто ты", "что ты умеешь", "что ты можешь", "о себе"))
        return "Я — DeepSeek+, демонстрационный чат с нейросетью на GitHub Pages.\n\nМои возможности:\n• отвечать на вопросы\n• писать код (Python, JS и др.)\n• объяснять сложные темы просто\n• переводить и редактировать текст\n\nПодключите настоящий DeepSeek API-ключ в настройках (☰), и я стану по-настоящему умным 🧠";

    if (has("python", "питон") && has("функци", "напиши", "код", "создай"))
        return "Вот пример функции на Python:\n\n```\ndef fibonacci(n):\n    \"\"\"Возвращает список первых n чисел Фибоначчи.\"\"\"\n    a, b, seq = 0, 1, []\n    for _ in range(n):\n        seq.append(a)\n        a, b = b, a + b\n    return seq\n\nprint(fibonacci(10))\n# [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]\n```\n\nНужно что-то посложнее? Уточните задачу!";

    if (has("javascript", "js") && has("напиши", "код", "функци"))
        return "Держите пример на JavaScript:\n\n```\nconst debounce = (fn, delay = 300) => {\n  let timer;\n  return (...args) => {\n    clearTimeout(timer);\n    timer = setTimeout(() => fn(...args), delay);\n  };\n};\n```\n\nЭта функция откладывает вызов — полезно для поиска при вводе. Хотите другой пример?";

    if (has("код"))
        return "Напишите, какой именно код нужен: язык (Python / JavaScript / C++...) и задачу — и я покажу пример! 💻\n\n(В демо-режиме мои способности ограничены, с API-ключом я напишу любой код.)";

    if (has("квант"))
        return "Коротко о квантовых компьютерах ⚛️:\n\n• Обычный бит — это 0 или 1. Кубит может быть в суперпозиции — одновременно и 0, и 1.\n• Благодаря этому квантовый компьютер перебирает варианты «параллельно» и решает некоторые задачи экспоненциально быстрее.\n• Применяют их для моделирования молекул, криптографии и оптимизации.\n• Пока такие компьютеры малы и требуют охлаждения почти до абсолютного нуля.\n\nХотите углубиться в какую-то часть?";

    if (has("шутк", "анекдот", "смешн", "пошути")) {
        const jokes = [
            "Программист ставит на ночь два стакана воды: один — на случай, если захочет пить, второй — на случай, если не захочет. 😄",
            "— Сколько программистов нужно, чтобы вкрутить лампочку?\n— Ни одного. Это аппаратная проблема. 💡",
            "Заходит как-то байт в бар. Бармен: «Что будете?» Байт: «А есть ли у вас киловатт-часы?» 🍺",
            "Жена программисту: «Сходи в магазин, купи батон хлеба. Если будут яйца — возьми десяток». Программист вернулся с десятью батонами: «Яйца были». 🥖",
        ];
        return jokes[Math.floor(Math.random() * jokes.length)];
    }

    if (has("план", "путешеств", "отпуск", "поездк"))
        return "Вот универсальный план путешествия на 5 дней 🌍:\n\n1. День — прибытие, прогулка по центру, локальная кухня.\n2. День — главные достопримечательности (заранее купите билеты онлайн).\n3. День — музеи/галереи + старый квартал.\n4. День — выезд на природу или соседний город.\n5. День — шопинг, сувениры и спокойный отъезд.\n\nСовет: бронируйте жильё рядом с транспортом. Куда собираетесь? Составлю детальный маршрут!";

    if (has("перевед", "translate"))
        return "В демо-режиме переводчик работает ограниченно 🙂 Подключите DeepSeek API-ключ в настройках (☰) — и я буду переводить между десятками языков быстро и качественно.";

    if (has("спасибо", "благодар"))
        return "Всегда пожалуйста! 😊 Обращайтесь ещё — я только рад помочь.";

    if (has("пока", "до свидания"))
        return "До встречи! 👋 Был рад общению. Вернитесь — расскажу что-нибудь интересное.";

    if (q.endsWith("?"))
        return `Хороший вопрос: «${qRaw}»\n\nВ демо-режиме я отвечаю по заготовкам, поэтому могу быть неточен. Подключите бесплатный DeepSeek API-ключ (platform.deepseek.com) в настройках ☰ — и я отвечу развернуто и по существу.`;

    return `Интересно! Вы сказали: «${qRaw}».\n\nЯ сейчас работаю в демо-режиме на статическом GitHub Pages. Чтобы включить настоящую нейросеть, добавьте DeepSeek API-ключ в настройках (кнопка ☰ слева сверху). А пока могу: написать код, рассказать про квантовые компьютеры, пошутить или составить план путешествия 😉`;
}

// ---------- Рендер сообщений ----------
function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Простой markdown: ```блоки кода``` и **жирный**
function renderMarkdown(text) {
    let html = escapeHtml(text);
    html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre>${code.trim()}</pre>`);
    html = html.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    return html;
}

function addUserMessage(text) {
    const div = document.createElement("div");
    div.className = "msg user";
    div.innerHTML = `<div class="avatar">🙂</div><div class="bubble">${renderMarkdown(text)}</div>`;
    els.messages.appendChild(div);
    scrollToBottom();
    history.push({ role: "user", content: text });
}

function addBotMessage(text) {
    const div = document.createElement("div");
    div.className = "msg bot";
    div.innerHTML = `<div class="avatar">🧠</div><div class="bubble">${renderMarkdown(text)}</div>`;
    els.messages.appendChild(div);
    scrollToBottom();
}

function addBotNote(text) {
    addBotMessage(text);
    history.push({ role: "assistant", content: text });
}

function showTyping() {
    const div = document.createElement("div");
    div.className = "msg bot";
    div.innerHTML = `<div class="avatar">🧠</div><div class="bubble typing"><span></span><span></span><span></span></div>`;
    els.messages.appendChild(div);
    scrollToBottom();
    return div;
}

function clearChat() {
    if (!confirm("Очистить всю историю чата?")) return;
    history = [];
    els.messages.innerHTML = "";
    els.suggestions.classList.remove("hidden");
    addBotNote("Чат очищен. Чем помочь? 🧹");
}

function scrollToBottom() {
    els.messages.scrollTop = els.messages.scrollHeight;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

init();
