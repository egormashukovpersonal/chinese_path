const LEVELS_PER_ROW = 6;
const TURN_LENGTH = 0;
const CHARS_PER_LEVEL = 1;
const CUSTOM_HANZI_START_ID = 100000;
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";

(function initPreviewSettings() {
  if (localStorage.getItem("usePinyin") === null) {
    localStorage.setItem("usePinyin", "false");
  }
})();

(function initTranslationSettings() {
  if (localStorage.getItem("useTranslationPreview") === null) {
    localStorage.setItem("useTranslationPreview", "false");
  }
})();

(function initToneColorSettings() {
  if (localStorage.getItem("useToneColors") === null) {
    localStorage.setItem("useToneColors", "true");
  }
})();

let HSK = [];

async function loadHSK() {
  const [res1, res2] = await Promise.all([
    fetch("./data/hsk1.json"),
    fetch("./data/hsk2.json")
  ]);

  const hsk1 = (await res1.json()).map(x => ({
    ...x,
    hsk: 1
  }));

  const hsk2 = (await res2.json()).map(x => ({
    ...x,
    hsk: 2
  }));

  HSK = [...hsk1, ...hsk2];
}


let PHONETICS_DB = [];
async function loadPhoneticsDb() {
  const res = await fetch("./data/db_phonetics.json");
  PHONETICS_DB = await res.json();
}

let COMPONENTS_DB2 = [];
async function loadComponentsDb() {
  const res = await fetch("./data/db_components.json");
  COMPONENTS_DB2 = await res.json();
}

let PINYIN_DB = {};
async function loadPinyinDb() {
  const res = await fetch("./data/db_pinyin.json");
  PINYIN_DB = await res.json();
}

function getCharPinyin(char) {
  const list = PINYIN_DB[char];

  if (!list || !list.length) {
    return "";
  }

  return list[0];
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

  const customMatch = hash.match(/^#\/custom(?:\/(\d+))?/);

  if (customMatch) {
    const index = parseInt(customMatch[1] || "0", 10);
    renderCustomChar(index);
    if (srsBtn) srsBtn.style.display = "none";
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


function getCustomChars() {
  return JSON.parse(localStorage.getItem("customHanzi") || "[]");
}

function saveCustomChars(chars) {
  localStorage.setItem("customHanzi", JSON.stringify(chars));
  HOMOPHONES_INDEX = null;
}

function getDeepSeekApiKey() {
  return localStorage.getItem("deepseekApiKey") || "sk-1edcd5ee53634b62b5510ca98fc6ee79";
}

function setDeepSeekApiKey(value) {
  localStorage.setItem("deepseekApiKey", value.trim());
}

function nextCustomHanziId() {
  const ids = getCustomChars().map(c => Number(c.id)).filter(Number.isFinite);
  return Math.max(CUSTOM_HANZI_START_ID - 1, ...ids) + 1;
}

function getGeneratedStory() {
  return JSON.parse(
    localStorage.getItem("generatedStory") || "null"
  );
}
function buildStoryPrompt() {
  return `
Generate a coherent Chinese story for HSK1-3 learners.

STRICT JSON ONLY.

Format:

{
  "title": "...",
  "sentences": [
    {
      "hanzi": "...", // in simplified
      "hanzi_traditional": "...", // same as hanzi only in traditional
      "pinying": "...",
      "polish_translation": "..."
    }
  ]
}

Rules:
- 10-20 connected sentences
- very natural
- not complex grammar
- mostly HSK1-3 vocabulary
- story should be coherent and interesting
- short sentences
- no markdown
- no explanations
- all pinyin must contain tone marks
`;
}
function saveGeneratedStory(story) {
  localStorage.setItem(
    "generatedStory",
    JSON.stringify(story)
  );
}
function normalizeGeneratedCustomChar(hanzi, result) {
  const translations = Array.isArray(result.translations) ? result.translations : [];
  const ruTranslations = Array.isArray(result.ru_translations) ? result.ru_translations : [];
  const plTranslations = Array.isArray(result.pl_translations) ? result.pl_translations : [];

  return {
    id: nextCustomHanziId(),
    custom: true,
    hanzi,
    hanzi_traditional: result.hanzi_traditional || hanzi,
    hsk: Number(result.hsk) || null,
    pinyin: result.pinyin || "",
    translations,
    ru_translations: ruTranslations,
    pl_translations: plTranslations,
    deepseek_description_paragraph_1: result.deepseek_description_paragraph_1 || "",
    deepseek_description_paragraph_2: result.deepseek_description_paragraph_2 || "",
    deepseek_description_paragraph_3: result.deepseek_description_paragraph_3 || "",
    deepseek_description_paragraph_4: result.deepseek_description_paragraph_4 || "",
    deepseek_description_pl_paragraph_1: result.deepseek_description_pl_paragraph_1 || "",
    deepseek_description_pl_paragraph_2: result.deepseek_description_pl_paragraph_2 || "",
    deepseek_description_pl_paragraph_3: result.deepseek_description_pl_paragraph_3 || "",
    deepseek_description_pl_paragraph_4: result.deepseek_description_pl_paragraph_4 || "",
    example_hanzi: result.example_hanzi || hanzi,
    example_hanzi_traditional: result.example_hanzi_traditional || result.example_hanzi || hanzi,
    example_pinying: result.example_pinying || result.example_pinyin || result.pinyin || "",
    example_ru: result.example_ru || "",
    example_pl: result.example_pl || "",
  };
}
async function generateStory() {
  const apiKey = getDeepSeekApiKey();

  if (!apiKey) {
    alert("Add DeepSeek API key first");
    return;
  }

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          {
            role: "user",
            content: buildStoryPrompt()
          }
        ],
        temperature: 1
      })
    });

    const payload = await response.json();

    let content =
      payload?.choices?.[0]?.message?.content || "{}";

    content = content
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    const result = JSON.parse(content);

    // replaces previous story
    saveGeneratedStory(result);

    document.getElementById("generated-list").innerHTML =
      renderGeneratedList();

  } catch (e) {
    console.error(e);
    alert(e.message);
  }
}
function buildCustomHanziPrompt(hanzi) {
  return `Ты помогаешь мне создать персональную систему изучения китайских иероглифов.

Для иероглифа: ${hanzi}

В ответе сгенерируй СТРОГО JSON со следующими ключами:

hanzi:
- сам знак

hanzi_traditional:
- тот же знак но в traditional форме

pinyin:
- пиньинь с тонами

translations:
- массив из 1–3 кратких переводов на английском

ru_translations:
- массив из 1–2 кратких переводов на русском
- если возможно — один перевод
- не дублируй синонимы

pl_translations:
- массив из 1–2 кратких переводов по польски
- если возможно — один перевод
- не дублируй синонимы

deepseek_description_pl_paragraph_1:
- общее понятное объяснение иероглифа ПО ПОЛЬСКИ

deepseek_description_pl_paragraph_2:
- внимательный разбор структуры иероглифа ПО ПОЛЬСКИ

deepseek_description_pl_paragraph_3:
- как и где иероглиф обычно используется ПО ПОЛЬСКИ

deepseek_description_pl_paragraph_4:
- краткий культурный или исторический аспект ПО ПОЛЬСКИ, только если уместно

example_hanzi:
- короткий пример предложения с этим иероглифом в simplified

example_hanzi_traditional:
- тот же пример что и в example_hanzi но в традиционной форме

example_pinying:
- пиньинь примера

example_ru:
- русский перевод примера

example_pl:
- польский перевод примера

hsk:
- цифра старого HSK уровня, на котором обычно появляется этот иероглиф (1-6), или null, если не определено

Ограничения:
- каждый параграф — 2–4 предложения
- когда пишешь иероглиф, всегда рядом добавляй пиньинь
- никакого текста вне JSON
- без Markdown
- без вступлений`;
}

async function addCustomHanziFromInput() {
  const hanziInput = document.getElementById("custom-hanzi-input");
  const apiKeyInput = document.getElementById("deepseek-api-key-input");
  const status = document.getElementById("custom-hanzi-status");

  const hanzi = (hanziInput?.value || "").trim();
  const apiKey = (apiKeyInput?.value || getDeepSeekApiKey()).trim();

  if (!hanzi) return;
  if (!apiKey) {
    status.textContent = "Add DeepSeek API key first";
    return;
  }

  setDeepSeekApiKey(apiKey);

  const existing = getCustomChars().find(c => c.hanzi === hanzi); // || HSK.find(c => c.hanzi === hanzi);
  if (existing) {
    status.textContent = "Already exists";
    return;
  }

  status.textContent = "Generating...";

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: "user", content: buildCustomHanziPrompt(hanzi) }
        ],
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`DeepSeek error ${response.status}`);
    }

    const payload = await response.json();
    let content = payload?.choices?.[0]?.message?.content || "{}";
    content = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();

    const result = JSON.parse(content);
    const newChar = normalizeGeneratedCustomChar(hanzi, result);
    const chars = getCustomChars();
    chars.push(newChar);
    saveCustomChars(chars);

    hanziInput.value = "";
    status.textContent = "Saved";
    location.hash = "#";
    window.location.reload();
  } catch (e) {
    console.error(e);
    status.textContent = `Error: ${e.message}`;
  }
}

function deleteCustomHanzi(hanzi) {
  const chars = getCustomChars().filter(c => c.hanzi !== hanzi);
  saveCustomChars(chars);

  const progress = getProgress();
  if (progress.ignoredFromSrs) {
    delete progress.ignoredFromSrs[hanzi];
    saveProgress(progress);
  }

  removeCharFromCurrentSrsSession(hanzi);
}
function isCustomHanzi(hanzi) {
  return getCustomChars().some(c => c.hanzi === hanzi);
}
function removeCharFromUiAndSrs(hanzi, options = {}) {
  if (isCustomHanzi(hanzi)) {
    deleteCustomHanzi(hanzi);
  } else {
    ignoreCharFromSrs(hanzi);
    removeCharFromCurrentSrsSession(hanzi);
  }

  HOMOPHONES_INDEX = null;

  // if (options.mode === "custom") {
  //   renderCustomChar(options.index || 0);
  //   return;
  // }

  // if (options.mode === "level") {
  //   renderLevel(options.level, options.index);
  //   return;
  // }

  if (options.mode === "srs") {
    renderSrs();
    return;
  }

  location.hash = "#";
  window.location.reload();
}

