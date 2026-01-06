/* =========================================================
   Preposition trainer (prep.js)

   CSV columns (case-insensitive; extras ignored):
   - ItemId
   - Level
   - Mode                 (e.g. "prep" or "prep+pronoun")
   - TopicEn, TopicCy
   - ContrastGroup        (e.g. AT_vs_I)
   - BeforeCy, AfterCy    (Welsh prompt split around the missing bit)
   - SentenceEN           (FULL correct English translation; shown in the “?” popover)
   - AnswerPrep           (Step 1 correct preposition)
   - NeedsStep2           (0/1)
   - PronounKey           (e.g. 1S, 2S...)
   - AnswerFormCy         (Step 2 correct full form, e.g. "arna i")
   - HintEn, HintCy
   - WhyEn, WhyCy
   - RuleEn, RuleCy

   Loading:
   - ?sheet=<CSV URL> overrides
   - else localStorage wm_prep_sheet_url_v1
   - else defaults to "data/prep.csv" (optional)
   ========================================================= */

/* ========= Tiny utilities ========= */
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

function getParam(k) { return new URLSearchParams(location.search).get(k); }
function saveLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
function loadLS(k, d) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : d; } catch { return d; } }

/* ========= Language sync (match your navbar.js storage format) ========= */
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
function wmSetDocLang(lang) {
  document.documentElement.setAttribute("lang", lang === "cy" ? "cy" : "en");
}

/* ========= “?” translation UI (reuse exact same classes as index) ========= */
function mountSentenceTranslationUI(capsuleEl, item, lang) {
  if (!capsuleEl) return;

  // Always English translation (your requirement)
  const meaning = (item?.SentenceEN || "").trim();
  if (!meaning) return;

  // Anchor absolute-positioned “?” to the capsule
  capsuleEl.style.position = "relative";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "base-info-btn";
  btn.textContent = "?";
  btn.setAttribute("aria-label", lang === "cy" ? "Saesneg" : "English");
  btn.setAttribute("title", lang === "cy" ? "Saesneg" : "English");

  const pop = document.createElement("div");
  pop.className = "base-info-popover hidden animate-pop";
  pop.setAttribute("role", "dialog");

  // Widen popover for full sentence WITHOUT touching shared styles.css
  pop.style.width = "22rem";
  pop.style.maxWidth = "min(22rem, calc(100vw - 20px))";

  const close = document.createElement("button");
  close.type = "button";
  close.className = "base-info-close";
  close.setAttribute("aria-label", "Close");
  close.textContent = "×";

  pop.innerHTML = `
    <div class="base-info-meaning">${esc(meaning)}</div>
    <div class="base-info-meta">
      <span class="base-info-tag">${esc(lang === "cy" ? "Saesneg" : "English")}</span>
    </div>
  `;
  pop.appendChild(close);

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = pop.classList.contains("hidden");
    // close other open popovers
    $$(".base-info-popover").forEach(p => p.classList.add("hidden"));
    if (isHidden) pop.classList.remove("hidden");
    else pop.classList.add("hidden");
  });

  close.addEventListener("click", (e) => {
    e.stopPropagation();
    pop.classList.add("hidden");
  });

  pop.addEventListener("click", (e) => e.stopPropagation());

  capsuleEl.appendChild(btn);
  capsuleEl.appendChild(pop);
}

// Global close behaviour (single listeners; no render leaks)
document.addEventListener("click", () => {
  $$(".base-info-popover").forEach(p => p.classList.add("hidden"));
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    $$(".base-info-popover").forEach(p => p.classList.add("hidden"));
  }
});

/* ========= Copy labels ========= */
const UI = {
  en: {
    filtersTitle: "Focus",
    level: "Level",
    mode: "Mode",
    topic: "Topic",
    contrast: "Contrast set",
    all: "All",
    newQuestion: "New question",
    reset: "Reset",
    session: "Session",
    streak: "Streak",
    done: "Done",
    instruction: "Choose the correct preposition.",
    hint: "Hint",
    reveal: "Reveal",
    next: "Next",
    step1: "Step 1 of 1",
    step1of2: "Step 1 of 2",
    step2of2: "Step 2 of 2",
    chooseForm: "Now choose the correct pronoun form.",
    correct: "Correct!",
    wrong: "Not quite",
    skipped: "Skipped",
    answer: "Answer",
    youPicked: "You picked",
    noItems: "No items match your filters.",
    clearFilters: "Clear filters",
    backToTop: "Back to top",
  },
  cy: {
    filtersTitle: "Ffocws",
    level: "Lefel",
    mode: "Modd",
    topic: "Pwnc",
    contrast: "Set cyferbyniad",
    all: "Pob un",
    newQuestion: "Cwestiwn newydd",
    reset: "Ailosod",
    session: "Sesiwn",
    streak: "Rhediad",
    done: "Wedi gwneud",
    instruction: "Dewiswch yr arddodiad cywir.",
    hint: "Awgrym",
    reveal: "Dangos",
    next: "Nesaf",
    step1: "Cam 1 o 1",
    step1of2: "Cam 1 o 2",
    step2of2: "Cam 2 o 2",
    chooseForm: "Nawr dewiswch y ffurf rhagenw gywir.",
    correct: "Cywir!",
    wrong: "Dim yn hollol gywir",
    skipped: "Wedi ei hepgor",
    answer: "Ateb",
    youPicked: "Dewisaist ti",
    noItems: "Does dim eitemau’n cyfateb i’r hidlwyr.",
    clearFilters: "Clirio hidlwyr",
    backToTop: "Yn ôl i’r brig",
  }
};

