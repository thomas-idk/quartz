/* the quiet garden — entrance animation
 * Drop-in, framework-free overlay for the Quartz site.
 * Install: copy this file to quartz/quartz/static/qg-entrance.js
 *          then add one <script> tag in Head.tsx (see README-entrance.md).
 *
 * Behaviour:
 *   - Reads theme from :root[saved-theme] (Quartz darkmode). Falls back to
 *     prefers-color-scheme. Light => heavenly blue door + golden light.
 *     Dark => warp through space to the abyss.
 *   - Plays ONCE PER DAY per browser (localStorage 'qg-intro-last').
 *   - Never plays on SPA navigations (only fires on real document load).
 *   - Respects prefers-reduced-motion (skips entirely).
 *   - Overlay sits above content, pointer-events:none, dissolves to reveal
 *     the real page underneath. No iframe.
 */
(function () {
  "use strict";
  var DURATION = 1.6;      // seconds
  var STAR_COUNT = 520;    // dark warp density
  var ONCE_PER = "day";    // "day" | "session" | "always"

  try {
    if (window.__qgEntranceRan) return;
    window.__qgEntranceRan = true;
  } catch (e) { return; }

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;

  // ---- gate: once per day (or session) ----
  var today = new Date().toISOString().slice(0, 10);
  try {
    if (ONCE_PER === "session") {
      if (sessionStorage.getItem("qg-intro-session")) return;
      sessionStorage.setItem("qg-intro-session", "1");
    } else if (ONCE_PER === "day") {
      if (localStorage.getItem("qg-intro-last") === today) return;
      localStorage.setItem("qg-intro-last", today);
    }
  } catch (e) { /* storage blocked: play anyway */ }

  // ---- theme ----
  function detectTheme() {
    try {
      var attr = document.documentElement.getAttribute("saved-theme");
      if (attr === "dark" || attr === "light") return attr;
      var ls = localStorage.getItem("theme") || localStorage.getItem("saved-theme");
      if (ls === "dark" || ls === "light") return ls;
    } catch (e) {}
    return (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  }
  var theme = detectTheme();

  // ---- easing ----
  function easeInCubic(x) { return x * x * x; }
  function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
  function easeInOutCubic(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }

  // ---- build overlay (works before <body> exists) ----
  var host = document.createElement("div");
  host.id = "qg-entrance";
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;inset:0;z-index:99999;overflow:hidden;pointer-events:none;" +
    "font-family:'Newsreader',Georgia,serif;";
  var mount = document.body || document.documentElement;
  mount.appendChild(host);

  var W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
  var raf = 0, t0 = 0, lastT = 0;

  // element refs (light)
  var els = {};

  function makeLight() {
    host.style.background = "radial-gradient(120% 90% at 50% 18%,#fff8e8 0%,#eef2f8 46%,#e2eaf3 100%)";
    host.innerHTML =
      '<div style="position:absolute;left:0;right:0;bottom:0;height:34%;filter:blur(2.5px);' +
        'background:radial-gradient(28% 60% at 8% 100%,#fff 0 55%,rgba(255,255,255,0) 74%),' +
        'radial-gradient(24% 50% at 26% 100%,#fdfaf1 0 55%,rgba(253,250,241,0) 74%),' +
        'radial-gradient(30% 55% at 50% 100%,#fff 0 55%,rgba(255,255,255,0) 74%),' +
        'radial-gradient(24% 50% at 74% 100%,#fdfaf1 0 55%,rgba(253,250,241,0) 74%),' +
        'radial-gradient(28% 60% at 92% 100%,#fff 0 55%,rgba(255,255,255,0) 74%),' +
        'linear-gradient(0deg,#fff 0 20%,rgba(255,255,255,0) 100%);"></div>' +
      '<div data-r="sun" style="position:absolute;left:50%;top:6%;width:900px;height:900px;transform:translate(-50%,-50%);opacity:.35;background:radial-gradient(circle,rgba(255,253,240,.95),rgba(255,244,205,.45) 32%,transparent 62%);filter:blur(4px);"></div>' +
      '<div data-r="wispL" style="position:absolute;left:2%;bottom:16%;width:30%;height:26%;opacity:.5;filter:blur(6px);background:radial-gradient(60% 60% at 40% 60%,rgba(255,255,255,.7),transparent 70%);"></div>' +
      '<div data-r="wispR" style="position:absolute;right:2%;bottom:20%;width:30%;height:26%;opacity:.5;filter:blur(6px);background:radial-gradient(60% 60% at 60% 60%,rgba(255,255,255,.7),transparent 70%);"></div>' +
      '<div data-r="beam" style="position:absolute;left:50%;top:2%;width:60%;height:110%;transform:translateX(-50%);opacity:0;mix-blend-mode:screen;filter:blur(18px);background:linear-gradient(180deg,rgba(255,250,225,0) 0%,rgba(255,248,215,.95) 26%,rgba(255,244,205,.4) 70%,transparent 100%);clip-path:polygon(40% 0,60% 0,100% 100%,0 100%);"></div>' +
      '<div style="position:absolute;left:50%;bottom:8%;width:60%;height:88%;transform:translateX(-50%);border-radius:50%;background:radial-gradient(closest-side,rgba(47,90,140,.22),transparent 72%);filter:blur(10px);"></div>' +
      '<div data-r="doorWrap" style="position:absolute;left:50%;bottom:13%;width:42%;height:72%;transform:translateX(-50%) scale(1);perspective:1500px;transform-style:preserve-3d;">' +
        '<div data-r="bloom" style="position:absolute;inset:0;border-radius:50% 50% 3% 3%/24% 24% 0 0;background:radial-gradient(130% 110% at 50% 34%,#fffef8,rgba(255,244,210,.85) 42%,rgba(255,232,175,.25) 74%,transparent 100%);opacity:.05;filter:blur(1px);"></div>' +
        '<div data-r="cloudL" style="position:absolute;left:0;top:0;width:50%;height:100%;transform-origin:0% 50%;border-radius:100% 0 0 0/46% 0 0 0;backface-visibility:hidden;border:1.5px solid rgba(226,238,250,.55);border-right:none;background:linear-gradient(200deg,#7fadd6 0%,#3f7fb3 46%,#1f4a70 100%);box-shadow:inset -14px 0 34px rgba(15,35,60,.4),inset 3px 0 10px rgba(255,255,255,.25),0 0 70px rgba(63,127,179,.55);"></div>' +
        '<div data-r="cloudR" style="position:absolute;right:0;top:0;width:50%;height:100%;transform-origin:100% 50%;border-radius:0 100% 0 0/0 46% 0 0;backface-visibility:hidden;border:1.5px solid rgba(226,238,250,.55);border-left:none;background:linear-gradient(160deg,#7fadd6 0%,#3f7fb3 46%,#1f4a70 100%);box-shadow:inset 14px 0 34px rgba(15,35,60,.4),inset -3px 0 10px rgba(255,255,255,.25),0 0 70px rgba(63,127,179,.55);"></div>' +
      '</div>' +
      '<div data-r="flash" style="position:absolute;inset:0;background:#fffdf6;opacity:0;"></div>';
    host.querySelectorAll("[data-r]").forEach(function (n) { els[n.getAttribute("data-r")] = n; });
  }

  function makeDark() {
    host.style.background = "#04050a";
    var c = document.createElement("canvas");
    c.style.cssText = "position:absolute;inset:0;display:block;width:100%;height:100%;";
    host.appendChild(c);
    var glow = document.createElement("div");
    glow.style.cssText = "position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 0%,rgba(58,80,150,.18),transparent 55%);";
    host.appendChild(glow);
    els.canvas = c;
  }

  var stars = [];
  function setupCanvas() {
    var c = els.canvas; if (!c) return;
    W = window.innerWidth; H = window.innerHeight;
    c.width = Math.max(1, Math.round(W * dpr));
    c.height = Math.max(1, Math.round(H * dpr));
    var ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function seedStars() {
    stars = [];
    for (var i = 0; i < STAR_COUNT; i++) {
      stars.push({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random() * 0.9 + 0.08, blue: Math.random() < 0.32 });
    }
  }

  function frameDark(p, now) {
    var c = els.canvas; if (!c) return;
    var ctx = c.getContext("2d"), cx = W / 2, cy = H / 2;
    var dt = (now - lastT) / 1000; if (dt > 0.05) dt = 0.05; if (dt < 0) dt = 0; lastT = now;
    ctx.fillStyle = "#04050a"; ctx.fillRect(0, 0, W, H);
    var speed = 0.22 + 2.15 * easeInCubic(p), F = 0.92;
    ctx.lineCap = "round";
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i], pz = s.z;
      s.z -= speed * dt;
      if (s.z <= 0.02) { s.x = Math.random() * 2 - 1; s.y = Math.random() * 2 - 1; s.z = 1; s.blue = Math.random() < 0.32; continue; }
      var k = 1 / s.z, kp = 1 / pz;
      var sx = cx + s.x * cx * F * k, sy = cy + s.y * cy * F * k;
      var px = cx + s.x * cx * F * kp, py = cy + s.y * cy * F * kp;
      var near = 1 - s.z;
      var a = Math.min(1, 0.18 + near * 1.05);
      var lw = 0.35 + near * 2.1;
      var col = s.blue ? "160,185,255" : "232,238,255";
      ctx.strokeStyle = "rgba(" + col + "," + a.toFixed(3) + ")";
      ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(sx, sy); ctx.stroke();
    }
    if (p > 0.5) {
      var b = easeOutCubic(Math.min(1, (p - 0.5) / 0.5));
      var rad = Math.max(W, H) * (0.04 + 0.44 * b);
      var ga = 0.9 * b; if (p > 0.86) ga *= (1 - (p - 0.86) / 0.14);
      ga = Math.max(0, Math.min(1, ga));
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, "rgba(255,255,255," + ga.toFixed(3) + ")");
      g.addColorStop(0.42, "rgba(198,214,255," + (ga * 0.45).toFixed(3) + ")");
      g.addColorStop(1, "rgba(160,185,255,0)");
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }
    var ov = 1; if (p > 0.74) ov = 1 - (p - 0.74) / 0.26;
    host.style.opacity = Math.max(0, ov).toFixed(3);
  }

  function frameLight(p) {
    var w = window.innerWidth;
    var openT = easeInOutCubic(Math.min(1, Math.max(0, (p - 0.08) / 0.54)));
    var ang = 100 * openT;
    if (els.cloudL) els.cloudL.style.transform = "rotateY(-" + ang + "deg)";
    if (els.cloudR) els.cloudR.style.transform = "rotateY(" + ang + "deg)";
    if (els.bloom) { var bb = Math.min(1, openT * 1.15); els.bloom.style.opacity = (0.06 + 0.9 * bb).toFixed(3); }
    if (els.sun) els.sun.style.opacity = (0.35 + 0.55 * openT).toFixed(3);
    if (els.beam) { var bo = 0, q = (openT - 0.25) / 0.75; if (q > 0) bo = easeOutCubic(Math.min(1, q)); els.beam.style.opacity = (0.85 * bo).toFixed(3); }
    var passT = Math.min(1, Math.max(0, (p - 0.6) / 0.26));
    var sc = 1 + 1.7 * easeInCubic(passT);
    if (els.doorWrap) els.doorWrap.style.transform = "translateX(-50%) scale(" + sc + ")";
    if (els.flash) { var fo = 0, fq = (p - 0.66) / 0.2; if (fq > 0) fo = easeOutCubic(Math.min(1, fq)); if (p > 0.87) fo *= Math.max(0, 1 - (p - 0.87) / 0.13); els.flash.style.opacity = fo.toFixed(3); }
    if (els.wispL) { els.wispL.style.opacity = (0.5 * (1 - 0.6 * openT)).toFixed(3); els.wispL.style.transform = "translateX(" + (-w * 0.05 * openT) + "px)"; }
    if (els.wispR) { els.wispR.style.opacity = (0.5 * (1 - 0.6 * openT)).toFixed(3); els.wispR.style.transform = "translateX(" + (w * 0.05 * openT) + "px)"; }
    var ov = 1; if (p > 0.84) ov = 1 - (p - 0.84) / 0.16;
    host.style.opacity = Math.max(0, ov).toFixed(3);
  }

  function done() {
    cancelAnimationFrame(raf);
    if (host && host.parentNode) host.parentNode.removeChild(host);
    window.removeEventListener("resize", onResize);
  }
  function onResize() { if (theme === "dark") setupCanvas(); }

  function tick(now) {
    var p = Math.min(1, (now - t0) / (DURATION * 1000));
    if (theme === "dark") frameDark(p, now); else frameLight(p);
    if (p < 1) raf = requestAnimationFrame(tick); else done();
  }

  function start() {
    if (theme === "dark") { makeDark(); setupCanvas(); seedStars(); }
    else { makeLight(); }
    window.addEventListener("resize", onResize);
    t0 = performance.now(); lastT = t0;
    raf = requestAnimationFrame(tick);
  }

  // ensure host is attached to <body> once it exists (better stacking)
  if (!document.body) {
    document.addEventListener("DOMContentLoaded", function () {
      if (host.parentNode !== document.body) document.body.appendChild(host);
      start();
    });
  } else {
    start();
  }
})();