function removeCharFromCurrentSrsSession(hanzi) {
  const session = JSON.parse(localStorage.getItem("srsSession") || "null");
  if (!session) return;

  session.chars = session.chars.filter(c => c.hanzi !== hanzi);

  if (session.index >= session.chars.length) {
    session.index = Math.max(0, session.chars.length - 1);
  }

  localStorage.setItem("srsSession", JSON.stringify(session));
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

function toggleDevMenu() {
  const panel =
    document.getElementById("restore-panel");

  const opening =
    panel.style.display === "none";

  closeAllPanels();

  if (!opening) {
    return;
  }

  panel.style.display = "block";

  const path = document.getElementById("path");
  const customs =
    document.getElementById("custom-hanzi-list");

  if (path) {
    path.style.display = "none";
  }

  if (customs) {
    customs.style.display = "none";
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
  updateActiveBottomButtons();
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
  const progress = getProgress();
  progress.completedLevels ||= {};

  for (let i = 1; i < level; i++) {
    progress.completedLevels[i] = true;
  }

  saveProgress(progress);
  location.hash = "#";
  window.location.reload();
}

function getHumanSrsLimit() {
  const limit = getSrsLimit();
  return limit == 9999999 ? 'All' : limit;
}

function getSrsLimit() {
  const progress = getProgress();
  return progress.settings?.srsLimit || 9999999;
}

function setSrsLimit(value) {
  const progress = getProgress();
  progress.settings ||= {};
  progress.settings.srsLimit = value == 'All' ? 9999999 : value;
  saveProgress(progress);
}
function toggleSrsSize() {
  const menu = document.getElementById("srs-size-menu");
  menu.style.display =
    menu.style.display === "none" ? "block" : "none";
}
function selectSrsSize(value) {
  setSrsLimit(value);

  document.getElementById("srs-size-btn").textContent = `${value}`;

  document.getElementById("srs-size-menu").style.display = "none";
}

function isLevelEmpty(level) {
  return getHanziPreviewForLevel(level).length === 0;
}
function closeAllPanels() {
  [
    "homo-list",
    "examples-list",
    "generated-list",
    "components-list",
    "phonetics-list",
    "notebook-list",
    "restore-panel"
  ].forEach(id => {
    const el = document.getElementById(id);

    if (el) {
      el.style.display = "none";
    }
  });

  const path = document.getElementById("path");
  const customs = document.getElementById("custom-hanzi-list");

  if (path) path.style.display = "block";
  if (customs) customs.style.display = "block";
}
function goHome() {
  closeAllPanels();

  const path = document.getElementById("path");
  const customs = document.getElementById("custom-hanzi-list");

  if (path) {
    path.style.display = "block";
  }

  if (customs) {
    customs.style.display = "block";
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
  updateActiveBottomButtons();
}
function renderPath() {
  const maxId = Math.max(...HSK.map(c => c.id));
  const totalLevels = Math.ceil(maxId / CHARS_PER_LEVEL);

  const visibleLevels = [];
  const nextAvailable = getNextAvailableLevel();
  const maxVisibleLevel = nextAvailable + 60;

  for (let lvl = 1; lvl <= totalLevels; lvl++) {
    if (lvl > maxVisibleLevel) {
      break;
    }

    if (!isLevelEmpty(lvl)) {
      visibleLevels.push(lvl);
    }
  }

  app.innerHTML = `
    <div class="fixed-bottom">
      <button class="home-toggle" onclick="goHome()">🏠</button>
      <button id='srs-btn' onclick='startSrsSession()'>🧠</button>
      <button id='notebook-btn' onclick='toggleNotebookPage()'>📒</button>
      <button class="generated-toggle" onclick="toggleGeneratedList()">✨</button>
      <button class="components-toggle" onclick="toggleComponentsList()">🧩</button>
      <button class="phonetics-toggle" onclick="togglePhoneticsList()">🧬</button>

      <button class="srs-size-btn" style="display: none" onclick="toggleSrsSize()" id="srs-size-btn">${getHumanSrsLimit()}</button>
      <button class="examples-toggle" style="display: none" onclick="toggleExamplesList()">📖</button>

      <div>
        <button id="speak-mute-btn" onclick="toggleSpeakMute()">${SPEAK_MUTED ? "🔇" : "🔊"}</button>
        <button class="dev-toggle" onclick="toggleDevMenu()">⚙︎</button>
        <button class="homo-toggle" onclick="toggleHomoList()">🅷</button>
        <button class="traditional-toggle ${useTraditional() ? "" : "grayscale-ui"}" onclick="toggleTraditional()">🀄</button>
        <button class="pinyin-toggle ${localStorage.getItem("usePinyin") === "false" ? "grayscale-ui" : ""}" onclick="togglePinyin()">ā</button>
        <button class="translation-toggle ${localStorage.getItem("useTranslationPreview") === "true" ? "" : "grayscale-ui"}" onclick="toggleTranslationPreview()">文</button>
        <button class="tone-toggle ${useToneColors ? "" : "grayscale-ui"}" onclick="savePathScroll();toggleToneColors()">🌈</button>
      </div>
    </div>

    <div id="srs-calendar" style="display:none"></div>
    <div id="homo-list" style="display:none"></div>
    <div id="examples-list" style="display:none"></div>
    <div id="generated-list" style="display:none"></div>
    <div id="components-list" style="display:none"></div>
    <div id="phonetics-list" style="display:none"></div>
    <div id="notebook-list" style="display:none"></div>

    <div id="restore-panel" style="display:none">
      <h1>Open levels til</h1>
      <input type="number" id="restore-level" placeholder="Open levels til" min="1"/>
      <button class="restore-rom-input-btn" onclick="restoreFromInput()">Save</button>

      <h1>Ignore levels til</h1>
      <input type="number" id="ignore-level" placeholder="Ignore levels til" min="1"/>
      <button class="ignore-rom-input-btn" onclick="ignoreSrsUntilLevel()">Save</button>

      <h1>Add custom hanzi</h1>
      <input type="password" style="display:none" id="deepseek-api-key-input" placeholder="DeepSeek API key" value="${getDeepSeekApiKey()}"/>
      <input type="text" id="custom-hanzi-input" placeholder="Hanzi" maxlength="8"/>
      <button class="custom-hanzi-input-btn" onclick="addCustomHanziFromInput()">Add</button>
      <div id="custom-hanzi-status" class="custom-hanzi-status"></div>

      <h1>Add word</h1>
      <input type="text" id="custom-word-input" placeholder="Chinese word" maxlength="12" />
      <button class="custom-hanzi-input-btn" onclick="addCustomWordFromInput()" >Add</button>
      <div id="custom-word-status" class="custom-hanzi-status" ></div>
    </div>
    <div id="srs-size-menu" class="srs-size-menu" style="display:none">
      <button class="select-srs-size-btn" onclick="selectSrsSize(5)">5</button>
      <button class="select-srs-size-btn" onclick="selectSrsSize(10)">10</button>
      <button class="select-srs-size-btn" onclick="selectSrsSize(15)">15</button>
      <button class="select-srs-size-btn" onclick="selectSrsSize(25)">25</button>
      <button class="select-srs-size-btn" onclick="selectSrsSize(50)">50</button>
      <button class="select-srs-size-btn" onclick="selectSrsSize('All')">All</button>
      <button class="srs-reset-ignored" onclick="resetIgnoredSrs()">Reset ignored</button>
    </div>


    <div id='custom-hanzi-list'></div>
    <div class='path' id='path'></div>
  `;
  renderCustomHanziList();
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

  const savedScroll = localStorage.getItem("pathScroll");
  if (savedScroll !== null) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo(0, parseInt(savedScroll, 10));
      });
    });
  }
}
function getCustomWords() {
  return JSON.parse(
    localStorage.getItem("customWords") || "[]"
  );
}

function saveCustomWords(words) {
  localStorage.setItem(
    "customWords",
    JSON.stringify(words)
  );
}

function buildCustomWordPrompt(word) {
  return `
Ты помогаешь мне создавать коллекцию китайских слов.

Вот полноценное китайское слово из 2-3 иероглифов:

${word}

Верни СТРОГО JSON:

{
  "hanzi": "...",
  "hanzi_traditional": "...",
  "translation_pl": "..."
}

Правила:
- hanzi_traditional должен быть в traditional форме
- translation_pl очень короткий
- только 1 перевод
- без markdown
- без объяснений
- только JSON
`;
}

async function addCustomWordFromInput() {
  const input =
    document.getElementById("custom-word-input");

  const status =
    document.getElementById("custom-word-status");

  const apiKey =
    getDeepSeekApiKey();

  const word =
    (input?.value || "").trim();

  if (!word) return;

  const existing = getCustomWords()
    .find(x => x.hanzi === word);

  if (existing) {
    status.textContent = "Already exists";
    return;
  }

  status.textContent = "Generating...";

  try {
    const response = await fetch(
      DEEPSEEK_API_URL,
      {
        method: "POST",
        headers: {
          "Authorization":
            `Bearer ${apiKey}`,
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages: [
            {
              role: "user",
              content:
                buildCustomWordPrompt(word)
            }
          ],
          temperature: 0.2
        })
      }
    );

    if (!response.ok) {
      throw new Error(
        `DeepSeek error ${response.status}`
      );
    }

    const payload = await response.json();

    let content =
      payload?.choices?.[0]?.message?.content || "{}";

    content = content
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    const result = JSON.parse(content);

    const words = getCustomWords();

    words.unshift({
      hanzi: result.hanzi || word,
      hanzi_traditional: result.hanzi_traditional || result.hanzi || word,
      translation_pl: result.translation_pl || ""
    });

    saveCustomWords(words);

    input.value = "";

    status.textContent = "Saved";

    renderNotebookList();
  } catch (e) {
    console.error(e);

    status.textContent =
      `Error: ${e.message}`;
  }
}

