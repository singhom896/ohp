/*
 * UX4G "Accessibility options" panel behaviour for Opportunity Hub.
 *
 * Local replacement for the original UX4G weights-v1.js (which was never
 * committed to git and is no longer published). It drives the markup in
 * components/site/AccessibilityPanel.tsx and uses the state classes defined
 * in styles/vendor/ux4g/accesibility-style-v2.1.css:
 *   html.ux4g-bg-cursor   big cursor          html.ux4g-font-df  dyslexia font
 *   html.ux4g-bg-white    invert colours      body.dark          dark mode
 *   body#imageHideBg.image-hide               hide background images
 * Everything else (text size, line height, spacing, links, images) is done
 * with one injected <style>, so it also applies to pages opened later by
 * client-side navigation. Settings are kept in localStorage.
 *
 * Globals called from React onClick handlers: openMain, closeMain,
 * highlightLinks, increaseAndReset, toggleFontFeature, toggleImages,
 * toggleCursorFeature, resetAll. The remaining buttons are wired by id here.
 */
(function () {
  "use strict";
  if (window.__ux4gA11yLoaded) return;
  window.__ux4gA11yLoaded = true;

  var STORE_KEY = "ux4g-a11y-v1";
  var CONTENT = "body > *:not(.uwaw):not(script):not(style)";
  var NOT_PANEL = ":not(.uwaw):not(.uwaw *)";

  // Step-based features: value is the current step (0 = off).
  var STEPS = { bigger: 3, smaller: 3, lineHeight: 3, spacing: 3 };
  var ZOOM_UP = [1, 1.1, 1.2, 1.3];
  var ZOOM_DOWN = [1, 0.95, 0.9, 0.85];
  var LINE_HEIGHT = [null, 1.6, 1.9, 2.2];
  var LETTER = [null, "0.05em", "0.1em", "0.15em"];
  var WORD = [null, "0.15em", "0.3em", "0.45em"];

  var DEFAULTS = {
    bigger: 0, smaller: 0, lineHeight: 0, spacing: 0,
    links: false, dyslexia: false, images: false, cursor: false,
    dark: false, invert: false, reader: false,
  };
  var state = load();

  function load() {
    var s = {};
    for (var k in DEFAULTS) s[k] = DEFAULTS[k];
    try {
      var saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      for (var j in saved) if (j in DEFAULTS) s[j] = saved[j];
    } catch (e) { /* storage blocked: use defaults */ }
    s.reader = false; // speech needs a fresh user gesture every visit
    return s;
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  function $(id) { return document.getElementById(id); }

  // ---- Apply state to the page -------------------------------------------

  function styleEl() {
    var el = $("ux4g-a11y-style");
    if (!el) {
      el = document.createElement("style");
      el.id = "ux4g-a11y-style";
      document.head.appendChild(el);
    }
    return el;
  }

  function applyPage() {
    var css = [];
    var zoom = state.bigger ? ZOOM_UP[state.bigger] : state.smaller ? ZOOM_DOWN[state.smaller] : 1;
    if (zoom !== 1) css.push(CONTENT + "{zoom:" + zoom + "}");
    if (state.lineHeight) {
      css.push(CONTENT + "," + CONTENT + " *{line-height:" + LINE_HEIGHT[state.lineHeight] + " !important}");
    }
    if (state.spacing) {
      css.push(CONTENT + "," + CONTENT + " *{letter-spacing:" + LETTER[state.spacing] +
        " !important;word-spacing:" + WORD[state.spacing] + " !important}");
    }
    if (state.links) {
      css.push("a" + NOT_PANEL + "{text-decoration:underline !important;outline:2px solid #ffbf00 !important;" +
        "outline-offset:2px;background-color:#fff3b0 !important;color:#000 !important}");
    }
    if (state.images) {
      css.push(":is(img,picture,video,svg:not(.bi),iframe,canvas)" + NOT_PANEL + "{visibility:hidden !important}");
    }
    if (state.dark) {
      css.push("html,body{background-color:#121212 !important}");
    }
    styleEl().textContent = css.join("\n");

    var html = document.documentElement;
    var body = document.body;
    html.classList.toggle("ux4g-font-df", state.dyslexia);
    html.classList.toggle("ux4g-bg-cursor", state.cursor);
    html.classList.toggle("ux4g-bg-white", state.invert);
    body.classList.toggle("dark", state.dark);
    if (state.images) { body.id = body.id || "imageHideBg"; body.classList.add("image-hide"); }
    else { body.classList.remove("image-hide"); if (body.id === "imageHideBg") body.removeAttribute("id"); }
  }

  // ---- Panel UI (active borders, ticks, step bars) -------------------------

  var ITEMS = {
    reader: ["featureItem_sp", "tickIcon_sp", "speak"],
    bigger: ["featureItem", "tickIcon", "btn-s9", "featureSteps"],
    smaller: ["featureItem-st", "tickIcon-st", "btn-small-text", "featureSteps-st"],
    lineHeight: ["featureItem-lh", "tickIcon-lh", "btn-s12", "featureSteps-lh"],
    links: ["featureItem-ht", "tickIcon-ht", "btn-s10"],
    spacing: ["featureItem-ts", "tickIcon-ts", "btn-s13", "featureSteps-ts"],
    dyslexia: ["featureItem-df", "tickIcon-df", "btn-df"],
    images: ["featureItem-hi", "tickIcon-hi", "btn-s11"],
    cursor: ["featureItem-Cursor", "tickIcon-cursor", "btn-cursor"],
    dark: ["featureItem-ht-dark", "tickIcon-ht-dark", "dark-btn"],
    invert: ["featureItem-ic", "tickIcon-ic", "btn-invert"],
  };

  function renderPanel() {
    for (var key in ITEMS) {
      var ids = ITEMS[key];
      var on = !!state[key];
      var item = $(ids[0]), tick = $(ids[1]), btn = $(ids[2]);
      if (item) item.classList.toggle("feature-active", on);
      if (tick) tick.style.display = on ? "flex" : "none";
      if (btn) btn.setAttribute("aria-pressed", on ? "true" : "false");
      if (ids[3]) renderSteps($(ids[3]), state[key], STEPS[key]);
    }
    // Bigger and Small text are opposites: only one can be on.
    var big = $("btn-s9"), small = $("btn-small-text");
    if (big) big.disabled = state.smaller > 0;
    if (small) small.disabled = state.bigger > 0;
    var cb = $("checkbox");
    if (cb) cb.checked = state.dark;
  }

  function renderSteps(box, value, count) {
    if (!box) return;
    if (box.children.length !== count) {
      box.innerHTML = "";
      for (var i = 0; i < count; i++) {
        var s = document.createElement("span");
        s.className = "uwaw-features__step";
        box.appendChild(s);
      }
    }
    for (var j = 0; j < count; j++) box.children[j].classList.toggle("active", j < value);
  }

  function update() {
    applyPage();
    renderPanel();
    save();
  }

  function step(key) {
    state[key] = (state[key] + 1) % (STEPS[key] + 1);
    if (key === "bigger" && state.bigger) state.smaller = 0;
    if (key === "smaller" && state.smaller) state.bigger = 0;
    update();
  }

  function toggle(key) {
    state[key] = !state[key];
    update();
  }

  // ---- Screen reader (browser speech synthesis) ----------------------------

  function speak(text) {
    if (!("speechSynthesis" in window) || !text) return;
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text.replace(/\s+/g, " ").trim().slice(0, 1000));
    u.lang = document.documentElement.lang || "en-IN";
    window.speechSynthesis.speak(u);
  }

  function readerTarget(e) {
    if (!state.reader) return;
    var el = e.target;
    if (!el || !el.closest || el.closest(".uwaw")) return;
    var text = el.getAttribute("aria-label") || el.getAttribute("alt") || el.innerText || el.textContent;
    speak(text);
  }

  function toggleReader() {
    if (!("speechSynthesis" in window)) return;
    state.reader = !state.reader;
    if (state.reader) speak("Screen reader on. Click or tab to any text to hear it.");
    else window.speechSynthesis.cancel();
    renderPanel();
  }

  // ---- Open / close ---------------------------------------------------------

  var lastTrigger = null;

  function panel() { return $("uw-main"); }

  function isOpen() { var p = panel(); return !!p && p.style.right === "0px"; }

  function openMain() {
    var p = panel();
    if (!p) return;
    lastTrigger = document.activeElement;
    p.inert = false;
    p.style.right = "0px";
    var trigger = $("uw-widget-custom-trigger");
    if (trigger) trigger.setAttribute("aria-expanded", "true");
    var first = p.querySelector(".uwaw-close, button");
    if (first) first.focus({ preventScroll: true });
  }

  function closeMain() {
    var p = panel();
    if (!p) return;
    p.style.right = "";
    p.inert = true; // hidden off-screen: keep it out of the Tab order
    var trigger = $("uw-widget-custom-trigger");
    if (trigger) trigger.setAttribute("aria-expanded", "false");
    if (lastTrigger && lastTrigger.focus) lastTrigger.focus({ preventScroll: true });
  }

  function resetAll() {
    for (var k in DEFAULTS) state[k] = DEFAULTS[k];
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    update();
  }

  // ---- Wiring ---------------------------------------------------------------

  // Called from React onClick handlers (AccessibilityPanel.tsx / GovTools.tsx).
  window.openMain = openMain;
  window.closeMain = closeMain;
  window.resetAll = resetAll;
  window.highlightLinks = function () { toggle("links"); };
  window.increaseAndReset = function () { step("spacing"); };
  window.toggleFontFeature = function () { toggle("dyslexia"); };
  window.toggleImages = function () { toggle("images"); };
  window.toggleCursorFeature = function () { toggle("cursor"); };

  // Buttons without a React handler, wired once by id (event delegation, so it
  // keeps working if React re-mounts the panel).
  var BY_ID = {
    "speak": toggleReader,
    "btn-s9": function () { step("bigger"); },
    "btn-small-text": function () { step("smaller"); },
    "btn-s12": function () { step("lineHeight"); },
    "btn-invert": function () { toggle("invert"); },
  };

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var btn = t.closest("#uw-main button");
    if (btn && BY_ID[btn.id]) { BY_ID[btn.id](); return; }

    // Light-Dark: the checkbox (or its label) drives it; a click elsewhere on
    // the button toggles the checkbox.
    if (btn && btn.id === "dark-btn" && !t.closest(".checkbox-label") && t.id !== "checkbox") {
      e.preventDefault();
      var cb = $("checkbox");
      if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event("change", { bubbles: true })); }
      return;
    }

    // Click outside an open panel closes it (but not the trigger itself).
    if (isOpen() && !t.closest("#uw-main") && !t.closest("#uw-widget-custom-trigger")) closeMain();

    readerTarget(e);
  });

  document.addEventListener("change", function (e) {
    if (e.target && e.target.id === "checkbox") {
      state.dark = e.target.checked;
      update();
    }
  });

  document.addEventListener("focusin", readerTarget);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isOpen()) closeMain();
  });

  function init() {
    var p = panel();
    if (p) p.inert = true;
    if (!("speechSynthesis" in window)) {
      var sp = $("featureItem_sp");
      if (sp) sp.style.display = "none";
    }
    update();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
