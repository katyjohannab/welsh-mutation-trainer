/* ========= Welsh Preposition Trainer (CSV-based) =========
   CSV path: data/prep.csv
   - Easy: multiple choice (click or 1-4)
   - Hard: type answer
   - “?” popover shows full English sentence (prompt_en)
*/

(() => {
  "use strict";

  /* ========= Config ========= */
  const DATA_URL = new URL("data/prep.csv", window.location.href).toString();

  // Optional: enable HEAR (Welsh TTS) like your mutation trainer.
  // Leave as "" to disable the button safely.
  const POLLY_FUNCTION_URL = "https://pl6xqfeht2hhbruzlhm3imcpya0upied.lambda-url.eu-west-2.on.aws/";

  /* ========= DOM helpers ========= */
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
  function loadLS(k, d) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : d; } catch { return d; } }

  function getLang() {
    const v = loadLS("wm_lang", "en");
    return (v === "cy" || v === "en") ? v : "en";
  }

  /* ========= CSV coercion ========= */
  function getVal(row, names) {
    const keys = Object.keys(row || {});
    for (const k of keys) {
      if (names.some(n => k.trim().toLowerCase() === n.trim().toLowerCase())) {
        return (row[k] ?? "").toString().trim();
      }
    }
    return "";
  }

  function coerceRow(row, idx) {
    const id = getVal(row, ["id","item_id","CardId","cardid","ItemId"]) || `row_${idx}`;
    const levelRaw = getVal(row, ["level","Level"]);
    const level = levelRaw ? Number(levelRaw) : null;

    return {
      id,
      level: Number.isFinite(level) ? level : null,
      topic_en: getVal(row, ["topic_en","TopicEn","topic","Topic"]) || "",
      topic_cy: getVal(row, ["topic_cy","TopicCy"]) || "",
      prompt_en: getVal(row, ["prompt_en","PromptEn","english","English","SentenceEn","MeaningEn"]) || "",
      prompt_cy: getVal(row, ["prompt_cy","PromptCy"]) || "",
      before_cy: getVal(row, ["before_cy","BeforeCy","before","Before"]) || "",
      after_cy: getVal(row, ["after_cy","AfterCy","after","After"]) || "",
      answer_cy: getVal(row, ["answer_cy","AnswerCy","answer","Answer","Expected","Target","Preposition"]) || "",
      group: getVal(row, ["group","Group","set","Set","contrast_group","ContrastGroup"]) || "",
      hint_en: getVal(row, ["hint_en","HintEn","hint","Hint"]) || "",
      hint_cy: getVal(row, ["hint_cy","HintCy"]) || "",
      why_en: getVal(row, ["why_en","WhyEn","why","Why","ExplanationEn"]) || "",
      why_cy: getVal(row, ["why_cy","WhyCy","ExplanationCy"]) || "",
      rule_en: getVal(row, ["rule_en","RuleEn","rule","Rule"]) || "",
      rule_cy: getVal(row, ["rule_cy","RuleCy"]) || "",
      choices: getVal(row, ["choices","Choices","options","Options"]) || "", // optional: "at|i|o|gyda"
    };
  }

  function buildWelshSentence(before, answer, after) {
    let s = [before || "", answer || "", after || ""].join("");
    s = s.replace(/\s+/g, " ").trim();
    s = s.replace(/\s+([,.;:!?])/g, "$1");
    return s;
  }

  /* ========= Popover (“?”) identical behaviour ========= */
  function mountSentenceTranslationUI(anchorEl, englishSentence) {
    if (!anchorEl) return;
    const meaning = (englishSentence || "").trim();
    if (!meaning) return;

    anchorEl.style.position = "relative";

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

  document.addEventListener("click", () => {
    $$(".base-info-popover").forEach(p => p.classList.add("hidden"));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      $$(".base-info-popover").forEach(p => p.classList.add("hidden"));
    }
  });

  /* ========= TTS ========= */
  const ttsCache = new Map();
  async function playPollySentence(sentence) {
    if (!POLLY_FUNCTION_URL) throw new Error("HEAR disabled (no POLLY_FUNCTION_URL).");
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
        throw new Error("TTS response missing audio.");
      }
    }

    ttsCache.set(sentence, url);
    const audio = new Audio(url);
    await audio.play();
  }

  /* ========= State ========= */
  const state = {
    items: [],
    filtered: [],
    used: new Set(),

    current: null,
    guess: "",
    revealed: false,
    lastResult: null, // "correct"|"wrong"|"revealed"

    score: 0,
    streak: 0,
    done: 0,

    level: "All",
    topic: "All",
    difficulty: loadLS("wm_prep_difficulty", "easy"), // easy|hard
    lang: getLang(),
  };

  /* ========= UI wiring ========= */
  const el = {
    prepCard: () => $("#prepCard"),

    fLevel: () => $("#fLevel"),
    fTopic: () => $("#fTopic"),

    diffEasy: () => $("#diffEasy"),
    diffHard: () => $("#diffHard"),

    statScore: () => $("#statScore"),
    statStreak: () => $("#statStreak"),
    statDone: () => $("#statDone"),

    btnResetSession: () => $("#btnResetSession"),
    btnTop: () => $("#btnTop"),

    mbHint: () => $("#mbHint"),
    mbCheck: () => $("#mbCheck"),
    mbNext: () => $("#mbNext"),

    debugBox: () => $("#debugBox"),
  };

  function setDifficulty(next) {
    state.difficulty = (next === "hard") ? "hard" : "easy";
    saveLS("wm_prep_difficulty", state.difficulty);
    render();
  }

  function fillSelect(sel, values, current) {
    sel.innerHTML = "";
    values.forEach(v => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      sel.appendChild(opt);
    });
    sel.value = values.includes(current) ? current : values[0];
  }

  function applyFilters() {
    const lvl = state.level;
    const topic = state.topic;

    state.filtered = state.items.filter(it => {
      if (lvl !== "All") {
        if (it.level == null) return false;
        if (String(it.level) !== String(lvl)) return false;
      }
      if (topic !== "All") {
        const tLabel = (state.lang === "cy" ? (it.topic_cy || it.topic_en) : it.topic_en) || it.topic_en || it.topic_cy;
        if (tLabel !== topic) return false;
      }
      return true;
    });
  }

  function rebuildFilterUI() {
    const fLevel = el.fLevel();
    const fTopic = el.fTopic();
    if (!fLevel || !fTopic) return;

    const levels = Array.from(new Set(state.items.map(i => i.level).filter(v => Number.isFinite(v)))).sort((a,b)=>a-b);
    const levelOpts = ["All", ...levels.map(String)];

    const topicsRaw = state.items.map(i => (state.lang === "cy" ? (i.topic_cy || i.topic_en) : i.topic_en)).filter(Boolean);
    const topics = Array.from(new Set(topicsRaw)).sort((a,b)=>a.localeCompare(b));
    const topicOpts = ["All", ...topics];

    fillSelect(fLevel, levelOpts, state.level);
    fillSelect(fTopic, topicOpts, state.topic);

    fLevel.onchange = () => { state.level = fLevel.value; state.used.clear(); applyFilters(); nextQuestion(); };
    fTopic.onchange = () => { state.topic = fTopic.value; state.used.clear(); applyFilters(); nextQuestion(); };
  }

  function pickNextItem() {
    const pool = state.filtered.length ? state.filtered : [];
    if (!pool.length) return null;

    const unused = pool.filter(x => !state.used.has(x.id));
    const list = unused.length ? unused : pool;
    if (!unused.length) state.used.clear();

    const item = list[Math.floor(Math.random() * list.length)];
    state.used.add(item.id);
    return item;
  }

  function buildChoices(item) {
    // 1) If CSV provides choices like "at|i|o|gyda", use them.
    const raw = (item.choices || "").trim();
    let options = [];
    if (raw.includes("|")) options = raw.split("|").map(s => s.trim()).filter(Boolean);

    // 2) Otherwise: sample from same group (hidden internal grouping), fallback global.
    if (!options.length) {
      const sameGroup = item.group
        ? state.items.filter(x => x.group === item.group).map(x => x.answer_cy).filter(Boolean)
        : [];
      const pool = sameGroup.length ? sameGroup : state.items.map(x => x.answer_cy).filter(Boolean);

      const uniq = Array.from(new Set(pool));
      // Ensure correct is present
      if (!uniq.some(x => normalize(x) === normalize(item.answer_cy))) uniq.push(item.answer_cy);

      // Pick 3 distractors + correct
      const distractors = uniq.filter(x => normalize(x) !== normalize(item.answer_cy));
      shuffleInPlace(distractors);

      options = [item.answer_cy, ...distractors.slice(0, 3)];
    }

    // Guarantee up to 4
    options = Array.from(new Set(options.map(x => x.trim()))).filter(Boolean);
    if (!options.some(x => normalize(x) === normalize(item.answer_cy))) options.unshift(item.answer_cy);
    options = options.slice(0, 4);

    shuffleInPlace(options);
    return options;
  }

  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function updateStatsUI() {
    const s = el.statScore(); if (s) s.textContent = String(state.score);
    const st = el.statStreak(); if (st) st.textContent = String(state.streak);
    const d = el.statDone(); if (d) d.textContent = String(state.done);
  }

  function setLangFromNavbarIfChanged() {
    const next = getLang();
    if (next !== state.lang) {
      state.lang = next;
      rebuildFilterUI();
      applyFilters();
      render();
    }
  }

  function onCheck() {
    if (!state.current || state.revealed) return;

    const item = state.current;
    const ok = normalize(state.guess) === normalize(item.answer_cy);

    state.revealed = true;
    state.lastResult = ok ? "correct" : "wrong";
    state.done += 1;

    if (ok) {
      state.score += 1;
      state.streak += 1;
    } else {
      state.streak = 0;
    }

    render();
  }

  function onReveal() {
    if (!state.current || state.revealed) return;

    state.guess = state.current.answer_cy;
    state.revealed = true;
    state.lastResult = "revealed";
    state.done += 1;
    state.streak = 0;

    render();
  }

  function nextQuestion() {
    state.current = pickNextItem();
    state.guess = "";
    state.revealed = false;
    state.lastResult = null;
    render();
  }

  function resetSession() {
    state.score = 0;
    state.streak = 0;
    state.done = 0;
    state.used.clear();
    nextQuestion();
  }

  function render() {
    setLangFromNavbarIfChanged();
    updateStatsUI();

    // difficulty buttons
    const be = el.diffEasy(), bh = el.diffHard();
    if (be && bh) {
      be.classList.toggle("is-on", state.difficulty === "easy");
      bh.classList.toggle("is-on", state.difficulty === "hard");
      be.setAttribute("aria-pressed", state.difficulty === "easy" ? "true" : "false");
      bh.setAttribute("aria-pressed", state.difficulty === "hard" ? "true" : "false");
    }

    const host = el.prepCard();
    if (!host) return;

    const item = state.current;
    if (!item) {
      host.innerHTML = `
        <div class="text-slate-700">
          <div class="text-lg font-medium mb-2">Couldn't load any items.</div>
          <div class="text-sm text-slate-600">Put a CSV at <code>data/prep.csv</code> (and make sure GitHub Pages is serving it).</div>
        </div>
      `;
      return;
    }

    const prompt = item.prompt_en || item.prompt_cy || "";
    const choices = (state.difficulty === "easy" && !state.revealed) ? buildChoices(item) : [];

    const welshBefore = item.before_cy || "";
    const welshAfter = item.after_cy || "";

    const hintText = (state.lang === "cy" ? item.hint_cy : item.hint_en) || item.hint_en || item.hint_cy || "";
    const whyText = (state.lang === "cy" ? item.why_cy : item.why_en) || item.why_en || item.why_cy || "";
    const ruleText = (state.lang === "cy" ? item.rule_cy : item.rule_en) || item.rule_en || item.rule_cy || "";

    const showHear = !!POLLY_FUNCTION_URL;

    host.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div class="text-xs text-slate-500">
          ${item.level != null ? `Level ${esc(item.level)} · ` : ""}${esc((state.lang === "cy" ? (item.topic_cy || item.topic_en) : item.topic_en) || "")}
        </div>
        <div class="flex items-center gap-2">
          <button id="btnNew" class="btn btn-ghost" type="button">New</button>
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:p-5">
        <div class="text-2xl md:text-3xl font-semibold text-slate-900 leading-snug">
          ${esc(prompt || "—")}
        </div>
        <div class="mt-2 text-sm text-slate-600">
          ${state.lang === "cy"
            ? "Dewisa/teipia’r arddodiad Cymraeg sy’n cyfateb i’r frawddeg Saesneg."
            : "Choose/type the Welsh preposition (or full form) that matches the English sentence."}
        </div>
      </div>

      <div id="welshCard" class="mt-5 rounded-2xl bg-white border border-slate-200 p-4 md:p-5 shadow-sm">
        <div class="practice-sentenceLine flex flex-wrap items-baseline gap-2 text-xl md:text-2xl">
          <span class="text-slate-700">${esc(welshBefore)}</span>

          <input id="answerBox"
                 class="border-2 border-slate-300 focus:border-cyan-600 outline-none bg-amber-50 px-3 py-2 rounded-xl text-2xl md:text-3xl leading-tight shadow-sm w-auto md:w-60 flex-shrink-0"
                 placeholder="${state.lang === "cy" ? "Ateb" : "Answer"}"
                 aria-label="${state.lang === "cy" ? "Ateb" : "Answer"}"
                 ${state.difficulty === "easy" ? "readonly" : ""} />

          <span class="text-slate-700">${esc(welshAfter)}</span>
        </div>

        <div id="choicesWrap" class="${(state.difficulty === "easy" && !state.revealed) ? "mt-4" : "hidden"}">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-2" id="choices"></div>
          <div class="mt-2 text-xs text-slate-500">
            ${state.lang === "cy" ? "Awgrym: defnyddia 1–4 ar y bysellfwrdd." : "Tip: use keys 1–4."}
          </div>
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <button id="btnHint" class="btn btn-ghost" type="button">${state.lang === "cy" ? "Awgrym" : "Hint"}</button>
          <button id="btnReveal" class="btn btn-ghost" type="button">${state.lang === "cy" ? "Dangos" : "Reveal"}</button>
          <button id="btnCheck" class="btn btn-primary shadow" type="button">${state.lang === "cy" ? "Gwirio" : "Check"}</button>
        </div>

        <div id="hintBox" class="mt-3 hidden text-sm text-slate-700">
          ${hintText ? esc(hintText) : ""}
        </div>
      </div>

      <div id="feedback" class="mt-5 ${state.revealed ? "" : "hidden"}">
        <div class="feedback-box">
          <div class="flex items-center gap-2 text-2xl md:text-3xl font-semibold ${
            state.lastResult === "correct" ? "text-indigo-900" : "text-rose-900"
          }">
            ${
              state.lastResult === "correct"
                ? "✅ " + (state.lang === "cy" ? "Cywir!" : "Correct!")
                : "❌ " + (state.lang === "cy" ? "Dim yn hollol" : "Not quite")
            }
          </div>

          <div class="mt-3 text-slate-800 text-xl md:text-2xl flex items-baseline flex-wrap gap-x-3 gap-y-2">
            <span>${esc(welshBefore)}</span>
            <span class="font-semibold bg-indigo-100 text-indigo-900 px-1 rounded">${esc(item.answer_cy)}</span>
            <span>${esc(welshAfter)}</span>

            ${showHear ? `
              <button id="btnHear" class="btn-hear" type="button">
                <span class="icon" aria-hidden="true">▶︎</span>
                <span>${esc(state.lang === "cy" ? "Gwrando" : "Hear")}</span>
              </button>` : ""}
          </div>

          ${
            (state.lastResult !== "correct" && state.lastResult !== null)
              ? `<div class="mt-2 text-slate-700">${esc(state.lang === "cy" ? "Teipiaist/dewisaist:" : "You entered:")} <b>${esc(state.guess || "(blank)")}</b></div>`
              : ""
          }

          ${
            (whyText || ruleText) ? `
              <div class="mt-4 text-slate-700">${whyText ? esc(whyText) : ""}</div>
              <div class="mt-2 text-slate-600 text-sm">${ruleText ? esc(ruleText) : ""}</div>
            ` : ""
          }

          <div class="mt-4 flex justify-end gap-2">
            <button id="btnNext" class="btn btn-primary shadow" type="button">${state.lang === "cy" ? "Nesaf" : "Next"}</button>
          </div>
        </div>
      </div>
    `;

    // Mount the “?” tooltip on Welsh card (full English sentence)
    mountSentenceTranslationUI($("#welshCard"), prompt);

    // Wire controls
    $("#btnNew")?.addEventListener("click", nextQuestion);

    const ab = $("#answerBox");
    if (ab) {
      ab.value = state.guess;
      ab.disabled = !!state.revealed;
      if (!state.revealed) ab.focus();

      ab.addEventListener("input", (e) => { state.guess = e.target.value; });

      ab.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (!state.revealed) onCheck();
          else $("#btnNext")?.click();
        }
      });
    }

    $("#btnHint")?.addEventListener("click", () => {
      $("#hintBox")?.classList.toggle("hidden");
    });

    $("#btnReveal")?.addEventListener("click", onReveal);
    $("#btnCheck")?.addEventListener("click", onCheck);
    $("#btnNext")?.addEventListener("click", nextQuestion);

    if (showHear) {
      $("#btnHear")?.addEventListener("click", async () => {
        try {
          const sentence = buildWelshSentence(welshBefore, item.answer_cy, welshAfter);
          await playPollySentence(sentence);
        } catch (e) {
          alert("Couldn't play audio: " + (e?.message || e));
        }
      });
    }

    // Choices (easy mode)
    const choicesHost = $("#choices");
    if (choicesHost && choices.length) {
      choicesHost.innerHTML = "";
      choices.forEach((opt, idx) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn btn-ghost w-full justify-center";
        b.textContent = opt;
        b.title = `${idx + 1}`;
        b.addEventListener("click", () => {
          state.guess = opt;
          const ab2 = $("#answerBox");
          if (ab2) ab2.value = opt;
          onCheck();
        });
        choicesHost.appendChild(b);
      });
    }

    // Keyboard shortcuts (only when not typing)
    document.onkeydown = (e) => {
      const tag = (e.target && e.target.tagName) || "";
      if (tag.toUpperCase() === "INPUT" || tag.toUpperCase() === "TEXTAREA") return;

      if (e.key.toLowerCase() === "h") $("#btnHint")?.click();
      if (e.key.toLowerCase() === "n") $("#btnNext")?.click();
      if (e.key === "Enter") {
        e.preventDefault();
        if (!state.revealed) onCheck();
        else $("#btnNext")?.click();
      }

      if (state.difficulty === "easy" && !state.revealed) {
        const n = Number(e.key);
        if (Number.isFinite(n) && n >= 1 && n <= 4) {
          const btn = $$("#choices button")[n - 1];
          btn?.click();
        }
      }
    };
  }

  /* ========= Data loading ========= */
  async function loadCsv(url) {
    return new Promise((resolve, reject) => {
      if (!window.Papa) return reject(new Error("PapaParse not loaded."));
      Papa.parse(url, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: (res) => resolve(res.data || []),
        error: reject
      });
    });
  }

  async function boot() {
    // Difficulty buttons (exist outside card)
    el.diffEasy()?.addEventListener("click", () => setDifficulty("easy"));
    el.diffHard()?.addEventListener("click", () => setDifficulty("hard"));

    // Session/reset + misc
    el.btnResetSession()?.addEventListener("click", resetSession);
    el.btnTop()?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

    el.mbHint()?.addEventListener("click", () => $("#btnHint")?.click());
    el.mbCheck()?.addEventListener("click", () => $("#btnCheck")?.click());
    el.mbNext()?.addEventListener("click", () => ($("#btnNext")?.click() || nextQuestion()));

    // If user taps navbar language toggle, refresh after it flips localStorage
    document.addEventListener("click", (e) => {
      const t = e.target;
      if (t && (t.closest && t.closest("#btnLangToggle"))) {
        setTimeout(() => { setLangFromNavbarIfChanged(); }, 0);
      }
    });

    // Load CSV
    try {
      const raw = await loadCsv(DATA_URL);
      const items = raw.map(coerceRow).filter(r => r.answer_cy && (r.prompt_en || r.prompt_cy));
      state.items = items;
    } catch (e) {
      state.items = [];
      const dbg = el.debugBox();
      if (dbg) {
        dbg.classList.remove("hidden");
        dbg.textContent = `CSV load failed: ${e?.message || e}`;
      }
    }

    rebuildFilterUI();
    applyFilters();
    nextQuestion();
  }

  // Start
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

