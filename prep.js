/* =========================
   Welsh Preposition Trainer
   =========================

CSV (flexible headers; these are the ones this script looks for):
- English            (full English target sentence shown in the ? popover)
- Before             (Welsh text before the gap)
- After              (Welsh text after the gap)
- AnswerPrep         (base preposition for step 1)
- AnswerForm         (optional: full form for pronoun cases, e.g. "arna i")
- PronounKey         (optional: 1S, 2S, 3SM, 3SF, 1PL, 2PL, 3PL)
- Level              (optional number)
- Topic              (optional string)
- Mode               (optional: "prep" or "prep+pronoun")
- Why / WhyCym       (optional explanation)
- Hint / HintCym     (optional hint)

URL params:
- ?sheet=<CSV_URL>   load this CSV instead of default
- ?admin=1           show admin CSV loaders in Filters panel
*/

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function getParam(k) { return new URLSearchParams(location.search).get(k); }
function saveLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
function loadLS(k, d) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : d; } catch (_) { return d; } }

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
function esc(s) {
  return (s == null ? "" : String(s)).replace(/[&<>"]/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"
  }[ch]));
}

function getVal(row, names) {
  const keys = Object.keys(row || {});
  for (const key of keys) {
    const k = key.trim().toLowerCase();
    if (names.some(n => k === n.trim().toLowerCase())) {
      return (row[key] ?? "").toString().trim();
    }
  }
  return "";
}

function coerceRow(row) {
  const r = row || {};
  const levelRaw = getVal(r, ["Level","Lefel","lvl"]);
  const level = levelRaw ? Number(levelRaw) : null;

  const before = getVal(r, ["Before","WelshBefore","CymBefore","CYBefore","SentenceBefore"]);
  const after  = getVal(r, ["After","WelshAfter","CymAfter","CYAfter","SentenceAfter"]);

  const answerPrep = getVal(r, ["AnswerPrep","Prep","Preposition","Answer","Expected","TargetPrep"]);
  const answerForm = getVal(r, ["AnswerForm","Form","TargetForm","PronounForm","ExpectedForm"]);

  const pronKey = getVal(r, ["PronounKey","PronKey","Pronoun","PersonKey"]);
  const mode = getVal(r, ["Mode","Modd"]) || (answerForm ? "prep+pronoun" : "prep");

  return {
    Id: getVal(r, ["Id","ID","CardId","CardID"]) || "",
    English: getVal(r, ["English","EN","Translate","Translation","Meaning","SentenceEN"]),
    Before: before,
    After: after,
    AnswerPrep: answerPrep,
    AnswerForm: answerForm,
    PronounKey: pronKey,
    Level: Number.isFinite(level) ? level : null,
    Topic: getVal(r, ["Topic","Pwnc","Theme"]),
    Mode: mode,
    Why: getVal(r, ["Why","Explanation","Notes"]),
    WhyCym: getVal(r, ["WhyCym","Why-Cym","Why Cym","Esboniad"]),
    Hint: getVal(r, ["Hint","Clue"]),
    HintCym: getVal(r, ["HintCym","Hint-Cym","Awgrym"]),
  };
}

function buildWelshSentence(before, insert, after) {
  const b = (before || "").trimEnd();
  const i = (insert || "").trim();
  const a = (after || "").trimStart();
  let s = [b, i, a].filter(Boolean).join(" ");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/\s+([,.;:!?])/g, "$1");
  return s;
}

/* ========= TTS (Polly via Lambda URL) ========= */
const POLLY_FUNCTION_URL = "https://pl6xqfeht2hhbruzlhm3imcpya0upied.lambda-url.eu-west-2.on.aws/";
const ttsCache = new Map();

async function playPollySentence(sentence) {
  if (!sentence) throw new Error("No sentence to speak.");
  if (!POLLY_FUNCTION_URL) throw new Error("POLLY_FUNCTION_URL isn't set.");

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
      throw new Error("TTS response wasn't audio and didn't include url/audioBase64/audioContent.");
    }
  }

  ttsCache.set(sentence, url);
  const audio = new Audio(url);
  await audio.play();
}

