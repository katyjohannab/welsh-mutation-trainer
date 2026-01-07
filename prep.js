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

/* ========= Utilities ========= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

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
function saveLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
function loadLS(k, d) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : d; } catch (_) { return d; } }
function getParam(k) { return new URLSearchParams(location.search).get(k); }

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ========= CSV loading ========= */
function loadCsvUrl(url) {
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

/* ========= Field coercion ========= */
function getVal(row, names) {
  const r = row || {};
  const keys = Object.keys(r);
  for (const key of keys) {
    const kk = key.trim().toLowerCase();
    if (names.some(n => kk === n.toLowerCase())) return (r[key] ?? "").toString().trim();
  }
  return "";
}

function coerceRow(row, idx) {
  // Expected CSV columns (flexible):
  // id/CardId, level, topic, type, before_cy, after_cy, answer_prep, needs_step2,
  // pronoun_key, answer_form_cy, english, hint_en, hint_cy, why_en, why_cy,
  // choices (comma/pipe separated), form_choices (comma/pipe separated)

  const id = getVal(row, ["cardid","card_id","id","item_id"]) || `row_${idx}`;
  const level = getVal(row, ["level","lef"]) || "";
  const topic = getVal(row, ["topic","pwnc"]) || "";

  const type = (getVal(row, ["type","mode"]) || "prep").trim(); // prep | prep+pronoun

  const beforeCy = getVal(row, ["before_cy","beforecy","cy_before","before"]) || "";
  const afterCy  = getVal(row, ["after_cy","aftercy","cy_after","after"]) || "";

  const answerPrep = getVal(row, ["answer_prep","answerprep","prep","answer"]) || "";
  const needsStep2 = normalize(getVal(row, ["needs_step2","needsstep2","step2"])) === "1";
  const pronounKey = getVal(row, ["pronoun_key","pronounkey"]) || "";
  const answerFormCy = getVal(row, ["answer_form_cy","answerformcy","form_cy","answer_form"]) || "";

  const english = getVal(row, ["english","meaning_en","en","prompt_en"]) || "";

  const hintEn = getVal(row, ["hint_en","hint"]) || "";
  const hintCy = getVal(row, ["hint_cy"]) || "";

  const whyEn = getVal(row, ["why_en","why","explanation_en"]) || "";
  const whyCy = getVal(row, ["why_cy","explanation_cy"]) || "";

  const choicesRaw = getVal(row, ["choices","options"]);
  const formChoicesRaw = getVal(row, ["form_choices","options2","choices2"]);

  const splitList = (s) =>
    (s || "")
      .split(/[|,]/g)
      .map(x => x.trim())
      .filter(Boolean);

  return {
    CardId: id,
    Level: level,
    Topic: topic,
    Type: type,
    BeforeCy: beforeCy,
    AfterCy: afterCy,
    AnswerPrep: answerPrep,
    NeedsStep2: needsStep2,
    PronounKey: pronounKey,
    AnswerFormCy: answerFormCy,
    English: english,
    HintEn: hintEn,
    HintCy: hintCy,
    WhyEn: whyEn,
    WhyCy: whyCy,
    Choices: splitList(choicesRaw),
    FormChoices: splitList(formChoicesRaw),
  };
}

/* ========= TTS (same pattern as your mutation trainer) ========= */
const POLLY_FUNCTION_URL = "https://pl6xqfeht2hhbruzlhm3imcpya0upied.lambda-url.eu-west-2.on.aws/";
const ttsCache = new Map();

function buildWelshSentence(beforeCy, fill, afterCy) {
  const before = (beforeCy || "").trimEnd();
  const mid = (fill || "").trim();
  const after = (afterCy || "").trimStart();
  let s = [before, mid, after].filter(Boolean).join(" ");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/\s+([,.;:!?])/g, "$1");
  return s;
}

