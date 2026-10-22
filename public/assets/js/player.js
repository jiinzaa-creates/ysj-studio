/* YSJ Studio — shared web player.
 * One <audio> element + one persistent bottom bar drive every preview on the
 * site (index, catalog, beat pages). Card/detail play buttons carry
 * data-play-slug and are synced from the audio element's real state, reusing
 * the existing .play-btn.playing hook. Plays each beat's full-length
 * stream (catalog.js `full`), falling back to its 30s preview.
 * Session continuity: {slug, currentTime, wasPlaying} in sessionStorage; on
 * load the track is restored cued at its position (autoplay attempted only if
 * it was playing, rejection handled silently).
 */
(function () {
  "use strict";

  var STORE_KEY = "ysj_player_v1";
  var audio = null;
  var bar = null, els = {};
  var idx = -1;            // index into BEATS (catalog order); -1 = nothing loaded
  var scrubbing = false;
  var lastSavedSecond = -1;

  /* NB: catalog.js declares BEATS with const — a lexical global, NOT a
   * window property — so always test it with typeof, never window.BEATS. */
  function hasBeats() { return typeof BEATS !== "undefined"; }
  function beat() { return idx >= 0 && hasBeats() ? BEATS[idx] : null; }
  function fmt(t) {
    if (!isFinite(t) || t < 0) t = 0;
    t = Math.floor(t);
    return Math.floor(t / 60) + ":" + ("0" + (t % 60)).slice(-2);
  }

  /* ---------- persistence ---------- */
  function save() {
    var b = beat();
    if (!b) return;
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify({
        slug: b.slug,
        currentTime: audio ? audio.currentTime || 0 : 0,
        wasPlaying: !!(audio && !audio.paused && !audio.ended),
      }));
    } catch (e) {}
  }
  function clearSaved() {
    try { sessionStorage.removeItem(STORE_KEY); } catch (e) {}
  }

  /* ---------- bar DOM ---------- */
  function build() {
    audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.id = "yp-audio";

    bar = document.createElement("div");
    bar.className = "yp-bar";
    bar.id = "yp-bar";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Beat preview player");
    bar.hidden = true;
    bar.innerHTML =
      '<img class="yp-cover" id="yp-cover" alt="">' +
      '<div class="yp-meta">' +
        '<div class="yp-title" id="yp-title"></div>' +
        '<div class="yp-genre" id="yp-genre"></div>' +
      "</div>" +
      '<div class="yp-transport">' +
        '<button type="button" class="yp-btn" id="yp-prev" aria-label="Previous beat">⏮</button>' +
        '<button type="button" class="yp-btn yp-play" id="yp-toggle" aria-label="Play">▶</button>' +
        '<button type="button" class="yp-btn" id="yp-next" aria-label="Next beat">⏭</button>' +
      "</div>" +
      '<span class="yp-time" id="yp-cur">0:00</span>' +
      '<input class="yp-seek" id="yp-seek" type="range" min="0" max="1000" step="1" value="0" aria-label="Seek">' +
      '<span class="yp-time" id="yp-dur">0:00</span>' +
      '<input class="yp-vol" id="yp-vol" type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume">' +
      '<button type="button" class="yp-btn yp-close" id="yp-close" aria-label="Close player">✕</button>';
    document.body.appendChild(bar);
    document.body.appendChild(audio);
    ["cover", "title", "genre", "prev", "toggle", "next", "cur", "seek", "dur", "vol", "close"]
      .forEach(function (k) { els[k] = document.getElementById("yp-" + k); });

    els.toggle.addEventListener("click", toggle);
    els.prev.addEventListener("click", function () { step(-1); });
    els.next.addEventListener("click", function () { step(1); });
    els.close.addEventListener("click", close);
    els.vol.addEventListener("input", function () { audio.volume = parseFloat(els.vol.value); });
    els.seek.addEventListener("pointerdown", function () { scrubbing = true; });
    els.seek.addEventListener("pointerup", function () { scrubbing = false; });
    els.seek.addEventListener("input", function () {
      if (!audio.duration) return;
      audio.currentTime = (parseFloat(els.seek.value) / 1000) * audio.duration;
      paintSeek();
      save();
    });
    els.seek.addEventListener("change", function () { scrubbing = false; });

    audio.addEventListener("play", function () { refresh(); save(); });
    audio.addEventListener("pause", function () { refresh(); save(); });
    audio.addEventListener("timeupdate", function () {
      if (!scrubbing) paintSeek();
      var s = Math.floor(audio.currentTime);
      if (s !== lastSavedSecond) { lastSavedSecond = s; save(); }
    });
    audio.addEventListener("loadedmetadata", function () { paintSeek(); });
    audio.addEventListener("durationchange", function () { paintSeek(); });
    audio.addEventListener("ended", onEnded);
    window.addEventListener("pagehide", save);
  }

  /* ---------- UI state (driven by the audio element) ---------- */
  function playing() { return !!(audio && !audio.paused && !audio.ended); }

  function paintSeek() {
    if (!audio) return;
    var d = audio.duration || 0;
    var pct = d ? (audio.currentTime / d) * 100 : 0;
    if (!scrubbing) els.seek.value = Math.round(pct * 10);
    els.seek.style.background =
      "linear-gradient(90deg, var(--accent) " + pct + "%, var(--surface2) " + pct + "%)";
    els.cur.textContent = fmt(audio.currentTime);
    els.dur.textContent = fmt(d);
  }

  function syncButtons(root) {
    var b = beat();
    (root || document).querySelectorAll(".play-btn[data-play-slug]").forEach(function (btn) {
      var on = !!b && btn.getAttribute("data-play-slug") === b.slug;
      if (on && playing()) {
        btn.classList.add("playing");
        btn.setAttribute("aria-label", "Pause preview");
      } else {
        btn.classList.remove("playing");
        btn.setAttribute("aria-label", "Play preview");
      }
    });
  }

  function refresh() {
    var b = beat();
    if (!b) return;
    els.toggle.textContent = playing() ? "❚❚" : "▶";
    els.toggle.setAttribute("aria-label", playing() ? "Pause" : "Play");
    els.prev.disabled = idx <= 0;
    els.next.disabled = idx >= BEATS.length - 1;
    syncButtons(document);
    paintSeek();
  }

  function show() {
    bar.hidden = false;
    document.body.classList.add("yp-open");
  }
  function hide() {
    bar.hidden = true;
    document.body.classList.remove("yp-open");
  }

  /* ---------- transport ---------- */
  function load(i, opts) {
    opts = opts || {};
    if (!hasBeats() || i < 0 || i >= BEATS.length) return;
    idx = i;
    var b = beat();
    audio.src = b.full || b.preview;
    els.cover.src = b.cover;
    els.cover.alt = b.title + " cover art";
    els.title.textContent = b.title;
    els.genre.textContent = b.genre || "";
    show();
    refresh();
    if (opts.startTime) {
      var t = opts.startTime;
      var seek = function () {
        try { audio.currentTime = Math.min(t, (audio.duration || t) - 0.1); } catch (e) {}
        paintSeek();
      };
      if (audio.readyState >= 1) seek();
      else audio.addEventListener("loadedmetadata", seek, { once: true });
    }
    if (opts.autoplay) play();
    save();
  }

  function play() {
    if (!audio) return;
    var p = audio.play();
    if (p && p.catch) p.catch(function () { refresh(); });
  }
  function toggle() {
    if (idx < 0) return;
    if (audio.paused) play();
    else audio.pause();
  }
  function step(d) {
    var n = idx + d;
    if (n < 0 || n >= BEATS.length) return;
    load(n, { autoplay: true });
  }
  function onEnded() {
    // Auto-advance in catalog order; stop at the end of the list.
    if (idx < BEATS.length - 1) load(idx + 1, { autoplay: true });
    else { refresh(); save(); }
  }
  function close() {
    if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); }
    idx = -1;
    lastSavedSecond = -1;
    clearSaved();
    hide();
    syncButtons(document);
  }

  function playSlug(slug) {
    if (!hasBeats()) return;
    var b = beat();
    if (b && b.slug === slug) { toggle(); return; }
    for (var i = 0; i < BEATS.length; i++) {
      if (BEATS[i].slug === slug) { load(i, { autoplay: true }); return; }
    }
  }

  /* ---------- restore from sessionStorage ---------- */
  function restore() {
    var saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || "null"); } catch (e) {}
    if (!saved || !saved.slug || !hasBeats()) return;
    for (var i = 0; i < BEATS.length; i++) {
      if (BEATS[i].slug === saved.slug) {
        load(i, { startTime: saved.currentTime || 0, autoplay: !!saved.wasPlaying });
        return;
      }
    }
    clearSaved();
  }

  /* ---------- wiring ---------- */
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".play-btn[data-play-slug]");
    if (!btn) return;
    playSlug(btn.getAttribute("data-play-slug"));
  });

  document.addEventListener("DOMContentLoaded", function () {
    build();
    restore();
    refresh();
  });

  window.YSJPlayer = { playSlug: playSlug, syncButtons: syncButtons, close: close };
})();