/* ========= “?” popover (same classes/behaviour as mutation trainer) ========= */
function mountSentenceTranslationUI(anchorEl, englishSentence, uiLang) {
  if (!anchorEl) return;
  const meaning = (englishSentence || "").trim();
  if (!meaning) return;

  anchorEl.style.position = "relative";

  // remove any previous UI mounted on re-render
  anchorEl.querySelectorAll(":scope > .base-info-btn, :scope > .base-info-popover").forEach(n => n.remove());

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "base-info-btn";
  btn.textContent = "?";
  btn.setAttribute("aria-label", uiLang === "cy" ? "Ystyr (Saesneg)" : "Meaning (English)");
  btn.setAttribute("title", uiLang === "cy" ? "Ystyr (Saesneg)" : "Meaning (English)");

  const pop = document.createElement("div");
  pop.className = "base-info-popover hidden animate-pop";
  pop.setAttribute("role", "dialog");

  const close = document.createElement("button");
  close.type = "button";
  close.className = "base-info-close";
  close.setAttribute("aria-label", "Close");
  close.textContent = "×";

  pop.innerHTML = `
    <div class="base-info-meaning">${esc(meaning)}</div>
  `;
  pop.appendChild(close);

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = pop.classList.contains("hidden");
    $$(".base-info-popover").forEach(p => p.classList.add("hidden"));
    if (isHidden) pop.classList.remove("hidden");
    else pop.classList.add("hidden");
  });

  close.addEventListener("click", (e) => {
    e.stopPropagation();
    pop.classList.add("hidden");
  });

  pop.addEventListener("click", (e) => e.stopPropagation());

  anchorEl.appendChild(btn);
  anchorEl.appendChild(pop);
}

// Global close (single listener; no render leaks)
document.addEventListener("click", () => {
  $$(".base-info-popover").forEach(p => p.classList.add("hidden"));
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") $$(".base-info-popover").forEach(p => p.classList.add("hidden"));
});

/* ========= Labels (UI language only) ========= */
const LABEL = {
  en: {
    filters: "Filters",
    level: "Level",
    topic: "Topic",
    mode: "Mode",
    clear: "Clear",
    session: "Session",
    score: "Score",
    streak: "Streak",
    done: "Done",
    resetStats: "Reset stats",
    instruction: "Pick the Welsh preposition that matches the English meaning.",
    easy: "Easy",
    hard: "Hard",
    hint: "Hint",
    reveal: "Reveal",
    newQ: "New question",
    check: "Check",
    next: "Next",
    typePlaceholder: "Type the missing preposition…",
    step1: "Step 1 of 2: choose the preposition.",
    step2: "Step 2 of 2: choose the correct pronoun form.",
    correct: "Correct!",
    wrong: "Not quite",
    youTyped: "You typed",
    answer: "Answer",
    hear: "Hear",
    englishHidden: "Use ? to view the English sentence.",
    noItems: "No items match your filters."
  },
  cy: {
    filters: "Hidlwyr",
    level: "Lefel",
    topic: "Pwnc",
    mode: "Modd",
    clear: "Clirio",
    session: "Sesiwn",
    score: "Sgôr",
    streak: "Rhediad",
    done: "Wedi gwneud",
    resetStats: "Ailosod ystadegau",
    instruction: "Dewiswch yr arddodiad Cymraeg sy’n cyfateb i’r ystyr Saesneg.",
    easy: "Hawdd",
    hard: "Anodd",
    hint: "Awgrym",
    reveal: "Dangos",
    newQ: "Cwestiwn newydd",
    check: "Gwirio",
    next: "Nesaf",
    typePlaceholder: "Teipiwch y darn coll…",
    step1: "Cam 1 o 2: dewiswch yr arddodiad.",
    step2: "Cam 2 o 2: dewiswch y ffurf gyda rhagenw.",
    correct: "Cywir!",
    wrong: "Dim yn hollol gywir",
    youTyped: "Teipioch chi",
    answer: "Ateb",
    hear: "Gwrando",
    englishHidden: "Defnyddiwch ? i weld y frawddeg Saesneg.",
    noItems: "Does dim eitemau’n cyfateb i’ch hidlwyr."
  }
};

function t(key) {
  return (LABEL[state.uiLang] && LABEL[state.uiLang][key]) || (LABEL.en[key] || key);
}