async function playPollySentence(sentence) {
  if (!sentence) throw new Error("No sentence to speak.");

  const cached = ttsCache.get(sentence);
  if (cached) {
    const audio = new Audio(cached);
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
    url = URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" }));
  } else {
    const j = await res.json();
    if (j.url) url = j.url;
    else if (j.audioBase64 || j.audioContent) {
      const b64 = j.audioBase64 || j.audioContent;
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      url = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
    } else {
      throw new Error("TTS response didn't include audio.");
    }
  }

  ttsCache.set(sentence, url);
  const audio = new Audio(url);
  await audio.play();
}

/* ========= “?” popover (re-uses your existing classes) ========= */
function mountSentenceTranslationUI(anchorEl, englishSentence) {
  if (!anchorEl) return;
  const meaning = (englishSentence || "").trim();
  if (!meaning) return;

  // Ensure absolute “?” positions correctly
  anchorEl.style.position = "relative";

  // If already mounted, don't duplicate
  if (anchorEl.querySelector(".base-info-btn")) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "base-info-btn";
  btn.textContent = "?";
  btn.setAttribute("aria-label", "English");
  btn.setAttribute("title", "English");

  const pop = document.createElement("div");
  pop.className = "base-info-popover hidden animate-pop";
  pop.setAttribute("role", "dialog");

  const close = document.createElement("button");
  close.type = "button";
  close.className = "base-info-close";
  close.setAttribute("aria-label", "Close");
  close.textContent = "×";

  pop.innerHTML = `<div class="base-info-meaning">${esc(meaning)}</div>`;
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

document.addEventListener("click", () => {
  $$(".base-info-popover").forEach(p => p.classList.add("hidden"));
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") $$(".base-info-popover").forEach(p => p.classList.add("hidden"));
});

/* ========= App state ========= */
const STATS_KEY = "prep_stats_v1";
const LANG_KEY = "prep_lang_v1";
const DIFF_KEY = "prep_diff_v1";
const FILTERS_KEY = "prep_filters_v1";

const state = {
  rows: [],
  filtered: [],
  deck: [],
  p: 0,
  current: null,

  // step flow
  step: 1,
  revealed: false,
  lastResult: null,
  step1Choice: null,

  // settings
  lang: loadLS(LANG_KEY, "en"),            // UI language (en/cy)
  difficulty: loadLS(DIFF_KEY, "easy"),    // easy/hard
  filters: loadLS(FILTERS_KEY, { level: "All", topic: "All", type: "All" }),

  // stats
  stats: loadLS(STATS_KEY, { score: 0, streak: 0, done: 0 }),
};

/* ========= DOM ========= */
const dom = {
  btnLangToggle: $("#btnLangToggle"),

  pillPos: $("#pillPos"),
  pillTopic: $("#pillTopic"),
  pillLevel: $("#pillLevel"),
  pillMode: $("#pillMode"),

  enPrompt: $("#enPrompt"),
  cySentence: $("#cySentence"),

  stepPill: $("#stepPill"),
  stepHelp: $("#stepHelp"),

  hintBox: $("#hintBox"),

  choices: $("#choices"),
  hardRow: $("#hardRow"),
  hardInput: $("#hardInput"),
  btnCheckHard: $("#btnCheckHard"),

  btnEasy: $("#btnEasy"),
  btnHard: $("#btnHard"),

  btnHear: $("#btnHear"),
  btnHint: $("#btnHint"),
  btnReveal: $("#btnReveal"),
  btnNew: $("#btnNew"),
  btnNext: $("#btnNext"),

  feedback: $("#feedback"),
  fbHeadline: $("#fbHeadline"),
  fbBody: $("#fbBody"),

  loadErrorWrap: $("#loadError"),
  loadErrorBox: $("#loadError .panel"),

  fLevel: $("#fLevel"),
  fTopic: $("#fTopic"),
  fType: $("#fType"),
  btnClearFilters: $("#btnClearFilters"),

  vScore: $("#vScore"),
  vStreak: $("#vStreak"),
  vDone: $("#vDone"),
  btnResetStats: $("#btnResetStats"),

  mbHint: $("#mbHint"),
  mbReveal: $("#mbReveal"),
  mbNew: $("#mbNew"),
};

function uiText(en, cy) {
  return state.lang === "cy" ? cy : en;
}

/* ========= Filters ========= */
function fillSelect(sel, options, value) {
  sel.innerHTML = "";
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt;
    sel.appendChild(o);
  }
  sel.value = options.includes(value) ? value : options[0];
}

