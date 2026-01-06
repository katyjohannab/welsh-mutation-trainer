/* navbar.js - inject navbar.html + wire language toggle + optional active-state */

(function () {
  const NAV_CANDIDATES = [
    "./navbar.html",
    "https://katyjohannab.github.io/welsh-mutation-trainer/navbar.html"
  ];

  const $ = (sel, root = document) => root.querySelector(sel);

  function saveLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function loadLS(k, d) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : d; } catch (e) { return d; } }

  function getLang() {
    const v = loadLS("wm_lang", "en");
    return (v === "cy" || v === "en") ? v : "en";
  }

  function setLang(next) {
    saveLS("wm_lang", next);
    document.documentElement.setAttribute("lang", next === "cy" ? "cy" : "en");
  }

  function applyLangToPage() {
    const lang = getLang();
    document.documentElement.setAttribute("lang", lang === "cy" ? "cy" : "en");

    // Page-level bilingual blocks (your home.html etc.)
    document.querySelectorAll("[data-lang]").forEach(el => {
      el.hidden = (el.getAttribute("data-lang") !== lang);
    });

    // Toggle button UI MUST match index.html style
    const langBtn = $("#btnLangToggle");
    if (langBtn) {
      const nextLabel = (lang === "en") ? "CY" : "EN";
      langBtn.innerHTML = `<span aria-hidden="true">🔁</span><span class="langtag">${nextLabel}</span>`;
      langBtn.title = (lang === "en") ? "Switch to Cymraeg" : "Switch to English";
      langBtn.setAttribute("aria-label", (lang === "en") ? "Switch language to Cymraeg" : "Switch language to English");
    }

    // If a page provides a hook to update labels, call it.
    // Example: window.onLangChange = (lang) => { ... }
    if (typeof window.onLangChange === "function") {
      try { window.onLangChange(lang); } catch (e) {}
    }
  }

  function wireToggle() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest && e.target.closest("#btnLangToggle");
      if (!btn) return;
      const next = (getLang() === "en") ? "cy" : "en";
      setLang(next);
      applyLangToPage();
    });
  }

  function highlightCurrent() {
    // Optional: set a subtle “current page” cue using data-current on <body>
    // e.g. <body data-current="home"> or "learn" / "practice" / "vocab"
    const cur = document.body?.getAttribute("data-current") || "";
    const map = {
      home: null,
      learn: "#btnLearn",
      practice: "#btnPractice",
      vocab: "#btnStats"
    };
    const sel = map[cur];
    if (!sel) return;
    const el = $(sel);
    if (!el) return;

    // Don’t fight your CSS. Just add a tiny class you can style if you want.
    el.classList.add("is-current");
  }

  async function fetchFirstOk(urls) {
    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: "no-cache" });
        if (!res.ok) throw new Error(String(res.status));
        return await res.text();
      } catch (e) {}
    }
    return null;
  }

  async function mountNavbar() {
    const mount = $("#navbarMount");
    if (!mount) return false;

    const html = await fetchF
