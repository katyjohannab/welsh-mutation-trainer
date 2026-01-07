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

(() => {
  "use strict";

  /* ========= Utilities ========= */
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

  function saveLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  function loadLS(k, d) {
    try {
      const r = localStorage.getItem(k);
      return r ? JSON.parse(r) : d;
    } catch (_) {
      return d;
    }
  }

  /* ========= Config ========= */
  const CSV_PRIMARY = "data/prep.csv";   // correct for GitHub Pages under /welsh-mutation-trainer/
  const CSV_FALLBACK = "/data/prep.csv"; // fallback if you *really* host at domain-root
  const POLLY_FUNCTION_URL = "https://pl6xqfeht2hhbruzlhm3imcpya0upied.lambda-url.eu-west-2.on.aws/";

  /* ========= Data coercion (flexible columns) ========= */
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

  function splitChoices(raw) {
    const s = (raw || "").trim();
    if (!s) return [];
    // allow pipe or comma
    const parts = s.includes("|") ? s.split("|") : s.split(",");
    return parts.map(x => x.trim()).filter(Boolean);
  }

  function coerceRow(row, idx) {
    const r = row || {};

    // You can provide either:
    //  A) Before + After + Answer
    //  B) SentenceCy with "__" placeholder + Answer
    const sentenceCy = getVal(r, ["SentenceCy", "Welsh", "CY", "Sentence", "Cymraeg"]);

    let before = getVal(r, ["Before", "BeforeCy", "WelshBefore", "CYBefore", "PromptBefore"]);
    let after  = getVal(r, ["After", "AfterCy", "WelshAfter", "CYAfter", "PromptAfter"]);

    if ((!before && !after) && sentenceCy && sentenceCy.includes("__")) {
      const [b, a] = sentenceCy.split("__");
      before = (b || "").trimEnd();
      after  = (a || "").trimStart();
    }

    const answer = getVal(r, ["Answer", "Expected", "Target", "Insert", "Preposition", "Prep"]) || "";
    const english = getVal(r, ["English", "EN", "Translate", "Translation", "Meaning"]) || "";

    return {
      CardId: getVal(r, ["CardId", "Card ID", "ID", "Id", "id"]) || `row_${idx}`,
      Level: getVal(r, ["Level", "Lvl", "Difficulty"]) || "",
      Topic: getVal(r, ["Topic", "Theme"]) || "",
      Before: before,
      After: after,
      Answer: answer,
      English: english,
      Hint: getVal(r, ["Hint", "Clue"]) || "",
      Why: getVal(r, ["Why", "Explanation", "Notes", "Rule"]) || "",
      ChoicesRaw: getVal(r, ["Choices", "Options", "Distractors"]) || ""
    };
  }

  /* ========= Popover “?” translation UI (same classnames as mutation trainer) ========= */
  let popoverClosersMounted = false;

  function mountTranslationPopover(anchorEl, englishSentence) {
    if (!anchorEl) return;
    const meaning = (englishSentence || "").trim();
    if (!meaning) return;

    // remove any previous
    anchorEl.querySelectorAll(".base-info-btn, .base-info-popover").forEach(n => n.remove());

    anchorEl.style.position = "relative";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "base-info-btn";
    btn.textContent = "?";
    btn.setAttribute("aria-label", "English translation");
    btn.setAttribute("title", "English translation");

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

    if (!popoverClosersMounted) {
      popoverClosersMounted = true;
      document.addEventListener("click", () => {
        $$(".base-info-popover").forEach(p => p.classList.add("hidden"));
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          $$(".base-info-popover").forEach(p => p.classList.add("hidden"));
        }
      });
    }
  }

  /* ========= TTS (same pattern as your mutation trainer) ========= */
  const ttsCache = new Map();

  function buildCompleteSentence(before, answer, after) {
    const b = (before || "").trimEnd();
    const a = (answer || "").trim();
    const c = (after || "").trimStart();
    let s = [b, a, c].filter(Boolean).join(" ");
    s = s.replace(/\s+/g, " ").trim();
    s = s.replace(/\s+([,.;:!?])/g, "$1");
    return s;
  }

  async function playPolly(sentence) {
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
        throw new Error("Unexpected TTS response.");
      }
    }

    ttsCache.set(sentence, url);
    const audio = new Audio(url);
    await audio.play();
  }

  /* ========= State ========= */
  const STATS_KEY = "prep_stats_v1";
  const DIFF_KEY = "prep_diff_v1";

  const state = {
    rows: [],
    filtered: [],
    deck: [],
    p: 0,
    used: new Set(),
    revealed: false,
    lastResult: null, // "correct" | "wrong" | "revealed"
    lastGuess: "",
    difficulty: loadLS(DIFF_KEY, "easy"), // "easy" | "hard"
    stats: loadLS(STATS_KEY, { score: 0, streak: 0, done: 0, correct: 0 })
  };

  /* ========= DOM ========= */
  const els = {
    loadError: $("#loadError"),
    loadErrorMsg: $("#loadErrorMsg"),

    enSentence: $("#enSentence"),
    cyBefore: $("#cyBefore"),
    cyGap: $("#cyGap"),
    cyAfter: $("#cyAfter"),

    hintBox: $("#hintBox"),
    hintText: $("#hintText"),

    choicesRow: $("#choicesRow"),
    hardInputRow: $("#hardInputRow"),
    hardInput: $("#hardInput"),
    btnCheck: $("#btnCheck"),

    feedbackBox: $("#feedbackBox"),
    fbHeadline: $("#fbHeadline"),
    fbBody: $("#fbBody"),

    btnHint: $("#btnHint"),
    btnHear: $("#btnHear"),
    btnReveal: $("#btnReveal"),
    btnNext: $("#btnNext"),

    btnEasy: $("#btnEasy"),
    btnHard: $("#btnHard"),

    fLevel: $("#fLevel"),
    fTopic: $("#fTopic"),
    fFocus: $("#fFocus"),
    btnClearFilters: $("#btnClearFilters"),
    poolCount: $("#poolCount"),

    prepProgress: $("#prepProgress"),
    prepMeta: $("#prepMeta"),

    statScore: $("#statScore"),
    statStreak: $("#statStreak"),
    statDone: $("#statDone"),
    statAcc: $("#statAcc"),
    btnResetStats: $("#btnResetStats")
  };

  /* ========= CSV loading ========= */
  function parseCsvUrl(url) {
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

  async function loadData() {
    const sheet = getParam("sheet");
    const candidates = sheet ? [sheet] : [CSV_PRIMARY, CSV_FALLBACK];

    let lastErr = null;
    for (const u of candidates) {
      try {
        const raw = await parseCsvUrl(u);
        const cleaned = raw.map((r, i) => coerceRow(r, i))
          .filter(x => (x.Before || x.After) && x.Answer); // minimal sanity
        if (!cleaned.length) throw new Error(`Loaded 0 usable rows from ${u}`);
        state.rows = cleaned;
        els.loadError?.classList.add("hidden");
        return;
      } catch (e) {
        lastErr = e;
      }
    }

    els.loadErrorMsg.textContent =
      (lastErr && (lastErr.message || String(lastErr))) ||
      "Unknown error.";
    els.loadError?.classList.remove("hidden");
    state.rows = [];
  }

  /* ========= Filters ========= */
  function uniq(arr) {
    return Array.from(new Set(arr.filter(Boolean)));
  }

  function fillSelect(sel, values) {
    const current = sel.value;
    sel.innerHTML = "";
    const all = document.createElement("option");
    all.value = "All";
    all.textContent = "All";
    sel.appendChild(all);

    values.forEach(v => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v;
      sel.appendChild(o);
    });

    sel.value = values.includes(current) ? current : "All";
  }

  function buildFilters() {
    fillSelect(els.fLevel, uniq(state.rows.map(r => r.Level)).sort((a,b)=>String(a).localeCompare(String(b), undefined, { numeric:true })));
    fillSelect(els.fTopic, uniq(state.rows.map(r => r.Topic)).sort((a,b)=>String(a).localeCompare(String(b))));
    fillSelect(els.fFocus, uniq(state.rows.map(r => r.Answer)).sort((a,b)=>String(a).localeCompare(String(b))));
  }

  function applyFilters() {
    const lvl = els.fLevel.value;
    const topic = els.fTopic.value;
    const focus = els.fFocus.value;

    state.filtered = state.rows.filter(r => {
      if (lvl !== "All" && String(r.Level) !== String(lvl)) return false;
      if (topic !== "All" && r.Topic !== topic) return false;
      if (focus !== "All" && r.Answer !== focus) return false;
      return true;
    });

    els.poolCount.textContent = String(state.filtered.length || 0);
  }

  function rebuildDeck() {
    const n = state.filtered.length;
    state.deck = Array.from({ length: n }, (_, i) => i);
    for (let i = state.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [state.deck[i], state.deck[j]] = [state.deck[j], state.deck[i]];
    }
    state.p = 0;
    state.used.clear();
    state.revealed = false;
    state.lastResult = null;
    state.lastGuess = "";
  }

  function currentCard() {
    if (!state.filtered.length) return null;
    const idx = state.deck[state.p % state.deck.length];
    return state.filtered[idx] || null;
  }

  /* ========= Choices ========= */
  function buildChoices(card) {
    const fromCsv = splitChoices(card.ChoicesRaw);
    const allAnswers = uniq(state.filtered.map(r => r.Answer));
    const fallbackPool = allAnswers.length ? allAnswers : [
      "i", "at", "ar", "o", "gyda", "â", "heb", "gan", "wrth", "yn", "yng", "dros", "dan"
    ];

    let choices = fromCsv.length ? fromCsv.slice() : [];

    if (!choices.length) {
      choices.push(card.Answer);
      // add 3 distractors
      const pool = fallbackPool.filter(x => normalize(x) !== normalize(card.Answer));
      while (choices.length < 4 && pool.length) {
        const pick = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
        choices.push(pick);
      }
    }

    // ensure answer included + unique
    if (!choices.some(x => normalize(x) === normalize(card.Answer))) choices.push(card.Answer);
    choices = uniq(choices.map(String));

    // keep 4 max to reduce clutter
    // (If you want 6 later, change here.)
    if (choices.length > 4) {
      // keep answer + 3 others
      const others = choices.filter(x => normalize(x) !== normalize(card.Answer));
      const trimmed = [card.Answer];
      while (trimmed.length < 4 && others.length) {
        trimmed.push(others.splice(Math.floor(Math.random() * others.length), 1)[0]);
      }
      choices = trimmed;
    }

    // shuffle
    for (let i = choices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [choices[i], choices[j]] = [choices[j], choices[i]];
    }
    return choices;
  }

  /* ========= Render ========= */
  function setDifficulty(diff) {
    state.difficulty = diff;
    saveLS(DIFF_KEY, diff);

    const easyOn = diff === "easy";
    els.btnEasy.classList.toggle("is-on", easyOn);
    els.btnHard.classList.toggle("is-on", !easyOn);
    els.btnEasy.setAttribute("aria-pressed", easyOn ? "true" : "false");
    els.btnHard.setAttribute("aria-pressed", !easyOn ? "true" : "false");

    render();
  }

  function showFeedback(kind, card, extraHtml = "") {
    const ok = kind === "correct";
    const revealed = kind === "revealed";
    els.feedbackBox.classList.remove("hidden");

    if (ok) {
      els.feedbackBox.classList.remove("border-rose-200", "bg-rose-50");
      els.feedbackBox.classList.add("border-emerald-200", "bg-emerald-50");
      els.fbHeadline.textContent = "Correct";
    } else if (revealed) {
      els.feedbackBox.classList.remove("border-emerald-200", "bg-emerald-50");
      els.feedbackBox.classList.add("border-slate-200", "bg-slate-50");
      els.fbHeadline.textContent = "Revealed";
    } else {
      els.feedbackBox.classList.remove("border-emerald-200", "bg-emerald-50");
      els.feedbackBox.classList.add("border-rose-200", "bg-rose-50");
      els.fbHeadline.textContent = "Not quite";
    }

    const why = (card.Why || "").trim();
    els.fbBody.innerHTML = `
      <div><span class="font-semibold">Answer:</span> <b>${esc(card.Answer)}</b></div>
      ${state.lastGuess && !ok && !revealed ? `<div class="mt-1 text-slate-700">You chose: <b>${esc(state.lastGuess)}</b></div>` : ""}
      <div class="mt-3 text-slate-800"><b>${esc(card.English || "")}</b></div>
      ${why ? `<div class="mt-3 text-slate-700">${esc(why)}</div>` : ""}
      ${extraHtml || ""}
    `;
  }

  function clearFeedback() {
    els.feedbackBox.classList.add("hidden");
    els.fbHeadline.textContent = "";
    els.fbBody.innerHTML = "";
  }

  function updateStatsUI() {
    const s = state.stats;
    els.statScore.textContent = String(s.score || 0);
    els.statStreak.textContent = String(s.streak || 0);
    els.statDone.textContent = String(s.done || 0);
    const acc = s.done ? Math.round(((s.correct || 0) / s.done) * 100) : 0;
    els.statAcc.textContent = `${acc}%`;
  }

  function render() {
    const card = currentCard();

    // progress
    els.prepProgress.textContent = state.filtered.length
      ? `Card ${Math.min(state.p + 1, state.filtered.length)} / ${state.filtered.length}`
      : "Card 0 / 0";

    els.prepMeta.textContent = card
      ? [card.Level ? `Level ${card.Level}` : "", card.Topic ? card.Topic : ""].filter(Boolean).join(" • ") || "—"
      : "—";

    // reset UI bits
    els.hintBox.classList.add("hidden");
    els.hintText.textContent = "";
    clearFeedback();

    if (!card) {
      els.enSentence.textContent = "No items match your filters.";
      els.cyBefore.textContent = "";
      els.cyAfter.textContent = "";
      els.cyGap.textContent = "____";
      els.choicesRow.innerHTML = "";
      els.hardInputRow.classList.add("hidden");
      els.choicesRow.classList.add("hidden");
      return;
    }

    // English target (always visible)
    els.enSentence.textContent = card.English || "—";

    // Welsh with gap
    els.cyBefore.textContent = card.Before || "";
    els.cyAfter.textContent = card.After || "";

    // show either blank or revealed answer
    els.cyGap.textContent = state.revealed ? card.Answer : "____";

    // Mount the same “?” translation popover on the tested word (gap capsule)
    // (Shows full English sentence.)
    mountTranslationPopover(els.cyGap, card.English);

    // Hint content
    els.hintText.textContent = card.Hint || "Think about what the English implies.";

    // Difficulty-specific UI
    if (state.difficulty === "hard") {
      els.choicesRow.classList.add("hidden");
      els.hardInputRow.classList.remove("hidden");
      els.hardInput.disabled = state.revealed;
      els.hardInput.value = state.revealed ? "" : els.hardInput.value;
      if (!state.revealed) setTimeout(() => els.hardInput?.focus({ preventScroll: true }), 0);
    } else {
      els.hardInputRow.classList.add("hidden");
      els.choicesRow.classList.remove("hidden");

      const choices = buildChoices(card);
      els.choicesRow.innerHTML = "";
      choices.forEach((c, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "prep-choice";
        b.textContent = c;
        b.dataset.idx = String(i + 1);
        b.disabled = state.revealed;
        b.addEventListener("click", () => checkAnswer(c));
        els.choicesRow.appendChild(b);
      });
    }

    // Next button label behavior (optional)
    els.btnNext.textContent = "Next";
  }

  /* ========= Game logic ========= */
  function markDone(correct) {
    state.stats.done = (state.stats.done || 0) + 1;
    if (correct) {
      state.stats.correct = (state.stats.correct || 0) + 1;
      state.stats.score = (state.stats.score || 0) + 1;
      state.stats.streak = (state.stats.streak || 0) + 1;
    } else {
      state.stats.streak = 0;
    }
    saveLS(STATS_KEY, state.stats);
    updateStatsUI();
  }

  function checkAnswer(guessRaw) {
    const card = currentCard();
    if (!card || state.revealed) return;

    const guess = (guessRaw || "").trim();
    state.lastGuess = guess;

    const ok = normalize(guess) === normalize(card.Answer);
    state.revealed = true;
    state.lastResult = ok ? "correct" : "wrong";

    // show revealed word in the gap
    els.cyGap.textContent = card.Answer;

    // disable inputs
    if (state.difficulty === "hard") {
      els.hardInput.disabled = true;
    } else {
      $$(".prep-choice", els.choicesRow).forEach(btn => {
        btn.disabled = true;
        if (normalize(btn.textContent) === normalize(card.Answer)) btn.classList.add("is-on");
      });
    }

    markDone(ok);
    showFeedback(ok ? "correct" : "wrong", card);
  }

  function reveal() {
    const card = currentCard();
    if (!card || state.revealed) return;
    state.lastGuess = "";
    state.revealed = true;
    state.lastResult = "revealed";

    els.cyGap.textContent = card.Answer;

    if (state.difficulty === "hard") els.hardInput.disabled = true;
    $$(".prep-choice", els.choicesRow).forEach(btn => {
      btn.disabled = true;
      if (normalize(btn.textContent) === normalize(card.Answer)) btn.classList.add("is-on");
    });

    markDone(false);
    showFeedback("revealed", card);
  }

  function next() {
    if (!state.filtered.length) return;
    state.revealed = false;
    state.lastResult = null;
    state.lastGuess = "";
    state.p = (state.p + 1) % state.deck.length;

    // reset hard input
    els.hardInput.value = "";
    render();
  }

  function toggleHint() {
    els.hintBox.classList.toggle("hidden");
  }

  async function hear() {
    const card = currentCard();
    if (!card) return;
    try {
      const sentence = buildCompleteSentence(card.Before, card.Answer, card.After);
      await playPolly(sentence);
    } catch (e) {
      alert("Couldn't play audio: " + (e?.message || e));
    }
  }

  function resetStats() {
    state.stats = { score: 0, streak: 0, done: 0, correct: 0 };
    saveLS(STATS_KEY, state.stats);
    updateStatsUI();
  }

  function clearFilters() {
    els.fLevel.value = "All";
    els.fTopic.value = "All";
    els.fFocus.value = "All";
    applyFilters();
    rebuildDeck();
    render();
  }

  /* ========= Events ========= */
  function wire() {
    els.btnEasy.addEventListener("click", () => setDifficulty("easy"));
    els.btnHard.addEventListener("click", () => setDifficulty("hard"));

    els.btnHint.addEventListener("click", toggleHint);
    els.btnReveal.addEventListener("click", reveal);
    els.btnNext.addEventListener("click", () => {
      // If not revealed yet, in hard mode Enter often means "Check"
      if (!state.revealed && state.difficulty === "hard") {
        checkAnswer(els.hardInput.value);
      } else {
        next();
      }
    });

    els.btnHear.addEventListener("click", hear);

    els.btnCheck.addEventListener("click", () => checkAnswer(els.hardInput.value));
    els.hardInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        checkAnswer(els.hardInput.value);
      }
    });

    [els.fLevel, els.fTopic, els.fFocus].forEach(sel => {
      sel.addEventListener("change", () => {
        applyFilters();
        rebuildDeck();
        render();
      });
    });

    els.btnClearFilters.addEventListener("click", clearFilters);
    els.btnResetStats.addEventListener("click", resetStats);

    // Keyboard shortcuts (don’t fire while typing in an input)
    document.addEventListener("keydown", (e) => {
      const tag = (e.target && e.target.tagName) || "";
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(tag.toUpperCase());
      if (typing) return;

      if (e.key === "Enter") {
        e.preventDefault();
        if (!state.revealed && state.difficulty === "hard") checkAnswer(els.hardInput.value);
        else next();
      } else if (e.key.toLowerCase() === "h") {
        toggleHint();
      } else if (e.key.toLowerCase() === "r") {
        reveal();
      } else {
        // 1-4 for easy mode choice picking
        if (state.difficulty === "easy" && !state.revealed) {
          const n = parseInt(e.key, 10);
          if (n >= 1 && n <= 4) {
            const btn = els.choicesRow.querySelector(`button[data-idx="${n}"]`);
            btn?.click();
          }
        }
      }
    });
  }

  /* ========= Boot ========= */
  async function boot() {
    wire();
    updateStatsUI();
    setDifficulty(state.difficulty);

    await loadData();
    buildFilters();
    applyFilters();
    rebuildDeck();
    render();
  }

  boot();
})();