/* ========= Choice sets (distractors) ========= */
const CHOICE_SETS = {
  AT_vs_I: ["at", "i", "o", "gyda"],
  CYN_vs_O_FLAEN: ["cyn", "o flaen", "ar ôl", "wrth"],
  A_vs_GYDA: ["â", "gyda", "at", "i"],
  GYDA_vs_AR: ["gyda", "ar", "â", "at"],
  INFLECTED_AR: ["ar", "gyda", "â", "at"]
};

/* ========= Pronoun forms bank (Step 2 distractors) ========= */
const PREP_FORMS = {
  "ar": {
    forms_cy: {
      "1S": "arna i",
      "2S": "arnat ti",
      "3SM": "arno fe",
      "3SF": "arni hi",
      "1PL": "arnon ni",
      "2PL": "arnoch chi",
      "3PL": "arnyn nhw"
    }
  },
  "at": {
    forms_cy: {
      "1S": "ata i",
      "2S": "atat ti",
      "3SM": "ato fe",
      "3SF": "ati hi",
      "1PL": "aton ni",
      "2PL": "atoch chi",
      "3PL": "atyn nhw"
    }
  },
  "i": {
    forms_cy: {
      "1S": "imi / i mi",
      "2S": "iti / i ti",
      "3SM": "iddo fe",
      "3SF": "iddi hi",
      "1PL": "inni / i ni",
      "2PL": "ichwi / i chi",
      "3PL": "iddyn nhw"
    }
  },
  "gyda": {
    forms_cy: {
      "1S": "gyda fi",
      "2S": "gyda ti",
      "3SM": "gyda fe",
      "3SF": "gyda hi",
      "1PL": "gyda ni",
      "2PL": "gyda chi",
      "3PL": "gyda nhw"
    }
  },
  "â": {
    forms_cy: {
      "1S": "â fi",
      "2S": "â ti",
      "3SM": "ag e",
      "3SF": "â hi",
      "1PL": "â ni",
      "2PL": "â chi",
      "3PL": "â nhw"
    }
  }
};

/* ========= CSV loading ========= */
const DEFAULT_CSV_URL = "data/prep.csv";
const SHEET_LS_KEY = "wm_prep_sheet_url_v1";

async function loadCsvUrl(url) {
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (res) => resolve(res.data || []),
      error: reject
    });
  });
}

function getVal(row, names) {
  const keys = Object.keys(row || {});
  for (const key of keys) {
    if (names.some(n => key.trim().toLowerCase() === n.trim().toLowerCase())) {
      return (row[key] ?? "").toString().trim();
    }
  }
  return "";
}

function coercePrepRow(row, idx) {
  const ItemId = getVal(row, ["ItemId","ItemID","ID","Id","id"]) || `row_${idx}`;
  const Level = Number(getVal(row, ["Level","Lvl"])) || 1;
  const Mode = getVal(row, ["Mode"]) || "prep";
  const TopicEn = getVal(row, ["TopicEn","TopicEN","Topic (EN)","Topic"]) || "General";
  const TopicCy = getVal(row, ["TopicCy","TopicCY","Topic (CY)"]) || TopicEn;

  const ContrastGroup = getVal(row, ["ContrastGroup","Contrast","Set","Contrast set"]) || "AT_vs_I";

  const BeforeCy = getVal(row, ["BeforeCy","BeforeCY","Before (CY)","BeforeWelsh","Before"]) || "";
  const AfterCy  = getVal(row, ["AfterCy","AfterCY","After (CY)","AfterWelsh","After"]) || "";

  const SentenceEN = getVal(row, ["SentenceEN","SentenceEn","English","Translation","TranslateSentence","Sentence"]) || "";

  const AnswerPrep = getVal(row, ["AnswerPrep","Answer","Prep","Preposition"]) || "";
  const NeedsStep2 = (getVal(row, ["NeedsStep2","Step2","Needs step2"]) || "").toString().trim() === "1" ? 1 : 0;
  const PronounKey = getVal(row, ["PronounKey","Pronoun","PronKey"]) || "";
  const AnswerFormCy = getVal(row, ["AnswerFormCy","AnswerFormCY","FormCy","AnswerForm","FullFormCy"]) || "";

  const HintEn = getVal(row, ["HintEn","HintEN","Hint (EN)","Hint"]) || "";
  const HintCy = getVal(row, ["HintCy","HintCY","Hint (CY)"]) || HintEn;

  const WhyEn = getVal(row, ["WhyEn","WhyEN","Why (EN)","Why"]) || "";
  const WhyCy = getVal(row, ["WhyCy","WhyCY","Why (CY)"]) || WhyEn;

  const RuleEn = getVal(row, ["RuleEn","RuleEN","Rule (EN)","Rule"]) || "";
  const RuleCy = getVal(row, ["RuleCy","RuleCY","Rule (CY)"]) || RuleEn;

  return {
    ItemId, Level, Mode,
    TopicEn, TopicCy,
    ContrastGroup,
    BeforeCy, AfterCy,
    SentenceEN,
    AnswerPrep,
    NeedsStep2,
    PronounKey,
    AnswerFormCy,
    HintEn, HintCy,
    WhyEn, WhyCy,
    RuleEn, RuleCy
  };
}