function renderNotebookList() {
  const container =
    document.getElementById("notebook-list");

  if (!container) return;

  const words = getCustomWords();

  container.innerHTML = `
    <div class="generated-words-list">

      ${words.map(word => `

        <div class="example-row">

          <div class="example-header">

            <div class="example-hanzi" onclick="speak('${word.hanzi}')">
              ${renderDualSentence(
                word.hanzi,
                word.hanzi_traditional || word.hanzi
              )}
            </div>

          </div>

          <div class="example-details open">

            <div
              class="example-pl"
              onclick="revealNotebookTranslation(this)"
            >
              ${word.translation_pl}

              <button
                class="generated-word-remove-btn"
                onclick="event.stopPropagation(); removeNotebookWord('${word.hanzi}')"
              >
                −
              </button>
            </div>

          </div>

        </div>

      `).join("")}

    </div>
  `;
}
function removeNotebookWord(hanzi) {
  const words = getCustomWords()
    .filter(word => word.hanzi !== hanzi);

  saveCustomWords(words);

  renderNotebookList();
}
function toggleNotebookPage() {
  const panel =
    document.getElementById("notebook-list");

  const opening =
    panel.style.display === "none";

  closeAllPanels();

  if (!opening) {
    return;
  }

  panel.style.display = "block";

  renderNotebookList();

  const path =
    document.getElementById("path");

  const customs =
    document.getElementById("custom-hanzi-list");

  if (path) {
    path.style.display = "none";
  }

  if (customs) {
    customs.style.display = "none";
  }

  updateActiveBottomButtons();
}
function togglePhoneticsList() {
  const panel = document.getElementById("phonetics-list");

  const opening =
    panel.style.display === "none";

  closeAllPanels();

  if (!opening) {
    console.log('[Egor]', 'CLOSING')
    return;
  }

  if (!panel.innerHTML) {
    panel.innerHTML = renderPhoneticsList();
  }

  panel.style.display = "block";

  const path = document.getElementById("path");
  const customs = document.getElementById("custom-hanzi-list");

  if (path) path.style.display = "none";
  if (customs) customs.style.display = "none";
  updateActiveBottomButtons();
}

function renderPhoneticsList() {
  var usePinyin =
    localStorage.getItem("usePinyin") !== "false";

  return PHONETICS_DB.map(function(group, groupIndex) {

    var sortedChars = [...group.chars].sort(function(a, b) {
      var hskA = Number(a.hsk) || 999;
      var hskB = Number(b.hsk) || 999;

      if (hskA !== hskB) {
        return hskA - hskB;
      }

      return (a.hanzi || "").localeCompare(
        b.hanzi || "",
        "zh"
      );
    });

    // сохраняем отсортированную версию
    group._sortedChars = sortedChars;

    var charsHtml = sortedChars.map(function(char, charIndex) {

      return (
        '<div class="phonetic-char-wrapper">' +

          '<div ' +
            'class="phonetic-char" ' +
            'onclick="togglePhoneticCharDetails(' +
              groupIndex + ', ' + charIndex +
            ')"' +
          '>' +

            renderDualHanzi(renderToneColoredHanzi(char.hanzi), renderToneColoredHanzi(char.hanzi_traditional || char.hanzi), getShortestTranslation(char), char.hanzi) +

            '<div ' +
              'class="phonetic-char-pinyin preview-pinyin" ' +
              'style="visibility:' +
                (usePinyin ? "visible" : "hidden") +
              ';"' +
            '>' +

              renderToneColoredPinyin(
                char.hanzi,
                char.pinyin || ""
              ) +

            '</div>' +

          '</div>' +

        '</div>'
      );

    }).join("");

    return (
      '<div class="phonetic-group">' +

        '<div class="phonetic-row">' +

          '<div ' +
            'class="phonetic-char phonetic-char-main" ' +
            'onclick="togglePhoneticGroup(' + groupIndex + ')"' +
          '>' +

            renderDualHanzi(renderToneColoredHanzi(group.phonetic), renderToneColoredHanzi(group.phonetic_traditional || group.phonetic)) +

            '<div ' +
              'class="phonetic-char-pinyin preview-pinyin" ' +
              'style="visibility:' +
                (usePinyin ? "visible" : "hidden") +
              ';"' +
            '>' +

              renderToneColoredPinyin(
                group.phonetic,
                group.phonetic_pinyin || ""
              ) +

            '</div>' +

          '</div>' +

          '<div ' +
            'class="phonetic-group-chars" ' +
            'id="phonetic-group-' + groupIndex + '" ' +
            'style="display:none;"' +
          '>' +

            charsHtml +

          '</div>' +

        '</div>' +

        '<div ' +
          'class="phonetic-details-container" ' +
          'id="phonetic-details-' + groupIndex + '"' +
        '></div>' +

      '</div>'
    );

  }).join("");
}
function togglePhoneticCharDetails(groupIndex, charIndex) {
  var container = document.getElementById(
    "phonetic-details-" + groupIndex
  );

  var group = PHONETICS_DB[groupIndex];
  var char = (group._sortedChars || group.chars)[charIndex];

  var current = container.dataset.currentIndex;

  if (
    current !== undefined &&
    current !== "" &&
    Number(current) === charIndex
  ) {
    container.innerHTML = "";
    container.dataset.currentIndex = "";
    return;
  }

  container.dataset.currentIndex = charIndex;

  var translations = [
    char.translation_pl,
    char.translation_en,
    char.translation_ru,
  ]
    .filter(Boolean)
    .join(" · ");

  container.innerHTML =
    '<div class="phonetic-char-details">' +

      '<div class="phonetic-row">' +

        '<div class="phonetic-char-wrapper">' +

          '<div class="phonetic-char">' +

            '<div class="phonetic-detail-hanzi" onclick="speak(\'' + char.hanzi + '\')">' +

              renderDualHanzi(renderToneColoredHanzi(char.hanzi), renderToneColoredHanzi(char.hanzi_traditional || char.hanzi)) +

              '<div class="phonetic-detail-pinyin">' +

                renderToneColoredPinyin(
                  char.hanzi,
                  char.pinyin
                ) +

              '</div>' +

            '</div>' +

          '</div>' +

        '</div>' +

      '</div>' +

      '<div class="phonetic-detail-hsk">' +
        'HSK ' + (char.hsk || "?") +
      '</div>' +

      '<div class="phonetic-detail-translations">' +
        translations +
      '</div>' +

      '<div class="phonetic-detail-example-hanzi">' +
        `<div onclick="speak('${char.example_hanzi}')">${renderDualSentence(char.example_hanzi, char.example_hanzi_traditional || char.example_hanzi)}</div>` +
      '</div>' +

      '<div class="phonetic-detail-example-pl">' +
        (char.example_pl || "") +
      '</div>' +

    '</div>';
}

function togglePhoneticGroup(groupIndex) {
  var groupEl = document.getElementById(
    "phonetic-group-" + groupIndex
  );

  var detailsEl = document.getElementById(
    "phonetic-details-" + groupIndex
  );

  if (!groupEl) return;

  var opening =
    groupEl.style.display === "none";

  groupEl.style.display =
    opening
      ? "grid"
      : "none";

  // закрываем details только
  // при закрытии текущей группы
  if (!opening && detailsEl) {
    detailsEl.innerHTML = "";
    detailsEl.dataset.currentIndex = "";
  }
}
function toggleComponentsList() {
  const panel = document.getElementById("components-list");

  const opening =
    panel.style.display === "none";

  closeAllPanels();

  if (!opening) {
    return;
  }

  if (!panel.innerHTML) {
    panel.innerHTML = renderComponentsList();
  }

  panel.style.display = "block";

  const path = document.getElementById("path");
  const customs = document.getElementById("custom-hanzi-list");

  if (path) path.style.display = "none";
  if (customs) customs.style.display = "none";
  updateActiveBottomButtons();
}


function renderComponentsList() {
  var usePinyin =
    localStorage.getItem("usePinyin") !== "false";

  return COMPONENTS_DB2.map(function(group, groupIndex) {

    var sortedChars = [...group.chars].sort(function(a, b) {
      var hskA = Number(a.hsk) || 999;
      var hskB = Number(b.hsk) || 999;

      if (hskA !== hskB) {
        return hskA - hskB;
      }

      return (a.hanzi || "").localeCompare(
        b.hanzi || "",
        "zh"
      );
    });

    // сохраняем отсортированную версию
    group._sortedChars = sortedChars;

    var charsHtml = sortedChars.map(function(char, charIndex) {

      return (
        '<div class="component-char-wrapper">' +

          '<div ' +
            'class="component-char" ' +
            'onclick="toggleComponentCharDetails(' +
              groupIndex + ', ' + charIndex +
            ')"' +
          '>' +
            renderDualHanzi(renderToneColoredHanzi(char.hanzi), renderToneColoredHanzi(char.hanzi_traditional || char.hanzi), getShortestTranslation(char), char.hanzi) +

            '<div ' +
              'class="component-char-pinyin preview-pinyin" ' +
              'style="visibility:' +
                (usePinyin ? "visible" : "hidden") +
              ';"' +
            '>' +
              renderToneColoredPinyin(
                char.hanzi,
                char.pinyin || ""
              ) +
            '</div>' +
          '</div>' +

        '</div>'
      );

    }).join("");

    return (
      '<div class="component-group">' +

        '<div class="component-row">' +

          '<div ' +
            'class="component-char component-char-main" ' +
            'onclick="toggleComponentGroup(' + groupIndex + ')"' +
          '>' +
            renderDualHanzi(renderToneColoredHanzi(group.component), renderToneColoredHanzi(group.component_traditional || group.component)) +

            '<div ' +
              'class="component-char-pinyin preview-pinyin" ' +
              'style="visibility:' +
                (usePinyin ? "visible" : "hidden") +
              ';"' +
            '>' +
            renderToneColoredPinyin(
              group.component,
              group.pinyin || ""
            ) +
            '</div>' +
          '</div>' +

          '<div ' +
            'class="component-group-chars" ' +
            'id="component-group-' + groupIndex + '" ' +
            'style="display:none;"' +
          '>' +

            charsHtml +

          '</div>' +

        '</div>' +

        '<div ' +
          'class="component-details-container" ' +
          'id="component-details-' + groupIndex + '"' +
        '></div>' +

      '</div>'
    );

  }).join("");
}