function buildFiltersUI() {
  const levels = Array.from(new Set(state.rows.map(r => r.Level).filter(Boolean))).sort((a,b)=>String(a).localeCompare(String(b)));
  const topics = Array.from(new Set(state.rows.map(r => r.Topic).filter(Boolean))).sort((a,b)=>String(a).localeCompare(String(b)));
  const types  = Array.from(new Set(state.rows.map(r => r.Type).filter(Boolean))).sort((a,b)=>String(a).localeCompare(String(b)));

  fillSelect(dom.fLevel, ["All", ...levels], state.filters.level || "All");
  fillSelect(dom.fTopic, ["All", ...topics], state.filters.topic || "All");
  fillSelect(dom.fType,  ["All", ...types],  state.filters.type  || "All");
}

function applyFilters() {
  const { level, topic, type } = state.filters;

  state.filtered = state.rows.filter(r => {
    if (level && level !== "All" && String(r.Level) !== String(level)) return false;
    if (topic && topic !== "All" && String(r.Topic) !== String(topic)) return false;
    if (type  && type  !== "All" && String(r.Type)  !== String(type))  return false;
    return true;
  });
}

function rebuildDeck() {
  state.deck = shuffle(Array.from({ length: state.filtered.length }, (_, i) => i));
  state.p = 0;
}

/* ========= Question logic ========= */
const COMMON_PREPS = ["i","at","ar","o","wrth","gyda","â","dan","dros","drwy","heb","hyd","tan","yn","yng"];

function getChoiceSet(card) {
  // 1) prefer CSV-provided choices
  const given = (card.Choices || []).filter(Boolean);
  if (given.length >= 2) {
    const set = Array.from(new Set([card.AnswerPrep, ...given])).slice(0, 6);
    return shuffle(set).slice(0, 4);
  }

  // 2) auto-generate: correct + 3 distractors
  const pool = COMMON_PREPS.filter(p => normalize(p) !== normalize(card.AnswerPrep));
  const distractors = shuffle(pool).slice(0, 3);
  return shuffle([card.AnswerPrep, ...distractors]);
}

function getFormChoiceSet(card) {
  // step 2 choices in Welsh form (arna i etc.)
  const correct = card.AnswerFormCy;
  const given = (card.FormChoices || []).filter(Boolean);
  if (given.length >= 2) {
    const set = Array.from(new Set([correct, ...given])).filter(Boolean);
    return shuffle(set).slice(0, 4);
  }

  // fallback: if no form choices provided, just show correct + “prep + fi” style distractors
  const fallback = [
    correct,
    `${card.AnswerPrep} fi`,
    `${card.AnswerPrep} ti`,
    `${card.AnswerPrep} nhw`,
  ].filter(Boolean);

  return shuffle(Array.from(new Set(fallback))).slice(0, 4);
}

function currentCard() {
  if (!state.filtered.length) return null;
  const idx = state.deck[state.p % state.deck.length];
  return state.filtered[idx];
}

function nextCard() {
  if (!state.filtered.length) return;
  state.p = (state.p + 1) % state.deck.length;

  state.step = 1;
  state.revealed = false;
  state.lastResult = null;
  state.step1Choice = null;

  render();
}

function setFeedback(show, headline = "", bodyHtml = "", tone = "neutral") {
  dom.feedback.classList.toggle("hidden", !show);
  if (!show) return;

  dom.fbHeadline.textContent = headline;
  dom.fbBody.innerHTML = bodyHtml;

  // subtle tone color via inline styles (doesn't fight your CSS)
  dom.fbHeadline.style.color =
    tone === "good" ? "#0f766e" :
    tone === "bad"  ? "#be123c" :
    "#111827";
}