/* ========= App state ========= */
const STATS_KEY = "prep_stats_v1";
const UILANG_KEY = "prep_ui_lang_v1";
const DIFF_KEY = "prep_difficulty_v1";

const state = {
  rows: [],
  filtered: [],
  used: new Set(),

  current: null,
  phase: "idle",          // idle | step1 | step2 | done
  revealed: false,
  lastResult: null,       // correct | wrong | revealed

  uiLang: loadLS(UILANG_KEY, "en"),
  difficulty: loadLS(DIFF_KEY, "easy"), // easy | hard

  filters: loadLS("prep_filters_v1", { level: "All", topic: "All", mode: "All" }),

  stats: loadLS(STATS_KEY, { score: 0, streak: 0, done: 0 }),
  admin: getParam("admin") === "1",
};

/* ========= CSV loading ========= */
async function loadCsvUrl(u) {
  return new Promise((resolve, reject) => {
    Papa.parse(u, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (res) => resolve(res.data),
      error: reject
    });
  });
}

async function tryFetchJson(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error("Failed: " + url);
  return r.json();
}

async function loadDefaultData() {
  // Prefer an index.json list if you want to merge multiple CSVs later
  // 1) data/prep/index.json  (array of csv paths)
  // 2) data/prep.csv
  const sheet = getParam("sheet");
  if (sheet) return loadCsvUrl(sheet);

  try {
    const list = await tryFetchJson("data/prep/index.json");
    if (Array.isArray(list) && list.length) {
      const root = new URL(".", location.href).toString();
      let merged = [];
      for (const p of list) {
        const url = /^https?:\/\//i.test(p) ? p : new URL(String(p).replace(/^\/+/, ""), root).toString();
        try {
          const d = await loadCsvUrl(url);
          merged = merged.concat(d);
        } catch (e) {
          console.warn("Failed to load CSV:", url, e);
        }
      }
      return merged;
    }
  } catch (_) {
    // ignore; fallback below
  }

  return loadCsvUrl("data/prep.csv");
}

/* ========= Filtering / picking ========= */
function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function applyFilters() {
  const f = state.filters || { level: "All", topic: "All", mode: "All" };
  const level = f.level || "All";
  const topic = f.topic || "All";
  const mode  = f.mode  || "All";

  let list = state.rows.slice();

  if (level !== "All") {
    const n = Number(level);
    list = list.filter(r => (r.Level ?? null) === n);
  }
  if (topic !== "All") {
    list = list.filter(r => (r.Topic || "") === topic);
  }
  if (mode !== "All") {
    list = list.filter(r => (r.Mode || "") === mode);
  }

  // Require basics
  list = list.filter(r => (r.Before || "").trim() && (r.After || "").trim() && (r.AnswerPrep || "").trim());

  state.filtered = list;
  $("#sampleCount").textContent = `Sample: ${state.filtered.length}`;
}

function pickNext() {
  const pool = state.filtered;
  if (!pool.length) return null;

  const usable = pool.filter(r => !state.used.has(r.Id || JSON.stringify(r)));
  const list = usable.length ? usable : pool;
  if (!usable.length) state.used.clear();

  const item = list[Math.floor(Math.random() * list.length)];
  state.used.add(item.Id || JSON.stringify(item));
  return item;
}

/* ========= Choice generation ========= */
function getAllPreps() {
  // Build distractors from your dataset (keeps it “on brand” with your content)
  const preps = uniq(state.rows.map(r => (r.AnswerPrep || "").trim()).filter(Boolean));
  // small safety fallback
  const fallback = ["i","at","ar","o","am","gan","gyda","â","heb","wrth","dros","dan","yn","yng"];
  const merged = uniq([...preps, ...fallback]);
  return merged;
}