/* ========= Fallback dummy data (kept small) ========= */
const FALLBACK_ITEMS = [
  {
    ItemId: "Q0001",
    Level: 1,
    Mode: "prep",
    TopicEn: "Letters",
    TopicCy: "Llythyrau",
    ContrastGroup: "AT_vs_I",
    BeforeCy: "Danfon lythyr",
    AfterCy: "Sioned.",
    SentenceEN: "Send a letter to Sioned.",
    AnswerPrep: "at",
    NeedsStep2: 0,
    PronounKey: "",
    AnswerFormCy: "",
    HintEn: "Person, not a place.",
    HintCy: "Person, nid lle.",
    WhyEn: "With a person as the target, Welsh often uses <strong>at</strong>.",
    WhyCy: "Gyda pherson fel targed, mae’r Gymraeg yn aml yn defnyddio <strong>at</strong>.",
    RuleEn: "<strong>at</strong> often for ‘to (a person)’; <strong>i</strong> often for ‘to/into (a place)’.",
    RuleCy: "<strong>at</strong> yn aml am ‘at berson’; <strong>i</strong> yn aml am ‘i / i mewn i le’."
  },
  {
    ItemId: "Q0002",
    Level: 1,
    Mode: "prep",
    TopicEn: "Travel",
    TopicCy: "Teithio",
    ContrastGroup: "AT_vs_I",
    BeforeCy: "Danfon lythyr",
    AfterCy: "Lundain.",
    SentenceEN: "Send a letter to London.",
    AnswerPrep: "i",
    NeedsStep2: 0,
    PronounKey: "",
    AnswerFormCy: "",
    HintEn: "Destination is a place.",
    HintCy: "Cyrchfan = lle.",
    WhyEn: "A place/destination → usually <strong>i</strong>.",
    WhyCy: "Lle/cyrchfan → fel arfer <strong>i</strong>.",
    RuleEn: "Place/destination → often <strong>i</strong>.",
    RuleCy: "Lle/cyrchfan → yn aml <strong>i</strong>."
  },
  // Step2 example: gap stands for the FULL form eventually ("arna i")
  {
    ItemId: "Q0301",
    Level: 3,
    Mode: "prep+pronoun",
    TopicEn: "Ownership",
    TopicCy: "Perchnogaeth",
    ContrastGroup: "INFLECTED_AR",
    BeforeCy: "Mae e",
    AfterCy: ".",
    SentenceEN: "It’s on me.",
    AnswerPrep: "ar",
    NeedsStep2: 1,
    PronounKey: "1S",
    AnswerFormCy: "arna i",
    HintEn: "This one inflects (it changes).",
    HintCy: "Mae hwn yn cyflyru (mae’n newid).",
    WhyEn: "<strong>ar</strong> is an inflected preposition: <strong>arna i</strong> (not *ar fi*).",
    WhyCy: "Mae <strong>ar</strong> yn arddodiad cyfunol: <strong>arna i</strong> (nid *ar fi*).",
    RuleEn: "Inflected prepositions: arna i, arnat ti, arno fe, arni hi…",
    RuleCy: "Arddodiaid cyfunol: arna i, arnat ti, arno fe, arni hi…"
  }
];

/* ========= App state ========= */
const state = {
  lang: "en",
  items: [],
  used:: new Set(), // (typo fixed below in init)
  current: null,

  // filters
  fLevel: "All",
  fMode: "All",
  fTopic: "All",
  fContrast: "All",

  // progress
  correct: 0,
  done: 0,
  streak: 0,

  // question state
  step: 1,              // 1 or 2
  locked: false,
  chosenStep1: null,
  showHint: false,
  showFeedback: false,
  lastResult: null,      // "correct" | "wrong" | "skipped"
  lastMessage: ""
};

/* Fix typo safely */
state.used = new Set();

