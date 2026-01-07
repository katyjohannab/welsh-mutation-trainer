/* ========= Utilities (mirrors your mutation trainer style) ========= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function normalize(s) {
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // allow â/a etc.
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
function getLang() {
  // match your site convention
  const raw = localStorage.getItem("wm_lang");
  if (!raw) return "en";
  try { return JSON.parse(raw); } catch { return raw; }
}
function setLang(lang) {
  try { localStorage.setItem("wm_lang", JSON.stringify(lang)); }
  catch { localStorage.setItem("wm_lang", lang); }
}

function waitForElement(selector, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const found = document.querySelector(selector);
    if (found) return resolve(found);

    const obs = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        obs.disconnect();
        resolve(el);
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });

    setTimeout(() => {
      obs.disconnect();
      resolve(document.querySelector(selector));
    }, timeoutMs);
  });
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
function getVal(row, names) {
  const keys = Object.keys(row || {});
  for (const key of keys) {
    const k = key.trim().toLowerCase();
    if (names.some(n => k === n.toLowerCase())) return (row[key] ?? "").toString().trim();
  }
  return "";
}
function coerceRow(r) {
  const level = Number(getVal(r, ["level", "lvl"])) || 1;

  const topic_en = getVal(r, ["topic_en", "topic", "topic (en)"]);
  const topic_cy = getVal(r, ["topic_cy", "topic (cy)", "pwnc"]);

  const prompt_en = getVal(r, ["prompt_en", "english", "en", "meaning_en", "translate_en"]);
  const prompt_cy = getVal(r, ["prompt_cy", "welsh_prompt", "cy"]);

  const before_cy = getVal(r, ["before_cy", "before", "welsh_before"]);
  const after_cy  = getVal(r, ["after_cy", "after", "welsh_after"]);

  const answer_cy = getVal(r, ["answer_cy", "answer", "target", "expected"]);
  const answer_alt = getVal(r, ["answer_alt", "alts", "alt", "accepted"]);

  const prep = getVal(r, ["prep", "preposition", "arddodiad"]) || (answer_cy.split(" ")[0] || "");

  const hint_en = getVal(r, ["hint_en", "hint (en)", "hint"]);
  const hint_cy = getVal(r, ["hint_cy", "hint (cy)"]);

  const why_en = getVal(r, ["why_en", "why (en)", "why"]);
  const why_cy = getVal(r, ["why_cy", "why (cy)"]);

  const distractors = getVal(r, ["distractors", "choices", "options"]); // pipe-separated, can include correct or not

  const id = getVal(r, ["id", "cardid", "card_id", "item_id"]) || `row_${Math.random().toString(16).slice(2)}`;

  return {
    id,
    level,
    topic_en,
    topic_cy,
    prompt_en,
    prompt_cy,
    before_cy,
    after_cy,
    answer_cy,
    answer_alt,
    prep,
    hint_en,
    hint_cy,
    why_en,
    why_cy,
    distractors
  };
}

/* ========= TTS (same pattern as your mutation trainer) ========= */
const POLLY_FUNCTION_URL = "https://pl6xqfeht2hhbruzlhm3imcpya0upied.lambda-url.eu-west-2.on.aws/";
const ttsCache = new Map();

function buildSentence(before, insert, after) {
  const b = (before || "").trimEnd();
  const i = (insert || "").trim();
  const a = (after || "").trimStart();
  let s = [b, i, a].filter(Boolean).join(" ");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/\s+([,.;:!?])/g, "$1");
  return s;
}
async function playPollySentence(sentence) {
  if (!sentence) return;

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
      throw new Error("TTS response missing url/audio.");
    }
  }

  ttsCache.set(sentence, url);
  const audio = new Audio(url);
  await audio.play();
}

