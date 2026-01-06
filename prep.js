/* global Papa */
(() => {
  "use strict";

  /* =========================
     Language (match navbar.js)
     ========================= */
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

  /* =========================
     Utilities
     ========================= */
  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return (s == null ? "" : String(s)).replace(/[&<>"]/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"
    }[ch]));
  }

  function normalize(s) {
    return (s || "")
      .toString()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/’/g, "'")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function uniq(arr) {
    return Array.from(new Set(arr.filter(v => v !== undefined && v !== null && String(v).trim() !== "")));
  }

  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function getParam(k) {
    return new URLSearchParams(location.search).get(k);
  }

  async function loadCsvUrl(u) {
    return new Promise((resolve, reject) => {
      Papa.parse(u, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: (res) => resolve(res.data || []),
        error: reject
      });
    });
  }

  function getVal(row, names) {
    const r = row || {};
    const keys = Object.keys(r);
    for (const k of keys) {
      if (names.some(n => k.trim().toLowerCase() === n.trim().toLowerCase())) {
        return (r[k] ?? "").toString().trim();
      }
    }
    return "";
  }

  /* =========================
     Data model
     =========================
     Each item:
     {
       item_id, level, mode, topic_en, topic_cy,
       contrast_group,
       en_sentence,
       cy_before, cy_after,
       answer_prep,
       needs_step2, pronoun_key,
       answer_form_cy, answer_form_en,
       hint_en, hint_cy, why_en, why_cy, rule_en, rule_cy,
       choices_step1 (optional "a|b|c|d")
     }
  ========================= */

  function coercePrepRow(row) {
    const level = Number(getVal(row, ["level", "Level"])) || 1;
    const needs2 = normalize(getVal(row, ["needs_step2", "NeedsStep2", "step2", "Needs Step 2"])) === "1"
      || normalize(getVal(row, ["needs_step2", "NeedsStep2", "step2", "Needs Step 2"])) === "true";

    const item = {
      item_id: getVal(row, ["item_id", "ItemId", "ID", "Id"]) || "",
      level,
      mode: getVal(row, ["mode", "Mode"]) || (needs2 ? "prep+pronoun" : "prep"),
      topic_en: getVal(row, ["topic_en", "TopicEN", "topic", "Topic"]) || "",
      topic_cy: getVal(row, ["topic_cy", "TopicCY"]) || "",
      contrast_group: getVal(row, ["contrast_group", "ContrastGroup", "contrast", "Contrast"]) || "",

      en_sentence: getVal(row, ["en_sentence", "English", "EN", "MeaningEN", "Meaning"]) || "",

      cy_before: getVal(row, ["cy_before", "WelshBefore", "CY_BEFORE", "BeforeCY", "Before"]) || "",
      cy_after: getVal(row, ["cy_after", "WelshAfter", "CY_AFTER", "AfterCY", "After"]) || "",

      answer_prep: getVal(row, ["answer_prep", "AnswerPrep", "prep", "Preposition", "Answer"]) || "",

      needs_step2: needs2,
      pronoun_key: getVal(row, ["pronoun_key", "PronounKey", "Pronoun"]) || "",
      answer_form_cy: getVal(row, ["answer_form_cy", "AnswerFormCY", "FormCY", "AnswerForm"]) || "",
      answer_form_en: getVal(row, ["answer_form_en", "AnswerFormEN", "FormEN"]) || "",

      hint_en: getVal(row, ["hint_en", "HintEN", "Hint"]) || "",
      hint_cy: getVal(row, ["hint_cy", "HintCY"]) || "",
      why_en: getVal(row, ["why_en", "WhyEN", "Why"]) || "",
      why_cy: getVal(row, ["why_cy", "WhyCY"]) || "",
      rule_en: getVal(row, ["rule_en", "RuleEN", "Rule"]) || "",
      rule_cy: getVal(row, ["rule_cy", "RuleCY"]) || "",

      choices_step1: getVal(row, ["choices_step1", "ChoicesStep1", "Choices", "Options"]) || ""
    };

    return item;
  }

  /* =========================
     Built-in fallback sample data
     (Used if CSV cannot be loaded)
     ========================= */
  const SAMPLE_ITEMS = [
    {
      item_id: "Q0001",
      level: 1,
      mode: "prep",
      topic_en: "Letters",
      topic_cy: "Llythyrau",
      contrast_group: "AT_vs_I",
      en_sentence: "Send a letter to Sioned.",
      cy_before: "Danfon lythyr ",
      cy_after: " Sioned.",
      answer_prep: "at",
      needs_step2: false,
      pronoun_key: "",
      answer_form_cy: "",
      answer_form_en: "",
      hint_en: "Person, not a place.",
      hint_cy: "Person, nid lle.",
      why_en: "In this pattern, Welsh often uses <strong>at</strong> with a person (like ‘to someone’).",
      why_cy: "Yn y patrwm yma, mae’r Gymraeg yn aml yn defnyddio <strong>at</strong> gyda pherson (fel ‘at rywun’).",
      rule_en: "<strong>at</strong> is common for ‘to (a person)’; <strong>i</strong> is common for ‘to/into (a place)’.",
      rule_cy: "Mae <strong>at</strong> yn gyffredin am ‘at berson’; mae <strong>i</strong> yn gyffredin am ‘i / i mewn i le’.",
      choices_step1: ""
    },
    {
      item_id: "Q0002",
      level: 1,
      mode: "prep",
      topic_en: "Travel",
      topic_cy: "Teithio",
      contrast_group: "AT_vs_I",
      en_sentence: "Send a letter to London.",
      cy_before: "Danfon lythyr ",
      cy_after: " Lundain.",
      answer_prep: "i",
      needs_step2: false,
      pronoun_key: "",
      answer_form_cy: "",
      answer_form_en: "",
      hint_en: "Destination is a place.",
      hint_cy: "Cyrchfan = lle.",
      why_en: "Here the destination is a place you go/send <em>into</em> — <strong>i</strong>.",
      why_cy: "Yma lle yw’r gyrchfan (mynd/danfon <em>i mewn</em>) — <strong>i</strong>.",
      rule_en: "Place/destination → often <strong>i</strong>.",
      rule_cy: "Lle/cyrchfan → yn aml <strong>i</strong>.",
      choices_step1: ""
    },
    {
      item_id: "Q0201",
      level: 2,
      mode: "prep+pronoun",
      topic_en: "Chat",
      topic_cy: "Sgwrsio",
      contrast_group: "A_vs_GYDA",
      en_sentence: "She’s talking to me.",
      cy_before: "Mae hi’n siarad ",
      cy_after: ".",
      answer_prep: "â",
      needs_step2: true,
      pronoun_key: "1S",
      answer_form_cy: "â fi",
      answer_form_en: "to me",
      hint_en: "This one stays ‘prep + pronoun’.",
      hint_cy: "Mae hwn yn aros fel ‘arddodiad + rhagenw’.",
      why_en: "After <strong>â</strong>, you simply use the pronoun: <strong>â fi</strong>.",
      why_cy: "Ar ôl <strong>â</strong>, defnyddia’r rhagenw: <strong>â fi</strong>.",
      rule_en: "Some prepositions don’t inflect: prep + pronoun (e.g. â fi, gyda fi).",
      rule_cy: "Dydy rhai arddodiaid ddim yn cyflyru: arddodiad + rhagenw (e.e. â fi, gyda fi).",
      choices_step1: ""
    },
    {
      item_id: "Q0301",
      level: 3,
      mode: "prep+pronoun",
      topic_en: "Ownership",
      topic_cy: "Perchnogaeth",
      contrast_group: "INFLECTED_AR",
      en_sentence: "It’s on me.",
      cy_before: "Mae e ",
      cy_after: ".",
      answer_prep: "ar",
      needs_step2: true,
      pronoun_key: "1S",
      answer_form_cy: "arna i",
      answer_form_en: "on me",
      hint_en: "This one inflects (it changes).",
      hint_cy: "Mae hwn yn cyflyru (mae’n newid).",
      why_en: "<strong>ar</strong> is an inflected preposition with pronouns: <strong>arna i</strong> (not <em>ar fi</em>).",
      why_cy: "Mae <strong>ar</strong> yn arddodiad cyfunol gyda rhagenwau: <strong>arna i</strong> (nid <em>ar fi</em>).",
      rule_en: "Some prepositions inflect with pronouns: arna i, arnat ti, arno fe, arni hi…",
      rule_cy: "Mae rhai arddodiaid yn cyflyru gyda rhagenwau: arna i, arnat ti, arno fe, arni hi…",
      choices_step1: ""
    }
  ];

  /* =========================
     Choice sets (Step 1)
     ========================= */
  const CHOICE_SETS = {
    AT_vs_I: ["at", "i", "o", "gyda"],
    CYN_vs_O_FLAEN: ["cyn", "o flaen", "ar ôl", "wrth"],
    A_vs_GYDA: ["â", "gyda", "at", "i"],
    GYDA_vs_AR: ["gyda", "ar", "â", "at"],
    INFLECTED_AR: ["ar", "gyda", "â", "at"]
  };

  /* =========================
     Pronouns + forms (Step 2 distractors)
     ========================= */
  const PRONOUNS = {
    "1S": { en: "me", cy: "fi / i" },
    "2S": { en: "you (sing.)", cy: "ti" },
    "3SM": { en: "him", cy: "fe/fo" },
    "3SF": { en: "her", cy: "hi" },
    "1PL": { en: "us", cy: "ni" },
    "2PL": { en: "you (pl.)", cy: "chi" },
    "3PL": { en: "them", cy: "nhw" }
  };

  const PREP_FORMS = {
    "ar": {
      forms_cy: {
        "1S": "arna i", "2S": "arnat ti", "3SM": "arno fe", "3SF": "arni hi",
        "1PL": "arnon ni", "2PL": "arnoch chi", "3PL": "arnyn nhw"
      }
    },
    "at": {
      forms_cy: {
        "1S": "ata i", "2S": "atat ti", "3SM": "ato fe", "3SF": "ati hi",
        "1PL": "aton ni", "2PL": "atoch chi", "3PL": "atyn nhw"
      }
    },
    "i": {
      forms_cy: {
        "1S": "imi / i mi", "2S": "iti / i ti", "3SM": "iddo fe", "3SF": "iddi hi",
        "1PL": "inni / i ni", "2PL": "ichwi / i chi", "3PL": "iddyn nhw"
      }
    },
    "gyda": {
      forms_cy: {
        "1S": "gyda fi", "2S": "gyda ti", "3SM": "gyda fe", "3SF": "gyda hi",
        "1PL": "gyda ni", "2PL": "gyda chi", "3PL": "gyda nhw"
      }
    },
    "â": {
      forms_cy: {
        "1S": "â fi", "2S": "â ti", "3SM": "ag e", "3SF": "â hi",
        "1PL": "â ni", "2PL": "â chi", "3PL": "â nhw"
      }
    }
  };

  function buildIndependentForm(prep, pronKey) {
    const indep = {
      "1S": "fi", "2S": "ti", "3SM": "fe", "3SF": "hi", "1PL": "ni", "2PL": "chi", "3PL": "nhw"
    };
    const pro = indep[pronKey];
    if (!pro) return null;
    return `${prep} ${pro}`;
  }

  /* =========================
     State + elements
     ========================= */
  const state = {
    lang: wmGetLang(),
    rows: [],
    used: new Set(),
    current: null,
    step: 1,              // 1 or 2
    step1Chosen: null,
    locked: false,
    score: 0,
    streak: 0,
    done: 0,
    lastChoices: []
  };

  const els = {
    // main
    metaRow: $("metaRow"),
    enMeaningLabel: $("enMeaningLabel"),
    enMeaningText: $("enMeaningText"),
    cyLabel: $("cyLabel"),
    cyBefore: $("cyBefore"),
    cyAfter: $("cyAfter"),
    gapCapsule: $("gapCapsule"),
    stepChip: $("stepChip"),
    stepPrompt: $("stepPrompt"),
    hintBox: $("hintBox"),
    choices: $("choices"),
    feedbackWrap: $("feedbackWrap"),

    // buttons
    btnHint: $("btnHint"),
    btnReveal: $("btnReveal"),
    btnNew: $("btnNew"),

    // filters
    fLevel: $("fLevel"),
    fMode: $("fMode"),
    fContrast: $("fContrast"),
    fTopic: $("fTopic"),
    btnClearFilters: $("btnClearFilters"),
    dataBadge: $("dataBadge"),

    // session
    kScore: $("kScore"),
    kStreak: $("kStreak"),
    kDone: $("kDone"),
    vScore: $("vScore"),
    vStreak: $("vStreak"),
    vDone: $("vDone"),
    helpText: $("helpText"),
    sessionTitle: $("sessionTitle"),
    filtersTitle: $("filtersTitle"),

    // footer
    btnTop: $("btnTop"),

    // admin
    adminPanel: $("adminPanel"),
    dataUrl: $("dataUrl"),
    btnLoadUrl: $("btnLoadUrl"),
    fileCsv: $("fileCsv")
  };

  function t(en, cy) {
    return state.lang === "cy" ? cy : en;
  }

  /* =========================
     “Red ?” popover (exact classes as index.html)
     Shows full English sentence.
     ========================= */
  function mountSentenceTranslationUI(anchorEl, item) {
    if (!anchorEl) return;

    // Remove previous (if any)
    anchorEl.querySelectorAll(".base-info-btn, .base-info-popover").forEach(n => n.remove());

    const meaning = (item?.en_sentence || "").trim();
    if (!meaning) return;

    anchorEl.style.position = "relative";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "base-info-btn";
    btn.textContent = "?";
    btn.setAttribute("aria-label", t("English meaning", "Ystyr Saesneg"));
    btn.setAttribute("title", t("English meaning", "Ystyr Saesneg"));

    const pop = document.createElement("div");
    pop.className = "base-info-popover hidden animate-pop";
    pop.setAttribute("role", "dialog");

    const close = document.createElement("button");
    close.type = "button";
    close.className = "base-info-close";
    close.setAttribute("aria-label", t("Close", "Cau"));
    close.textContent = "×";

    pop.innerHTML = `
      <div class="base-info-meaning">${esc(meaning)}</div>
    `;
    pop.appendChild(close);

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = pop.classList.contains("hidden");
      document.querySelectorAll(".base-info-popover").forEach(p => p.classList.add("hidden"));
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

  // Global close (single listeners; avoids leaks)
  document.addEventListener("click", () => {
    document.querySelectorAll(".base-info-popover").forEach(p => p.classList.add("hidden"));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".base-info-popover").forEach(p => p.classList.add("hidden"));
    }
  });

  /* =========================
     Filters
     ========================= */
  function fillSelect(sel, options) {
    const cur = sel.value;
    sel.innerHTML = "";
    for (const opt of options) {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      sel.appendChild(o);
    }
    sel.value = options.includes(cur) ? cur : options[0];
  }

  function renderFilters() {
    const all = t("All", "Pob un");

    const levels = uniq(state.rows.map(r => String(r.level))).sort((a, b) => Number(a) - Number(b));
    const modes = uniq(state.rows.map(r => r.mode)).sort((a, b) => a.localeCompare(b));
    const contrasts = uniq(state.rows.map(r => r.contrast_group)).sort((a, b) => a.localeCompare(b));
    const topics = uniq(state.rows.map(r => (state.lang === "cy" ? (r.topic_cy || r.topic_en) : (r.topic_en || r.topic_cy))))
      .sort((a, b) => a.localeCompare(b));

    fillSelect(els.fLevel, [all, ...levels]);
    fillSelect(els.fMode, [all, ...modes]);
    fillSelect(els.fContrast, [all, ...contrasts]);
    fillSelect(els.fTopic, [all, ...topics]);
  }

  function getFilteredItems() {
    const all = t("All", "Pob un");
    const lvl = els.fLevel.value;
    const mode = els.fMode.value;
    const contrast = els.fContrast.value;
    const topic = els.fTopic.value;

    return state.rows.filter(r => {
      if (lvl !== all && String(r.level) !== lvl) return false;
      if (mode !== all && r.mode !== mode) return false;
      if (contrast !== all && r.contrast_group !== contrast) return false;

      const topicLabel = (state.lang === "cy" ? (r.topic_cy || r.topic_en) : (r.topic_en || r.topic_cy)) || "";
      if (topic !== all && topicLabel !== topic) return false;

      return true;
    });
  }

  function pickNextItem() {
    const pool = getFilteredItems();
    if (!pool.length) return null;

    const unused = pool.filter(i => !state.used.has(i.item_id));
    const list = unused.length ? unused : pool;
    if (!unused.length) state.used.clear();

    const item = list[Math.floor(Math.random() * list.length)];
    if (item.item_id) state.used.add(item.item_id);
    return item;
  }

  /* =========================
     UI text (bilingual)
     ========================= */
  function applyLanguageStatic() {
    els.enMeaningLabel.textContent = t("Meaning to express (English)", "Ystyr i’w fynegi (Saesneg)");
    els.cyLabel.textContent = t("Cymraeg", "Cymraeg");

    els.btnHint.textContent = t("Hint", "Awgrym");
    els.btnReveal.textContent = t("Reveal", "Dangos");
    els.btnNew.textContent = t("New question", "Cwestiwn newydd");

    $("pageSubtitle").textContent = t(
      "Choose the correct Welsh preposition to match the English meaning. If a pronoun form is needed, you’ll get a second step.",
      "Dewis yr arddodiad Cymraeg cywir i weddu i’r ystyr Saesneg. Os oes angen ffurf gyda rhagenw, bydd ail gam."
    );

    els.filtersTitle.textContent = t("Filters", "Hidlwyr");
    els.sessionTitle.textContent = t("Session", "Sesiwn");

    $("lblLevel").textContent = t("Level", "Lefel");
    $("lblMode").textContent = t("Mode", "Modd");
    $("lblContrast").textContent = t("Contrast set", "Set cyferbyniad");
    $("lblTopic").textContent = t("Topic", "Pwnc");

    els.kScore.textContent = t("Score", "Sgôr");
    els.kStreak.textContent = t("Streak", "Rhediad");
    els.kDone.textContent = t("Done", "Wedi gwneud");

    els.helpText.innerHTML = t(
      `Use filters to drill a contrast set (e.g. <span class="kbd">AT vs I</span>). Hint doesn’t affect score.`,
      `Defnyddia hidlwyr i ymarfer set cyferbyniad (e.e. <span class="kbd">AT vs I</span>). Dydy Awgrym ddim yn newid y sgôr.`
    );

    els.btnClearFilters.textContent = t("Clear", "Clirio");
    $("btnResetStats").textContent = t("Reset stats", "Ailosod ystadegau");
    els.btnTop.textContent = t("Back to top", "Yn ôl i’r brig");
  }

  /* =========================
     Rendering
     ========================= */
  function renderMeta(item) {
    els.metaRow.innerHTML = "";

    const addChip = (text) => {
      const s = document.createElement("span");
      s.className = "chip";
      s.textContent = text;
      els.metaRow.appendChild(s);
    };

    if (!item) return;

    addChip(`${t("Level", "Lefel")}: ${item.level}`);

    const topicLabel = state.lang === "cy" ? (item.topic_cy || item.topic_en) : (item.topic_en || item.topic_cy);
    if (topicLabel) addChip(`${t("Topic", "Pwnc")}: ${topicLabel}`);

    if (item.contrast_group) addChip(`${t("Set", "Set")}: ${item.contrast_group.replaceAll("_", " ")}`);

    if (item.mode) addChip(`${t("Mode", "Modd")}: ${item.mode}`);
  }

  function setGapText(txt) {
    els.gapCapsule.textContent = txt;
    // re-mount the ? after setting text (so it sits on top-right correctly)
    mountSentenceTranslationUI(els.gapCapsule, state.current);
  }

  function renderQuestion() {
    const item = state.current;
    if (!item) return;

    state.step = 1;
    state.step1Chosen = null;
    state.locked = false;
    state.lastChoices = [];

    els.feedbackWrap.classList.add("hidden");
    els.feedbackWrap.innerHTML = "";

    els.hintBox.classList.add("hidden");
    els.hintBox.textContent = "";

    renderMeta(item);

    // English meaning
    els.enMeaningText.textContent = item.en_sentence || t("(No English provided)", "(Dim Saesneg wedi’i ddarparu)");

    // Welsh line
    els.cyBefore.textContent = item.cy_before || "";
    els.cyAfter.textContent = item.cy_after || "";
    setGapText("__");

    // Step prompt (explicit)
    els.stepChip.textContent = item.needs_step2
      ? t("Step 1 of 2", "Cam 1 o 2")
      : t("Step 1 of 1", "Cam 1 o 1");

    els.stepPrompt.textContent = t(
      "Choose the correct preposition.",
      "Dewis yr arddodiad cywir."
    );

    // Hint content (ready, but hidden)
    const hint = state.lang === "cy" ? item.hint_cy : item.hint_en;
    if (hint) els.hintBox.innerHTML = esc(hint);

    renderStep1Choices(item);
  }

  function choiceButton(label, idx) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-ghost w-full justify-center py-3";
    b.innerHTML = `<span class="sr-only">${idx + 1}</span>${esc(label)}`;
    b.dataset.choice = label;
    return b;
  }

  function disableChoiceButtons() {
    els.choices.querySelectorAll("button").forEach(btn => {
      btn.disabled = true;
      btn.classList.add("opacity-70", "cursor-not-allowed");
    });
  }

  function markCorrectWrongButtons(correctValue, chosenValue) {
    els.choices.querySelectorAll("button").forEach(btn => {
      const val = btn.dataset.choice || btn.textContent;
      if (normalize(val) === normalize(correctValue)) {
        btn.classList.remove("btn-ghost");
        btn.classList.add("btn-primary");
      } else if (chosenValue && normalize(val) === normalize(chosenValue) && normalize(val) !== normalize(correctValue)) {
        // wrong choice styling (page-specific via Tailwind utilities; no shared CSS)
        btn.classList.add("border", "border-rose-300", "bg-rose-50", "text-rose-900");
      }
    });
  }

  function renderStep1Choices(item) {
    let choices = [];

    // Allow CSV override: "a|b|c|d"
    if (item.choices_step1 && item.choices_step1.includes("|")) {
      choices = item.choices_step1.split("|").map(s => s.trim()).filter(Boolean);
    } else if (item.contrast_group && CHOICE_SETS[item.contrast_group]) {
      choices = [...CHOICE_SETS[item.contrast_group]];
    } else {
      // fallback
      choices = uniq([item.answer_prep, "i", "at", "ar", "o", "gyda"]).slice(0, 4);
    }

    choices = uniq(choices);
    shuffleInPlace(choices);
    state.lastChoices = choices;

    els.choices.innerHTML = "";
    choices.slice(0, 4).forEach((ch, i) => {
      const b = choiceButton(ch, i);
      b.addEventListener("click", () => onPickPrep(ch));
      els.choices.appendChild(b);
    });
  }

  function renderStep2Choices(item) {
    const prep = item.answer_prep;
    const pronKey = item.pronoun_key;
    const correct = (item.answer_form_cy || "").trim();

    const options = new Set();
    if (correct) options.add(correct);

    // Distractor: prep + independent pronoun
    const wrongIndep = buildIndependentForm(prep, pronKey);
    if (wrongIndep && normalize(wrongIndep) !== normalize(correct)) options.add(wrongIndep);

    // Distractor: same prep, different pronoun
    const bank = PREP_FORMS[prep]?.forms_cy || {};
    const otherKeys = Object.keys(bank).filter(k => k !== pronKey);
    if (otherKeys.length) {
      const k = otherKeys[Math.floor(Math.random() * otherKeys.length)];
      options.add(bank[k]);
    }

    // Distractor: other prep, same pronoun
    const otherPreps = Object.keys(PREP_FORMS).filter(p => p !== prep);
    if (otherPreps.length) {
      const p = otherPreps[Math.floor(Math.random() * otherPreps.length)];
      const form = PREP_FORMS[p]?.forms_cy?.[pronKey];
      if (form) options.add(form);
    }

    // Pad to 4
    while (options.size < 4) {
      const p = Object.keys(PREP_FORMS)[Math.floor(Math.random() * Object.keys(PREP_FORMS).length)];
      const keys = Object.keys(PREP_FORMS[p].forms_cy);
      const k = keys[Math.floor(Math.random() * keys.length)];
      options.add(PREP_FORMS[p].forms_cy[k]);
    }

    const list = Array.from(options).slice(0, 4);
    shuffleInPlace(list);
    state.lastChoices = list;

    els.choices.innerHTML = "";
    list.forEach((ch, i) => {
      const b = choiceButton(ch, i);
      b.addEventListener("click", () => onPickForm(ch));
      els.choices.appendChild(b);
    });
  }

  function showFeedback({ ok, headline, bodyHtml }) {
    els.feedbackWrap.classList.remove("hidden");

    const box = document.createElement("div");
    box.className = "feedback-box";

    // Accent border per correctness (Tailwind utilities; no shared CSS)
    box.classList.add("border");
    if (ok === true) box.classList.add("border-emerald-200", "bg-emerald-50/40");
    if (ok === false) box.classList.add("border-rose-200", "bg-rose-50/40");

    box.innerHTML = `
      <div class="text-xl md:text-2xl font-semibold ${ok ? "text-emerald-900" : "text-rose-900"}">
        ${esc(headline)}
      </div>
      <div class="mt-2 text-slate-800">${bodyHtml || ""}</div>
    `;

    els.feedbackWrap.innerHTML = "";
    els.feedbackWrap.appendChild(box);
  }

  function showFullExplanation(ok, item, extra = {}) {
    const why = state.lang === "cy" ? item.why_cy : item.why_en;
    const rule = state.lang === "cy" ? item.rule_cy : item.rule_en;

    const answerLine = item.needs_step2
      ? t(
          `Answer: <strong>${esc(item.answer_prep)}</strong> → <strong>${esc(item.answer_form_cy)}</strong>.`,
          `Ateb: <strong>${esc(item.answer_prep)}</strong> → <strong>${esc(item.answer_form_cy)}</strong>.`
        )
      : t(
          `Answer: <strong>${esc(item.answer_prep)}</strong>.`,
          `Ateb: <strong>${esc(item.answer_prep)}</strong>.`
        );

    const chosenLine = extra.chosen
      ? `<div class="mt-2 text-slate-700">${esc(t("You chose:", "Dewisaist ti:"))} <strong>${esc(extra.chosen)}</strong></div>`
      : "";

    const meaningLine = `<div class="mt-3 text-slate-700">
      <span class="text-xs uppercase tracking-wide text-slate-500">${esc(t("Meaning", "Ystyr"))}</span><br>
      <span class="font-semibold">${esc(item.en_sentence || "")}</span>
    </div>`;

    const whyBlock = why ? `<div class="mt-3 text-slate-700">${why}</div>` : "";
    const ruleBlock = rule ? `<div class="mt-2 text-slate-600">${rule}</div>` : "";

    showFeedback({
      ok,
      headline: ok ? t("Correct", "Cywir") : t("Incorrect", "Anghywir"),
      bodyHtml: `
        <div>${answerLine}</div>
        ${chosenLine}
        ${meaningLine}
        ${whyBlock}
        ${ruleBlock}
      `
    });
  }

  function updateStats(ok, counted = true) {
    if (!counted) return;
    state.done += 1;
    if (ok) {
      state.score += 1;
      state.streak += 1;
    } else {
      state.streak = 0;
    }
    els.vScore.textContent = String(state.score);
    els.vStreak.textContent = String(state.streak);
    els.vDone.textContent = String(state.done);
  }

  function onPickPrep(choice) {
    if (state.locked) return;
    const item = state.current;

    state.step1Chosen = choice;
    setGapText(choice); // shows what they picked (even if step2 will replace later)

    const correct = normalize(choice) === normalize(item.answer_prep);
    state.locked = true;

    markCorrectWrongButtons(item.answer_prep, choice);
    disableChoiceButtons();

    if (!correct) {
      updateStats(false, true);
      showFullExplanation(false, item, { chosen: choice });
      return;
    }

    // Step 1 correct
    if (item.needs_step2) {
      state.step = 2;
      state.locked = false;

      els.stepChip.textContent = t("Step 2 of 2", "Cam 2 o 2");

      const pron = PRONOUNS[item.pronoun_key];
      const pronLabel = pron ? (state.lang === "cy" ? pron.cy : pron.en) : "";

      const target = item.answer_form_en
        ? `${item.answer_form_en}`
        : (pronLabel ? t(`for ${pronLabel}`, `ar gyfer ${pronLabel}`) : "");

      els.stepPrompt.textContent = t(
        `Now choose the full Welsh form ${target ? `(${target})` : ""} — it will replace what’s in the blank.`,
        `Nawr dewis y ffurf Gymraeg lawn ${target ? `(${target})` : ""} — bydd yn disodli’r hyn sydd yn y bwlch.`
      );

      renderStep2Choices(item);

      showFeedback({
        ok: true,
        headline: t("Good — now choose the form", "Da — nawr dewis y ffurf"),
        bodyHtml: `
          <div class="text-slate-700">
            ${t("Preposition chosen:", "Arddodiad a ddewiswyd:")} <strong>${esc(item.answer_prep)}</strong>
          </div>
        `
      });

      return;
    }

    // No step2: finished
    updateStats(true, true);
    showFullExplanation(true, item);
  }

  function onPickForm(choice) {
    if (state.locked) return;
    const item = state.current;

    state.locked = true;
    setGapText(choice); // replace the blank with the chosen form

    const correct = normalize(choice) === normalize(item.answer_form_cy);
    markCorrectWrongButtons(item.answer_form_cy, choice);
    disableChoiceButtons();

    updateStats(correct, true);
    showFullExplanation(correct, item, { chosen: choice });
  }

  function showHint() {
    const item = state.current;
    if (!item) return;
    const hint = state.lang === "cy" ? item.hint_cy : item.hint_en;
    if (!hint) return;
    els.hintBox.classList.toggle("hidden");
    if (!els.hintBox.classList.contains("hidden")) {
      els.hintBox.innerHTML = esc(hint);
    }
  }

  function reveal() {
    const item = state.current;
    if (!item) return;

    // Reveal the final target for this card (if step2 exists, reveal the full form)
    const finalAnswer = item.needs_step2 ? (item.answer_form_cy || item.answer_prep) : item.answer_prep;

    setGapText(finalAnswer);

    // Lock + mark
    state.locked = true;
    const correctValue = finalAnswer;
    markCorrectWrongButtons(correctValue, null);
    disableChoiceButtons();

    updateStats(false, true);
    showFullExplanation(false, item, { chosen: t("(revealed)", "(wedi dangos)") });
  }

  function newQuestion() {
    const item = pickNextItem();
    if (!item) {
      els.enMeaningText.textContent = t("No items match your filters.", "Does dim eitemau’n cyfateb i’r hidlwyr.");
      els.cyBefore.textContent = "";
      els.cyAfter.textContent = "";
      setGapText("__");
      els.choices.innerHTML = "";
      els.feedbackWrap.classList.add("hidden");
      els.feedbackWrap.innerHTML = "";
      return;
    }
    state.current = item;
    renderQuestion();
  }

  function clearFilters() {
    const all = t("All", "Pob un");
    els.fLevel.value = all;
    els.fMode.value = all;
    els.fContrast.value = all;
    els.fTopic.value = all;
    state.used.clear();
    newQuestion();
  }

  function resetStats() {
    state.score = 0;
    state.streak = 0;
    state.done = 0;
    els.vScore.textContent = "0";
    els.vStreak.textContent = "0";
    els.vDone.textContent = "0";
    state.used.clear();
    newQuestion();
  }

  /* =========================
     Keyboard shortcuts
     ========================= */
  function bindKeyboard() {
    document.addEventListener("keydown", (e) => {
      // Don’t interfere with typing in inputs/selects
      const tag = (e.target && e.target.tagName) || "";
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag.toUpperCase())) return;

      const k = e.key.toLowerCase();

      if (k === "h") { e.preventDefault(); els.btnHint.click(); return; }
      if (k === "r") { e.preventDefault(); els.btnReveal.click(); return; }
      if (k === "n") { e.preventDefault(); els.btnNew.click(); return; }

      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 4) {
        const arr = state.lastChoices || [];
        const choice = arr[num - 1];
        if (!choice) return;
        if (state.step === 1) onPickPrep(choice);
        else onPickForm(choice);
      }
    });
  }

  /* =========================
     Data loading (CSV)
     ========================= */
  async function initDataFromCsvOrFallback() {
    const sheet = getParam("sheet") || getParam("csv");
    const defaultLocal = "./data/prep.csv";
    const url = sheet || defaultLocal;

    try {
      const rows = await loadCsvUrl(url);
      const items = rows.map(coercePrepRow)
        .filter(it =>
          (it.en_sentence || it.cy_before || it.cy_after) &&
          it.answer_prep
        );

      if (!items.length) throw new Error("Parsed 0 usable rows.");

      state.rows = items;
      els.dataBadge.textContent = `${items.length} items`;
      return;
    } catch (e) {
      console.warn("[prep] CSV load failed, using sample data:", e);
      state.rows = SAMPLE_ITEMS;
      els.dataBadge.textContent = `Sample (${SAMPLE_ITEMS.length})`;
    }
  }

  /* =========================
     Admin tools (optional)
     ========================= */
  function initAdminTools() {
    const admin = getParam("admin") === "1";
    if (!admin) return;

    els.adminPanel.classList.remove("hidden");
    if (els.dataUrl) els.dataUrl.value = getParam("sheet") || getParam("csv") || "";

    els.btnLoadUrl?.addEventListener("click", async () => {
      const u = (els.dataUrl?.value || "").trim();
      if (!u) return;
      try {
        const rows = await loadCsvUrl(u);
        const items = rows.map(coercePrepRow).filter(it => it.answer_prep && (it.en_sentence || it.cy_before));
        if (!items.length) return alert("Loaded, but 0 usable rows found.");
        state.rows = items;
        state.used.clear();
        els.dataBadge.textContent = `${items.length} items`;
        renderFilters();
        newQuestion();
      } catch (err) {
        alert("CSV load failed: " + (err?.message || err));
      }
    });

    els.fileCsv?.addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      if (!f) return;

      Papa.parse(f, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          const items = (res.data || []).map(coercePrepRow).filter(it => it.answer_prep && (it.en_sentence || it.cy_before));
          if (!items.length) return alert("Loaded, but 0 usable rows found.");
          state.rows = items;
          state.used.clear();
          els.dataBadge.textContent = `${items.length} items`;
          renderFilters();
          newQuestion();
        }
      });
    });
  }

  /* =========================
     Language syncing (with navbar toggle)
     ========================= */
  function syncLangIfChanged() {
    const next = wmGetLang();
    if (next === state.lang) return;
    state.lang = next;
    applyLanguageStatic();
    renderFilters();
    // keep same current item, just re-render
    if (state.current) renderQuestion();
  }

  function bindLangSync() {
    // Clicking the navbar toggle happens in-page; storage event doesn't fire in same tab.
    document.addEventListener("click", (e) => {
      if (e.target.closest("#btnLangToggle")) {
        setTimeout(syncLangIfChanged, 0);
      }
    });

    // Storage is still useful across tabs
    window.addEventListener("storage", (e) => {
      if (e.key === "wm_lang") syncLangIfChanged();
    });
  }

  /* =========================
     Wire events
     ========================= */
  function wireUi() {
    els.btnHint.addEventListener("click", showHint);
    els.btnReveal.addEventListener("click", reveal);
    els.btnNew.addEventListener("click", () => { state.used.clear(); newQuestion(); });

    [els.fLevel, els.fMode, els.fContrast, els.fTopic].forEach(sel => {
      sel.addEventListener("change", () => {
        state.used.clear();
        newQuestion();
      });
    });

    els.btnClearFilters.addEventListener("click", clearFilters);
    $("btnResetStats").addEventListener("click", resetStats);

    els.btnTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  /* =========================
     Boot
     ========================= */
  (async function boot() {
    bindLangSync();
    applyLanguageStatic();
    wireUi();
    bindKeyboard();
    initAdminTools();

    await initDataFromCsvOrFallback();
    renderFilters();
    newQuestion();
  })();
})();

