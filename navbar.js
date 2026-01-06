(async function () {
  const mount = document.getElementById("navbarMount");
  if (!mount) return;

  // ----- Load navbar.html -----
  const candidates = [
    "./navbar.html",
    "https://katyjohannab.github.io/welsh-mutation-trainer/navbar.html",
  ];

  let html = null;
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      html = await res.text();
      break;
    } catch (e) {}
  }

  if (!html) {
    console.warn("[Navbar] Could not load navbar.html");
    return;
  }

  mount.innerHTML = html;

  // ----- LocalStorage language: robust (handles JSON or raw) -----
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

  function wmSetLang(next) {
    localStorage.setItem("wm_lang", JSON.stringify(next));
    document.documentElement.setAttribute("lang", next === "cy" ? "cy" : "en");
  }

  function wmApplyLangToPage() {
    const lang = wmGetLang();
    document.documentElement.setAttribute("lang", lang === "cy" ? "cy" : "en");
    document.querySelectorAll("[data-lang]").forEach((el) => {
      el.hidden = (el.getAttribute("data-lang") !== lang);
    });
  }

  function wmSyncLangToggleUI() {
    const btn = document.getElementById("btnLangToggle");
    if (!btn) return;
    const lang = wmGetLang();
    const next = (lang === "en") ? "CY" : "EN";
    btn.innerHTML = `<span aria-hidden="true">🔁</span><span class="langtag">${next}</span>`;
    btn.title = (lang === "en") ? "Switch to Cymraeg" : "Switch to English";
    btn.setAttribute("aria-label", (lang === "en") ? "Switch language to Cymraeg" : "Switch language to English");
  }

  function wmBindLangToggle() {
    const btn = document.getElementById("btnLangToggle");
    if (!btn) return;
    if (btn.dataset.wmBound === "1") return;
    btn.dataset.wmBound = "1";

    btn.addEventListener("click", () => {
      const next = (wmGetLang() === "en") ? "cy" : "en";
      wmSetLang(next);
      wmApplyLangToPage();
      wmSyncLangToggleUI();
    });
  }

  // ----- Active nav highlighting (based on body[data-current]) -----
  function wmApplyActiveNav() {
    const current = document.body?.dataset?.current || "";
    const items = Array.from(document.querySelectorAll("[data-nav]"));

    items.forEach((el) => {
      el.classList.remove("btn-primary");
      el.classList.add("btn-ghost");
      el.removeAttribute("aria-current");
    });

    if (!current) return;

    const active = document.querySelector(`[data-nav="${CSS.escape(current)}"]`);
    if (active) {
      active.classList.remove("btn-ghost");
      active.classList.add("btn-primary");
      active.setAttribute("aria-current", "page");
    }
  }

  // ----- Dropdown niceties: close on outside click / Escape -----
  function wmInitDropdownClose() {
    document.addEventListener("click", (e) => {
      document.querySelectorAll("details.nav-dd[open]").forEach((d) => {
        if (!d.contains(e.target)) d.removeAttribute("open");
      });
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      document.querySelectorAll("details.nav-dd[open]").forEach((d) => d.removeAttribute("open"));
    });
  }

  // ----- Optional sticky shadow (matches your earlier pattern) -----
  function wmInitStickyShadow() {
    const h = document.getElementById("siteHeader");
    if (!h) return;
    const set = () => h.classList.toggle("is-scrolled", window.scrollY > 8);
    window.addEventListener("scroll", set, { passive: true });
    set();
  }

  // ----- Boot -----
  wmApplyLangToPage();
  wmSyncLangToggleUI();
  wmBindLangToggle();
  wmApplyActiveNav();
  wmInitDropdownClose();
  wmInitStickyShadow();
})();

