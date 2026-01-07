/* prep.js — Welsh Preposition Trainer (CSV-powered)
   - Uses shared styles.css + navbar.html/navbar.js
   - Loads CSV from data/prep.csv (with safe fallbacks for GH Pages)
   - Easy mode: multiple choice
   - Hard mode: type the missing Welsh chunk (e.g. "arna i")
   - Includes the same red “?” popover UI (base-info-btn/base-info-popover) but for the full English sentence
*/

/* ========= Small utils ========= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(s) {
  return (s == null ? "" : String(s)).replace(/[&<>"]/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"
  }[ch]));
}

function normalize(s) {
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/’/g, "'")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function saveLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
function loadLS(k, d) {
  try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : d; }
  catch { return d; }
}

/* ========= Shared language key (matches navbar.js) ========= */
function wmGetLang() {
  const raw = localStorage.getItem("wm_lang");
  if (!raw) return "en";
  try {
    const v = JSON.parse(raw);
    return (v === "cy" || v === "en") ? v : "en";
  } catch {
    return (raw === "cy" || raw === "en") ? raw : "en";
  }
}

/* ========= Labels ========= */
const LABEL = {
  en: {
    instruction: "Choose the missing Welsh preposition to match the English meaning.",
    filters: "Filters",
    topic: "Topic",
    level: "Level",
    reset: "Reset",
    next: "Next",
    check: "Check",
    hint: "Hint",
    reveal: "Reveal",
    session: "Session",
    score: "Score",
    streak: "Streak",
    done: "Done",
    loading: "Loading CSV…",
    loaded: (n, src) => `Loaded ${n} items from ${src}`,
    noItems: "No items match your filters.",
    needAnswer: "Type an answer (Hard) or pick an option (Easy).",
    correct: "Correct!",
    notQuite: "Not quite",
    revealed: "Revealed",
    youChose: "You chose",
    answer: "Answer",
    hear: "Hear",
    meaningAria: "Meaning",
    all: "All",
  },
  cy: {
    instruction: "Dewisa’r arddodiad Cymraeg coll i gyd-fynd â’r ystyr Saesneg.",
    filters: "Hidiau",
    topic: "Pwnc",
    level: "Lefel",
    reset: "Ailosod",
    next: "Nesaf",
    check: "Gwirio",
    hint: "Awgrym",
    reveal: "Datgelu",
    session: "Sesiwn",
    score: "Sgôr",
    streak: "Rhediad",
    done: "Wedi gwneud",
    loading: "Yn llwytho CSV…",
    loaded: (n, src) => `Wedi llwytho ${n} eitem o ${src}`,
    noItems: "Does dim eitemau’n cyfateb i’r hidlwyr.",
    needAnswer: "Teipia ateb (Anodd) neu dewis opsiwn (Hawdd).",
    correct: "Cywir!",
    notQuite: "Dim yn hollol gywir",
    revealed: "Wedi datgelu",
    youChose: "Dewisaist ti",
    answer: "Ateb",
    hear: "Gwrando",
    meaningAria: "Ystyr",
    all: "Pob un",
  }
};

function L(key) {
  const lang = state.lang || "en";
  return (LABEL[lang] && LABEL[lang][key]) || (LABEL.en[key] || key);
}

/* ========= CSV loading =========
   IMPORTANT: On GH Pages project sites, "/data/prep.csv" points to the domain root (wrong).
   So we try a few safe candidates.
*/
const CSV_CANDIDATES = [
  "./data/prep.csv",
  "data/prep.csv",
  "/welsh-mutation-trainer/data/prep.csv",
  "/data/prep.csv",
  "https://katyjohannab.github.io/welsh-mutation-trainer/data/prep.csv",
];

function getVal(row, names) {
  const r = row || {};
  const keys = Object.keys(r);
  for (const k of keys) {
    const lk = k.trim().toLowerCase();
    if (names.some(n => lk === n.trim().toLowerCase())) {
      return (r[k] ?? "").toString().trim();
    }
  }
  return "";
}