function toggleComponentGroup(groupIndex) {
  var groupEl = document.getElementById(
    "component-group-" + groupIndex
  );

  var detailsEl = document.getElementById(
    "component-details-" + groupIndex
  );

  if (!groupEl) return;

  var opening =
    groupEl.style.display === "none";

  groupEl.style.display =
    opening
      ? "contents"
      : "none";

  // закрываем details только
  // при закрытии текущей группы
  if (!opening && detailsEl) {
    detailsEl.innerHTML = "";
    detailsEl.dataset.currentIndex = "";
  }
}
function toggleComponentCharDetails(groupIndex, charIndex) {
  var container = document.getElementById(
    "component-details-" + groupIndex
  );

  var group = COMPONENTS_DB2[groupIndex];
  var char = (group._sortedChars || group.chars)[charIndex];

  var current = container.dataset.currentIndex;

  if (
    current !== undefined &&
    current !== "" &&
    Number(current) === charIndex
  ) {
    container.innerHTML = "";
    container.dataset.currentIndex = "";
    return;
  }

  container.dataset.currentIndex = charIndex;

  var translations = [
    char.translation_pl,
    char.translation_ru,
    char.translation_en,
  ]
    .filter(function(item) {
      return Boolean(item);
    })
    .join(" · ");

  container.innerHTML =
    '<div class="component-char-details">' +


      '<div class="component-row">' +
        '<div class="component-char-wrapper">' +
          '<div class="component-char">' +
            '<div class="component-detail-hanzi" onclick="speak(\'' + char.hanzi + '\')">' +
              renderDualHanzi(renderToneColoredHanzi(char.hanzi), renderToneColoredHanzi(char.hanzi_traditional || char.hanzi)) +

              '<div class="component-detail-pinyin">' +
                renderToneColoredPinyin(
                  char.hanzi,
                  char.pinyin
                ) +
              '</div>' +

            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="component-detail-hsk">' +
        'HSK ' + (char.hsk || "?") +
      '</div>' +

      '<div class="component-detail-translations">' +
        translations +
      '</div>' +

      '<div class="component-detail-example-hanzi">' +
        `<div onclick="speak('${char.example_hanzi}')">${renderDualSentence(char.example_hanzi, char.example_hanzi_traditional || char.example_hanzi)}</div>` +
      '</div>' +

      '<div class="component-detail-example-pl">' +
        (char.example_pl || "") +
      '</div>' +

    '</div>';
}

function renderDualHanzi(
  simple,
  traditional,
  translation = "",
  hanzi = ""
) {
  const cleanSimple =
    String(simple)
      .replace(/<[^>]+>/g, "")
      .trim();

  const cleanTraditional =
    String(traditional)
      .replace(/<[^>]+>/g, "")
      .trim();

  const hasDifference =
    cleanSimple !== cleanTraditional;

  const pinyin = getCharPinyin(hanzi);
  const tone = detectTone(pinyin);

  return `
    <div class="hanzi-simple ${
      useTraditional() ? "hidden" : ""
    } ${
      hasDifference ? "traditional-diff" : ""
    }">
      ${simple}
    </div>

    <div class="hanzi-traditional ${
      useTraditional() ? "" : "hidden"
    } ${
      hasDifference ? "traditional-diff" : ""
    }">
      ${traditional}
    </div>

    <div
      class="preview-translation tone-${tone}"
      style="display:${
        localStorage.getItem("useTranslationPreview") === "true"
          ? ""
          : "none"
      };"
    >
      ${translation}
    </div>
  `;
}
function toggleTraditional() {
  const next = !useTraditional();

  localStorage.setItem(
    "useTraditional",
    String(next)
  );

  document
    .querySelectorAll(".hanzi-simple")
    .forEach(el => {
      el.classList.toggle("hidden", next);
    });

  document
    .querySelectorAll(".hanzi-traditional")
    .forEach(el => {
      el.classList.toggle("hidden", !next);
    });

  const btn =
    document.querySelector(".traditional-toggle");

  if (btn) {
    btn.classList.toggle(
      "grayscale-ui",
      !next
    );
  }
}
function savePathScroll() {
  if (!location.hash || location.hash === "#") {
    localStorage.setItem("pathScroll", String(window.scrollY));
  }
}
function renderCustomHanziList() {
  const container =
    document.getElementById("custom-hanzi-list");

  if (!container) return;

  const customChars = getCustomChars();

  if (!customChars.length) {
    container.innerHTML = "";
    return;
  }

  const usePinyin =
    localStorage.getItem("usePinyin") !== "false";

  container.innerHTML =
    '<div class="custom-hanzi-grid">' +

      customChars.map(function(c, index) {

        return (
          '<button ' +
            'class="custom-hanzi-card" ' +
            'onclick="savePathScroll(); location.hash=\'#/custom/' +
              index +
            '\'"' +
          '>' +

            '<span class="custom-hanzi-main">' +
              renderDualHanzi(renderToneColoredHanzi(c.hanzi), renderToneColoredHanzi(c.hanzi_traditional || c.hanzi), getShortestTranslation(c), c.hanzi) +
            '</span>' +

            '<span ' +
              'class="custom-hanzi-pinyin preview-pinyin" ' +
              'style="visibility:' +
                (usePinyin ? "visible" : "hidden") +
              ';"' +
            '>' +
              renderToneColoredPinyin(
                c.hanzi,
                c.pinyin || ""
              ) +
            '</span>' +

          '</button>'
        );

      }).join("") +

    '</div>';
}

function ignoreSrsUntilLevel() {
  const level = parseInt(
    document.getElementById("ignore-level")?.value,
    10
  )

  if (!Number.isInteger(level) || level < 2) return

  const progress = getProgress()

  progress.ignoredFromSrs ||= {}
  progress.completedLevels ||= {};

  for (let i = 1; i < level; i++) {
    progress.completedLevels[i] = true;

    for (const char of getCharsForLevel(i)) {
      progress.ignoredFromSrs[char.hanzi] = true
    }
  }

  saveProgress(progress)
  location.hash = "#";
  window.location.reload();
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
      hanzi.innerHTML = getHanziPreviewForLevel(lvl);
      btn.appendChild(hanzi);
    }

    // 🔹 zigzag offset (same logic, just array-based)
    if (direction !== "forward") {
      const step = 20;
      const offset =
        direction === "forward"
          ? index * step
          : (count - 1 - index) * step;

      // btn.style.marginTop = `${offset}px`;
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
        savePathScroll();
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
      hanzi.innerHTML = getHanziPreviewForLevel(lvl);
      btn.appendChild(hanzi);
    }

    if (direction != "forward"){
      const step = 20;
      const offset =
        direction === "forward"
          ? index * step
          : (count - 1 - index) * step;

      // btn.style.marginTop = `${offset}px`;
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
        savePathScroll();
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

  chars.push(...getCustomChars());

  return chars.filter(c => !isIgnoredFromSrs(c.hanzi));
}