/* ========= Rendering ========= */
function renderLangToggle() {
  const next = state.lang === "en" ? "CY" : "EN";
  dom.btnLangToggle.innerHTML = `<span aria-hidden="true">🔁</span><span class="langtag">${next}</span>`;
  dom.btnLangToggle.title = state.lang === "en" ? "Switch to Cymraeg" : "Switch to English";
}

function renderStats() {
  dom.vScore.textContent = String(state.stats.score || 0);
  dom.vStreak.textContent = String(state.stats.streak || 0);
  dom.vDone.textContent = String(state.stats.done || 0);
}

function setDifficultyUI() {
  const easyOn = state.difficulty === "easy";
  dom.btnEasy.classList.toggle("is-on", easyOn);
  dom.btnEasy.setAttribute("aria-pressed", easyOn ? "true" : "false");
  dom.btnHard.classList.toggle("is-on", !easyOn);
  dom.btnHard.setAttribute("aria-pressed", !easyOn ? "true" : "false");

  dom.choices.classList.toggle("hidden", !easyOn);
  dom.hardRow.classList.toggle("hidden", easyOn);
}

function render() {
  renderLangToggle();
  setDifficultyUI();
  renderStats();

  const card = currentCard();
  state.current = card;

  if (!card) {
    dom.enPrompt.textContent = uiText("No items match your filters.", "Does dim eitemau’n cyfateb i’r hidlwyr.");
    dom.cySentence.innerHTML = "";
    dom.choices.innerHTML = "";
    dom.hardInput.value = "";
    dom.hintBox.classList.add("hidden");
    setFeedback(false);
    return;
  }

  // Pills
  dom.pillPos.textContent = `Card ${Math.min(state.p + 1, state.deck.length)} / ${state.deck.length}`;
  dom.pillTopic.textContent = `Topic: ${card.Topic || "—"}`;
  dom.pillLevel.textContent = `Level: ${card.Level || "—"}`;
  dom.pillMode.textContent = `Type: ${card.Type || "prep"}`;

  // English prompt (always visible)
  dom.enPrompt.textContent = card.English || "—";

  // Hint
  const hint = state.lang === "cy" ? (card.HintCy || card.HintEn) : (card.HintEn || card.HintCy);
  dom.hintBox.innerHTML = hint ? esc(hint) : "";
  // keep visibility as user set (don’t force show)

  // Welsh sentence with gap capsule
  const before = card.BeforeCy || "";
  const after = card.AfterCy || "";

  // what to show in the gap
  let gapText = "____";
  if (state.revealed) {
    if (state.step === 1) gapText = card.AnswerPrep || "—";
    else gapText = card.AnswerPrep || "—";
  } else if (state.step1Choice) {
    gapText = state.step1Choice;
  }

  dom.cySentence.innerHTML = `
    <span>${esc(before)}</span>
    <span id="gapCapsule"
          class="inline-flex items-baseline bg-indigo-100 ring-1 ring-indigo-300 rounded-2xl px-4 py-1.5 shadow-sm mx-1"
          style="position:relative;">
      <span class="text-indigo-900 text-2xl md:text-3xl font-bold tracking-tight">${esc(gapText)}</span>
    </span>
    <span>${esc(after)}</span>
  `;

  // Mount the “?” on the tested word (gap capsule) — shows full English sentence
  mountSentenceTranslationUI($("#gapCapsule"), card.English);

  // Step UI
  if (state.step === 1) {
    dom.stepPill.textContent = card.NeedsStep2 ? uiText("Step 1 of 2", "Cam 1 o 2") : uiText("Step 1 of 1", "Cam 1 o 1");
    dom.stepHelp.textContent = uiText("Choose the correct preposition.", "Dewiswch yr arddodiad cywir.");
  } else {
    dom.stepPill.textContent = uiText("Step 2 of 2", "Cam 2 o 2");
    dom.stepHelp.textContent = uiText("Choose the correct pronoun form.", "Dewiswch y ffurf rhagenw gywir.");
  }

  // Choices / input
  if (state.difficulty === "easy") {
    renderChoices(card);
  } else {
    dom.choices.innerHTML = "";
    dom.hardInput.disabled = state.revealed;
    if (!state.revealed) dom.hardInput.value = "";
  }

  // Feedback
  if (!state.revealed) setFeedback(false);
}