function coerceRow(row, idx) {
  const id =
    getVal(row, ["id", "item_id", "itemid", "cardid", "card_id"]) ||
    `row_${idx + 1}`;

  const levelRaw = getVal(row, ["level", "lvl"]);
  const level = levelRaw ? Number(levelRaw) : "";

  const topic = getVal(row, ["topic", "category"]);

  const en = getVal(row, ["en_sentence", "english", "en", "prompt_en", "meaning_en"]);
  const cyBefore = getVal(row, ["cy_before", "welsh_before", "before_cy", "cybefore", "before"]);
  const cyAfter  = getVal(row, ["cy_after", "welsh_after", "after_cy", "cyafter", "after"]);
  const answer   = getVal(row, ["answer", "cy_answer", "missing", "target"]);

  const hintEn = getVal(row, ["hint_en", "hint", "clue_en"]);
  const hintCy = getVal(row, ["hint_cy", "clue_cy"]);

  const whyEn  = getVal(row, ["why_en", "why", "explain_en", "rule_en"]);
  const whyCy  = getVal(row, ["why_cy", "explain_cy", "rule_cy"]);

  return {
    id,
    level: Number.isFinite(level) ? level : "",
    topic,
    en,
    cyBefore,
    cyAfter,
    answer,
    hintEn,
    hintCy,
    whyEn,
    whyCy,
  };
}

async function fetchText(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

async function loadCsv() {
  if (!window.Papa) throw new Error("PapaParse not available.");

  for (const url of CSV_CANDIDATES) {
    try {
      const text = await fetchText(url);
      const parsed = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
      });

      const rows = (parsed.data || []).filter(r => r && Object.keys(r).length);
      const items = rows.map((r, i) => coerceRow(r, i))
        .filter(it => (it.en && it.cyBefore != null && it.cyAfter != null && it.answer));

      if (items.length) return { items, source: url };
    } catch (e) {
      // try next candidate
    }
  }

  return { items: [], source: "" };
}

/* ========= Optional TTS (same Lambda URL as your mutation trainer) ========= */
const POLLY_FUNCTION_URL = "https://pl6xqfeht2hhbruzlhm3imcpya0upied.lambda-url.eu-west-2.on.aws/";
const ttsCache = new Map();

function buildWelshSentence(item) {
  const s = `${item.cyBefore || ""}${item.answer || ""}${item.cyAfter || ""}`;
  return s.replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
}

async function playPollySentence(sentence) {
  if (!sentence) throw new Error("No sentence to speak.");

  const cachedUrl = ttsCache.get(sentence);
  if (cachedUrl) {
    const audio = new Audio(cachedUrl);
    await audio.play();
    return;
  }

  const res = await fetch(POLLY_FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: sentence })
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `TTS failed (${res.status})`);
  }

  const ct = (res.headers.get("content-type") || "").toLowerCase();
  let url = null;

  if (ct.includes("audio") || ct.includes("octet-stream")) {
    const buf = await res.arrayBuffer();
    const blob = new Blob([buf], { type: "audio/mpeg" });
    url = URL.createObjectURL(blob);
  } else {
    const j = await res.json();
    if (j.url) url = j.url;
    else if (j.audioBase64 || j.audioContent) {
      const b64 = j.audioBase64 || j.audioContent;
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "audio/mpeg" });
      url = URL.createObjectURL(blob);
    } else {
      throw new Error("TTS response didn't include audio.");
    }
  }

  ttsCache.set(sentence, url);
  const audio = new Audio(url);
  await audio.play();
}

/* ========= “?” popover (reuses your CSS classes from styles.css) ========= */
let popoverWired = false;

function wireGlobalPopoverClosersOnce() {
  if (popoverWired) return;
  popoverWired = true;

  document.addEventListener("click", () => {
    $$(".base-info-popover").forEach(p => p.classList.add("hidden"));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") $$(".base-info-popover").forEach(p => p.classList.add("hidden"));
  });
}

function mountSentenceTranslationUI(anchorEl, englishSentence) {
  if (!anchorEl) return;
  if (!englishSentence) return;

  // clear any existing
  anchorEl.querySelectorAll(".base-info-btn, .base-info-popover").forEach(n => n.remove());

  // anchor absolute “?”
  anchorEl.style.position = "relative";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "base-info-btn";
  btn.textContent = "?";
  btn.setAttribute("aria-label", L("meaningAria"));
  btn.setAttribute("title", L("meaningAria"));

  const pop = document.createElement("div");
  pop.className = "base-info-popover hidden animate-pop";
  pop.setAttribute("role", "dialog");

  const close = document.createElement("button");
  close.type = "button";
  close.className = "base-info-close";
  close.setAttribute("aria-label", "Close");
  close.textContent = "×";

  pop.innerHTML = `<div class="base-info-meaning">${esc(englishSentence)}</div>`;
  pop.appendChild(close);

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = pop.classList.contains("hidden");
    $$(".base-info-popover").forEach(p => p.classList.add("hidden"));
    pop.classList.toggle("hidden", !isHidden ? true : false);
    if (isHidden) pop.classList.remove("hidden");
  });

  close.addEventListener("click", (e) => {
    e.stopPropagation();
    pop.classList.add("hidden");
  });

  pop.addEventListener("click", (e) => e.stopPropagation());

  anchorEl.appendChild(btn);
  anchorEl.appendChild(pop);

  wireGlobalPopoverClosersOnce();
}

