/* the quiet garden — site enhancements (framework-free, SPA-aware)
 *   - ambient generative pad + top-bar mute toggle (muted by default, remembered)
 *   - soft cross-fade on SPA navigation
 *   - reading-progress bar on note pages
 *   - copy buttons on code blocks
 *   - click-to-zoom lightbox for article images
 * Loaded via <script defer> in Head.tsx. Listeners are delegated / bound to the
 * "nav" event so everything keeps working across Quartz SPA navigations.
 */
(function () {
  "use strict";
  if (window.__qgEnhance) return;
  window.__qgEnhance = true;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ================= ambient generative pad ================= */
  var AudioCtx = window.AudioContext || window.webkitAudioContext;
  var actx = null, ambMaster = null, ambOn = false;

  function reverb(ctx) {
    var len = Math.floor(ctx.sampleRate * 2.8), b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) { var d = b.getChannelData(ch);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    var c = ctx.createConvolver(); c.buffer = b; return c;
  }
  function voice(ctx, dest, freq, type, gain, rate) {
    var o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    var o2 = ctx.createOscillator(); o2.type = type; o2.frequency.value = freq * 1.003; // slow beating
    var g = ctx.createGain(); g.gain.value = 0.0001;
    var lfo = ctx.createOscillator(); lfo.frequency.value = rate; var lg = ctx.createGain(); lg.gain.value = gain * 0.5;
    var base = ctx.createConstantSource(); base.offset.value = gain * 0.5;
    lfo.connect(lg); lg.connect(g.gain); base.connect(g.gain);
    o.connect(g); o2.connect(g); g.connect(dest);
    o.start(); o2.start(); lfo.start(); base.start();
  }
  function ambStart() {
    if (actx || !AudioCtx) return;
    try { actx = new AudioCtx(); } catch (e) { return; }
    ambMaster = actx.createGain(); ambMaster.gain.value = 0.0001;
    var rev = reverb(actx), wet = actx.createGain(); wet.gain.value = 0.55;
    var dry = actx.createGain(); dry.gain.value = 0.6;
    var lp = actx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 560; lp.Q.value = 0.6;
    var flfo = actx.createOscillator(); flfo.frequency.value = 0.035; var fg = actx.createGain(); fg.gain.value = 300;
    var fbase = actx.createConstantSource(); fbase.offset.value = 620;
    flfo.connect(fg); fg.connect(lp.frequency); fbase.connect(lp.frequency); flfo.start(); fbase.start();
    lp.connect(dry); lp.connect(rev); rev.connect(wet); dry.connect(ambMaster); wet.connect(ambMaster); ambMaster.connect(actx.destination);
    voice(actx, lp, 110.0, "sine", 0.16, 0.05);
    voice(actx, lp, 164.81, "sine", 0.13, 0.062);
    voice(actx, lp, 220.0, "triangle", 0.08, 0.045);
    voice(actx, lp, 329.63, "sine", 0.05, 0.07);
    voice(actx, lp, 659.25, "sine", 0.022, 0.09);
    var nlen = Math.floor(actx.sampleRate * 4), nb = actx.createBuffer(1, nlen, actx.sampleRate), nd = nb.getChannelData(0);
    for (var i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
    var ns = actx.createBufferSource(); ns.buffer = nb; ns.loop = true;
    var bp = actx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2400; bp.Q.value = 0.5;
    var ng = actx.createGain(); ng.gain.value = 0.012; ns.connect(bp); bp.connect(ng); ng.connect(rev); ns.start();
    ambMaster.gain.exponentialRampToValueAtTime(0.13, actx.currentTime + 2.5);
  }
  function ambStop() {
    if (!actx) return;
    try { ambMaster.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 1.0); } catch (e) {}
    var old = actx; actx = null; ambMaster = null;
    setTimeout(function () { try { old.close(); } catch (e) {} }, 1200);
  }
  function ambReflect() {
    var btns = document.querySelectorAll("[data-qg-ambient]");
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle("is-on", ambOn);
      btns[i].setAttribute("aria-pressed", ambOn ? "true" : "false");
      btns[i].setAttribute("aria-label", ambOn ? "Ambient sound (on)" : "Ambient sound (off)");
    }
  }
  function ambSet(on) {
    ambOn = on;
    try { localStorage.setItem("qg-ambient", on ? "on" : "off"); } catch (e) {}
    if (on) ambStart(); else ambStop();
    ambReflect();
  }
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest("[data-qg-ambient]") : null;
    if (b) { e.preventDefault(); ambSet(!ambOn); }
  });
  try {
    if (localStorage.getItem("qg-ambient") === "on") {
      ambOn = true; // browsers block autoplay: resume on the first gesture
      var arm = function () { if (ambOn && !actx) ambStart(); ambReflect();
        window.removeEventListener("pointerdown", arm); window.removeEventListener("keydown", arm); };
      window.addEventListener("pointerdown", arm); window.addEventListener("keydown", arm);
    }
  } catch (e) {}
  document.addEventListener("nav", ambReflect);

  /* ================= soft cross-fade on SPA nav ================= */
  if (!reduce) {
    document.addEventListener("nav", function () {
      var el = document.querySelector(".qg-content-col");
      if (!el) return;
      el.classList.remove("qg-navin"); void el.offsetWidth; el.classList.add("qg-navin");
    });
  }

  /* ================= reading progress bar (notes) ================= */
  var bar = null;
  function progress() {
    if (!bar) { bar = document.createElement("div"); bar.id = "qg-progress"; document.body.appendChild(bar); }
    if (!document.querySelector(".qg-shell.qg-note")) { bar.style.width = "0"; bar.style.opacity = "0"; return; }
    var h = document.documentElement, top = h.scrollTop || document.body.scrollTop;
    var max = h.scrollHeight - h.clientHeight;
    bar.style.opacity = "1";
    bar.style.width = (max > 0 ? Math.min(1, top / max) * 100 : 0).toFixed(2) + "%";
  }
  window.addEventListener("scroll", progress, { passive: true });
  window.addEventListener("resize", progress, { passive: true });
  document.addEventListener("nav", function () { setTimeout(progress, 0); });

  /* ================= copy buttons on code blocks ================= */
  function addCopy() {
    var pres = document.querySelectorAll(".qg-content-col pre");
    for (var i = 0; i < pres.length; i++) {
      var pre = pres[i];
      if (pre.querySelector(".qg-copy")) continue;
      var code = pre.querySelector("code"); if (!code) continue;
      var btn = document.createElement("button");
      btn.className = "qg-copy"; btn.type = "button"; btn.textContent = "copy"; btn.setAttribute("aria-label", "Copy code");
      (function (code, btn) {
        btn.addEventListener("click", function () {
          var text = code.innerText;
          function ok() { btn.textContent = "copied"; setTimeout(function () { btn.textContent = "copy"; }, 1400); }
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, function () {});
          else { try { var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); ok(); } catch (e) {} }
        });
      })(code, btn);
      if (getComputedStyle(pre).position === "static") pre.style.position = "relative";
      pre.appendChild(btn);
    }
  }
  document.addEventListener("nav", function () { setTimeout(addCopy, 0); });

  /* ================= image lightbox ================= */
  var lb = null;
  function closeLb() { if (lb) { lb.classList.remove("open"); var g = lb; lb = null; setTimeout(function () { if (g && g.parentNode) g.parentNode.removeChild(g); }, 250); } }
  document.addEventListener("click", function (e) {
    var img = e.target;
    if (!img || img.tagName !== "IMG" || !img.closest) return;
    if (!img.closest(".qg-content-col")) return;
    if (img.closest("a")) return;
    if (img.naturalWidth && img.naturalWidth < 120) return;
    e.preventDefault();
    lb = document.createElement("div"); lb.id = "qg-lightbox";
    var big = document.createElement("img"); big.src = img.currentSrc || img.src; big.alt = img.alt || "";
    lb.appendChild(big); document.body.appendChild(lb);
    lb.addEventListener("click", closeLb);
    requestAnimationFrame(function () { lb.classList.add("open"); });
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeLb(); });
  document.addEventListener("nav", closeLb);

  /* ---- initial run ---- */
  function init() { ambReflect(); progress(); addCopy(); }
  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
})();