/* ========= DOM refs ========= */
const els = {
  practiceCard: $("#practiceCard"),

  // filters
  fLevel: $("#fLevel"),
  fMode: $("#fMode"),
  fTopic: $("#fTopic"),
  fContrast: $("#fContrast"),

  btnNewQuestion: $("#btnNewQuestion"),
  btnResetAll: $("#btnResetAll"),

  // admin
  adminPanel: $("#adminPanel"),
  dataUrl: $("#dataUrl"),
  btnLoadUrl: $("#btnLoadUrl"),
  fileCsv: $("#fileCsv"),
  dataBadge: $("#dataBadge"),

  // right stats
  accBig: $("#accBig"),
  accText: $("#accText"),
  streakText: $("#streakText"),
  doneText: $("#doneText"),

  // labels
  filtersTitle: $("#filtersTitle"),
  lblLevel: $("#lblLevel"),
  lblMode: $("#lblMode"),
  lblTopic: $("#lblTopic"),
  lblContrast: $("#lblContrast"),
  sessionTitle: $("#sessionTitle"),

  // mobile bar
  mbHint: $("#mbHint"),
  mbReveal: $("#mbReveal"),
  mbNext: $("#mbNext"),

  // footer
  btnTop: $("#btnTop"),
};

/* ========= Helpers ========= */
function ui() { return UI[state.lang] || UI.en; }

function uniq(arr) {
  return Array.from(new Set(arr.filter(v => v != null && String(v).trim() !== "")));
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function prettyContrast(code) {
  return (code || "").replaceAll("_", " ").replaceAll("vs", "vs");
}

function getFilteredItems() {
  const u = ui();
  return state.items.filter(it => {
    if (state.fLevel !== u.all && String(it.Level) !== String(state.fLevel)) return false;
    if (state.fMode !== u.all && String(it.Mode) !== String(state.fMode)) return false;
    if (state.fTopic !== u.all && String(it.TopicEn) !== String(state.fTopic)) return false;
    if (state.fContrast !== u.all && String(it.ContrastGroup) !== String(state.fContrast)) return false;
    return true;
  });
}

function pickNextItem() {
  const pool = getFilteredItems();
  if (!pool.length) return null;

  const unused = pool.filter(it => !state.used.has(it.ItemId));
  const list = unused.length ? unused : pool;
  if (!unused.length) state.used.clear();

  const it = list[Math.floor(Math.random() * list.length)];
  state.used.add(it.ItemId);
  return it;
}

function computeAccuracy() {
  const acc = state.done ? Math.round((state.correct / state.done) * 100) : 0;
  return acc;
}

/* ========= Render filters ========= */
function fillSelect(sel, options, value) {
  if (!sel) return;
  sel.innerHTML = "";
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    sel.appendChild(o);
  }
  sel.value = value;
}

function renderFilters() {
  const u = ui();

  const levels = uniq(state.items.map(i => String(i.Level))).sort((a,b)=>Number(a)-Number(b));
  const modes  = uniq(state.items.map(i => i.Mode)).sort((a,b)=>a.localeCompare(b));
  const topics = uniq(state.items.map(i => i.TopicEn)).sort((a,b)=>a.localeCompare(b));
  const contrasts = uniq(state.items.map(i => i.ContrastGroup)).sort((a,b)=>a.localeCompare(b));

  fillSelect(els.fLevel,
    [{ value: u.all, label: u.all }, ...levels.map(v => ({ value: v, label: v }))],
    state.fLevel
  );
  fillSelect(els.fMode,
    [{ value: u.all, label: u.all }, ...modes.map(v => ({ value: v, label: v }))],
    state.fMode
  );

  // Topic: value is TopicEn for stability; label depends on UI language
  const topicLabel = (topicEn) => {
    const any = state.items.find(x => x.TopicEn === topicEn);
    return state.lang === "cy" ? (any?.TopicCy || topicEn) : topicEn;
  };
  fillSelect(els.fTopic,
    [{ value: u.all, label: u.all }, ...topics.map(v => ({ value: v, label: topicLabel(v) }))],
    state.fTopic
  );

  fillSelect(els.fContrast,
    [{ value: u.all, label: u.all }, ...contrasts.map(v => ({ value: v, label: prettyContrast(v) }))],
    state.fContrast
  );

  // copy
  if (els.filtersTitle) els.filtersTitle.textContent = u.filtersTitle;
  if (els.lblLevel) els.lblLevel.textContent = u.level;
  if (els.lblMode) els.lblMode.textContent = u.mode;
  if (els.lblTopic) els.lblTopic.textContent = u.topic;
  if (els.lblContrast) els.lblContrast.textContent = u.contrast;

  if (els.btnNewQuestion) els.btnNewQuestion.textContent = u.newQuestion;
  if (els.btnResetAll) els.btnResetAll.textContent = u.reset;

  if (els.sessionTitle) els.sessionTitle.textContent = u.session;

  if (els.mbHint) els.mbHint.textContent = u.hint;
  if (els.mbReveal) els.mbReveal.textContent = u.reveal;
  if (els.mbNext) els.mbNext.textContent = u.next;

  if (els.btnTop) els.btnTop.textContent = u.backToTop;

  // badge showing current data source
  const activeSheet = loadLS(SHEET_LS_KEY, "") || getParam("sheet") || DEFAULT_CSV_URL;
  if (els.dataBadge) {
    els.dataBadge.textContent = `Data: ${activeSheet} • Items: ${state.items.length}`;
  }
}