/* ========= App state ========= */
const state = {
  items: [],
  filtered: [],
  used: new Set(),
  current: null,

  lang: wmGetLang(),
  mode: loadLS("wm_prep_mode_v1", "easy"), // "easy" | "hard"

  score: 0,
  streak: 0,
  done: 0,

  revealed: false,
  lastResult: null, // "correct" | "wrong" | "revealed"
  guess: "",

  filterTopic: "",
  filterLevel: "",
};

/* ========= DOM refs ========= */
const els = {
  // main
  promptCard: $("#promptCard"),
  enPrompt: $("#enPrompt"),
  cyBefore: $("#cyBefore"),
  cyAfter: $("#cyAfter"),
  answerBox: $("#answerBox"),

  btnModeEasy: $("#btnModeEasy"),
  btnModeHard: $("#btnModeHard"),
  btnNextTop: $("#btnNextTop"),

  btnCheck: $("#btnCheck"),
  btnHint: $("#btnHint"),
  btnReveal: $("#btnReveal"),

  hintBox: $("#hintBox"),
  hintTitle: $("#hintTitle"),
  hintText: $("#hintText"),

  choicesWrap: $("#choicesWrap"),
  choices: $("#choices"),

  feedback: $("#feedback"),
  loadStatus: $("#loadStatus"),

  // filters
  fTopic: $("#fTopic"),
  fLevel: $("#fLevel"),
  btnReset: $("#btnReset"),

  // labels
  prepInstruction: $("#prepInstruction"),
  filtersTitle: $("#filtersTitle"),
  lblTopic: $("#lblTopic"),
  lblLevel: $("#lblLevel"),
  sessionTitle: $("#sessionTitle"),
  kScore: $("#kScore"),
  kStreak: $("#kStreak"),
  kDone: $("#kDone"),
  vScore: $("#vScore"),
  vStreak: $("#vStreak"),
  vDone: $("#vDone"),

  btnTop: $("#btnTop"),
};

function setMode(next) {
  state.mode = (next === "hard") ? "hard" : "easy";
  saveLS("wm_prep_mode_v1", state.mode);

  const easyOn = state.mode === "easy";
  els.btnModeEasy.classList.toggle("is-on", easyOn);
  els.btnModeHard.classList.toggle("is-on", !easyOn);
  els.btnModeEasy.setAttribute("aria-pressed", easyOn ? "true" : "false");
  els.btnModeHard.setAttribute("aria-pressed", !easyOn ? "true" : "false");

  // In easy mode: answerBox is filled by clicking; keep it readonly to avoid confusion
  els.answerBox.readOnly = easyOn;
  els.answerBox.placeholder = L("answer");

  renderQuestion();
}

function updateStats() {
  els.vScore.textContent = String(state.score);
  els.vStreak.textContent = String(state.streak);
  els.vDone.textContent = String(state.done);
}

function applyLanguageToUI() {
  state.lang = wmGetLang();

  els.prepInstruction.textContent = L("instruction");
  els.filtersTitle.textContent = L("filters");
  els.lblTopic.textContent = L("topic");
  els.lblLevel.textContent = L("level");
  els.btnReset.textContent = L("reset");

  els.btnNextTop.textContent = L("next");
  els.btnCheck.textContent = L("check");
  els.btnHint.textContent = L("hint");
  els.btnReveal.textContent = L("reveal");

  els.sessionTitle.textContent = L("session");
  els.kScore.textContent = L("score");
  els.kStreak.textContent = L("streak");
  els.kDone.textContent = L("done");

  // Rebuild filter option labels (keep selected values)
  buildFilters();

  // re-render question text + popover aria labels
  renderQuestion();

  // footer
  if (els.btnTop) els.btnTop.textContent = (state.lang === "cy" ? "Yn ôl i’r brig" : "Back to top");
}

function uniq(arr) {
  return Array.from(new Set(arr.filter(v => v !== "" && v != null)));
}