function getAllLearnedCharsWithIgnored() {
  const progress = getProgress();
  const completedLevels = Object.keys(progress.completedLevels || {}).map(Number);

  const chars = [];
  completedLevels.forEach(level => {
    chars.push(...getCharsForLevel(level));
  });

  // custom chars
  chars.push(...getCustomChars());

  // dedupe by hanzi
  const seen = new Set();

  return chars.filter(c => {
    if (!c?.hanzi) return false;

    if (seen.has(c.hanzi)) {
      return false;
    }

    seen.add(c.hanzi);
    return true;
  });
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
        savePathScroll();
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
function toggleTranslationPreview() {
  const current =
    localStorage.getItem("useTranslationPreview") === "true";

  const next = !current;

  localStorage.setItem(
    "useTranslationPreview",
    String(next)
  );

  if (next) {
    localStorage.setItem("usePinyin", "false");
  }

  const btn =
    document.querySelector(".translation-toggle");

  if (btn) {
    btn.classList.toggle(
      "grayscale-ui",
      !next
    );
  }

  const pinyinBtn =
    document.querySelector(".pinyin-toggle");

  if (pinyinBtn) {
    pinyinBtn.classList.add("grayscale-ui");
  }

  repaintPinyinVisibility();
  repaintTranslationVisibility();
}
function togglePinyin() {
  const current =
    localStorage.getItem("usePinyin") !== "false";

  const next = !current;

  if (next) {
    localStorage.setItem(
      "useTranslationPreview",
      "false"
    );
  }

  const translationBtn = document.querySelector(".translation-toggle");
  if (translationBtn && next) {
    translationBtn.classList.add("grayscale-ui");
  }

  localStorage.setItem(
    "usePinyin",
    String(next)
  );

  const btn = document.querySelector(".pinyin-toggle");

  if (btn) {
    btn.classList.toggle(
      "grayscale-ui",
      !next
    );
  }

  repaintTranslationVisibility();
  repaintPinyinVisibility();
}
function repaintTranslationVisibility() {
  const enabled =
    localStorage.getItem("useTranslationPreview") === "true";

  document
    .querySelectorAll(".preview-translation")
    .forEach(function(el) {
      el.style.display =
        enabled ? "" : "none";
    });
}
function repaintPinyinVisibility() {
  const enabled =
    localStorage.getItem("usePinyin") !== "false";

  document.querySelectorAll(".preview-pinyin")
    .forEach(function(el) {
      el.style.visibility =
        enabled ? "visible" : "hidden";
    });

  document.querySelectorAll(".component-char-pinyin")
    .forEach(function(el) {
      el.style.visibility =
        enabled ? "visible" : "hidden";
    });
}
function getShortestTranslation(c) {
  const values = [
    c.translation_pl,
    c.translation_en,
    c.translation_ru,

    ...(c.pl_translations || []),
    ...(c.ru_translations || []),
    ...(c.translations || []),
  ]
    .filter(Boolean)

    .flatMap(x =>
      String(x)
        .split(/[,/;·]/g)
    )

    .map(x => x.trim())

    .filter(Boolean)

    // remove "(formal)" etc
    .map(x =>
      x.replace(/\(.*?\)/g, "").trim()
    )

    .filter(Boolean);

  if (!values.length) {
    return "";
  }

  const sorted = values.sort((a, b) => {
    const aScore =
      a.length + a.split(" ").length * 10;

    const bScore =
      b.length + b.split(" ").length * 10;

    return aScore - bScore;
  });

  const result =
    sorted[0] || "";

  return result.slice(0, 7);
}
function getHanziPreviewForLevel(level) {
  var usePinyin =
    localStorage.getItem("usePinyin") !== "false";

  var filtered = getCharsForLevel(level)
    .filter(function(c) {
      return !isIgnoredFromSrs(c.hanzi);
    });

  return filtered.map(function(c, i) {

    return (
      '<div>' +

        '<div>' +
          renderDualHanzi(renderToneColoredHanzi(c.hanzi), renderToneColoredHanzi(c.hanzi_traditional || c.hanzi), getShortestTranslation(c), c.hanzi) +
        '</div>' +

        '<div ' +
          'class="preview-pinyin" ' +
          'style="visibility:' +
            (usePinyin ? "visible" : "hidden") +
          ';"' +
        '>' +
          renderToneColoredPinyin(
            c.hanzi,
            c.pinyin
          ) +
        '</div>' +

        (
          i < filtered.length - 1
            ? '<hr>'
            : ''
        ) +

      '</div>'
    );

  }).join("");
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


function renderCustomChar(index = 0) {
  const chars = getCustomChars();
  const c = chars[index];

  if (!c) {
    location.hash = "#";
    return;
  }

  const isLast = index >= chars.length - 1;
  const isFirst = index <= 0;

  const homophones = getKnownHomophones(c.hanzi, c.pinyin);
  const homophonesHtml = homophones.length ? `
      <div class="section">
        <div class="homophones">
          Омонимы: ${homophones.map(h =>
            `<span class="homo">${h.hanzi} (${h.pinyin})</span>`
          ).join(" ")}
        </div>
      </div>
    `
    : "";
  // <h1>Custom</h1>
  // <div class="progress">${index + 1} / ${chars.length}</div>

  app.innerHTML = `
    <div class="fixed-bottom">
      <button class="back-btn" onclick="${"location.hash='#'"}">←</button>
      <button class="ignore-btn" onclick="removeCharFromUiAndSrs('${c.hanzi}', { mode: 'custom', index: ${index} })">-</button>
      ${
        !isLast
          ? `<button class="next-btn" onclick="location.hash='#/custom/${index + 1}'">→</button>`
          : `<button class="next-btn" onclick="location.hash='#'">✓</button>`
      }
      <button id="open-all-desc-btn" class="open-all-desc-btn">↓</button>
      ${renderStudyToggles()}
    </div>


    <div class="char-card custom-study-card">
      <div class="hanzi" onclick="speak('${c.hanzi}')">${renderDualHanzi(renderToneColoredHanzi(c.hanzi), renderToneColoredHanzi(c.hanzi_traditional || c.hanzi))}</div>

      <div style="display:flex; gap:20px; justify-content:center;">
        <button id="toggle-meaning" class="secondary-btn">Pinying</button>
        <button id="incremental-reveal-pinyin" class="secondary-btn">+</button>
      </div>

      <div id="toggle-pinyin" style="display: none;">
        <div class="pinyin-row">
          <p class="pinyin">${c.pinyin}</p>
        </div>
      </div>

      <div class="example-section">
        <div onclick="speak('${c.example_hanzi}')">${renderDualSentence(c.example_hanzi, c.example_hanzi_traditional || c.example_hanzi)}</div>
        <p class="section example-p example-p-pinying" id="example-p-pinying" style="visibility: hidden">${c.example_pinying || ""}</p>
        <p class="section example-p example-p-pl" id="example-p-pl" style="visibility: hidden">${c.example_pl || ""}</p>
        ${
          c.hsk
          ? `<p class="section example-p example-p-hsk" id="example-p-hsk" style="visibility: hidden">HSK ${c.hsk || ""}</p>`
          : ''
        }
      </div>

      <div id="meaning" style="display:none">
        <div class="section">
          Перевод: ${ [...(c.pl_translations || []).slice(0, 3), ...(c.translations || []).slice(0, 3), ...(c.ru_translations || []).slice(0, 3)].join(", ") }
        </div>

        ${homophonesHtml}

        <h1>Deepseek</h1>

        <p class="section">${c.deepseek_description_pl_paragraph_1 || ""}</p>
        <p class="section">${c.deepseek_description_pl_paragraph_2 || ""}</p>
        <p class="section">${c.deepseek_description_pl_paragraph_3 || ""}</p>
        <p class="section">${c.deepseek_description_pl_paragraph_4 || ""}</p>

        <button class="google-btn" onclick="googleHanzi('${c.hanzi}')">🧭</button>
        <button class="chatgpt-btn" onclick="explainInChatGPT('${c.hanzi}')">💬</button>
      </div>
    </div>
  `;

  const openExampleBtn = document.getElementById("open-all-desc-btn");
  const toggleBtn = document.getElementById("toggle-meaning");
  const meaning = document.getElementById("meaning");
  const pinyin = document.getElementById("toggle-pinyin");

  const incrementalRevealBtn = document.getElementById("incremental-reveal-pinyin");
  const pinyinTextEl = pinyin.querySelector(".pinyin");
  const fullPinyin = c.pinyin || "";

  let revealIndex = 0;
  let clicks = 0;

  toggleBtn.onclick = () => {
    clicks++;
    if (clicks == 1) {
      speak(c.hanzi);
      incrementalRevealBtn.style.display = 'none';
      pinyin.style.display = "block";
      toggleBtn.textContent = "Open";
      toggleBtn.style.width = '100%';
      toggleBtn.style.visibility = 'hidden';
      pinyinTextEl.textContent = maskedPinyin(fullPinyin, fullPinyin.length);
    }
    if (clicks == 2) {
      toggleBtn.style.display = 'none';
      meaning.style.display = "block";
      openExampleBtn.click();
      openExampleBtn.click();
    }
  };

  incrementalRevealBtn.onclick = () => {
    if (!fullPinyin) return;

    if (revealIndex === 0) {
      pinyin.style.display = "block";
      pinyinTextEl.textContent = maskedPinyin(fullPinyin, 0);
      revealIndex = 1;
      return;
    }

    pinyinTextEl.textContent = maskedPinyin(fullPinyin, revealIndex);
    revealIndex++;

    if (revealIndex > fullPinyin.length) {
      incrementalRevealBtn.style.display = "none";
      toggleBtn.click();
    }
  };

  const examplePinying = document.getElementById("example-p-pinying");
  const examplePl = document.getElementById("example-p-pl");
  const exampleHsk = document.getElementById("example-p-hsk");
  let exampleOpenClicks = 0;

  document.addEventListener("click", (e) => {
    if (!e.target || e.target.id !== "open-all-desc-btn") return;

    exampleOpenClicks++;
    if (exampleOpenClicks == 1) {
      examplePinying.style.visibility = "visible";
      examplePl.style.visibility = "visible";
      exampleHsk.style.visibility = "visible";
      openExampleBtn.style.display = 'none';
      toggleBtn.click()
      toggleBtn.click()
    }
    if (exampleOpenClicks == 2) {
    }
  });

  incrementalRevealBtn.click();
}

function renderLevel(level, index = 0) {
  const chars = getCharsForLevel(level);
  const c = chars[index];

  const isLast = index >= chars.length - 1;

  const homophones = getKnownHomophones(c.hanzi, c.pinyin);
  const homophonesHtml = homophones.length ? `
      <div class="section">
        <div class="homophones">
          Омонимы: ${homophones.map(h =>
            `<span class="homo">${h.hanzi} (${h.pinyin})</span>`
          ).join(" ")}
        </div>
      </div>
    `
    : "";

  app.innerHTML = `
    <div class="fixed-bottom">
      <button class="back-btn" onclick="goBack(${level}, ${index})">←</button>
      ${
        isIgnoredFromSrs(c.hanzi)
        ? ""
        :
          `<button class="ignore-btn" onclick="finishLevel(${level});removeCharFromUiAndSrs('${c.hanzi}', { mode: 'level', level: ${level}, index: ${index} })">
            -
          </button>`
      }
      ${
        !isLast
          ? `<button class="next-btn" onclick="location.hash='#/level/${level}/${index + 1}'">→</button>`
          : `<button class="next-btn" onclick="finishLevel(${level})">✓</button>`
      }
      <button id="open-all-desc-btn" class="open-all-desc-btn">↓</button>
      ${renderStudyToggles()}
    </div>


    <div class="char-card">
      <div class="hanzi" onclick="speak('${c.hanzi}')">${renderDualHanzi(renderToneColoredHanzi(c.hanzi), renderToneColoredHanzi(c.hanzi_traditional || c.hanzi))}</div>

      <div style="display:flex; gap:20px; justify-content:center;">
        <button id="toggle-meaning" class="secondary-btn">Pinying</button>
        <button id="incremental-reveal-pinyin" class="secondary-btn">+</button>
      </div>

      <div id="toggle-pinyin" style="display: none;">
        <div class="pinyin-row">
          <p class="pinyin">${c.pinyin}</span>
        </div>
      </div>

      <div class="example-section">
        <div onclick="speak('${c.example_hanzi}')">${renderDualSentence(c.example_hanzi, c.example_hanzi_traditional || c.example_hanzi)}</div>
        <p class="section example-p example-p-pinying" id="example-p-pinying" style="visibility: hidden">${c.example_pinying}</p>
        <p class="section example-p example-p-pl" id="example-p-pl" style="visibility: hidden">${c.example_pl}</p>
        <p class="section example-p example-p-hsk" id="example-p-hsk" style="visibility: hidden">HSK ${c.hsk || ""}</p>
      </div>

      <div id="meaning" style="display:none">
        <div class="section">
          Перевод: ${ [...(c.pl_translations || []).slice(0, 3), ...(c.translations || []).slice(0, 3), ...(c.ru_translations || []).slice(0, 3)].join(", ") }
        </div>

        ${homophonesHtml}

        <h1>Deepseek</h1>

        <p class="section">${c.deepseek_description_pl_paragraph_1 || ""}</p>
        <p class="section">${c.deepseek_description_pl_paragraph_2 || ""}</p>
        <p class="section">${c.deepseek_description_pl_paragraph_3 || ""}</p>
        <p class="section">${c.deepseek_description_pl_paragraph_4 || ""}</p>

        <button class="google-btn" onclick="googleHanzi('${c.hanzi}')">🧭</button>
        <button class="chatgpt-btn" onclick="explainInChatGPT('${c.hanzi}')">💬</button>
      </div>
    </div>
  `;

  const openExampleBtn = document.getElementById("open-all-desc-btn");
  const toggleBtn = document.getElementById("toggle-meaning");
  const meaning = document.getElementById("meaning");
  const pinyin = document.getElementById("toggle-pinyin");

  const incrementalRevealBtn = document.getElementById("incremental-reveal-pinyin");
  const pinyinTextEl = pinyin.querySelector(".pinyin");
  const fullPinyin = c.pinyin || "";

  let revealIndex = 0;
  let clicks = 0

  toggleBtn.onclick = () => {
    clicks++;
    if (clicks == 1) {
      speak(c.hanzi);
      incrementalRevealBtn.style.display = 'none'
      pinyin.style.display = "block";
      toggleBtn.textContent = "Open";
      toggleBtn.style.width = '100%'
      toggleBtn.style.visibility = 'hidden';
      pinyinTextEl.textContent = maskedPinyin(fullPinyin, fullPinyin.length);
    }
    if (clicks == 2) {
      toggleBtn.style.display = 'none'
      meaning.style.display = "block";
      openExampleBtn.click();
      openExampleBtn.click();
    };
  };

  incrementalRevealBtn.onclick = () => {
    if (!fullPinyin) return;

    // первое нажатие — просто показать все звёздочки
    if (revealIndex === 0) {
      pinyin.style.display = "block";
      pinyinTextEl.textContent = maskedPinyin(fullPinyin, 0);
      revealIndex = 1; // подготовка к следующему шагу
      return;
    }

    // последующие нажатия
    pinyinTextEl.textContent = maskedPinyin(fullPinyin, revealIndex);

    revealIndex++;

    if (revealIndex > fullPinyin.length) {
      incrementalRevealBtn.style.display = "none";
      toggleBtn.click();
    }
  };

  const examplePinying = document.getElementById("example-p-pinying");
  const examplePl = document.getElementById("example-p-pl");
  const exampleHsk = document.getElementById("example-p-hsk");
  let exampleOpenClicks = 0

  document.addEventListener("click", (e) => {
    if (!e.target || e.target.id !== "open-all-desc-btn") return;

    exampleOpenClicks++;
    if (exampleOpenClicks == 1) {
      examplePinying.style.visibility = "visible";
      examplePl.style.visibility = "visible";
      exampleHsk.style.visibility = "visible";
      openExampleBtn.style.display = 'none'
      toggleBtn.click()
      toggleBtn.click()
    };
    // if (exampleOpenClicks == 2) {
    // }
  });

  incrementalRevealBtn.click();
}
function renderStudyToggles() {
  return `
    <div style="clear: both;">
      <button class="traditional-toggle ${useTraditional() ? "" : "grayscale-ui"}" onclick="toggleTraditional()">🀄</button>
      <button class="pinyin-toggle ${localStorage.getItem("usePinyin") === "false" ? "grayscale-ui" : ""}" onclick="togglePinyin()">ā</button>
      <button class="tone-toggle ${useToneColors ? "" : "grayscale-ui"}" onclick="toggleToneColors()">🌈</button>
    </div>
  `;
}

function renderDualSentence(
  simple,
  traditional,
  translation = ""
) {
  const s = [...(simple || "")];
  const t = [...(traditional || simple || "")];

  const renderSide = (chars, other) =>
    chars.map((ch, i) => `
      <div class="dual-sentence-char ${
        ch !== (other[i] || "")
          ? "traditional-diff"
          : ""
      }">
        ${renderToneColoredHanzi(ch)}

        <div
          class="preview-pinyin dual-sentence-pinyin"
          style="visibility:${
            localStorage.getItem("usePinyin") !== "false"
              ? "visible"
              : "hidden"
          }"
        >
          ${renderToneColoredPinyin(
            ch,
            getCharPinyin(ch)
          )}
        </div>

        <div
          class="preview-translation"
          style="display:${
            localStorage.getItem("useTranslationPreview") === "true"
              ? ""
              : "none"
          };"
        >
          ${translation}
        </div>
      </div>
    `).join("");

  return renderDualHanzi(
    renderSide(s, t),
    renderSide(t, s)
  );
}
function maskedPinyin(fullPinyin, count) {
  return [...fullPinyin].map((ch, i) => {
    if (ch === " ") return " ";
    return i < count ? ch : "*";
  }).join("");
}
function explainInChatGPT(hanzi) {
  const text = `объясни из каких черт и элементов состоит иероглиф ${hanzi}\n`;

  navigator.share({
    text
  });
}


function ignoreCurrentSrsChar() {
  const session = JSON.parse(localStorage.getItem("srsSession"));
  if (!session) return;

  const c = session.chars[session.index];
  if (!c) return;

  removeCharFromUiAndSrs(c.hanzi, { mode: "srs" });
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

  const homophones = getKnownHomophones(c.hanzi, c.pinyin);
  const homophonesHtml = homophones.length ? `
      <div class="section">
        <div class="homophones">
          Омонимы: ${homophones.map(h =>
            `${h.hanzi} (${h.pinyin})`
          ).join(" ")}
        </div>
      </div>
    `
    : "";

  // <div class="progress">${index + 1} / ${chars.length}</div>

  app.innerHTML = `
    <div class="fixed-bottom">
      <button class="back-btn" onclick="location.hash = '#';">←</button>
      <button class="ignore-btn" onclick="ignoreCurrentSrsChar()">
        -
      </button>
      <button class="next-srs-btn"  onclick="nextSrs()">
        ${isLast ? "✓" : "→"}
      </button>
      <button id="open-all-desc-btn" class="open-all-desc-btn">↓</button>
      ${renderStudyToggles()}
    </div>
    <div class="char-card">
      <div class="hanzi" onclick="speak('${c.hanzi}')">${renderDualHanzi(renderToneColoredHanzi(c.hanzi), renderToneColoredHanzi(c.hanzi_traditional || c.hanzi))}</div>

      <div style="display:flex; gap:20px; justify-content:center;">
        <button id="toggle-meaning" class="secondary-btn">Pinying</button>
        <button id="incremental-reveal-pinyin" class="secondary-btn">+</button>
      </div>

      <div id="toggle-pinyin" style="display: none;">
        <div class="pinyin-row">
          <p class="pinyin">${c.pinyin}</span>
        </div>
      </div>

      <div class="example-section">
        <div onclick="speak('${c.example_hanzi}')">${renderDualSentence(c.example_hanzi, c.example_hanzi_traditional || c.example_hanzi)}</div>
        <p class="section example-p example-p-pinying" id="example-p-pinying" style="visibility: hidden">${c.example_pinying}</p>
        <p class="section example-p example-p-pl" id="example-p-pl" style="visibility: hidden">${c.example_pl}</p>
        <p class="section example-p example-p-hsk" id="example-p-hsk" style="visibility: hidden">HSK ${c.hsk || ""}</p>
      </div>

      <div id="meaning" style="display:none">
        <div class="section">
          Перевод: ${ [...(c.pl_translations || []).slice(0, 3), ...(c.translations || []).slice(0, 3), ...(c.ru_translations || []).slice(0, 3)].join(", ") }
        </div>

        ${homophonesHtml}

        <h1>Deepseek</h1>

        <p class="section">${c.deepseek_description_pl_paragraph_1 || ""}</p>
        <p class="section">${c.deepseek_description_pl_paragraph_2 || ""}</p>
        <p class="section">${c.deepseek_description_pl_paragraph_3 || ""}</p>
        <p class="section">${c.deepseek_description_pl_paragraph_4 || ""}</p>

        <button class="google-btn" onclick="googleHanzi('${c.hanzi}')">🧭</button>
        <button class="chatgpt-btn" onclick="explainInChatGPT('${c.hanzi}')">💬</button>
      </div>
    </div>
  `;

  const openExampleBtn = document.getElementById("open-all-desc-btn");
  const toggleBtn = document.getElementById("toggle-meaning");
  const meaning = document.getElementById("meaning");
  const pinyin = document.getElementById("toggle-pinyin");

  const incrementalRevealBtn = document.getElementById("incremental-reveal-pinyin");
  const pinyinTextEl = pinyin.querySelector(".pinyin");
  const fullPinyin = c.pinyin || "";

  let revealIndex = 0;
  let clicks = 0

  toggleBtn.onclick = () => {
    clicks++;
    if (clicks == 1) {
      speak(c.hanzi);
      incrementalRevealBtn.style.display = 'none'
      pinyin.style.display = "block";
      toggleBtn.textContent = "Open";
      toggleBtn.style.width = '100%'
      toggleBtn.style.visibility = 'hidden';
      pinyinTextEl.textContent = maskedPinyin(fullPinyin, fullPinyin.length);
    }
    if (clicks == 2) {
      toggleBtn.style.display = 'none'
      meaning.style.display = "block";
      openExampleBtn.click();
      openExampleBtn.click();
    };
  };

  incrementalRevealBtn.onclick = () => {
    if (!fullPinyin) return;

    // первое нажатие — просто показать все звёздочки
    if (revealIndex === 0) {
      pinyin.style.display = "block";
      pinyinTextEl.textContent = maskedPinyin(fullPinyin, 0);
      revealIndex = 1; // подготовка к следующему шагу
      return;
    }

    // последующие нажатия
    pinyinTextEl.textContent = maskedPinyin(fullPinyin, revealIndex);

    revealIndex++;

    if (revealIndex > fullPinyin.length) {
      incrementalRevealBtn.style.display = "none";
      toggleBtn.click();
    }
  };

  const examplePinying = document.getElementById("example-p-pinying");
  const examplePl = document.getElementById("example-p-pl");
  const exampleHsk = document.getElementById("example-p-hsk");
  let exampleOpenClicks = 0

  document.addEventListener("click", (e) => {
    if (!e.target || e.target.id !== "open-all-desc-btn") return;

    exampleOpenClicks++;
    if (exampleOpenClicks == 1) {
      examplePinying.style.visibility = "visible";
      examplePl.style.visibility = "visible";
      exampleHsk.style.visibility = "visible";
      openExampleBtn.style.display = 'none'
      toggleBtn.click()
      toggleBtn.click()
    };
    if (exampleOpenClicks == 2) {
    }
  });

  incrementalRevealBtn.click();
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

function toggleHomoList() {
  closeAllPanels();
  const homoList = document.getElementById("homo-list");
  if (!homoList.innerHTML) {
    homoList.innerHTML = renderHomoList();
  }
  const path = document.getElementById("path");
  const customs = document.getElementById("custom-hanzi-list");

  homoList.style.display = homoList.style.display === "none" ? "block" : "none";
  path.style.display = homoList.style.display === "none" ? "block" : "none";
  customs.style.display = homoList.style.display === "none" ? "block" : "none";

  collapseAllHomoGroups();
  updateActiveBottomButtons();
}
function normalizeInitialTJQForSort(key) {
  if (!key) return key;

  const first = key[0];

  // приравниваем t == j == q
  if (first === 't' || first === 'j' || first === 'q') {
    return 'q' + key.slice(1);
  }

  if (key == 'zai') {
    return 'cai'
  }

  if (key == 'zuo') {
    return 'cuo'
  }

  return key;
}
function renderHomoList() {
  const index = getHomophonesIndex();
  let html = "";

  html += `
    <div style="height: 200px;">
      <button class="homo-expand-collapse" onclick="collapseAllHomoGroups()">Collapse All</button>
      <button class="homo-expand-collapse" onclick="expandAllHomoGroups()">Expand All</button>
    </div>
  `;

  const sortedKeys = Object.keys(index).sort((a, b) => {
    const na = normalizeInitialTJQForSort(a);
    const nb = normalizeInitialTJQForSort(b);

    if (na === nb) {
      return a.localeCompare(b, 'en');
    }

    return na.localeCompare(nb, 'en');
  });

  // 🔹 сгруппируем ключи по секциям заранее
  const groups = {};
  let tjqShown = false;
  let zcShown = false;

  for (const key of sortedKeys) {
    const firstLetter = key.charAt(0).toUpperCase();

    let groupName;

    if (["T", "Q", "J"].includes(firstLetter)) {
      groupName = "T/Q/J";
    } else if (["zuo", "cuo", "zai", "cai"].includes(key) || firstLetter === "C") {
      groupName = "C/Z";
    } else {
      groupName = firstLetter;
    }

    groups[groupName] ||= [];
    groups[groupName].push(key);
  }

  for (const groupName of Object.keys(groups)) {
    const keys = groups[groupName];

    // 🔹 считаем ОБЩЕЕ количество иероглифов
    const totalChars = keys.reduce((sum, key) => {
      return sum + (index[key]?.length || 0);
    }, 0);

    html += `<h1 class="homo-letter-section">
               ${groupName} (${totalChars})
             </h1>`;

    for (const key of keys) {
      html += `
        <div class="homo-row">
          <div class="homo-key">${key}</div>
          <div class="homo-values">
            ${index[key].map(v => `
              <span class="homo-val" onclick="speak('${v.hanzi}')">
                ${renderDualHanzi(renderToneColoredHanzi(v.hanzi), renderToneColoredHanzi(v.hanzi_traditional || v.hanzi))} &nbsp;(${v.pinyin})
              </span>
            `).join("")}
          </div>
        </div>
      `;
    }
  }

  return html;
}

function collapseAllHomoGroups() {
  const headers = document.querySelectorAll(".homo-letter-section");

  headers.forEach(header => {
    header.classList.add("collapsed");

    let next = header.nextElementSibling;

    while (next && !next.classList.contains("homo-letter-section")) {
      if (next.classList.contains("homo-row")) {
        next.style.display = "none";
      }
      next = next.nextElementSibling;
    }
  });
}

function expandAllHomoGroups() {
  const headers = document.querySelectorAll(".homo-letter-section");

  headers.forEach(header => {
    header.classList.remove("collapsed");

    let next = header.nextElementSibling;

    while (next && !next.classList.contains("homo-letter-section")) {
      if (next.classList.contains("homo-row")) {
        next.style.display = "flex";
      }
      next = next.nextElementSibling;
    }
  });
}
function renderSrsMonth() {
  const history = getProgress().srsHistory || {};
  const now = new Date();

  const year = now.getFullYear();
  const month = now.getMonth(); // текущий

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay() || 7;

  let html = `<h1>SRS Calendar</h1><div class="calendar-grid">`;

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

function normalizePinyin(pinyin) {
  return pinyin
    .toLowerCase()
    .replace(/[āáǎà]/g, "a")
    .replace(/[ēéěè]/g, "e")
    .replace(/[īíǐì]/g, "i")
    .replace(/[ōóǒò]/g, "o")
    .replace(/[ūúǔù]/g, "u")
    .replace(/[ǖǘǚǜü]/g, "u")
    .replace(/\d/g, ""); // если вдруг цифры
}

function splitHanziAndPinyin(hanzi, pinyin) {
  const chars = [...hanzi];
  if (!pinyin) return [];

  // 1️⃣ если один иероглиф — вообще не парсим
  if (chars.length === 1) {
    return [{ hanzi, pinyin }];
  }

  // 2️⃣ нормальный случай: пробелы есть
  const spaced = pinyin.trim().split(/\s+/);
  if (spaced.length === chars.length) {
    return chars.map((h, i) => ({
      hanzi: h,
      pinyin: spaced[i]
    }));
  }

  // 3️⃣ fallback: НЕ ЗНАЕМ как делить xuéxí
  // → возвращаем иероглифы без пиньиня
  return chars.map(h => ({
    hanzi: h,
    pinyin: null
  }));
}


function buildHomophoneIndex() {
  const learned = getAllLearnedCharsWithIgnored();
  const index = {};

  learned.forEach(entry => {
    const parts = splitHanziAndPinyin(entry.hanzi, entry.pinyin);

    parts.forEach(({ hanzi, pinyin }, i) => {
      const key = normalizePinyin(pinyin);

      if (!index[key]) {
        index[key] = [];
      }

      if (!index[key].some(e => e.hanzi === hanzi)) {
        index[key].push({
          hanzi,
          hanzi_traditional:
            [...(entry.hanzi_traditional || entry.hanzi)][i] || hanzi,
          pinyin
        });
      }
    });
  });

  return index;
}

let HOMOPHONES_INDEX = null;

function getHomophonesIndex() {
  if (!HOMOPHONES_INDEX) {
    HOMOPHONES_INDEX = buildHomophoneIndex();
  }
  return HOMOPHONES_INDEX;
}
function getKnownHomophones(hanzi, pinyin) {
  const index = getHomophonesIndex();
  const parts = splitHanziAndPinyin(hanzi, pinyin);
  const inputChars = new Set([...hanzi]);
  const result = [];
  const seen = new Set();

  parts.forEach(({ pinyin: py }) => {
    if (!py) return;

    const key = normalizePinyin(py);
    const list = index[key] || [];

    list.forEach(e => {
      if (inputChars.has(e.hanzi)) return;
      if (seen.has(e.hanzi)) return;

      seen.add(e.hanzi);
      result.push(e);
    });
  });

  return result;
}

GROUP_EQUIVALENT = {
  t: 'q',
  j: 'q',
  q: 'q'
}
function normalizeForSort(word) {
  const first = word[0].toLowerCase()

  if (['t', 'j', 'q'].includes(first)) {
    return 'q' + word.slice(1)
  }

  return word
}

function useToneColors() {
  return localStorage.getItem("useToneColors") === "true";
}
function useTraditional() {
  return localStorage.getItem("useTraditional") === "true";
}

function toggleToneColors() {
  const current =
    localStorage.getItem("useToneColors") !== "false";

  const next = !current;

  localStorage.setItem(
    "useToneColors",
    String(next)
  );

  const btn = document.querySelector(".tone-toggle");

  if (btn) {
    btn.classList.toggle(
      "grayscale-ui",
      !next
    );
  }

  repaintToneColors();
}
function detectTone(pinyin) {
  if (!pinyin) return 5;

  if (/[āēīōūǖ]/.test(pinyin)) return 1;
  if (/[áéíóúǘ]/.test(pinyin)) return 2;
  if (/[ǎěǐǒǔǚ]/.test(pinyin)) return 3;
  if (/[àèìòùǜ]/.test(pinyin)) return 4;

  return 5;
}

function renderToneColoredHanzi(hanzi) {
  return [...hanzi].map(char => {
    const pinyin = getCharPinyin(char);
    const tone = detectTone(pinyin);

    return `
      <span
        class="tone-char ${useToneColors() ? `tone-${tone}` : ""}"
        data-hanzi="${char}"
      >
        ${char}
      </span>
    `;
  }).join("");
}
function repaintToneColors() {
  const enabled = useToneColors();

  const classes = [
    "tone-1",
    "tone-2",
    "tone-3",
    "tone-4",
    "tone-5"
  ];

  document.querySelectorAll(".tone-char").forEach(el => {
    const char = el.dataset.hanzi;

    el.classList.remove(...classes);

    if (!enabled) return;

    const pinyin = getCharPinyin(char);
    const tone = detectTone(pinyin);

    el.classList.add(`tone-${tone}`);
  });

  document.querySelectorAll(".pinyin-tone").forEach(el => {
    const tone = el.dataset.tone;

    el.classList.remove(...classes);

    if (!enabled) return;

    el.classList.add(`tone-${tone}`);
  });
}
function toggleExamplesList() {
  closeAllPanels();
  const examplesList = document.getElementById("examples-list");

  if (!examplesList.innerHTML) {
    examplesList.innerHTML = renderExamplesList();
  }

  const isOpening = examplesList.style.display === "none";

  examplesList.style.display = isOpening ? "block" : "none";

  const path = document.getElementById("path");
  const customs = document.getElementById("custom-hanzi-list");
  const homo = document.getElementById("homo-list");

  if (path) path.style.display = isOpening ? "none" : "block";
  if (customs) customs.style.display = isOpening ? "none" : "block";
  if (homo) homo.style.display = "none";
}

function renderExamplesList() {
  const chars = getAllLearnedCharsWithIgnored();

  return chars
    .filter(c => c.example_hanzi)
    .map((c, index) => `
      <div class="example-row">
        <div class="example-header" onclick="toggleExampleDetails(${index})">
          <div
            class="example-hanzi"
            onclick="event.stopPropagation(); speak('${c.example_hanzi}')"
          >
            ${renderDualHanzi(renderToneColoredHanzi(с.example_hanzi), renderToneColoredHanzi(с.example_hanzi_traditional || с.example_hanzi))}
          </div>

          <div class="example-arrow" id="example-arrow-${index}">
            ◀
          </div>

        </div>

        <div class="example-details" id="example-details-${index}">
          <div class="example-pl">
            ${c.example_pl || c.example_ru || ""}
          </div>
        </div>
      </div>
    `)
    .join("");
}

function toggleExampleDetails(index) {
  const details = document.getElementById(`example-details-${index}`);
  const arrow = document.getElementById(`example-arrow-${index}`);

  const isOpen = details.classList.contains("open");

  details.classList.toggle("open");

  arrow.textContent = isOpen ? "◀" : "▼";
}

function renderToneColoredPinyin(hanzi, pinyin) {
  const chars = [...hanzi];
  const pinyinParts = pinyin.trim().split(/\s+/);

  return pinyinParts.map((part, index) => {
    const char = chars[index];

    const dbPinyin =
      getCharPinyin(char) || part;

    const tone = detectTone(dbPinyin);

    return `
      <span
        class="pinyin-tone ${useToneColors() ? `tone-${tone}` : ""}"
        data-tone="${tone}"
      >
        ${part}
      </span>
    `;
  }).join(" ");
}

function toggleGeneratedList() {
  closeAllPanels();
  const panel = document.getElementById("generated-list");

  if (!panel.innerHTML) {
    panel.innerHTML = renderGeneratedList();
  }

  const isOpening = panel.style.display === "none";

  panel.style.display = isOpening ? "block" : "none";

  const path = document.getElementById("path");
  const customs = document.getElementById("custom-hanzi-list");
  const homo = document.getElementById("homo-list");
  const examples = document.getElementById("examples-list");

  if (path) path.style.display = isOpening ? "none" : "block";
  if (customs) customs.style.display = isOpening ? "none" : "block";

  if (homo) homo.style.display = "none";
  if (examples) examples.style.display = "none";
  updateActiveBottomButtons();
}

function renderGeneratedList() {
  const story = getGeneratedStory();

  return `
    <button class="generate-btn" onclick="generateStory()">
      Generate
    </button>

    ${
      !story
        ? ""
        : `
          ${story.sentences.map((c, index) => `
            <div class="example-row">

              <div
                class="example-header"
                onclick="toggleExampleDetails(${index})"
              >

                <div
                  class="example-hanzi"
                  onclick="event.stopPropagation(); speak('${c.hanzi}')"
                >
                  ${renderDualSentence(c.hanzi, c.hanzi_traditional || c.hanzi)}
                </div>

                <div
                  class="example-arrow"
                  id="example-arrow-${index}"
                >
                  ◀
                </div>

              </div>

              <div
                class="example-details"
                id="example-details-${index}"
              >
                <div class="example-pl">
                  ${c.polish_translation || ""}
                </div>

              </div>

            </div>
          `).join("")}
        `
    }
  `;
}
function updateActiveBottomButtons() {
  return
  const hash = location.hash || "#";

  const buttons = [
    ".home-toggle",
    "#srs-btn",
    ".generated-toggle",
    ".components-toggle",
    ".phonetics-toggle",
    ".dev-toggle",
    ".homo-toggle"
  ];

  // reset all
  buttons.forEach(selector => {
    const el = document.querySelector(selector);

    if (el) {
      el.style.border = "";
    }
  });

  const generatedVisible =
    document.getElementById("generated-list")?.style.display === "block";

  const componentsVisible =
    document.getElementById("components-list")?.style.display === "block";

  const phoneticsVisible =
    document.getElementById("phonetics-list")?.style.display === "block";

  const notebooksVisible =
    document.getElementById("notebook-list")?.style.display === "block";

  const devVisible =
    document.getElementById("restore-panel")?.style.display === "block";

  const homoVisible =
    document.getElementById("homo-list")?.style.display === "block";

  const hasOverlayOpen =
    generatedVisible ||
    componentsVisible ||
    phoneticsVisible ||
    notebooksVisible ||
    devVisible ||
    homoVisible;

  // HOME
  if ((hash === "#" || !hash) && !hasOverlayOpen) {
    document.querySelector(".home-toggle")?.style.setProperty(
      "border",
      "1px solid gold",
      "important"
    );
  }

  // SRS
  if (hash.startsWith("#/srs")) {
    document.querySelector("#srs-btn")?.style.setProperty(
      "border",
      "1px solid gold",
      "important"
    );
  }

  // GENERATED
  if (generatedVisible) {
    document.querySelector(".generated-toggle")?.style.setProperty(
      "border",
      "1px solid gold",
      "important"
    );
  }

  // COMPONENTS
  if (componentsVisible) {
    document.querySelector(".components-toggle")?.style.setProperty(
      "border",
      "1px solid gold",
      "important"
    );
  }

  // PHONETICS
  if (phoneticsVisible) {
    document.querySelector(".phonetics-toggle")?.style.setProperty(
      "border",
      "1px solid gold",
      "important"
    );
  }

  // DEV
  if (devVisible) {
    document.querySelector(".dev-toggle")?.style.setProperty(
      "border",
      "1px solid gold",
      "important"
    );
  }

  // HOMO
  if (homoVisible) {
    document.querySelector(".homo-toggle")?.style.setProperty(
      "border",
      "1px solid gold",
      "important"
    );
  }
}
function revealNotebookTranslation(el) {
  if (!el) return;

  clearTimeout(el._hideTimer);

  el.classList.add("revealed");

  el._hideTimer = setTimeout(() => {
    el.classList.remove("revealed");
  }, 2000);
}
function getDefaultGeneratedStory() {
  return {
    title: "我的一天",
    sentences: [
      {
        hanzi: "今天我很开心。",
        hanzi_traditional: "今天我很開心。",
        pinying: "jīntiān wǒ hěn kāixīn.",
        polish_translation: "Dzisiaj jestem bardzo szczęśliwy."
      },
      {
        hanzi: "我学习中文。",
        hanzi_traditional: "我學習中文。",
        pinying: "wǒ xuéxí zhōngwén.",
        polish_translation: "Uczę się chińskiego."
      },
      {
        hanzi: "晚上我喝茶。",
        hanzi_traditional: "晚上我喝茶。",
        pinying: "wǎnshang wǒ hē chá.",
        polish_translation: "Wieczorem piję herbatę."
      }
    ]
  };
}
(async function init() {
  await Promise.all([
    loadHSK(),
    loadPinyinDb(),
    loadComponentsDb(),
    loadPhoneticsDb()
  ]);

  if (false) {
    const existingCustoms = getCustomChars();

    if (existingCustoms.length === 0) {
      restoreProgressToLevel(20)
      saveCustomChars([
        {
          id: 100001,
          custom: true,
          hsk: 1,
          hanzi: "妈",
          pinyin: "mā",
          translations: ["mom"],
          ru_translations: ["мама"],
          pl_translations: ["mama"]
        },
        {
          id: 100002,
          custom: true,
          hsk: 1,
          hanzi: "麻",
          pinyin: "má",
          translations: ["hemp"],
          ru_translations: ["конопля"],
          pl_translations: ["konopie"]
        },
        {
          id: 100003,
          custom: true,
          hsk: 1,
          hanzi: "马",
          pinyin: "mǎ",
          translations: ["horse"],
          ru_translations: ["лошадь"],
          pl_translations: ["koń"]
        },
        {
          id: 100004,
          custom: true,
          hsk: 1,
          hanzi: "骂",
          pinyin: "mà",
          translations: ["scold"],
          ru_translations: ["ругать"],
          pl_translations: ["besztać"]
        },
        {
          id: 100005,
          custom: true,
          hsk: 1,
          hanzi: "吗",
          pinyin: "ma",
          translations: ["question particle"],
          ru_translations: ["частица"],
          pl_translations: ["partykuła"]
        },

        {
          id: 100006,
          custom: true,
          hsk: 1,
          hanzi: "天",
          pinyin: "tiān",
          translations: ["sky"],
          ru_translations: ["небо"],
          pl_translations: ["niebo"]
        },
        {
          id: 100007,
          custom: true,
          hsk: 1,
          hanzi: "田",
          pinyin: "tián",
          translations: ["field"],
          ru_translations: ["поле"],
          pl_translations: ["pole"]
        },
        {
          id: 100008,
          custom: true,
          hsk: 1,
          hanzi: "舔",
          pinyin: "tiǎn",
          translations: ["lick"],
          ru_translations: ["лизать"],
          pl_translations: ["lizać"]
        },
        {
          id: 100009,
          custom: true,
          hsk: 1,
          hanzi: "跳",
          pinyin: "tiào",
          translations: ["jump"],
          ru_translations: ["прыгать"],
          pl_translations: ["skakać"]
        },
        {
          id: 100010,
          custom: true,
          hsk: 1,
          hanzi: "的",
          pinyin: "de",
          translations: ["possessive particle"],
          ru_translations: ["частица"],
          pl_translations: ["partykuła"]
        },

        {
          id: 100011,
          custom: true,
          hsk: 1,
          hanzi: "东",
          pinyin: "dōng",
          translations: ["east"],
          ru_translations: ["восток"],
          pl_translations: ["wschód"]
        },
        {
          id: 100012,
          custom: true,
          hsk: 1,
          hanzi: "懂",
          pinyin: "dǒng",
          translations: ["understand"],
          ru_translations: ["понимать"],
          pl_translations: ["rozumieć"]
        },
        {
          id: 100013,
          custom: true,
          hsk: 1,
          hanzi: "动",
          pinyin: "dòng",
          translations: ["move"],
          ru_translations: ["двигаться"],
          pl_translations: ["ruszać się"]
        },
        {
          id: 100014,
          custom: true,
          hsk: 1,
          hanzi: "都",
          pinyin: "dōu",
          translations: ["all"],
          ru_translations: ["все"],
          pl_translations: ["wszyscy"]
        },
        {
          id: 100015,
          custom: true,
          hsk: 1,
          hanzi: "读",
          pinyin: "dú",
          translations: ["read"],
          ru_translations: ["читать"],
          pl_translations: ["czytać"]
        },

        {
          id: 100016,
          custom: true,
          hsk: 1,
          hanzi: "花",
          pinyin: "huā",
          translations: ["flower"],
          ru_translations: ["цветок"],
          pl_translations: ["kwiat"]
        },
        {
          id: 100017,
          custom: true,
          hsk: 1,
          hanzi: "滑",
          pinyin: "huá",
          translations: ["slippery"],
          ru_translations: ["скользкий"],
          pl_translations: ["ślizgi"]
        },
        {
          id: 100018,
          custom: true,
          hsk: 1,
          hanzi: "话",
          pinyin: "huà",
          translations: ["speech"],
          ru_translations: ["речь"],
          pl_translations: ["mowa"]
        },
        {
          id: 100019,
          custom: true,
          hsk: 1,
          hanzi: "火",
          pinyin: "huǒ",
          translations: ["fire"],
          ru_translations: ["огонь"],
          pl_translations: ["ogień"]
        },
        {
          id: 100020,
          custom: true,
          hsk: 1,
          hanzi: "灰",
          pinyin: "huī",
          translations: ["gray"],
          ru_translations: ["серый"],
          pl_translations: ["szary"]
        }
      ]);

      saveCustomWords([
        {
          hanzi: "你好",
          hanzi_traditional: "你好",
          translation_pl: "cześć"
        },
        {
          hanzi: "谢谢",
          hanzi_traditional: "謝謝",
          translation_pl: "dziękuję"
        },
        {
          hanzi: "没关系",
          hanzi_traditional: "沒關係",
          translation_pl: "nie ma problemu"
        },
        {
          hanzi: "可以",
          hanzi_traditional: "可以",
          translation_pl: "można"
        },
        {
          hanzi: "喜欢",
          hanzi_traditional: "喜歡",
          translation_pl: "lubić"
        },
        {
          hanzi: "今天",
          hanzi_traditional: "今天",
          translation_pl: "dzisiaj"
        },
        {
          hanzi: "明天",
          hanzi_traditional: "明天",
          translation_pl: "jutro"
        },
        {
          hanzi: "中国人",
          hanzi_traditional: "中國人",
          translation_pl: "Chińczyk"
        }
      ]);

      saveGeneratedStory(getDefaultGeneratedStory())
    }
  }
  router();
  updateActiveBottomButtons();

  document.addEventListener("click", function (e) {
    const header = e.target.closest(".homo-letter-section");
    if (!header) return;

    let next = header.nextElementSibling;
    const shouldHide = !header.classList.contains("collapsed");

    header.classList.toggle("collapsed");

    while (next && !next.classList.contains("homo-letter-section")) {
      if (next.classList.contains("homo-row")) {
        next.style.display = shouldHide ? "none" : "flex";
      }
      next = next.nextElementSibling;
    }
  });

})();