/* ========= Render practice card ========= */
function renderPractice() {
  const host = els.practiceCard;
  if (!host) return;
  const u = ui();

  const pool = getFilteredItems();
  if (!pool.length) {
    host.innerHTML = `
      <div class="panel rounded-xl p-4 text-slate-700">
        ${esc(u.noItems)}
        <button id="btnClearFilters" class="ml-2 btn btn-ghost px-2 py-1">${esc(u.clearFilters)}</button>
      </div>
    `;
    $("#btnClearFilters")?.addEventListener("click", () => {
      state.fLevel = u.all;
      state.fMode = u.all;
      state.fTopic = u.all;
      state.fContrast = u.all;
      state.used.clear();
      state.current = pickNextItem();
      resetQuestionState();
      render();
    });
    return;
  }

  if (!state.current) {
    state.current = pickNextItem();
    resetQuestionState();
  }

  const it = state.current;

  // Header row: pool + item id (small)
  const header = `
    <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
      <div class="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>${esc(`Pool ${pool.length}`)}</span>
        <span>·</span>
        <span class="mono">${esc(it.ItemId)}</span>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="chip">${esc(u.level)}: ${esc(it.Level)}</span>
        <span class="chip">${esc(u.topic)}: ${esc(state.lang === "cy" ? (it.TopicCy || it.TopicEn) : it.TopicEn)}</span>
        <span class="chip">${esc(u.contrast)}: ${esc(prettyContrast(it.ContrastGroup))}</span>
      </div>
    </div>
  `;

  // Instruction
  const instruction = `
    <div class="practice-instruction text-lg md:text-xl text-slate-700 mb-6">
      ${esc(u.instruction)}
    </div>
  `;

  // “word being tested” capsule (matches mutation trainer’s look)
  const shownWord = (() => {
    if (!state.chosenStep1) return "__";
    if (state.step === 2) return state.chosenStep1; // preposition already chosen
    return state.chosenStep1;
  })();

  const capsuleHtml = `
    <div class="practice-base text-2xl md:text-3xl font-medium">
      <div id="testedCapsule" class="inline-flex items-baseline bg-indigo-100 ring-1 ring-indigo-300 rounded-2xl px-5 py-2.5 shadow-sm">
        <span class="base-word-text text-indigo-900 text-3xl md:text-4xl font-bold tracking-tight">${esc(shownWord)}</span>
      </div>
    </div>
  `;

  // Sentence (Welsh) with inline gap mirror (so you see it in context)
  const gapInline = state.step === 2
    ? (state.lastResult ? (it.AnswerFormCy || it.AnswerPrep || "__") : (state.chosenStep1 || "__"))
    : (state.chosenStep1 || "__");

  const sentenceHtml = `
    <div class="prep-sentenceLine text-slate-800 flex flex-wrap items-baseline gap-x-2 gap-y-2 mt-2">
      <span>${esc(it.BeforeCy || "")}</span>
      <span class="font-semibold bg-indigo-100 text-indigo-900 px-1.5 py-0.5 rounded">${esc(gapInline)}</span>
      <span>${esc(it.AfterCy || "")}</span>
    </div>
  `;

  // Step pill
  const stepLabel = it.NeedsStep2 ? (state.step === 1 ? u.step1of2 : u.step2of2) : u.step1;
  const stepPill = `
    <div class="mt-4">
      <span class="pill">${esc(stepLabel)}</span>
      ${it.NeedsStep2 && state.step === 2 ? `<span class="ml-2 text-sm text-slate-600">${esc(u.chooseForm)}</span>` : ""}
    </div>
  `;

  // Hint area
  const hintText = state.lang === "cy" ? (it.HintCy || it.HintEn) : (it.HintEn || it.HintCy);
  const hintHtml = `
    <div id="hintBox" class="${state.showHint ? "" : "hidden"} mt-4 text-sm text-slate-700">
      <div class="feedback-box">
        <div class="font-semibold mb-1">${esc(u.hint)}</div>
        <div>${hintText || "—"}</div>
      </div>
    </div>
  `;

  // Choices
  const choices = buildChoicesForCurrent(it);
  const choicesHtml = `
    <div class="prep-choiceGrid mt-5" id="choicesGrid">
      ${choices.map((c, idx) => `
        <button
          class="btn btn-ghost prep-choice w-full justify-center py-3 text-base"
          type="button"
          data-choice="${esc(c)}"
          data-idx="${idx}"
          ${state.locked ? "disabled" : ""}
        >${esc(c)}</button>
      `).join("")}
    </div>
    <div class="mt-2 text-xs text-slate-500">${esc("Keys: 1–4 • H hint • R reveal • N next")}</div>
  `;

  // Actions row (use your shared layout styling hooks)
  const actionsHtml = `
    <div class="practice-actions mt-5">
      <div class="practice-actions-main">
        <button id="btnHint" class="btn btn-ghost" type="button">${esc(u.hint)}</button>
        <button id="btnReveal" class="btn btn-ghost" type="button">${esc(u.reveal)}</button>
        <button id="btnSkip" class="btn btn-ghost" type="button">${esc(u.skipped)}</button>
      </div>
      <div class="practice-actions-aux">
        <button id="btnNext" class="btn btn-primary shadow" type="button" ${state.showFeedback ? "" : "disabled"}>${esc(u.next)}</button>
      </div>
    </div>
  `;

  // Feedback box
  const feedbackHtml = state.showFeedback ? buildFeedbackHtml(it) : "";

  host.innerHTML = `
    <div>
      ${header}
      ${instruction}
      ${capsuleHtml}
      ${sentenceHtml}
      ${stepPill}
      ${choicesHtml}
      ${actionsHtml}
      ${hintHtml}
      ${feedbackHtml}
    </div>
  `;

  // Mount the “?” translation popover EXACT styling (shared CSS classes),
  // but content is the full English sentence.
  const capsuleEl = $("#testedCapsule");
  mountSentenceTranslationUI(capsuleEl, it, state.lang);

  // Wire choice clicks
  $$("#choicesGrid button").forEach(btn => {
    btn.addEventListener("click", () => {
      const val = btn.getAttribute("data-choice") || "";
      onPick(val);
    });
  });

  // Wire actions
  $("#btnHint")?.addEventListener("click", () => {
    state.showHint = !state.showHint;
    render();
  });
  $("#btnReveal")?.addEventListener("click", () => reveal());
  $("#btnSkip")?.addEventListener("click", () => skip());
  $("#btnNext")?.addEventListener("click", () => next());

  // Mobile bar
  els.mbHint?.addEventListener("click", () => $("#btnHint")?.click(), { once: true });
  els.mbReveal?.addEventListener("click", () => $("#btnReveal")?.click(), { once: true });
  els.mbNext?.addEventListener("click", () => $("#btnNext")?.click(), { once: true });

  // Mark correct/wrong states on buttons after lock
  if (state.locked) applyChoiceButtonMarking(it);
}