/* ========= Choice rendering & marking ========= */
function renderChoices(card) {
  dom.choices.innerHTML = "";
  const choices = (state.step === 1) ? getChoiceSet(card) : getFormChoiceSet(card);

  choices.forEach((ch, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-ghost px-4 py-3 rounded-2xl w-full";
    b.innerHTML = `<span class="text-slate-700 font-semibold">${esc(ch)}</span>`;
    b.title = `Key ${i + 1}`;

    b.addEventListener("click", () => {
      if (state.revealed) return;
      if (state.step === 1) handleStep1Choice(ch);
      else handleStep2Choice(ch);
    });

    dom.choices.appendChild(b);
  });
}

function markButtons(correctValue, chosenValue) {
  const btns = $$("#choices button");
  btns.forEach(b => {
    const v = normalize(b.textContent);
    b.disabled = true;

    if (v === normalize(correctValue)) {
      b.classList.remove("btn-ghost");
      b.classList.add("btn-primary", "shadow");
    } else if (chosenValue && v === normalize(chosenValue) && v !== normalize(correctValue)) {
      // wrong choice
      b.classList.remove("btn-ghost");
      b.classList.add("btn-ghost");
      b.style.borderColor = "#fda4af";
      b.style.background = "#fff1f2";
    } else {
      b.classList.add("opacity-80");
    }
  });
}

/* ========= Answer handling ========= */
function handleStep1Choice(choice) {
  const card = state.current;
  state.step1Choice = choice;

  const ok = normalize(choice) === normalize(card.AnswerPrep);

  if (!ok) {
    state.revealed = true;
    state.lastResult = "wrong";

    state.stats.done += 1;
    state.stats.streak = 0;

    saveLS(STATS_KEY, state.stats);

    markButtons(card.AnswerPrep, choice);

    const correctSentence = buildWelshSentence(card.BeforeCy, card.AnswerPrep, card.AfterCy);
    const why = state.lang === "cy" ? (card.WhyCy || card.WhyEn) : (card.WhyEn || card.WhyCy);

    setFeedback(true,
      uiText("Not quite", "Anghywir"),
      `
        <div class="text-slate-700"><b>${uiText("Answer:", "Ateb:")}</b> ${esc(card.AnswerPrep)}</div>
        <div class="mt-2 text-slate-700"><b>${uiText("Welsh:", "Cymraeg:")}</b> ${esc(correctSentence)}</div>
        ${why ? `<div class="mt-3 text-slate-700">${esc(why)}</div>` : ""}
      `,
      "bad"
    );

    renderStats();
    return;
  }

  // Step 1 correct
  if (card.NeedsStep2) {
    state.step = 2;
    // keep revealed=false (we’re continuing)
    setFeedback(true,
      uiText("Good — one more step", "Da — un cam arall"),
      uiText("Now choose the correct pronoun form.", "Nawr dewiswch y ffurf rhagenw gywir."),
      "good"
    );

    // rerender buttons for step2
    render();
    return;
  }

  // Fully correct (no step2)
  state.revealed = true;
  state.lastResult = "correct";

  state.stats.done += 1;
  state.stats.score += 1;
  state.stats.streak += 1;
  saveLS(STATS_KEY, state.stats);

  markButtons(card.AnswerPrep, choice);

  const correctSentence = buildWelshSentence(card.BeforeCy, card.AnswerPrep, card.AfterCy);
  const why = state.lang === "cy" ? (card.WhyCy || card.WhyEn) : (card.WhyEn || card.WhyCy);

  setFeedback(true,
    uiText("Correct", "Cywir"),
    `
      <div class="text-slate-700"><b>${uiText("Answer:", "Ateb:")}</b> ${esc(card.AnswerPrep)}</div>
      <div class="mt-2 text-slate-700"><b>${uiText("Welsh:", "Cymraeg:")}</b> ${esc(correctSentence)}</div>
      ${why ? `<div class="mt-3 text-slate-700">${esc(why)}</div>` : ""}
    `,
    "good"
  );

  renderStats();
  render();
}