function randSample(arr, n, excludeSet = new Set()) {
  const pool = arr.filter(x => !excludeSet.has(normalize(x)));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

function buildStep1Choices(item) {
  const correct = (item.AnswerPrep || "").trim();
  const all = getAllPreps();
  const ex = new Set([normalize(correct)]);
  const distractors = randSample(all, 3, ex);
  const choices = [correct, ...distractors].filter(Boolean);
  // shuffle
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return choices.slice(0, 4);
}

const INDEP_PRON = {
  "1S": "fi",
  "2S": "ti",
  "3SM": "fe",
  "3SF": "hi",
  "1PL": "ni",
  "2PL": "chi",
  "3PL": "nhw"
};

function buildStep2Choices(item) {
  const correct = (item.AnswerForm || "").trim();
  const choices = new Set([correct]);

  // a common “wrong” form: base prep + independent pronoun
  const pk = (item.PronounKey || "").trim();
  const wrong = pk && INDEP_PRON[pk] ? `${(item.AnswerPrep || "").trim()} ${INDEP_PRON[pk]}` : "";
  if (wrong && normalize(wrong) !== normalize(correct)) choices.add(wrong);

  // pull other forms from dataset with same pronoun key (good distractors if you have enough rows)
  const samePron = state.rows
    .filter(r => (r.PronounKey || "").trim() === pk && (r.AnswerForm || "").trim())
    .map(r => (r.AnswerForm || "").trim())
    .filter(f => normalize(f) !== normalize(correct));

  for (const s of randSample(uniq(samePron), 3, new Set(Array.from(choices).map(normalize)))) {
    choices.add(s);
  }

  // if still short, pad with any other AnswerForm
  if (choices.size < 4) {
    const anyForms = uniq(state.rows.map(r => (r.AnswerForm || "").trim()).filter(Boolean));
    for (const s of randSample(anyForms, 6, new Set(Array.from(choices).map(normalize)))) {
      choices.add(s);
      if (choices.size >= 4) break;
    }
  }

  const out = Array.from(choices).slice(0, 4);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ========= Rendering ========= */
function btn(text, extraClass, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `btn ${extraClass || ""}`.trim();
  b.textContent = text;
  b.onclick = onClick;
  return b;
}

function renderLangToggle() {
  const langBtn = $("#btnLangToggle");
  if (!langBtn) return;
  const nextLang = (state.uiLang === "en") ? "CY" : "EN";
  langBtn.innerHTML = `<span aria-hidden="true">🔁</span><span class="langtag">${nextLang}</span>`;
  langBtn.title = (state.uiLang === "en") ? "Switch to Cymraeg" : "Switch to English";
  langBtn.setAttribute("aria-label", (state.uiLang === "en") ? "Switch language to Cymraeg" : "Switch language to English");
}

function renderStaticText() {
  $("#filtersTitle").textContent = t("filters");
  $("#lblLevel").textContent = t("level");
  $("#lblTopic").textContent = t("topic");
  $("#lblMode").textContent  = t("mode");
  $("#btnClearFilters").textContent = t("clear");
  $("#sessionTitle").textContent = t("session");
  $("#kScore").textContent = t("score");
  $("#kStreak").textContent = t("streak");
  $("#kDone").textContent = t("done");
  $("#btnResetStats").textContent = t("resetStats");
  $("#pageSub").textContent = t("instruction");
  $("#helpText").textContent = state.difficulty === "hard" ? t("englishHidden") : "Easy = choose. Hard = type. Use ? for the English sentence.";

  $("#mbHint").textContent = t("hint");
  $("#mbHear").textContent = t("hear");
  // mbCheckNext label will be set dynamically (Check/Next)
  renderLangToggle();
}

function renderStats() {
  $("#vScore").textContent = String(state.stats.score || 0);
  $("#vStreak").textContent = String(state.stats.streak || 0);
  $("#vDone").textContent = String(state.stats.done || 0);
}

function renderFiltersUI() {
  const levels = uniq(state.rows.map(r => r.Level).filter(v => Number.isFinite(v))).sort((a,b)=>a-b);
  const topics = uniq(state.rows.map(r => (r.Topic || "").trim()).filter(Boolean)).sort((a,b)=>a.localeCompare(b));
  const modes  = uniq(state.rows.map(r => (r.Mode || "").trim()).filter(Boolean)).sort((a,b)=>a.localeCompare(b));

  const fLevel = $("#fLevel");
  const fTopic = $("#fTopic");
  const fMode  = $("#fMode");

  const fill = (sel, options, selected) => {
    sel.innerHTML = "";
    for (const opt of options) {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      sel.appendChild(o);
    }
    sel.value = options.includes(selected) ? selected : options[0];
  };

  fill(fLevel, ["All", ...levels.map(String)], state.filters.level || "All");
  fill(fTopic, ["All", ...topics], state.filters.topic || "All");
  fill(fMode,  ["All", ...modes],  state.filters.mode  || "All");

  $("#sampleCount").textContent = `Sample: ${state.filtered.length}`;
}

function renderTrainer() {
  const host = $("#trainerHost");
  if (!host) return;
  host.innerHTML = "";

  const item = state.current;
  if (!item) {
    host.innerHTML = `<div class="text-slate-700">${esc(t("noItems"))}</div>`;
    return;
  }

  const needsStep2 = state.difficulty === "easy" && !!(item.AnswerForm || "").trim();

  const correctInsert = (item.AnswerForm || item.AnswerPrep || "").trim();

  // Header row: progress + difficulty toggle + new question
  const top = document.createElement("div");
  top.className = "flex flex-wrap items-center justify-between gap-2 mb-4";

  const left = document.createElement("div");
  left.className = "flex flex-wrap items-center gap-2 text-xs text-slate-500";

  const lvl = (Number.isFinite(item.Level) ? item.Level : null);
  if (lvl != null) left.appendChild(chip(`${t("level")}: ${lvl}`));
  if ((item.Topic || "").trim()) left.appendChild(chip(`${t("topic")}: ${item.Topic}`));
  left.appendChild(chip(`${t("mode")}: ${item.Mode || (item.AnswerForm ? "prep+pronoun" : "prep")}`));

  const right = document.createElement("div");
  right.className = "flex items-center gap-2";

  // difficulty segmented control (uses same .seg / .seg-btn as your mutation trainer)
  const seg = document.createElement("div");
  seg.className = "seg";

  const mkSegBtn = (label, value) => {
    const b = document.createElement("button");
    b.type = "button";
    const on = state.difficulty === value;
    b.className = `seg-btn ${on ? "is-on" : ""}`;
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.textContent = label.toUpperCase();
    b.onclick = () => {
      if (state.difficulty === value) return;
      state.difficulty = value;
      saveLS(DIFF_KEY, state.difficulty);
      // reset question flow cleanly
      startNewQuestion(true);
    };
    return b;
  };

  seg.append(
    mkSegBtn(t("easy"), "easy"),
    mkSegBtn(t("hard"), "hard")
  );

  const newQ = btn(t("newQ"), "btn-primary shadow", () => startNewQuestion(true));
  right.append(seg, newQ);

  top.append(left, right);

  // English target sentence (clean: sentence only, no extra label)
  const enCard = document.createElement("div");
  enCard.className = "rounded-2xl border bg-emerald-50/80 px-5 py-4 mb-4";
  enCard.innerHTML = `<div class="text-slate-900 text-xl md:text-2xl font-semibold">${esc(item.English || "")}</div>`;

  // Welsh sentence with gap capsule (anchor ? here)
  const cyWrap = document.createElement("div");
  cyWrap.className = "rounded-2xl border border-slate-200 bg-white/70 px-5 py-5";

  const cyLine = document.createElement("div");
  cyLine.className = "text-xl md:text-2xl text-slate-800 flex flex-wrap items-baseline gap-2";

  const before = document.createElement("span");
  before.textContent = (item.Before || "");

  const gap = document.createElement("span");
  gap.className = "inline-flex items-baseline bg-indigo-100 ring-1 ring-indigo-300 rounded-2xl px-4 py-1.5 shadow-sm font-semibold text-indigo-900";
  gap.textContent = state.revealed ? correctInsert : "___";

  const after = document.createElement("span");
  after.textContent = (item.After || "");

  // Mount the “?” popover here (full English sentence)
  mountSentenceTranslationUI(gap, item.English, state.uiLang);

  cyLine.append(before, gap, after);
  cyWrap.appendChild(cyLine);

  // step / instruction line
  const stepLine = document.createElement("div");
  stepLine.className = "mt-3 flex items-center gap-2 text-sm text-slate-600";

  if (state.difficulty === "easy" && needsStep2) {
    stepLine.innerHTML = `<span class="pill">${esc(state.phase === "step2" ? t("step2") : t("step1"))}</span>`;
  } else {
    stepLine.innerHTML = `<span class="pill">${esc(t("instruction"))}</span>`;
  }
  cyWrap.appendChild(stepLine);

  // Answer interaction area
  const inter = document.createElement("div");
  inter.className = "mt-5";

  // Hint text
  const hint = document.createElement("div");
  hint.id = "hintBox";
  hint.className = "hidden mt-3 text-sm text-slate-600";
  const hintText = (state.uiLang === "cy" ? (item.HintCym || item.Hint) : item.Hint) || "";
  hint.innerHTML = hintText ? esc(hintText) : `Starts with: <b>${esc(correctInsert.slice(0, 1) || "?")}</b>`;

  // Feedback box
  const fb = document.createElement("div");
  fb.id = "feedbackBox";
  fb.className = "hidden mt-5 rounded-2xl border px-5 py-4 bg-white/70";
  fb.setAttribute("aria-live", "polite");

  // Actions
  const actions = document.createElement("div");
  actions.className = "mt-4 flex flex-wrap gap-2 justify-between items-center";

  const leftActions = document.createElement("div");
  leftActions.className = "flex flex-wrap gap-2";

  const rightActions = document.createElement("div");
  rightActions.className = "flex flex-wrap gap-2";

  const btnHint = btn(t("hint"), "btn-ghost", () => hint.classList.toggle("hidden"));
  const btnReveal = btn(t("reveal"), "btn-ghost", () => revealNow());

  leftActions.append(btnHint, btnReveal);

  // Hear button (always available, but speaks the correct sentence)
  const btnHear = document.createElement("button");
  btnHear.type = "button";
  btnHear.className = "btn-hear";
  btnHear.innerHTML = `<span class="icon" aria-hidden="true">▶︎</span><span>${esc(t("hear"))}</span>`;
  btnHear.onclick = async () => {
    try {
      const sentence = buildWelshSentence(item.Before, correctInsert, item.After);
      await playPollySentence(sentence);
    } catch (e) {
      alert("Couldn't play audio: " + (e?.message || e));
    }
  };

  // “Next” button
  const btnNext = btn(t("next"), "btn-primary shadow", () => startNewQuestion(true));
  btnNext.id = "btnNext";
  btnNext.disabled = !state.revealed && !(state.phase === "done");
  btnNext.classList.toggle("opacity-60", btnNext.disabled);

  rightActions.append(btnHear, btnNext);
  actions.append(leftActions, rightActions);

  // Difficulty-specific UI
  if (state.difficulty === "hard") {
    const row = document.createElement("div");
    row.className = "flex flex-wrap items-center gap-2";

    const input = document.createElement("input");
    input.id = "typeBox";
    input.className = "border-2 border-slate-300 focus:border-cyan-600 outline-none bg-amber-50 px-3 py-2 rounded-xl text-xl md:text-2xl leading-tight shadow-sm w-full md:w-80";
    input.placeholder = t("typePlaceholder");
    input.autocomplete = "off";

    const btnCheck = btn(t("check"), "btn-primary shadow", () => checkTyped(input.value));
    btnCheck.id = "btnCheck";

    row.append(input, btnCheck);
    inter.append(row);

    // keyboard
    setTimeout(() => input.focus(), 0);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); btnCheck.click(); }
    });

    $("#mbCheckNext").textContent = t("check");
  } else {
    // EASY mode choices
    const choices = document.createElement("div");
    choices.id = "choices";
    choices.className = "grid grid-cols-2 md:grid-cols-4 gap-2";

    const opts = (state.phase === "step2") ? buildStep2Choices(item) : buildStep1Choices(item);

    opts.forEach((opt, idx) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-ghost";
      b.textContent = opt;
      b.onclick = () => pickChoice(opt);
      choices.appendChild(b);

      // keyboard 1-4
      b.dataset.key = String(idx + 1);
    });

    inter.appendChild(choices);
    $("#mbCheckNext").textContent = t("next"); // easy is “tap to answer”; next only matters after result
  }

  inter.append(hint, fb, actions);

  // assemble
  host.append(top, enCard, cyWrap, inter);

  // mobile buttons wiring
  $("#mbHint").onclick = () => btnHint.click();
  $("#mbHear").onclick = () => btnHear.click();
  $("#mbCheckNext").onclick = () => {
    if (state.difficulty === "hard") {
      if (!state.revealed) $("#btnCheck")?.click();
      else startNewQuestion(true);
    } else {
      if (state.revealed || state.phase === "done") startNewQuestion(true);
    }
  };

  function setNextEnabled(on) {
    btnNext.disabled = !on;
    btnNext.classList.toggle("opacity-60", !on);
  }

  function showFeedback(ok, detailsHtml) {
    fb.classList.remove("hidden");
    fb.classList.toggle("border-emerald-200", ok);
    fb.classList.toggle("border-rose-200", !ok);
    fb.classList.toggle("bg-emerald-50/60", ok);
    fb.classList.toggle("bg-rose-50/60", !ok);

    fb.innerHTML = `
      <div class="text-2xl font-semibold ${ok ? "text-emerald-900" : "text-rose-900"}">
        ${ok ? "✅ " + esc(t("correct")) : "❌ " + esc(t("wrong"))}
      </div>
      <div class="mt-2 text-slate-700">${detailsHtml}</div>
    `;
  }

  function revealNow() {
    if (state.revealed) return;
    state.revealed = true;
    state.lastResult = "revealed";
    state.stats.done += 1;
    state.stats.streak = 0;
    saveLS(STATS_KEY, state.stats);
    renderStats();

    // Force show correct gap
    gap.textContent = correctInsert;

    const whyText = (state.uiLang === "cy" ? (item.WhyCym || item.Why) : item.Why) || "";
    const fullWelsh = buildWelshSentence(item.Before, correctInsert, item.After);

    showFeedback(false, `
      <div><b>${esc(t("answer"))}:</b> <span class="font-semibold">${esc(correctInsert)}</span></div>
      <div class="mt-2"><b>Cymraeg:</b> ${esc(fullWelsh)}</div>
      ${whyText ? `<div class="mt-2">${esc(whyText)}</div>` : ""}
    `);

    setNextEnabled(true);
    renderTrainer(); // re-render to update gap + buttons state
  }

  function finishCard(ok, userValue) {
    state.revealed = true;
    state.lastResult = ok ? "correct" : "wrong";
    state.stats.done += 1;

    if (ok) {
      state.stats.score += 1;
      state.stats.streak += 1;
    } else {
      state.stats.streak = 0;
    }

    saveLS(STATS_KEY, state.stats);
    renderStats();

    gap.textContent = correctInsert;

    const whyText = (state.uiLang === "cy" ? (item.WhyCym || item.Why) : item.Why) || "";
    const fullWelsh = buildWelshSentence(item.Before, correctInsert, item.After);

    const typedLine = (!ok && userValue != null)
      ? `<div class="mt-1">${esc(t("youTyped"))}: <b>${esc(userValue || "(blank)")}</b></div>`
      : "";

    showFeedback(ok, `
      <div><b>${esc(t("answer"))}:</b> <span class="font-semibold">${esc(correctInsert)}</span></div>
      ${typedLine}
      <div class="mt-2"><b>Cymraeg:</b> ${esc(fullWelsh)}</div>
      ${whyText ? `<div class="mt-2">${esc(whyText)}</div>` : ""}
    `);

    setNextEnabled(true);
    renderTrainer(); // update UI states
  }

  function pickChoice(choice) {
    if (state.revealed) return;

    if (state.phase === "step2") {
      const ok = normalize(choice) === normalize(item.AnswerForm);
      state.phase = "done";
      finishCard(ok, choice);
      return;
    }

    // step1
    const ok = normalize(choice) === normalize(item.AnswerPrep);
    if (!ok) {
      state.phase = "done";
      finishCard(false, choice);
      return;
    }

    // correct step1
    if (needsStep2) {
      state.phase = "step2";
      // small positive feedback + advance to step2 without counting a “done”
      showFeedback(true, `<div>${esc(item.AnswerPrep)} ✓</div><div class="mt-1 text-slate-600">${esc(t("step2"))}</div>`);
      // re-render into step2 choices
      renderTrainer();
    } else {
      state.phase = "done";
      finishCard(true, choice);
    }
  }

  function checkTyped(val) {
    if (state.revealed) return;
    const guess = (val || "").trim();
    const ok = normalize(guess) === normalize(correctInsert);
    state.phase = "done";
    finishCard(ok, guess);
  }
}