function buildChoicesForCurrent(it) {
  // Step 1: preposition options
  if (state.step === 1) {
    const set = CHOICE_SETS[it.ContrastGroup] || uniq([it.AnswerPrep, "i", "at", "o"]);
    const choices = uniq(set);
    shuffleInPlace(choices);
    return choices.slice(0, 4);
  }

  // Step 2: full form options
  const prep = it.AnswerPrep;
  const pronKey = it.PronounKey;
  const correct = (it.AnswerFormCy || "").trim();

  const opts = new Set();
  if (correct) opts.add(correct);

  // distractor 1: independent form like "ar fi"
  const indep = buildIndependentForm(prep, pronKey);
  if (indep && indep !== correct) opts.add(indep);

  // distractor 2: same prep different pronoun
  const bank = PREP_FORMS[prep]?.forms_cy || {};
  const keys = Object.keys(bank).filter(k => k !== pronKey);
  if (keys.length) opts.add(bank[keys[Math.floor(Math.random() * keys.length)]]);

  // distractor 3: other prep same pronoun
  const otherPreps = Object.keys(PREP_FORMS).filter(p => p !== prep);
  if (otherPreps.length) {
    const p = otherPreps[Math.floor(Math.random() * otherPreps.length)];
    const form = PREP_FORMS[p]?.forms_cy?.[pronKey];
    if (form) opts.add(form);
  }

  // fill to 4
  while (opts.size < 4) {
    const p = Object.keys(PREP_FORMS)[Math.floor(Math.random() * Object.keys(PREP_FORMS).length)];
    const kk = Object.keys(PREP_FORMS[p].forms_cy);
    const k = kk[Math.floor(Math.random() * kk.length)];
    opts.add(PREP_FORMS[p].forms_cy[k]);
  }

  const list = Array.from(opts).slice(0, 4);
  shuffleInPlace(list);
  return list;
}

function buildIndependentForm(prep, pronKey) {
  const indep = { "1S":"fi", "2S":"ti", "3SM":"fe", "3SF":"hi", "1PL":"ni", "2PL":"chi", "3PL":"nhw" };
  const pro = indep[pronKey];
  if (!prep || !pro) return null;
  return `${prep} ${pro}`;
}

function resetQuestionState() {
  state.step = 1;
  state.locked = false;
  state.chosenStep1 = null;
  state.showHint = false;
  state.showFeedback = false;
  state.lastResult = null;
  state.lastMessage = "";
}

function applyChoiceButtonMarking(it) {
  const buttons = $$("#choicesGrid button");
  const correctValue = (state.step === 1)
    ? (it.AnswerPrep || "")
    : (it.AnswerFormCy || "");

  buttons.forEach(b => {
    const v = b.getAttribute("data-choice") || b.textContent || "";
    if (normalize(v) === normalize(correctValue)) b.classList.add("is-good");
    if (state.lastResult === "wrong") {
      if (normalize(v) === normalize(state.step === 1 ? (state.chosenStep1 || "") : (state.lastMessage || ""))) {
        // (Keep wrong marking minimal; we mark only if it was an actual choice)
        if (normalize(v) !== normalize(correctValue)) b.classList.add("is-bad");
      }
    }
    b.disabled = true;
  });
}

