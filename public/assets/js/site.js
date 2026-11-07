/* YSJ Studio — shared chrome + interactions.
 * - Injects header/footer (brand: YSJ Studio business / JINZA artist)
 * - Void (dark) / Bone (light) theme toggle, persisted; honors prefers-reduced-motion
 * - Work cards render selected productions listen-only (no prices, no cart,
 *   no checkout). Audio is driven by the shared web player (player.js);
 *   card buttons carry data-play-slug and the player syncs their state.
 * - This is a production-company site. There is no store, no crate, and no
 *   checkout anywhere on it.
 */
(function () {
  "use strict";

  var THEME_KEY = "ysj_theme";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- theme ---------- */
  function currentTheme() {
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
    if (saved === "void" || saved === "bone") return saved;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "bone" : "void";
  }
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    var btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.setAttribute("aria-pressed", t === "bone" ? "true" : "false");
      btn.querySelector(".theme-label").textContent = t === "bone" ? "Void" : "Bone";
    }
  }
  function initTheme() {
    applyTheme(currentTheme());
    document.addEventListener("click", function (e) {
      var btn = e.target.closest("#theme-toggle");
      if (!btn) return;
      var next = document.documentElement.getAttribute("data-theme") === "bone" ? "void" : "bone";
      try { localStorage.setItem(THEME_KEY, next); } catch (err) {}
      applyTheme(next);
    });
  }

  /* ---------- header / footer ---------- */
  var NAV = [
    ["Services", "services.html"],
    ["Publishing", "publishing.html"],
    ["About", "about.html"],
    ["Contact", "contact.html"],
  ];
  function headerHTML(active) {
    var links = NAV.map(function (n) {
      var cls = n[1] === active ? ' class="active" aria-current="page"' : "";
      return '<a href="' + n[1] + '"' + cls + ">" + n[0] + "</a>";
    }).join("");
    return (
      '<div class="wrap header-inner">' +
        '<a class="brand" href="index.html" aria-label="YSJ Studio home">' +
          '<span class="brand-mark"><img src="assets/logos/skull-sm.jpg?v=2" alt="" aria-hidden="true"></span>' +
          '<span class="brand-word">YSJ <span>Studio</span></span>' +
        "</a>" +
        '<nav class="nav" aria-label="Primary">' + links + "</nav>" +
        '<div class="header-actions">' +
          '<button id="theme-toggle" class="icon-btn" aria-pressed="false" aria-label="Toggle light and dark theme"><span class="theme-dot" aria-hidden="true"></span><span class="theme-label">Bone</span></button>' +
          '<button class="nav-toggle icon-btn" id="nav-toggle" aria-expanded="false" aria-controls="mobile-nav" aria-label="Open menu">☰</button>' +
        "</div>" +
      "</div>" +
      '<nav class="mobile-nav" id="mobile-nav" aria-label="Mobile">' + links + "</nav>"
    );
  }
  function footerHTML() {
    return (
      '<div class="wrap footer-grid">' +
        '<div class="footer-brand">' +
          '<span class="brand-mark sm"><img src="assets/logos/skull-sm.jpg?v=2" alt="" aria-hidden="true"></span>' +
          "<p><strong>YSJ Studio</strong><br>Original production. Your next record.<br>" +
          '<span class="credit">Produced by JINZA | YSJ Studio</span></p>' +
        "</div>" +
        '<nav aria-label="Footer"><a href="services.html">Services</a>' +
        '<a href="publishing.html">Publishing</a><a href="about.html">About</a><a href="contact.html">Contact</a></nav>' +
        '<nav aria-label="More">' +
        '<a href="privacy.html">Privacy Policy</a><a href="terms.html">Terms of Service</a></nav>' +
        '<div class="footer-social"><a href="https://instagram.com/yessirjinza" target="_blank" rel="noopener">Instagram @yessirjinza</a></div>' +
      "</div>" +
      '<div class="wrap footer-base"><small>© ' + new Date().getFullYear() + " YSJ Studio. All rights reserved. " +
      "Produced by JINZA | YSJ Studio.</small></div>"
    );
  }
  function injectChrome() {
    var page = (location.pathname.split("/").pop() || "index.html").replace(/\.html$/, "") || "index";
    var map = { index: "index.html", services: "services.html", publishing: "publishing.html",
                about: "about.html", contact: "contact.html" };
    var h = document.getElementById("site-header");
    var f = document.getElementById("site-footer");
    if (h) h.innerHTML = headerHTML(map[page] || "");
    if (f) f.innerHTML = footerHTML();
    var toggle = document.getElementById("nav-toggle");
    var mnav = document.getElementById("mobile-nav");
    if (toggle && mnav) {
      toggle.addEventListener("click", function () {
        var open = mnav.classList.toggle("open");
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
  }

  /* ---------- toast ---------- */
  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2600);
  }

  /* ---------- work cards (listen-only) ---------- */
  function metaChip(label, value) {
    return '<span class="chip"><span class="chip-k">' + label + "</span> " + (value == null ? "—" : value) + "</span>";
  }
  function workCard(b) {
    return (
      '<article class="beat-card">' +
        '<span class="beat-art" aria-label="' + b.title + ' cover art">' +
          '<img src="' + b.cover + '" alt="' + b.title + ' cover art" loading="lazy" width="800" height="800">' +
          '<span class="beat-badges">' +
            (b.isNew ? '<span class="badge new">New</span>' : "") +
            (b.featured ? '<span class="badge feat">Featured</span>' : "") +
          "</span>" +
        "</span>" +
        '<div class="beat-body">' +
          "<h3>" + b.title + "</h3>" +
          '<div class="chips">' + metaChip("BPM", b.bpm) + metaChip("Key", b.key) + (b.genre ? '<span class="chip genre">' + b.genre + "</span>" : "") + "</div>" +
          '<div class="beat-row">' +
            '<button class="play-btn" data-play-slug="' + b.slug + '" aria-label="Play ' + b.title + '"><span aria-hidden="true">▶</span></button>' +
            '<span class="from-price">Produced by JINZA</span>' +
          "</div>" +
        "</div>" +
      "</article>"
    );
  }
  function renderWorkGrid(el, beats) {
    if (!el) return;
    el.innerHTML = beats.length
      ? beats.map(workCard).join("")
      : '<p class="empty">Nothing here yet.</p>';
    if (window.YSJPlayer) YSJPlayer.syncButtons(el);
  }

  /* ---------- init ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    initTheme();
    injectChrome();
  });

  window.YSJ = {
    renderWorkGrid, toast, workCard, reduceMotion,
  };
})();