function buildFilters() {
  // preserve current selections
  const topicVal = els.fTopic.value || state.filterTopic || "";
  const levelVal = els.fLevel.value || state.filterLevel || "";

  const topics = uniq(state.items.map(it => (it.topic || "").trim())).sort((a,b) => a.localeCompare(b));
  const levels = uniq(state.items.map(it => it.level)).sort((a,b) => (a || 0) - (b || 0));

  // topic
  els.fTopic.innerHTML = "";
  {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = L("all");
    els.fTopic.appendChild(opt);
    for (const t of topics) {
      const o = document.createElement("option");
      o.value = t;
      o.textContent = t;
      els.fTopic.appendChild(o);
    }
  }

  // level
  els.fLevel.innerHTML = "";
  {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = L("all");
    els.fLevel.appendChild(opt);
    for (const lv of levels) {
      const o = document.createElement("option");
      o.value = String(lv);
      o.textContent = String(lv);
      els.fLevel.appendChild(o);
    }
  }

  // restore selection
  els.fTopic.value = topics.includes(topicVal) ? topicVal : "";
  els.fLevel.value = levels.map(String).includes(levelVal) ? levelVal : "";

  state.filterTopic = els.fTopic.value;
  state.filterLevel = els.fLevel.value;

  applyFilters();
}

function applyFilters() {
  const topic = (els.fTopic.value || "").trim();
  const level = (els.fLevel.value || "").trim();

  state.filtered = state.items.filter(it => {
    if (topic && (it.topic || "").trim() !== topic) return false;
    if (level && String(it.level) !== level) return false;
    return true;
  });
}

function pickNext() {
  const pool = state.filtered || [];
  if (!pool.length) return null;

  const unused = pool.filter(it => !state.used.has(it.id));
  const list = unused.length ? unused : pool;
  if (!unused.length) state.used.clear();

  const item = list[Math.floor(Math.random() * list.length)];
  state.used.add(item.id);
  return item;
}

function buildChoices(item) {
  const correct = (item.answer || "").trim();
  const answers = uniq(state.filtered.map(it => (it.answer || "").trim()).filter(a => a && a !== correct));

  // pick 3 distractors from other answers
  const picks = [];
  const shuffled = answers.slice().sort(() => Math.random() - 0.5);
  for (const a of shuffled) {
    if (picks.length >= 3) break;
    picks.push(a);
  }

  const list = uniq([correct, ...picks]);

  // if dataset is tiny, pad with a few common preps
  const common = ["i", "at", "o", "ar", "yn", "yng", "gyda", "â", "heb", "wrth", "dros", "drwy", "o flaen", "ar ôl"];
  for (const c of common) {
    if (list.length >= 4) break;
    if (!list.includes(c) && c !== correct) list.push(c);
  }

  // guarantee 4
  while (list.length < 4) list.push(correct);

  // shuffle
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }

  return list.slice(0, 4);
}

function renderChoices(item) {
  const show = state.mode === "easy" && !state.revealed;
  els.choicesWrap.classList.toggle("hidden", !show);
  els.choices.innerHTML = "";
  if (!show) return;

  const options = buildChoices(item);
  options.forEach((opt, idx) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `btn ${normalize(state.guess) === normalize(opt) ? "btn-primary" : "btn-ghost"}`;
    b.textContent = opt;

    b.addEventListener("click", () => {
      state.guess = opt;
      els.answerBox.value = opt;
      // re-render to highlight selection
      renderChoices(item);
      els.answerBox.blur();
    });

    // data-index for keyboard 1-4
    b.dataset.idx = String(idx + 1);

    els.choices.appendChild(b);
  });
}

function clearFeedback() {
  els.feedback.classList.add("hidden");
  els.feedback.innerHTML = "";
  els.hintBox.classList.add("hidden");
  els.hintText.textContent = "";
}