function buildFeedbackHtml(it) {
  const u = ui();
  const ok = state.lastResult === "correct";
  const skipped = state.lastResult === "skipped";

  const statusIcon = skipped ? "⏭️" : (ok ? "✅" : "❌");
  const statusColor = skipped ? "text-slate-900" : (ok ? "text-indigo-900" : "text-rose-900");
  const statusText = skipped ? u.skipped : (ok ? u.correct : u.wrong);

  const why = state.lang === "cy" ? (it.WhyCy || it.WhyEn) : (it.WhyEn || it.WhyCy);
  const rule = state.lang === "cy" ? (it.RuleCy || it.RuleEn) : (it.RuleEn || it.RuleCy);

  const answerLine = it.NeedsStep2
    ? `${esc(u.answer)}: <b>${esc(it.AnswerPrep || "")}</b> → <b>${esc(it.AnswerFormCy || "")}</b>`
    : `${esc(u.answer)}: <b>${esc(it.AnswerPrep || "")}</b>`;

  const english = (it.SentenceEN || "").trim();
  const englishLine = english ? `<div class="mt-2 text-slate-700"><span class="font-semibold">${esc("English:")}</span> ${esc(english)}</div>` : "";

  return `
    <div class="mt-5 feedback-box" aria-live="polite">
      <div class="flex items-center gap-2 ${statusColor} text-2xl md:text-3xl font-semibold">
        ${statusIcon} ${esc(statusText)}
      </div>

      <div class="mt-2 text-slate-800 text-lg md:text-xl">
        ${answerLine}
      </div>

      ${englishLine}

      ${why ? `<div class="mt-4 text-slate-700">${why}</div>` : ""}
      ${rule ? `<div class="mt-3 text-slate-600">${rule}</div>` : ""}
    </div>
  `;
}

/* ========= Core interactions ========= */
function onPick(choice) {
  if (state.locked || !state.current) return;
  const it = state.current;

  if (state.step === 1) {
    state.chosenStep1 = choice;
    const correct = normalize(choice) === normalize(it.AnswerPrep || "");

    if (!correct) {
      state.locked = true;
      state.showFeedback = true;
      state.lastResult = "wrong";
      state.done += 1;
      state.streak = 0;
      render();
      return;
    }

    // step1 correct
    if (it.NeedsStep2) {
      state.step = 2;
      state.locked = false;     // allow step 2 choices
      state.showFeedback = true; // show “correct” feedback but keep going
      state.lastResult = "correct";
      // do NOT increment done/correct yet; done counts when question completes (after step2)
      render();
      return;
    }

    // no step2: question complete
    state.locked = true;
    state.showFeedback = true;
    state.lastResult = "correct";
    state.done += 1;
    state.correct += 1;
    state.streak += 1;
    render();
    return;
  }

  // Step 2
  const correct = normalize(choice) === normalize(it.AnswerFormCy || "");
  state.locked = true;
  state.showFeedback = true;
  state.done += 1;

  if (correct) {
    state.correct += 1;
    state.streak += 1;
    state.lastResult = "correct";
  } else {
    state.streak = 0;
    state.lastResult = "wrong";
  }

  render();
}

function reveal() {
  if (!state.current) return;
  const it = state.current;

  state.locked = true;
  state.showFeedback = true;
  state.lastResult = "wrong"; // reveal counts as not-correct (keeps stats honest)
  state.done += 1;
  state.streak = 0;

  // Fill the step1 chosen with the correct preposition so the UI reflects it
  state.chosenStep1 = it.AnswerPrep || "__";

  // If step2 exists, force step2 complete visually by moving to step2 and locking,
  // but feedback shows the answer anyway.
  if (it.NeedsStep2) state.step = 2;

  render();
}

function skip() {
  if (!state.current) return;
  state.locked = true;
  state.showFeedback = true;
  state.lastResult = "skipped";
  state.done += 1;
  state.streak = 0;
  render();
}

function next() {
  // Only allow “Next” after feedback is shown (keeps flow clean)
  if (!state.showFeedback) return;

  state.current = pickNextItem();
  resetQuestionState();
  render();
}

/* ========= Render right-side stats ========= */
function renderSession() {
  const acc = computeAccuracy();
  if (els.accBig) els.accBig.textContent = `${acc}%`;
  if (els.accText) els.accText.textContent = `${state.correct} / ${state.done} correct`;
  if (els.streakText) els.streakText.textContent = `${ui().streak}: ${state.streak}`;
  if (els.doneText) els.doneText.textContent = `${ui().done}: ${state.done}`;
}

/* ========= One render to rule them all ========= */
function render() {
  wmSetDocLang(state.lang);
  renderFilters();
  renderPractice();
  renderSession();

  // Enable/disable mobile Next based on feedback presence
  if (els.mbNext) els.mbNext.disabled = !state.showFeedback;
}

