/* YSJ Studio storefront — shared chrome + interactions (Milestone 2, frontend only).
 * - Injects header/footer (brand: YSJ Studio business / JINZA artist)
 * - Void (dark) / Bone (light) theme toggle, persisted; honors prefers-reduced-motion
 * - Crate (cart) in localStorage; checkout buttons are UI-only until M4/M5
 * - Audio previews are driven by the shared web player (player.js); card
 *   buttons carry data-play-slug and the player syncs their state
 */
(function () {
  "use strict";

  var CRATE_KEY = "ysj_crate_v1";
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
    ["Beats", "catalog.html"],
    ["Licensing", "licensing.html"],
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
          '<a class="crate-btn" href="checkout.html" aria-label="Your crate"><span aria-hidden="true">◈</span> Crate <span class="crate-count" id="crate-count">0</span></a>' +
          '<button class="nav-toggle icon-btn" id="nav-toggle" aria-expanded="false" aria-controls="mobile-nav" aria-label="Open menu">☰</button>' +
        "</div>" +
      "</div>" +
      '<nav class="mobile-nav" id="mobile-nav" aria-label="Mobile">' + links +
        '<a href="checkout.html">Crate (<span id="crate-count-m">0</span>)</a></nav>'
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
        '<nav aria-label="Footer"><a href="catalog.html">Beats</a><a href="licensing.html">Licensing</a>' +
        '<a href="about.html">About</a><a href="contact.html">Contact</a></nav>' +
        '<nav aria-label="Legal"><a href="privacy.html">Privacy Policy</a><a href="terms.html">Terms of Service</a></nav>' +
        '<div class="footer-social"><a href="https://instagram.com/yessirjinza" target="_blank" rel="noopener">Instagram @yessirjinza</a></div>' +
      "</div>" +
      '<div class="wrap footer-base"><small>© ' + new Date().getFullYear() + " YSJ Studio. All rights reserved. " +
      "Beats produced by JINZA.</small></div>"
    );
  }
  function injectChrome() {
    var page = (location.pathname.split("/").pop() || "index.html").replace(/\.html$/, "") || "index";
    var map = { index: "index.html", catalog: "catalog.html", beat: "catalog.html", checkout: "checkout.html",
                licensing: "licensing.html", about: "about.html", contact: "contact.html" };
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

  /* ---------- crate (cart) ---------- */
  function readCrate() {
    try { return JSON.parse(localStorage.getItem(CRATE_KEY) || "[]"); }
    catch (e) { return []; }
  }
  function writeCrate(c) {
    try { localStorage.setItem(CRATE_KEY, JSON.stringify(c)); } catch (e) {}
    updateCrateBadge();
  }
  function updateCrateBadge() {
    var n = readCrate().length;
    ["crate-count", "crate-count-m"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = n;
    });
  }
  function addToCrate(slug, licenseId, btn) {
    var crate = readCrate();
    if (crate.some(function (i) { return i.slug === slug && i.license === licenseId; })) {
      toast("Already in your crate.");
      return;
    }
    crate.push({ slug: slug, license: licenseId, addedAt: new Date().toISOString() });
    writeCrate(crate);
    if (btn) {
      var orig = btn.textContent;
      btn.textContent = "Added ✓"; btn.disabled = true;
      setTimeout(function () { btn.textContent = orig; btn.disabled = false; }, 1600);
    } else toast("Added to your crate.");
  }
  function removeFromCrate(idx) {
    var crate = readCrate();
    crate.splice(idx, 1);
    writeCrate(crate);
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

  /* ---------- beat cards ---------- */
  function metaChip(label, value) {
    return '<span class="chip"><span class="chip-k">' + label + "</span> " + (value == null ? "—" : value) + "</span>";
  }
  function beatCard(b) {
    return (
      '<article class="beat-card">' +
        '<a class="beat-art" href="beat.html?slug=' + b.slug + '" aria-label="Open ' + b.title + '">' +
          '<img src="' + b.cover + '" alt="' + b.title + ' cover art" loading="lazy" width="800" height="800">' +
          '<span class="beat-badges">' +
            (b.isNew ? '<span class="badge new">New</span>' : "") +
            (b.featured ? '<span class="badge feat">Featured</span>' : "") +
          "</span>" +
        "</a>" +
        '<div class="beat-body">' +
          '<h3><a href="beat.html?slug=' + b.slug + '">' + b.title + "</a></h3>" +
          '<div class="chips">' + metaChip("BPM", b.bpm) + metaChip("Key", b.key) + (b.genre ? '<span class="chip genre">' + b.genre + "</span>" : "") + "</div>" +
          '<div class="beat-row">' +
            '<button class="play-btn" data-play-slug="' + b.slug + '" aria-label="Play preview"><span aria-hidden="true">▶</span></button>' +
            '<span class="from-price">from ' + fromPrice() + "</span>" +
            '<a class="btn small" href="beat.html?slug=' + b.slug + '">License</a>' +
          "</div>" +
        "</div>" +
      "</article>"
    );
  }
  function renderBeatGrid(el, beats) {
    if (!el) return;
    el.innerHTML = beats.length
      ? beats.map(beatCard).join("")
      : '<p class="empty">No beats match. Try clearing the filters.</p>';
    if (window.YSJPlayer) YSJPlayer.syncButtons(el);
  }

  /* ---------- init ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    initTheme();
    injectChrome();
    updateCrateBadge();
  });

  window.YSJ = {
    readCrate, writeCrate, addToCrate, removeFromCrate,
    renderBeatGrid, toast, beatCard, reduceMotion,
  };
})();