function handleStep2Choice(choiceFormCy) {
  const card = state.current;
  const ok = normalize(choiceFormCy) === normalize(card.AnswerFormCy);

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

  markButtons(card.AnswerFormCy, choiceFormCy);

  const correctSentence = buildWelshSentence(card.BeforeCy, card.AnswerFormCy || card.AnswerPrep, card.AfterCy);
  const why = state.lang === "cy" ? (card.WhyCy || card.WhyEn) : (card.WhyEn || card.WhyCy);

  setFeedback(true,
    ok ? uiText("Correct", "Cywir") : uiText("Not quite", "Anghywir"),
    `
      <div class="text-slate-700"><b>${uiText("Answer:", "Ateb:")}</b> ${esc(card.AnswerFormCy || "—")}</div>
      <div class="mt-2 text-slate-700"><b>${uiText("Welsh:", "Cymraeg:")}</b> ${esc(correctSentence)}</div>
      ${why ? `<div class="mt-3 text-slate-700">${esc(why)}</div>` : ""}
    `,
    ok ? "good" : "bad"
  );

  renderStats();
  render();
}

function reveal() {
  const card = state.current;
  if (!card) return;

  state.revealed = true;
  state.lastResult = "revealed";

  state.stats.done += 1;
  state.stats.streak = 0;
  saveLS(STATS_KEY, state.stats);

  const correctSentence = buildWelshSentence(card.BeforeCy, card.NeedsStep2 ? (card.AnswerFormCy || card.AnswerPrep) : card.AnswerPrep, card.AfterCy);
  const why = state.lang === "cy" ? (card.WhyCy || card.WhyEn) : (card.WhyEn || card.WhyCy);

  setFeedback(true,
    uiText("Revealed", "Wedi’i ddangos"),
    `
      <div class="text-slate-700"><b>${uiText("Answer:", "Ateb:")}</b>
        ${esc(card.AnswerPrep)}${card.NeedsStep2 && card.AnswerFormCy ? ` → ${esc(card.AnswerFormCy)}` : ""}
      </div>
      <div class="mt-2 text-slate-700"><b>${uiText("Welsh:", "Cymraeg:")}</b> ${esc(correctSentence)}</div>
      ${why ? `<div class="mt-3 text-slate-700">${esc(why)}</div>` : ""}
    `,
    "bad"
  );

  // disable choices / hard input
  $$("#choices button").forEach(b => b.disabled = true);
  dom.hardInput.disabled = true;

  renderStats();
  render();
}

function checkHard() {
  const card = state.current;
  if (!card || state.revealed) return;

  if (state.step !== 1) return; // hard mode only for step1 in this simple version

  const val = (dom.hardInput.value || "").trim();
  state.step1Choice = val;

  handleStep1Choice(val);
}