/* ========= Popover “?” (re-uses your CSS classes) ========= */
function mountEnglishPopover(anchorEl, englishSentence) {
  if (!anchorEl) return;
  const meaning = (englishSentence || "").trim();
  if (!meaning) return;

  // anchor absolute-positioned “?” correctly
  anchorEl.style.position = "relative";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "base-info-btn";     // keep identical styling
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
const state = {
  lang: "en",
  rows: [],
  filtered: [],
  used: new Set(),

  // filters
  fLevel: "all",
  fTopic: "all",
  fPrep: "all",

  // mode
  difficulty: "easy", // easy | hard

  // session
  score: 0,
  streak: 0,
  done: 0,

  // current question
  cur: null,
  revealed: false,
  lastResult: null, // correct | wrong | revealed
  guess: ""
};

/* ========= Filtering ========= */
function applyFilters() {
  state.filtered = state.rows.filter(r => {
    if (state.fLevel !== "all" && String(r.level) !== String(state.fLevel)) return false;

    const topicLabel = (state.lang === "cy" ? (r.topic_cy || r.topic_en) : (r.topic_en || r.topic_cy)) || "";
    if (state.fTopic !== "all" && topicLabel !== state.fTopic) return false;

    if (state.fPrep !== "all" && normalize(r.prep) !== normalize(state.fPrep)) return false;

    return true;
  });

  const poolInfo = $("#poolInfo");
  if (poolInfo) {
    poolInfo.textContent =
      state.filtered.length
        ? `${state.filtered.length} items in pool`
        : "No items match your filters.";
  }
}

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function buildFilterSelects() {
  const fLevel = $("#fLevel");
  const fTopic = $("#fTopic");
  const fPrep  = $("#fPrep");

  if (!fLevel || !fTopic || !fPrep) return;

  const levels = uniq(state.rows.map(r => String(r.level))).sort((a,b)=>Number(a)-Number(b));

  const topics = uniq(state.rows.map(r => {
    const t = (state.lang === "cy" ? (r.topic_cy || r.topic_en) : (r.topic_en || r.topic_cy)) || "";
    return t.trim();
  })).sort((a,b)=>a.localeCompare(b));

  const preps = uniq(state.rows.map(r => (r.prep || "").trim())).sort((a,b)=>a.localeCompare(b));

  const fill = (sel, items, current) => {
    sel.innerHTML = "";
    const optAll = document.createElement("option");
    optAll.value = "all";
    optAll.textContent = (state.lang === "cy" ? "Pob un" : "All");
    sel.appendChild(optAll);

    items.forEach(v => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v;
      sel.appendChild(o);
    });

    sel.value = (items.includes(current) ? current : "all");
  };

  fill(fLevel, levels, state.fLevel);
  fill(fTopic, topics, state.fTopic);
  fill(fPrep,  preps,  state.fPrep);
}

/* ========= Question picking + choices ========= */
const FALLBACK_DISTRACTORS = ["i", "at", "o", "am", "ar", "gan", "gyda", "â", "heb", "wrth", "dros", "dan", "trwy", "yng", "yn"];

function parsePipedList(s) {
  return (s || "")
    .split("|")
    .map(x => x.trim())
    .filter(Boolean);
}