function chip(text) {
  const c = document.createElement("span");
  c.className = "chip";
  c.innerHTML = `<span>${esc(text)}</span>`;
  c.style.cursor = "default";
  return c;
}

/* ========= Flow ========= */
function startNewQuestion(resetUsed = false) {
  if (resetUsed) {
    // not clearing used by default; but if filters change we do
  }
  const item = pickNext();
  state.current = item;
  state.revealed = false;
  state.lastResult = null;
  state.phase = (state.difficulty === "easy" && item && (item.AnswerForm || "").trim()) ? "step1" : "step1";
  renderTrainer();
}

/* ========= Wiring ========= */
function wireUi() {
  $("#btnTop")?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  $("#btnFilters")?.addEventListener("click", () => $("#filtersPanel")?.classList.toggle("hidden"));

  $("#btnLangToggle")?.addEventListener("click", () => {
    state.uiLang = (state.uiLang === "en") ? "cy" : "en";
    saveLS(UILANG_KEY, state.uiLang);
    renderStaticText();
    renderTrainer();
  });

  $("#btnResetStats")?.addEventListener("click", () => {
    state.stats = { score: 0, streak: 0, done: 0 };
    saveLS(STATS_KEY, state.stats);
    renderStats();
  });

  $("#btnClearFilters")?.addEventListener("click", () => {
    state.filters = { level: "All", topic: "All", mode: "All" };
    saveLS("prep_filters_v1", state.filters);
    renderFiltersUI();
    applyFilters();
    state.used.clear();
    startNewQuestion(true);
  });

  // Filters change
  ["#fLevel", "#fTopic", "#fMode"].forEach(id => {
    $(id)?.addEventListener("change", () => {
      state.filters.level = $("#fLevel").value;
      state.filters.topic = $("#fTopic").value;
      state.filters.mode  = $("#fMode").value;
      saveLS("prep_filters_v1", state.filters);
      applyFilters();
      state.used.clear();
      startNewQuestion(true);
    });
  });

  // Keyboard shortcuts (avoid when typing)
  document.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) || "";
    if (["INPUT", "TEXTAREA"].includes(tag.toUpperCase())) return;

    if (e.key.toLowerCase() === "h") $("#mbHint")?.click();
    if (e.key.toLowerCase() === "r") $("#trainerHost")?.querySelector("button.btn.btn-ghost")?.click(); // first ghost is hint; reveal is second (not perfect, but ok)
    if (e.key.toLowerCase() === "n") startNewQuestion(true);

    // Easy mode: 1-4 selects choice
    if (state.difficulty === "easy" && state.current && !state.revealed) {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 4) {
        const btn = $("#trainerHost")?.querySelector(`#choices button:nth-child(${n})`);
        btn?.click();
      }
    }

    // Enter: in hard mode, acts as Check or Next
    if (e.key === "Enter") {
      e.preventDefault();
      $("#mbCheckNext")?.click();
    }
  });

  // Admin tools
  if (state.admin) {
    $("#adminPanel")?.classList.remove("hidden");
    const dataUrl = $("#dataUrl");
    if (dataUrl) dataUrl.value = getParam("sheet") || "";

    $("#btnLoadUrl")?.addEventListener("click", async () => {
      const u = ($("#dataUrl")?.value || "").trim();
      if (!u) return;
      const d = await loadCsvUrl(u);
      state.rows = d.map(coerceRow);
      applyFilters();
      renderFiltersUI();
      startNewQuestion(true);
    });

    $("#fileCsv")?.addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      Papa.parse(f, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          state.rows = res.data.map(coerceRow);
          applyFilters();
          renderFiltersUI();
          startNewQuestion(true);
        }
      });
    });
  }
}

/* ========= Boot ========= */
(async function boot() {
  wireUi();
  renderStaticText();
  renderStats();

  try {
    const raw = await loadDefaultData();
    state.rows = (raw || []).map(coerceRow);
  } catch (e) {
    console.warn("Prep CSV load failed:", e);
    state.rows = [];
  }

  applyFilters();
  renderFiltersUI();
  renderStaticText();
  startNewQuestion(true);
})();


