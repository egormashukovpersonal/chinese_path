const LEVELS_PER_ROW = 5;
const TURN_LENGTH = 1;
const CHARS_PER_LEVEL = 3;

let HSK = [];

async function loadHSK() {
  const res = await fetch("./data/hsk1.json");
  HSK = await res.json();
}


const app = document.getElementById("app");

function router() {
  const hash = location.hash;
  const srsBtn = document.getElementById("srs-btn");

  if (!hash || hash === "#") {
    renderPath();
    if (srsBtn) {
      srsBtn.style.display = "block";
    }
    return;
  }

  if (hash === "#/srs") {
    renderSrs();
    return;
  }

  const levelMatch = hash.match(/^#\/level\/(\d+)(?:\/(\d+))?/);

  if (levelMatch) {
    const level = parseInt(levelMatch[1], 10);
    const index = parseInt(levelMatch[2] || "0", 10);
    renderLevel(level, index);
    if (srsBtn) srsBtn.style.display = "none";
    return;
  }
}

window.addEventListener("hashchange", router);

function getProgress() {
  return JSON.parse(localStorage.getItem("progress") || "{}");
}

function saveProgress(progress) {
  localStorage.setItem("progress", JSON.stringify(progress));
}

function markLevelCompleted(level) {
  const progress = getProgress();
  progress.completedLevels ||= {};
  progress.completedLevels[level] = true;
  saveProgress(progress);
}

function isLevelCompleted(level) {
  const progress = getProgress();
  return !!progress.completedLevels?.[level];
}

function toggleRestore() {
  const panel = document.getElementById("restore-panel");
  panel.style.display =
    panel.style.display === "none" ? "block" : "none";
}

function restoreFromInput() {
  const level = parseInt(
    document.getElementById("restore-level").value,
    10
  );

  if (!level || level < 1) return;

  restoreProgressToLevel(level);
}

function restoreProgressToLevel(level) {
  const progress = {
    completedLevels: {},
    srsHistory: {},
    ignoredFromSrs: {},
    settings: {}
  };

  for (let i = 1; i < level; i++) {
    progress.completedLevels[i] = true;
  }

  saveProgress(progress);
  location.hash = "#";
  window.location.reload();
}

function getSrsLimit() {
  const progress = getProgress();
  return progress.settings?.srsLimit || 10;
}

function setSrsLimit(value) {
  const progress = getProgress();
  progress.settings ||= {};
  progress.settings.srsLimit = value;
  saveProgress(progress);
}
function toggleSrsSize() {
  const menu = document.getElementById("srs-size-menu");
  menu.style.display =
    menu.style.display === "none" ? "block" : "none";
}
function selectSrsSize(value) {
  setSrsLimit(value);

  document.getElementById("srs-size-btn").textContent =
    `SRS: ${value}`;

  document.getElementById("srs-size-menu").style.display = "none";
}

function renderPath() {
  const maxId = Math.max(...HSK.map(c => c.id));
  const totalLevels = Math.ceil(maxId / CHARS_PER_LEVEL);

  app.innerHTML = `
    <div class="fixed-bottom">
      <button id='srs-btn' onclick='startSrsSession()'>SRS</button>
      <button class="stats-toggle" onclick="toggleSrsCalendar()">📊</button>
      <button class="dev-toggle" onclick="toggleRestore()">⚙️</button>
      <button class="srs-size-btn" onclick="toggleSrsSize()" id="srs-size-btn">SRS: ${getSrsLimit()}</button>
    </div>

    <div id="srs-calendar" style="display:none"></div>

    <div id="restore-panel" style="display:none">
      <input
        type="number"
        id="restore-level"
        placeholder="Start from level"
        min="1"
      />
      <button class="restore-rom-input-btn" onclick="restoreFromInput()">Save</button>
    </div>

    <div id="srs-size-menu" class="srs-size-menu" style="display:none">
      <button class="select-srs-size-btn" onclick="selectSrsSize(5)">5</button>
      <button class="select-srs-size-btn" onclick="selectSrsSize(10)">10</button>
      <button class="select-srs-size-btn" onclick="selectSrsSize(25)">25</button>
      <button class="select-srs-size-btn" onclick="selectSrsSize(50)">50</button>
    </div>


    <div class='path' id='path'></div>
  `;
  const path = document.getElementById("path");

  let level = 1;
  let direction = "forward";

  while (level <= totalLevels) {
    const rowStart = level;
    const rowEnd = Math.min(level + LEVELS_PER_ROW - 1, totalLevels);

    createRow(path, direction, rowStart, rowEnd);
    level = rowEnd + 1;

    if (level > totalLevels) break;

    createTurn(path, direction, level);
    level += TURN_LENGTH;

    direction = direction === "forward" ? "backward" : "forward";
  }
}

function createRow(container, direction, start, end) {
  const row = document.createElement("div");
  row.className = "row";

  const levels =
    direction === "forward"
      ? range(start, end)
      : range(start, end).reverse();

  levels.forEach(lvl => {
    const cell = document.createElement("div");
    cell.className = "cell";

    const btn = document.createElement("button");
    btn.textContent = lvl;
    if (isLevelCompleted(lvl)) {
      btn.classList.add("completed");
    }

    const nextAvailable = getNextAvailableLevel();

    if (lvl > nextAvailable) {
      btn.classList.add("locked");
      btn.disabled = true;
    } else {
      btn.onclick = () => {
        location.hash = `/level/${lvl}`;
        window.location.reload();
      };
    }

    cell.appendChild(btn);
    row.appendChild(cell);
  });

  container.appendChild(row);
}

function getNextAvailableLevel() {
  const progress = getProgress();
  const completed = Object.keys(progress.completedLevels || {})
    .map(Number);

  if (completed.length === 0) return 1;

  return Math.max(...completed) + 1;
}

function getAllLearnedChars() {
  const progress = getProgress();
  const completedLevels = Object.keys(progress.completedLevels || {}).map(Number);

  const chars = [];
  completedLevels.forEach(level => {
    chars.push(...getCharsForLevel(level));
  });

  return chars.filter(c => !isIgnoredFromSrs(c.hanzi));
}


function shuffle(array) {
  return array.sort(() => Math.random() - 0.5);
}
function startSrsSession() {
  const limit = getSrsLimit();
  const all = shuffle(getAllLearnedChars());
  const session = all.slice(0, limit);

  localStorage.setItem("srsSession", JSON.stringify({
    chars: session,
    index: 0
  }));

  location.hash = "#/srs";
}
function createTurn(container, direction, startLevel) {
  for (let i = 0; i < TURN_LENGTH; i++) {
    const lvl = startLevel + i;

    const row = document.createElement("div");
    row.className = "row turn";

    const cell = document.createElement("div");
    cell.className = "cell";

    const btn = document.createElement("button");
    btn.className = "secondary";
    btn.textContent = lvl;
    if (isLevelCompleted(lvl)) {
      btn.classList.add("completed");
    }
    const nextAvailable = getNextAvailableLevel();

    if (lvl > nextAvailable) {
      btn.classList.add("locked");
      btn.disabled = true;
    } else {
      btn.onclick = () => {
        location.hash = `/level/${lvl}`;
        window.location.reload();
      };
    }

    cell.appendChild(btn);
    row.appendChild(cell);

    row.style.justifyContent =
      direction === "forward" ? "flex-end" : "flex-start";

    container.appendChild(row);
  }
}

function range(a, b) {
  const res = [];
  for (let i = a; i <= b; i++) res.push(i);
  return res;
}

function getCharsForLevel(level) {
  const startId = (level - 1) * CHARS_PER_LEVEL + 1;
  const endId = startId + CHARS_PER_LEVEL - 1;
  return HSK.filter(c => c.id >= startId && c.id <= endId);
}

function goBack(level, index) {
  if (index > 0) {
    location.hash = `#/level/${level}/${index - 1}`;
  } else {
    location.hash = "#";
  }
}

function finishLevel(level) {
  markLevelCompleted(level);
  location.hash = "#";
  window.location.reload();
}

function renderLevel(level, index = 0) {
  const chars = getCharsForLevel(level);
  const c = chars[index];

  const isLast = index >= chars.length - 1;

  app.innerHTML = `
    <div class="fixed-bottom">
      <button class="back-btn" onclick="goBack(${level}, ${index})">←</button>
      ${
        !isLast
          ? `<button class="next-btn" onclick="location.hash='#/level/${level}/${index + 1}'">→</button>`
          : `<button class="next-btn" onclick="finishLevel(${level})">✓</button>`
      }
      <button class="speak-btn" onclick="speak2('${c.hanzi}')">🔊</button>
    </div>

    <h1>Level ${level}</h1>

    <div class="char-card">
      <div class="progress">${index + 1} / ${chars.length}</div>
      <div class="hanzi">${c.hanzi}</div>
      <button id="toggle-meaning" class="secondary-btn">Open</button>
      <div id="meaning" style="display:none">
        <div class="pinyin-row">
          <span class="pinyin">${c.pinyin}</span>
        </div>

        <div class="section">Перевод: ${c.ru_translations.join(", ")}</div>
        <div class="section">Translation: ${c.translations.join(", ")}</div>

        <h1>Deepseek</h1>
        <p class="section">${c.deepseek_description_paragraph_1 || ""}</p>
        <p class="section">${c.deepseek_description_paragraph_2 || ""}</p>
        <p class="section">${c.deepseek_description_paragraph_3 || ""}</p>
        <p class="section">${c.deepseek_description_paragraph_4 || ""}</p>

        <h1>ChatGPT</h1>
        <p class="section">${c.chatgpt_description_paragraph_1 || ""}</p>
        <p class="section">${c.chatgpt_description_paragraph_2 || ""}</p>
        <p class="section">${c.chatgpt_description_paragraph_3 || ""}</p>
        <p class="section">${c.chatgpt_description_paragraph_4 || ""}</p>
      </div>
    </div>
  `;

  const toggleBtn = document.getElementById("toggle-meaning");
  toggleBtn.onclick = () => {
    toggleBtn.style.display = 'none'
    document.getElementById("meaning").style.display = "block";
  };
}

function ignoreCurrentSrsChar() {
  const session = JSON.parse(localStorage.getItem("srsSession"));
  if (!session) return;

  const c = session.chars[session.index];

  ignoreCharFromSrs(c.hanzi);

  // сразу убираем из текущей сессии
  session.chars.splice(session.index, 1);

  if (session.index >= session.chars.length) {
    finishSrsSession();
  } else {
    localStorage.setItem("srsSession", JSON.stringify(session));
    renderSrs();
  }
}


function renderSrs() {
  const session = JSON.parse(localStorage.getItem("srsSession"));
  if (!session) {
    app.innerHTML = "<p>No SRS session</p>";
    return;
  }

  const { chars, index } = session;
  const c = chars[index];

  if (!c) {
    return;
  }
  const isLast = index >= chars.length - 1;

  app.innerHTML = `
    <div class="fixed-bottom">
      <button class="back-btn" onclick="location.hash = '#';">←</button>
      <button class="ignore-btn" onclick="ignoreCurrentSrsChar()">
        -
      </button>
      <button class="next-srs-btn"  onclick="nextSrs()">
        ${isLast ? "✓" : "→"}
      </button>
      <button class="speak-btn" onclick="speak2('${c.hanzi}')">🔊</button>
    </div>

    <h1>SRS</h1>

    <div class="char-card">
      <div class="progress">${index + 1} / ${chars.length}</div>
      <div class="hanzi">${c.hanzi}</div>
      <button id="toggle-meaning" class="secondary-btn">Open</button>
      <div id="meaning" style="display:none">
        <div class="pinyin-row">
          <span class="pinyin">${c.pinyin}</span>
        </div>

        <div class="section">Перевод: ${c.ru_translations.join(", ")}</div>
        <div class="section">Translation: ${c.translations.join(", ")}</div>

        <h1>Deepseek</h1>
        <p class="section">${c.deepseek_description_paragraph_1 || ""}</p>
        <p class="section">${c.deepseek_description_paragraph_2 || ""}</p>
        <p class="section">${c.deepseek_description_paragraph_3 || ""}</p>
        <p class="section">${c.deepseek_description_paragraph_4 || ""}</p>
      </div>
    </div>
  `;

  const toggleBtn = document.getElementById("toggle-meaning");
  toggleBtn.onclick = () => {
    toggleBtn.style.display = 'none'
    document.getElementById("meaning").style.display = "block";

  };
}

function nextSrs() {
  const session = JSON.parse(localStorage.getItem("srsSession"));
  markSrsSeen();
  session.index++;

  if (session.index >= session.chars.length) {
    finishSrsSession();
  } else {
    localStorage.setItem("srsSession", JSON.stringify(session));
    renderSrs();
  }
}
function markSrsSeen() {
  const today = new Date().toISOString().slice(0, 10);
  const progress = getProgress();

  progress.srsHistory ||= {};
  progress.srsHistory[today] ||= 0;
  progress.srsHistory[today]++;

  saveProgress(progress);
}

function finishSrsSession() {
  localStorage.removeItem("srsSession");
  location.hash = "#";
  window.location.reload();
}

function toggleSrsCalendar() {
  const el = document.getElementById("srs-calendar");
  if (!el.innerHTML) {
    el.innerHTML = renderSrsMonth();
  }
  el.style.display = el.style.display === "none" ? "block" : "none";
}

function renderSrsMonth() {
  const history = getProgress().srsHistory || {};
  const now = new Date();

  const year = now.getFullYear();
  const month = now.getMonth(); // текущий

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay() || 7;

  let html = `<div class="calendar-grid">`;

  // пустые ячейки перед началом месяца
  for (let i = 1; i < firstDay; i++) {
    html += `<div class="day empty"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const count = history[date] || 0;

    html += `
      <div class="day" title="${date}: ${count}">${count}
      </div>
    `;
  }

  html += `</div>`;
  return html;
}
function ignoreCharFromSrs(hanzi) {
  const progress = getProgress();
  progress.ignoredFromSrs ||= {};
  progress.ignoredFromSrs[hanzi] = true;
  saveProgress(progress);
}

function isIgnoredFromSrs(hanzi) {
  const progress = getProgress();
  return !!progress.ignoredFromSrs?.[hanzi];
}
function handleSwipe() {
  const diff = touchEndX - touchStartX;
  if (Math.abs(diff) < 50) return;

  const hash = location.hash;

  // ---------- LEVEL ----------
  if (hash.startsWith("#/level/")) {
    const match = hash.match(/^#\/level\/(\d+)(?:\/(\d+))?/);
    if (!match) return;

    const level = parseInt(match[1], 10);
    const index = parseInt(match[2] || "0", 10);
    const charsCount = getCharsForLevel(level).length;

    // swipe left → next char / finish level
    if (diff < 0) {
      if (index < charsCount - 1) {
        location.hash = `#/level/${level}/${index + 1}`;
      } else {
        finishLevel(level);
      }
    }

    // swipe right → prev char / back to main
    if (diff > 0) {
      if (index > 0) {
        location.hash = `#/level/${level}/${index - 1}`;
      } else {
        location.hash = "#";
      }
    }
    return;
  }

  // ---------- SRS ----------
  if (hash === "#/srs") {
    // swipe left → next SRS card
    if (diff < 0) {
      nextSrs();
    }

    // swipe right → exit SRS
    if (diff > 0) {
      location.hash = "#";
      window.location.reload();
    }

    return;
  }
}

let touchStartX = 0;
let touchEndX = 0;

document.addEventListener("touchstart", e => {
  touchStartX = e.changedTouches[0].screenX;
});

document.addEventListener("touchend", e => {
  touchEndX = e.changedTouches[0].screenX;
  handleSwipe();
});


(async function init() {
  await loadHSK();
  router();
})();