/* ========= Events ========= */
function wire() {
  // Language toggle affects UI strings + which why/hint fields we prefer
  dom.btnLangToggle?.addEventListener("click", () => {
    state.lang = state.lang === "en" ? "cy" : "en";
    saveLS(LANG_KEY, state.lang);
    render();
  });

  dom.btnEasy?.addEventListener("click", () => {
    state.difficulty = "easy";
    saveLS(DIFF_KEY, state.difficulty);
    render();
  });
  dom.btnHard?.addEventListener("click", () => {
    state.difficulty = "hard";
    saveLS(DIFF_KEY, state.difficulty);
    render();
    setTimeout(() => dom.hardInput?.focus(), 0);
  });

  dom.btnNew?.addEventListener("click", () => nextCard());
  dom.btnNext?.addEventListener("click", () => nextCard());

  dom.btnHint?.addEventListener("click", () => {
    dom.hintBox.classList.toggle("hidden");
  });

  dom.btnReveal?.addEventListener("click", reveal);

  dom.btnHear?.addEventListener("click", async () => {
    const card = state.current;
    if (!card) return;
    try {
      const fill = state.revealed
        ? (card.NeedsStep2 ? (card.AnswerFormCy || card.AnswerPrep) : card.AnswerPrep)
        : (state.step1Choice || card.AnswerPrep);
      const sentence = buildWelshSentence(card.BeforeCy, fill, card.AfterCy);
      await playPollySentence(sentence);
    } catch (e) {
      alert("Couldn't play audio: " + (e?.message || e));
    }
  });

  dom.btnCheckHard?.addEventListener("click", checkHard);
  dom.hardInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      checkHard();
    }
  });

  // Mobile
  dom.mbHint?.addEventListener("click", () => dom.btnHint?.click());
  dom.mbReveal?.addEventListener("click", () => dom.btnReveal?.click());
  dom.mbNew?.addEventListener("click", () => dom.btnNew?.click());

  // Filters
  const onFilterChange = () => {
    state.filters.level = dom.fLevel.value;
    state.filters.topic = dom.fTopic.value;
    state.filters.type  = dom.fType.value;
    saveLS(FILTERS_KEY, state.filters);

    applyFilters();
    rebuildDeck();

    state.step = 1;
    state.revealed = false;
    state.lastResult = null;
    state.step1Choice = null;

    render();
  };

  dom.fLevel?.addEventListener("change", onFilterChange);
  dom.fTopic?.addEventListener("change", onFilterChange);
  dom.fType?.addEventListener("change", onFilterChange);

  dom.btnClearFilters?.addEventListener("click", () => {
    state.filters = { level: "All", topic: "All", type: "All" };
    saveLS(FILTERS_KEY, state.filters);
    buildFiltersUI();
    onFilterChange();
  });

  dom.btnResetStats?.addEventListener("click", () => {
    state.stats = { score: 0, streak: 0, done: 0 };
    saveLS(STATS_KEY, state.stats);
    renderStats();
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    // If typing in input, don't steal keys except Enter which is handled above
    const tag = (e.target && e.target.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    if (e.key === "Enter") {
      if (state.revealed) dom.btnNext?.click();
      return;
    }
    if (e.key.toLowerCase() === "n") dom.btnNew?.click();
    if (e.key.toLowerCase() === "h") dom.btnHint?.click();
    if (e.key.toLowerCase() === "r") dom.btnReveal?.click();

    // 1–4 pick choice in Easy mode
    if (state.difficulty === "easy" && !state.revealed) {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 4) {
        const btns = $$("#choices button");
        btns[n - 1]?.click();
      }
    }
  });
}

/* ========= Boot ========= */
async function boot() {
  wire();

  // IMPORTANT: use a RELATIVE path so GitHub Pages project sites work.
  // This resolves to ".../welsh-mutation-trainer/data/prep.csv" on your site.
  const defaultCsv = new URL("data/prep.csv", document.baseURI).toString();

  // Optional override: ?sheet=<csv-url>
  const csvUrl = getParam("sheet") || defaultCsv;

  try {
    const raw = await loadCsvUrl(csvUrl);
    const cleaned = raw.map(coerceRow).filter(r => r.AnswerPrep || r.English || r.BeforeCy || r.AfterCy);

    state.rows = cleaned;

    buildFiltersUI();
    // ensure UI reflects stored filters
    dom.fLevel.value = state.filters.level || "All";
    dom.fTopic.value = state.filters.topic || "All";
    dom.fType.value  = state.filters.type  || "All";

    applyFilters();
    rebuildDeck();
    render();
  } catch (e) {
    const msg =
      `Couldn't load CSV.<br><br>` +
      `<b>Tried:</b> <code>${esc(csvUrl)}</code><br><br>` +
      `Fix: make sure <code>data/prep.csv</code> exists in your repo and is published.<br>` +
      `If you're on GitHub Pages project site, do <b>not</b> use <code>/data/prep.csv</code>.<br><br>` +
      `<b>Error:</b> ${esc(e?.message || String(e))}`;

    dom.loadErrorWrap.classList.remove("hidden");
    dom.loadErrorBox.innerHTML = msg;
    dom.enPrompt.textContent = "—";
  }
}

boot();
