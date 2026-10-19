/* YSJ Studio storefront — shared chrome + interactions (Milestone 2, frontend only).
 * - Injects header/footer (brand: YSJ Studio business / JINZA artist)
 * - Void (dark) / Bone (light) theme toggle, persisted; honors prefers-reduced-motion
 * - Crate (cart) in localStorage; checkout buttons are UI-only until M4/M5
 * - One-at-a-time audio previews
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
          '<span class="brand-mark"><video src="assets/logos/oni-animated.mp4" poster="assets/logos/oni-poster.jpg" muted loop playsinline autoplay aria-hidden="true"></video></span>' +
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
          '<span class="brand-mark sm"><video src="assets/logos/oni-animated.mp4" poster="assets/logos/oni-poster.jpg" muted loop playsinline autoplay aria-hidden="true"></video></span>' +
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
    // Reduced motion: never autoplay the oni mark; show poster instead.
    if (reduceMotion) {
      document.querySelectorAll(".brand-mark video").forEach(function (v) {
        v.removeAttribute("autoplay"); v.pause();
      });
    }
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

  /* ---------- audio: one at a time ---------- */
  var currentAudio = null;
  function hookPlayers(root) {
    (root || document).querySelectorAll("audio[data-preview]").forEach(function (audio) {
      audio.addEventListener("play", function () {
        if (currentAudio && currentAudio !== audio) currentAudio.pause();
        currentAudio = audio;
        document.querySelectorAll(".play-btn.playing").forEach(function (b) {
          if (b.dataset.target !== audio.id) { b.classList.remove("playing"); b.setAttribute("aria-label", "Play preview"); }
        });
        var btn = document.querySelector('.play-btn[data-target="' + audio.id + '"]');
        if (btn) { btn.classList.add("playing"); btn.setAttribute("aria-label", "Pause preview"); }
      });
      audio.addEventListener("pause", function () {
        var btn = document.querySelector('.play-btn[data-target="' + audio.id + '"]');
        if (btn) { btn.classList.remove("playing"); btn.setAttribute("aria-label", "Play preview"); }
        if (currentAudio === audio) currentAudio = null;
      });
    });
    document.addEventListener("click", function (e) {
      var btn = e.target.closest(".play-btn");
      if (!btn || !btn.dataset.target) return;
      var audio = document.getElementById(btn.dataset.target);
      if (!audio) return;
      if (audio.paused) { audio.play().catch(function () {}); }
      else audio.pause();
    });
  }

  /* ---------- beat cards ---------- */
  function metaChip(label, value) {
    return '<span class="chip"><span class="chip-k">' + label + "</span> " + (value == null ? "—" : value) + "</span>";
  }
  function beatCard(b, i) {
    var audioId = "pv-" + b.slug + "-" + i;
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
            '<button class="play-btn" data-target="' + audioId + '" aria-label="Play preview"><span aria-hidden="true">▶</span></button>' +
            '<audio id="' + audioId + '" data-preview preload="none" src="' + b.preview + '"></audio>' +
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
    hookPlayers(el);
  }

  /* ---------- init ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    initTheme();
    injectChrome();
    updateCrateBadge();
    hookPlayers(document);
  });

  window.YSJ = {
    readCrate, writeCrate, addToCrate, removeFromCrate,
    renderBeatGrid, toast, beatCard, reduceMotion,
  };
})();