function renderQuestion() {
  const item = state.current;

  // mode button states (ensure CSS "is-on")
  const easyOn = state.mode === "easy";
  els.btnModeEasy.classList.toggle("is-on", easyOn);
  els.btnModeHard.classList.toggle("is-on", !easyOn);
  els.btnModeEasy.setAttribute("aria-pressed", easyOn ? "true" : "false");
  els.btnModeHard.setAttribute("aria-pressed", !easyOn ? "true" : "false");
  els.answerBox.readOnly = easyOn;

  if (!item) {
    els.enPrompt.textContent = state.items.length ? L("noItems") : L("loading");
    els.cyBefore.textContent = "";
    els.cyAfter.textContent = "";
    els.answerBox.value = "";
    els.answerBox.disabled = true;
    els.choicesWrap.classList.add("hidden");
    clearFeedback();
    return;
  }

  els.answerBox.disabled = state.revealed;
  els.answerBox.classList.toggle("opacity-70", state.revealed);
  els.answerBox.classList.toggle("cursor-not-allowed", state.revealed);

  els.enPrompt.textContent = item.en || "—";
  mountSentenceTranslationUI(els.promptCard, item.en || "");

  els.cyBefore.textContent = item.cyBefore || "";
  els.cyAfter.textContent = item.cyAfter || "";

  if (!state.revealed) {
    els.answerBox.value = state.guess || "";
    if (state.mode === "hard") {
      // allow typing
      els.answerBox.readOnly = false;
      setTimeout(() => els.answerBox.focus({ preventScroll: true }), 0);
    }
  }

  renderChoices(item);
}

function showHint() {
  const item = state.current;
  if (!item) return;

  const txt = (state.lang === "cy")
    ? (item.hintCy || item.hintEn || "")
    : (item.hintEn || item.hintCy || "");

  const fallback = (() => {
    const a = (item.answer || "").trim();
    if (!a) return "";
    return (state.lang === "cy")
      ? `Mae’r ateb yn dechrau gyda: “${a.slice(0, 1)}…”`
      : `Answer starts with: “${a.slice(0, 1)}…”`;
  })();

  els.hintTitle.textContent = L("hint");
  els.hintText.textContent = txt || fallback || "";
  els.hintBox.classList.remove("hidden");
}

function showFeedback({ status, ok, item }) {
  const statusIcon = ok ? "✅" : (status === "revealed" ? "👀" : "❌");
  const statusText = ok ? L("correct") : (status === "revealed" ? L("revealed") : L("notQuite"));
  const statusColor = ok ? "text-indigo-900" : (status === "revealed" ? "text-slate-900" : "text-rose-900");

  const fullCy = `${esc(item.cyBefore || "")}<span class="font-semibold bg-indigo-100 text-indigo-900 px-1 rounded">${esc(item.answer || "")}</span>${esc(item.cyAfter || "")}`;
  const why = (state.lang === "cy") ? (item.whyCy || item.whyEn || "") : (item.whyEn || item.whyCy || "");

  els.feedback.classList.remove("hidden");
  els.feedback.innerHTML = `
    <div class="feedback-box">
      <div class="flex items-center gap-2 ${statusColor} text-2xl md:text-3xl font-semibold">
        ${statusIcon} ${esc(statusText)}
      </div>

      ${(!ok && state.guess)
        ? `<div class="mt-1 text-slate-700">${esc(L("youChose"))}: <b>${esc(state.guess)}</b></div>`
        : ""
      }

      <div class="mt-4 text-slate-800 text-xl md:text-2xl flex items-baseline flex-wrap gap-x-2 gap-y-2">
        ${fullCy}

        <button id="btnHear" class="btn-hear" type="button">
          <span class="icon" aria-hidden="true">▶︎</span>
          <span>${esc(L("hear"))}</span>
        </button>
      </div>

      ${why ? `<div class="mt-4 text-slate-700">${esc(why)}</div>` : ""}

      <div class="mt-4 flex justify-end">
        <button id="btnNextInline" class="btn btn-primary shadow" type="button">${esc(L("next"))}</button>
      </div>
    </div>
  `;

  // wire Hear + Next
  setTimeout(() => {
    $("#btnNextInline")?.addEventListener("click", () => nextQuestion());
    $("#btnNextInline")?.focus({ preventScroll: true });

    $("#btnHear")?.addEventListener("click", async () => {
      try {
        const sentence = buildWelshSentence(item);
        await playPollySentence(sentence);
      } catch (e) {
        alert("Couldn't play audio: " + (e?.message || e));
      }
    });
  }, 0);
}

function checkAnswer() {
  const item = state.current;
  if (!item || state.revealed) return;

  // source of guess
  if (state.mode === "hard") {
    state.guess = (els.answerBox.value || "").trim();
  }

  if (!state.guess) {
    els.loadStatus.textContent = L("needAnswer");
    return;
  }

  const ok = normalize(state.guess) === normalize(item.answer);

  state.done += 1;
  if (ok) {
    state.score += 1;
    state.streak += 1;
    state.lastResult = "correct";
  } else {
    state.streak = 0;
    state.lastResult = "wrong";
  }

  state.revealed = true;
  els.answerBox.value = item.answer; // show correct after checking (reduces ambiguity)
  els.answerBox.disabled = true;

  // disable choices
  $$("#choices button").forEach(b => b.disabled = true);

  updateStats();
  showFeedback({ status: ok ? "correct" : "wrong", ok, item });
}