function buildChoices(row) {
  const correct = row.answer_cy;
  const fromRow = parsePipedList(row.distractors);
  const poolAnswers = state.rows.map(r => r.answer_cy).filter(Boolean);

  const set = new Set([correct]);

  // 1) user-provided distractors (preferred)
  for (const d of fromRow) set.add(d);

  // 2) pull plausible distractors from same prep focus (if possible)
  const samePrep = state.rows
    .filter(r => normalize(r.prep) === normalize(row.prep) && normalize(r.answer_cy) !== normalize(correct))
    .map(r => r.answer_cy);

  // 3) then from whole bank
  const others = poolAnswers.filter(a => normalize(a) !== normalize(correct));

  function addRandom(fromArr) {
    const shuffled = fromArr.slice().sort(()=>Math.random()-0.5);
    for (const v of shuffled) {
      if (set.size >= 4) break;
      set.add(v);
    }
  }

  addRandom(samePrep);
  addRandom(others);

  // 4) final fallback
  addRandom(FALLBACK_DISTRACTORS);

  const list = Array.from(set).slice(0, 4);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function pickNext() {
  const pool = state.filtered.length ? state.filtered : state.rows;
  if (!pool.length) return null;

  // avoid repeats until exhausted
  const unused = pool.filter(r => !state.used.has(r.id));
  const list = unused.length ? unused : pool;
  if (!unused.length) state.used.clear();

  const row = list[Math.floor(Math.random() * list.length)];
  state.used.add(row.id);
  return row;
}

/* ========= Marking / checking ========= */
function isCorrectGuess(row, guess) {
  const g = normalize(guess);
  if (!g) return false;
  const answers = [row.answer_cy, ...parsePipedList(row.answer_alt)];
  return answers.some(a => normalize(a) === g);
}

function setStats() {
  $("#statScore") && ($("#statScore").textContent = String(state.score));
  $("#statStreak") && ($("#statStreak").textContent = String(state.streak));
  $("#statDone") && ($("#statDone").textContent = String(state.done));
}

/* ========= Render ========= */
function render() {
  const host = $("#prepCard");
  if (!host) return;

  const row = state.cur;
  if (!row) {
    host.innerHTML = `
      <div class="text-slate-700">
        <div class="text-lg font-medium">Couldn’t load data.</div>
        <div class="text-sm text-slate-600 mt-1">Make sure <code>./data/prep.csv</code> exists and is published with your site.</div>
      </div>
    `;
    return;
  }

  const isCY = state.lang === "cy";
  const english = (row.prompt_en || "").trim();
  const welshBefore = (row.before_cy || "").trim();
  const welshAfter  = (row.after_cy || "").trim();
  const correctInsert = (row.answer_cy || "").trim();
  const fullWelsh = buildSentence(welshBefore, correctInsert, welshAfter);

  const hintText = isCY ? (row.hint_cy || row.hint_en) : (row.hint_en || row.hint_cy);
  const whyText  = isCY ? (row.why_cy  || row.why_en)  : (row.why_en  || row.why_cy);

  // Top row: mode toggle + new question
  host.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
      <div class="seg">
        <button id="segEasy" class="seg-btn ${state.difficulty === "easy" ? "is-on" : ""}" type="button" aria-pressed="${state.difficulty === "easy"}">EASY</button>
        <button id="segHard" class="seg-btn ${state.difficulty === "hard" ? "is-on" : ""}" type="button" aria-pressed="${state.difficulty === "hard"}">HARD</button>
      </div>

      <div class="flex items-center gap-2">
        <button id="btnNew" class="btn btn-ghost" type="button">
          <span data-lang="en">New</span><span data-lang="cy">Newydd</span>
        </button>
      </div>
    </div>

    <!-- Instruction (compact) -->
    <div class="practice-instruction text-slate-700 mb-4">
      <span data-lang="en">Choose (or type) the Welsh preposition phrase that matches the English sentence.</span>
      <span data-lang="cy">Dewis (neu deipio) y mynegiad Cymraeg sy’n cyfateb i’r frawddeg Saesneg.</span>
    </div>

    <!-- English sentence (clear hierarchy, no “meaning to express” label) -->
    <div class="rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-4 mb-5">
      <div class="text-xl md:text-2xl leading-snug text-slate-900 font-medium">
        ${esc(english || "(missing English prompt)")}
      </div>
      <div class="mt-2 text-xs text-slate-500">
        ${esc((isCY ? (row.topic_cy || row.topic_en) : (row.topic_en || row.topic_cy)) || "")}
        ${row.level ? ` • ${isCY ? "Lefel" : "Level"} ${row.level}` : ""}
        ${row.prep ? ` • ${isCY ? "Ffocws" : "Focus"}: ${esc(row.prep)}` : ""}
      </div>
    </div>

    <!-- Welsh sentence with gap -->
    <div class="practice-sentence mb-3">
      <div class="practice-sentenceLine flex flex-wrap items-baseline gap-2 text-xl md:text-2xl">
        <span class="text-slate-600">${esc(welshBefore)}</span>

        ${
          state.difficulty === "hard"
            ? `<input id="answerBox"
                      class="border-2 border-slate-300 focus:border-cyan-600 outline-none bg-amber-50 px-3 py-2 rounded-xl text-2xl md:text-3xl leading-tight shadow-sm w-auto md:w-72 flex-shrink-0"
                      placeholder="${isCY ? "Ateb" : "Answer"}"
                      aria-label="${isCY ? "Ateb" : "Answer"}" />`
            : `<span id="gapCapsule"
                     class="inline-flex items-baseline bg-indigo-100 ring-1 ring-indigo-300 rounded-2xl px-5 py-2.5 shadow-sm text-indigo-900 text-2xl md:text-3xl font-bold tracking-tight relative">
                   ${state.revealed ? esc(correctInsert) : "____"}
                 </span>`
        }

        <span class="text-slate-600">${esc(welshAfter)}</span>
      </div>
    </div>

    <!-- Actions -->
    <div class="practice-actions flex flex-wrap gap-3 mb-3">
      <div class="practice-actions-main">
        ${state.difficulty === "hard"
          ? `<button id="btnCheck" class="btn btn-primary shadow" type="button">${isCY ? "Gwirio" : "Check"}</button>`
          : ``
        }
        <button id="btnHint" class="btn btn-ghost" type="button">${isCY ? "Awgrym" : "Hint"}</button>
        <button id="btnReveal" class="btn btn-ghost" type="button">${isCY ? "Datgelu" : "Reveal"}</button>
      </div>

      <div class="practice-actions-aux ml-auto">
        <button id="btnNext" class="btn btn-primary shadow" type="button">${isCY ? "Nesaf" : "Next"}</button>
      </div>
    </div>

    <!-- Easy choices -->
    ${state.difficulty === "easy" ? `<div id="choices" class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3"></div>` : ""}

    <!-- Hint -->
    <div id="hint" class="hidden text-sm text-slate-600 mb-3"></div>

    <!-- Feedback -->
    <div id="feedback" class="practice-feedback" aria-live="polite"></div>
  `;

  // Anchor the red “?” to the GAP (same UX as your mutation trainer)
  // It shows the full English sentence.
  if (state.difficulty === "easy") {
    const gap = $("#gapCapsule");
    mountEnglishPopover(gap, english);
  } else {
    // In hard mode the gap is the input; anchor the ? to the input's wrapper by creating a small anchor span
    const ab = $("#answerBox");
    if (ab) {
      const anchor = document.createElement("span");
      anchor.className = "inline-flex relative";
      ab.parentNode.insertBefore(anchor, ab);
      anchor.appendChild(ab);
      mountEnglishPopover(anchor, english);
    }
  }

  // Wire mode toggles
  $("#segEasy")?.addEventListener("click", () => { state.difficulty = "easy"; state.revealed = false; state.lastResult = null; render(); });
  $("#segHard")?.addEventListener("click", () => { state.difficulty = "hard"; state.revealed = false; state.lastResult = null; state.guess = ""; render(); });

  // Hint
  $("#btnHint")?.addEventListener("click", () => {
    const h = $("#hint");
    if (!h) return;
    h.innerHTML = hintText ? esc(hintText) : (isCY ? "Dim awgrym." : "No hint.");
    h.classList.toggle("hidden");
    $("#answerBox")?.focus();
  });

  // Reveal
  $("#btnReveal")?.addEventListener("click", () => {
    if (!state.cur) return;
    if (!state.revealed) {
      state.revealed = true;
      state.lastResult = "revealed";
      state.done += 1;
      state.streak = 0;
      setStats();
    }
    showFeedback(false);
    if (state.difficulty === "easy") render(); // to fill gapCapsule text
  });

  // Next
  $("#btnNext")?.addEventListener("click", () => nextQuestion());

  // New
  $("#btnNew")?.addEventListener("click", () => nextQuestion(true));

  // Hard mode check
  if (state.difficulty === "hard") {
    const ab = $("#answerBox");
    if (ab) {
      ab.value = state.guess || "";
      ab.focus();

      const doCheck = () => {
        if (!state.cur || state.revealed) return;

        state.guess = ab.value;
        const ok = isCorrectGuess(state.cur, state.guess);

        state.revealed = true;
        state.lastResult = ok ? "correct" : "wrong";
        state.done += 1;

        if (ok) { state.score += 1; state.streak += 1; }
        else { state.streak = 0; }

        setStats();
        showFeedback(ok);
        ab.disabled = true;
        ab.classList.add("opacity-70", "cursor-not-allowed");
      };

      $("#btnCheck")?.addEventListener("click", doCheck);
      ab.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); doCheck(); }
      });
      ab.addEventListener("input", (e) => { state.guess = e.target.value; });
    }
  }

  // Easy mode choices
  if (state.difficulty === "easy") {
    const choicesEl = $("#choices");
    if (choicesEl) {
      const choices = buildChoices(row);

      choicesEl.innerHTML = "";
      choices.forEach((choice, idx) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn btn-ghost";
        b.innerHTML = `<span class="text-slate-500 mr-2">${idx + 1}.</span><span class="font-semibold">${esc(choice)}</span>`;
        b.addEventListener("click", () => onPick(choice, choicesEl));
        choicesEl.appendChild(b);
      });

      // keyboard 1-4
      window.onkeydown = (e) => {
        const tag = (e.target && e.target.tagName) || "";
        if (["INPUT", "TEXTAREA"].includes(tag.toUpperCase())) return;
        if (e.key >= "1" && e.key <= "4") {
          const i = Number(e.key) - 1;
          if (choices[i]) onPick(choices[i], choicesEl);
        } else if (e.key === "Enter") {
          if (state.revealed) $("#btnNext")?.click();
        } else if (e.key.toLowerCase() === "h") {
          $("#btnHint")?.click();
        } else if (e.key.toLowerCase() === "n") {
          $("#btnNext")?.click();
        }
      };
    }
  }

  // Mobile bar mappings
  $("#mbHint")?.onclick = () => $("#btnHint")?.click();
  $("#mbCheck")?.onclick = () => (state.difficulty === "hard" ? $("#btnCheck")?.click() : $("#btnReveal")?.click());
  $("#mbNext")?.onclick = () => $("#btnNext")?.click();

  // back to top
  $("#btnTop")?.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });

  function onPick(choice, choicesEl) {
    if (state.revealed) return;

    const ok = isCorrectGuess(row, choice);

    state.revealed = true;
    state.lastResult = ok ? "correct" : "wrong";
    state.done += 1;

    if (ok) { state.score += 1; state.streak += 1; }
    else { state.streak = 0; }

    setStats();

    // mark buttons
    $$("#choices button", choicesEl).forEach(btn => {
      btn.disabled = true;
      const val = btn.textContent.replace(/^\s*\d+\.\s*/,"").trim();
      if (normalize(val) === normalize(row.answer_cy)) btn.classList.add("btn-primary");
      if (!ok && normalize(val) === normalize(choice)) btn.classList.add("opacity-80");
    });

    // fill the gap visually
    const gap = $("#gapCapsule");
    if (gap) gap.textContent = choice;

    showFeedback(ok);
  }

  function showFeedback(ok) {
    const fb = $("#feedback");
    if (!fb) return;

    if (!state.revealed) { fb.innerHTML = ""; return; }

    const got = (state.difficulty === "hard") ? (state.guess || "") : null;

    const headline =
      state.lastResult === "correct" ? (isCY ? "✅ Cywir!" : "✅ Correct!") :
      state.lastResult === "wrong"   ? (isCY ? "❌ Dim yn hollol" : "❌ Not quite") :
                                      (isCY ? "👀 Datgelwyd" : "👀 Revealed");

    const explain = whyText ? `<div class="mt-3 text-slate-700">${esc(whyText)}</div>` : "";

    const youTyped = (state.difficulty === "hard" && state.lastResult === "wrong")
      ? `<div class="mt-2 text-slate-700">${isCY ? "Teipioch chi" : "You typed"}: <b>${esc(got) || (isCY ? "(gwag)" : "(blank)")}</b></div>`
      : "";

    fb.innerHTML = `
      <div class="feedback-box">
        <div class="text-2xl md:text-3xl font-semibold ${state.lastResult === "correct" ? "text-indigo-900" : "text-rose-900"}">
          ${headline}
        </div>

        ${youTyped}

        <div class="mt-4 text-slate-800 text-xl md:text-2xl flex items-baseline flex-wrap gap-x-3 gap-y-2">
          <span>${esc(welshBefore)}</span>
          <span class="font-semibold bg-indigo-100 text-indigo-900 px-1 rounded">${esc(correctInsert)}</span>
          <span>${esc(welshAfter)}</span>

          <button id="btnHear" class="btn-hear" type="button" title="Hear">
            <span class="icon" aria-hidden="true">▶︎</span>
            <span>${isCY ? "Gwrando" : "Hear"}</span>
          </button>
        </div>

        ${explain}
      </div>
    `;

    $("#btnHear")?.addEventListener("click", async () => {
      try {
        await playPollySentence(fullWelsh);
      } catch (e) {
        alert("Couldn't play audio: " + (e?.message || e));
      }
    });
  }
}

function nextQuestion(clearUsed = false) {
  if (clearUsed) state.used.clear();

  applyFilters();

  const next = pickNext();
  state.cur = next;
  state.revealed = false;
  state.lastResult = null;
  state.guess = "";

  render();
}

/* ========= Boot ========= */
async function boot() {
  state.lang = getLang() || "en";

  // load CSV
  const DATA_URL = new URL("./data/prep.csv", location.href).toString();

  try {
    const raw = await loadCsvUrl(DATA_URL);
    state.rows = raw.map(coerceRow).filter(r => r.answer_cy && r.before_cy);
  } catch (e) {
    console.error("Failed to load CSV:", e);
    state.rows = [];
  }

  // build filters + first question
  buildFilterSelects();
  applyFilters();
  state.cur = pickNext();

  // wire filters
  $("#fLevel")?.addEventListener("change", (e) => { state.fLevel = e.target.value; state.used.clear(); nextQuestion(true); });
  $("#fTopic")?.addEventListener("change", (e) => { state.fTopic = e.target.value; state.used.clear(); nextQuestion(true); });
  $("#fPrep")?.addEventListener("change",  (e) => { state.fPrep  = e.target.value; state.used.clear(); nextQuestion(true); });

  $("#btnResetFilters")?.addEventListener("click", () => {
    state.fLevel = "all"; state.fTopic = "all"; state.fPrep = "all";
    state.used.clear();
    buildFilterSelects();
    nextQuestion(true);
  });

  $("#btnResetSession")?.addEventListener("click", () => {
    state.score = 0; state.streak = 0; state.done = 0;
    setStats();
  });

  setStats();
  render();

  // Sync when navbar language toggle is clicked (navbar is injected asynchronously)
  const langBtn = await waitForElement("#btnLangToggle");
  if (langBtn) {
    langBtn.addEventListener("click", () => {
      // navbar.js changes wm_lang; re-render after it updates
      setTimeout(() => {
        state.lang = getLang() || "en";
        buildFilterSelects();
        applyFilters();
        render();
      }, 0);
    });
  }

  // Also respond if user changes localStorage in another tab
  window.addEventListener("storage", (e) => {
    if (e.key === "wm_lang") {
      state.lang = getLang() || "en";
      buildFilterSelects();
      applyFilters();
      render();
    }
  });
}

document.addEventListener("DOMContentLoaded", boot);