/* ========= Wiring ========= */
function wireUi() {
  // Filters
  els.fLevel?.addEventListener("change", (e) => { state.fLevel = e.target.value; state.used.clear(); state.current = pickNextItem(); resetQuestionState(); render(); });
  els.fMode?.addEventListener("change",  (e) => { state.fMode = e.target.value;  state.used.clear(); state.current = pickNextItem(); resetQuestionState(); render(); });
  els.fTopic?.addEventListener("change", (e) => { state.fTopic = e.target.value; state.used.clear(); state.current = pickNextItem(); resetQuestionState(); render(); });
  els.fContrast?.addEventListener("change",(e)=> { state.fContrast = e.target.value; state.used.clear(); state.current = pickNextItem(); resetQuestionState(); render(); });

  els.btnNewQuestion?.addEventListener("click", () => {
    state.current = pickNextItem();
    resetQuestionState();
    render();
  });

  els.btnResetAll?.addEventListener("click", () => {
    state.correct = 0;
    state.done = 0;
    state.streak = 0;
    state.used.clear();
    state.current = pickNextItem();
    resetQuestionState();
    render();
  });

  // Footer
  els.btnTop?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) || "";
    if (["INPUT", "TEXTAREA", "SELECT"].includes(tag.toUpperCase())) return;

    // 1–4 pick choice
    const n = Number.parseInt(e.key, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 4) {
      const btn = $(`#choicesGrid button[data-idx="${n-1}"]`);
      if (btn && !btn.disabled) btn.click();
      return;
    }

    if (e.key.toLowerCase() === "h") { e.preventDefault(); $("#btnHint")?.click(); }
    if (e.key.toLowerCase() === "r") { e.preventDefault(); $("#btnReveal")?.click(); }
    if (e.key.toLowerCase() === "n") { e.preventDefault(); $("#btnNext")?.click(); }
    if (e.key === "Enter") {
      // After feedback, Enter goes next
      if (state.showFeedback) { e.preventDefault(); $("#btnNext")?.click(); }
    }
  });

  // Sync language with navbar toggle (same-tab clicks don’t fire storage events)
  document.addEventListener("click", (e) => {
    if (e.target.closest && e.target.closest("#btnLangToggle")) {
      setTimeout(() => {
        const next = wmGetLang();
        if (next !== state.lang) {
          state.lang = next;
          render();
        }
      }, 0);
    }
  });

  // Also sync on focus (covers any edge cases)
  window.addEventListener("focus", () => {
    const next = wmGetLang();
    if (next !== state.lang) {
      state.lang = next;
      render();
    }
  });
}

/* ========= Admin: CSV load controls ========= */
async function loadDataFromUrl(url) {
  const raw = await loadCsvUrl(url);
  const cleaned = raw.map(coercePrepRow);
  // drop totally empty rows
  return cleaned.filter(r => (r.BeforeCy || r.AfterCy || r.AnswerPrep || r.SentenceEN));
}

function initAdminPanel() {
  const isAdmin = getParam("admin") === "1";
  if (!isAdmin) return;
  els.adminPanel?.classList.remove("hidden");

  const initial = getParam("sheet") || loadLS(SHEET_LS_KEY, "") || "";
  if (els.dataUrl) els.dataUrl.value = initial;

  els.btnLoadUrl?.addEventListener("click", async () => {
    const u = (els.dataUrl?.value || "").trim();
    if (!u) return;
    try {
      const data = await loadDataFromUrl(u);
      state.items = data.length ? data : FALLBACK_ITEMS;
      saveLS(SHEET_LS_KEY, u);
      state.used.clear();
      state.current = pickNextItem();
      resetQuestionState();
      render();
    } catch (err) {
      alert("Couldn't load CSV: " + (err?.message || err));
    }
  });

  els.fileCsv?.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const raw = res.data || [];
        const data = raw.map(coercePrepRow).filter(r => (r.BeforeCy || r.AfterCy || r.AnswerPrep || r.SentenceEN));
        state.items = data.length ? data : FALLBACK_ITEMS;
        state.used.clear();
        state.current = pickNextItem();
        resetQuestionState();
        render();
      }
    });
  });
}

/* ========= Boot ========= */
(async function boot() {
  wireUi();

  // initial language from navbar storage
  state.lang = wmGetLang();
  wmSetDocLang(state.lang);

  // load data (sheet param > localStorage > default)
  const sheet = getParam("sheet") || loadLS(SHEET_LS_KEY, "") || DEFAULT_CSV_URL;

  let items = [];
  try {
    items = await loadDataFromUrl(sheet);
    if (!items.length) items = FALLBACK_ITEMS;
  } catch {
    items = FALLBACK_ITEMS;
  }
  state.items = items;

  // set initial filter defaults
  const u = ui();
  state.fLevel = u.all;
  state.fMode = u.all;
  state.fTopic = u.all;
  state.fContrast = u.all;

  state.current = pickNextItem();
  resetQuestionState();

  initAdminPanel();
  render();
})();