function revealAnswer() {
  const item = state.current;
  if (!item || state.revealed) return;

  state.done += 1;
  state.streak = 0;
  state.lastResult = "revealed";
  state.revealed = true;

  state.guess = (els.answerBox.value || "").trim();
  els.answerBox.value = item.answer;
  els.answerBox.disabled = true;

  $$("#choices button").forEach(b => b.disabled = true);

  updateStats();
  showFeedback({ status: "revealed", ok: false, item });
}

function nextQuestion() {
  clearFeedback();
  els.loadStatus.textContent = "";

  applyFilters();
  const item = pickNext();

  state.current = item;
  state.revealed = false;
  state.lastResult = null;
  state.guess = "";

  // reset input
  els.answerBox.disabled = false;
  els.answerBox.value = "";
  els.answerBox.readOnly = (state.mode === "easy");

  renderQuestion();
}

function resetAll() {
  state.score = 0;
  state.streak = 0;
  state.done = 0;
  state.used.clear();
  updateStats();
  nextQuestion();
}

/* ========= Wiring ========= */
function wireUI() {
  els.btnModeEasy.addEventListener("click", () => setMode("easy"));
  els.btnModeHard.addEventListener("click", () => setMode("hard"));

  els.btnNextTop.addEventListener("click", () => nextQuestion());
  els.btnCheck.addEventListener("click", () => checkAnswer());
  els.btnHint.addEventListener("click", () => showHint());
  els.btnReveal.addEventListener("click", () => revealAnswer());

  els.btnReset.addEventListener("click", () => resetAll());

  els.fTopic.addEventListener("change", () => {
    state.used.clear();
    state.filterTopic = els.fTopic.value;
    nextQuestion();
  });
  els.fLevel.addEventListener("change", () => {
    state.used.clear();
    state.filterLevel = els.fLevel.value;
    nextQuestion();
  });

  els.btnTop?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  // React to navbar language toggle
  const langBtn = $("#btnLangToggle");
  langBtn?.addEventListener("click", () => setTimeout(applyLanguageToUI, 0));
  window.addEventListener("storage", (e) => {
    if (e.key === "wm_lang") applyLanguageToUI();
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (!state.current) return;

    const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : "";
    const inInput = (tag === "INPUT" || tag === "TEXTAREA");

    // Easy mode number keys (when not revealed)
    if (state.mode === "easy" && !state.revealed && !inInput) {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 4) {
        const btn = $(`#choices button[data-idx="${n}"]`);
        if (btn && !btn.disabled) btn.click();
      }
    }

    // Hint
    if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "h") {
      e.preventDefault();
      showHint();
      return;
    }

    // Enter = Check or Next
    if (e.key === "Enter") {
      // If typing in hard mode, allow Enter from the input
      if (!state.revealed) {
        e.preventDefault();
        checkAnswer();
      } else {
        const nextInline = $("#btnNextInline");
        if (nextInline) nextInline.click();
        else nextQuestion();
      }
    }
  });

  // In hard mode, keep guess synced
  els.answerBox.addEventListener("input", (e) => {
    if (state.mode === "hard" && !state.revealed) state.guess = e.target.value;
  });
}

/* ========= Boot ========= */
(async function boot() {
  // initial mode buttons styling expects "seg-btn is-on"
  // (styles.css uses .seg-btn.is-on)
  els.btnModeEasy.classList.add("seg-btn");
  els.btnModeHard.classList.add("seg-btn");

  setMode(state.mode);

  els.loadStatus.textContent = L("loading");

  wireUI();

  const { items, source } = await loadCsv();
  state.items = items;

  if (!items.length) {
    els.loadStatus.textContent = "Couldn't load any items. Put a CSV at data/prep.csv.";
    state.current = null;
    renderQuestion();
    return;
  }

  els.loadStatus.textContent = LABEL[state.lang || "en"].loaded(items.length, source);
  buildFilters();

  // Start
  updateStats();
  nextQuestion();

  // Ensure UI text matches current navbar language
  applyLanguageToUI();
})();
