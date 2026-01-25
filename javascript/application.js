const LEVELS_PER_ROW = 5;
const TURN_LENGTH = 0;
const CHARS_PER_LEVEL = 4;

let HSK = [];

async function loadHSK() {
  const [res1, res2] = await Promise.all([
    fetch("./data/hsk1.json"),
    fetch("./data/hsk2.json")
  ]);

  const hsk1 = await res1.json();
  const hsk2 = await res2.json();

  HSK = [...hsk1, ...hsk2];
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

function isLevelEmpty(level) {
  return getHanziPreviewForLevel(level).length === 0;
}

function renderPath() {
  const maxId = Math.max(...HSK.map(c => c.id));
  const totalLevels = Math.ceil(maxId / CHARS_PER_LEVEL);

  const visibleLevels = [];
  for (let lvl = 1; lvl <= totalLevels; lvl++) {
    if (!isLevelEmpty(lvl)) {
      visibleLevels.push(lvl);
    }
  }

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
      <button class="select-srs-size-btn" onclick="selectSrsSize(15)">15</button>
      <button class="select-srs-size-btn" onclick="selectSrsSize(25)">25</button>
      <button class="select-srs-size-btn" onclick="selectSrsSize(50)">50</button>
      <button class="srs-reset-ignored" onclick="resetIgnoredSrs()">Reset ignored</button>
    </div>


    <div class='path' id='path'></div>
  `;
  const path = document.getElementById("path");

  let index = 0;
  let direction = "forward";

  while (index < visibleLevels.length) {
    const rowLevels = visibleLevels.slice(
      index,
      index + LEVELS_PER_ROW
    );

    createRowFromLevels(path, direction, rowLevels);
    index += rowLevels.length;

    if (index >= visibleLevels.length) break;

    if (TURN_LENGTH > 0) {
      const turnLevels = visibleLevels.slice(index, index + TURN_LENGTH);
      createTurnFromLevels(path, direction, turnLevels);
      index += turnLevels.length;
    }

    direction = direction === "forward" ? "backward" : "forward";
  }
}

function resetIgnoredSrs() {
  const progress = getProgress();

  if (progress.ignoredFromSrs) {
    delete progress.ignoredFromSrs;
    saveProgress(progress);
  }
  document.getElementById("srs-size-menu").style.display = "none";

  location.hash = "#";
  window.location.reload();
}

function createRowFromLevels(container, direction, levels) {
  const row = document.createElement("div");
  row.className = "row";

  const orderedLevels =
    direction === "forward"
      ? levels
      : [...levels].reverse();

  const count = orderedLevels.length;

  orderedLevels.forEach((lvl, index) => {
    const cell = document.createElement("div");
    cell.className = "cell";

    const btn = document.createElement("button");

    const levelNum = document.createElement("div");
    levelNum.className = "level-number";
    levelNum.textContent = lvl;
    btn.appendChild(levelNum);

    if (isLevelCompleted(lvl)) {
      const hanzi = document.createElement("div");
      hanzi.className = "level-hanzi";
      hanzi.textContent = getHanziPreviewForLevel(lvl);
      btn.appendChild(hanzi);
    }

    // 🔹 zigzag offset (same logic, just array-based)
    if (direction !== "forward") {
      const step = 20;
      const offset =
        direction === "forward"
          ? index * step
          : (count - 1 - index) * step;

      btn.style.marginTop = `${offset}px`;
    }

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


function createRow(container, direction, start, end) {
  const row = document.createElement("div");
  row.className = "row";

  const levels =
    direction === "forward"
      ? range(start, end)
      : range(start, end).reverse();

  const count = levels.length;

  levels.forEach((lvl, index) => {
    const cell = document.createElement("div");
    cell.className = "cell";

    const btn = document.createElement("button");

    const levelNum = document.createElement("div");
    levelNum.className = "level-number";
    levelNum.textContent = lvl;
    btn.appendChild(levelNum);

    if (isLevelCompleted(lvl)) {
      const hanzi = document.createElement("div");
      hanzi.className = "level-hanzi";
      hanzi.textContent = getHanziPreviewForLevel(lvl);
      btn.appendChild(hanzi);
    }

    if (direction != "forward"){
      const step = 20;
      const offset =
        direction === "forward"
          ? index * step
          : (count - 1 - index) * step;

      btn.style.marginTop = `${offset}px`;
    }

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

    const levelNum = document.createElement("div");
    levelNum.className = "level-number";
    levelNum.textContent = lvl;

    const hanzi = document.createElement("div");
    hanzi.className = "level-hanzi";
    hanzi.textContent = getHanziPreviewForLevel(lvl);

    btn.appendChild(levelNum);
    btn.appendChild(hanzi);


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

function getHanziPreviewForLevel(level) {
  return getCharsForLevel(level)
    .filter(c => !isIgnoredFromSrs(c.hanzi))
    .map(c => c.hanzi)
    .join("");
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
          <button class="google-btn" onclick="googleHanzi('${c.hanzi}')">🌐</button>
        </div>

        <div class="section">Перевод: ${c.ru_translations.slice(0, 3).join(", ")}</div>
        <div class="section">Translation: ${c.translations.slice(0, 3).join(", ")}</div>

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

function googleHanzi(hanzi) {
  const query = encodeURIComponent(hanzi);
  const url = `https://www.google.com/search?tbm=isch&q=${query}`;

  const a = document.createElement("a");
  a.href = url;
  a.target = "_system";
  a.rel = "noopener";
  a.click();
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
          <button class="google-btn" onclick="googleHanzi('${c.hanzi}')">🌐</button>
        </div>

        <div class="section">Перевод: ${c.ru_translations.slice(0, 3).join(", ")}</div>
        <div class="section">Translation: ${c.translations.slice(0, 3).join(", ")}</div>

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
  if (Math.abs(diff) < 300) return;

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
let touchStartY = 0;
let touchStartTime = 0;

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
