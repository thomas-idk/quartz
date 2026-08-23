// NoteAudio: sidebar player for notes narrated by the local Kokoro render
// pipeline (scripts/audio_pipeline/render.py).
//
// Staleness is derived at build time, never written: this file re-reads the
// note's raw source text, cleans it with the exact same function the render
// script used (see cleanText.js for why that has to be true), hashes it, and
// compares against `audio_hash` in frontmatter. Mismatch or missing fields
// -> render nothing. Editing a note therefore makes the player disappear
// until the next render, with no commit required either way.
//
// This is a local, plain-JS Quartz plugin (see package.json) rather than a
// git-fetched one: it's symlinked into .quartz/plugins/note-audio by
// `npx quartz plugin install`. It is deliberately NOT TypeScript/JSX --
// local plugins are used as-is (no build step is ever run on them by
// Quartz), so this must already be plain, directly-importable ESM.

import { h } from "preact"
import fs from "node:fs"
import crypto from "node:crypto"
import { slugifyFilePath, resolveRelative } from "@quartz-community/utils"
import { cleanNoteText } from "./cleanText.js"

function computeLiveHash(absoluteFilePath) {
  try {
    const raw = fs.readFileSync(absoluteFilePath, "utf8")
    return crypto.createHash("sha256").update(cleanNoteText(raw), "utf8").digest("hex")
  } catch {
    return null
  }
}

const PLAY_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>'
const PAUSE_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>'
const DOWNLOAD_ICON =
  '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 3v10.5m0 0 4-4m-4 4-4-4M5 19h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'

function NoteAudioComponent(props) {
  const { fileData } = props
  const fm = (fileData && fileData.frontmatter) || {}
  const audioRel = fm.audio
  const storedHash = fm.audio_hash

  if (typeof audioRel !== "string" || typeof storedHash !== "string") return null
  if (!fileData.filePath || !fileData.slug) return null

  const liveHash = computeLiveHash(fileData.filePath)
  if (!liveHash || liveHash !== storedHash) return null

  const audioSlug = slugifyFilePath(audioRel)
  const href = resolveRelative(fileData.slug, audioSlug)

  return h(
    "div",
    { class: "note-audio-card" },
    h("p", { class: "note-audio-label" }, "Listen"),
    h(
      "div",
      { class: "note-audio-row" },
      h("button", {
        type: "button",
        class: "note-audio-playpause",
        "aria-label": "Play",
        "aria-pressed": "false",
        "data-note-audio-toggle": "",
        dangerouslySetInnerHTML: { __html: PLAY_ICON },
      }),
      h(
        "div",
        { class: "note-audio-meta" },
        h(
          "div",
          { class: "note-audio-progress", "data-note-audio-progress": "", tabindex: "0", role: "slider" },
          h("div", { class: "note-audio-progress-fill", "data-note-audio-fill": "" }),
        ),
        h(
          "div",
          { class: "note-audio-time" },
          h("span", { "data-note-audio-elapsed": "" }, "0:00"),
          h("span", { "data-note-audio-duration": "" }, "–:––"),
        ),
      ),
      h(
        "a",
        {
          class: "note-audio-download",
          href,
          download: true,
          title: "Download MP3",
          "aria-label": "Download MP3",
          dangerouslySetInnerHTML: { __html: DOWNLOAD_ICON },
        },
      ),
    ),
    h("audio", { class: "note-audio-element", preload: "none", "data-note-audio-src": href }),
  )
}

NoteAudioComponent.css = `
.note-audio-card {
  border: 1px solid var(--qg-toc-line, var(--lightgray));
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 20px;
}
.note-audio-label {
  margin: 0 0 10px;
  font: 600 11px var(--ui-font, inherit);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--qg-label, var(--gray));
}
.note-audio-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.note-audio-playpause {
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--qg-toc-line, var(--lightgray));
  background: var(--light);
  color: var(--qg-body, var(--dark));
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.note-audio-playpause:hover {
  color: var(--qg-accent-hi, var(--secondary));
  border-color: var(--qg-accent-hi, var(--secondary));
}
.note-audio-meta {
  flex: auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.note-audio-progress {
  height: 4px;
  border-radius: 2px;
  background: var(--lightgray);
  cursor: pointer;
  position: relative;
}
.note-audio-progress-fill {
  position: absolute;
  inset: 0;
  width: 0%;
  border-radius: 2px;
  background: var(--secondary);
}
.note-audio-time {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--gray);
}
.note-audio-download {
  flex: none;
  color: var(--gray);
  display: flex;
  align-items: center;
}
.note-audio-download:hover {
  color: var(--qg-accent-hi, var(--secondary));
}
`

NoteAudioComponent.afterDOMLoaded = `
function noteAudioInit() {
  document.querySelectorAll(".note-audio-card").forEach(function (card) {
    if (card.dataset.noteAudioBound) return
    card.dataset.noteAudioBound = "1"

    var audioEl = card.querySelector(".note-audio-element")
    var btn = card.querySelector("[data-note-audio-toggle]")
    var progress = card.querySelector("[data-note-audio-progress]")
    var fill = card.querySelector("[data-note-audio-fill]")
    var elapsedEl = card.querySelector("[data-note-audio-elapsed]")
    var durationEl = card.querySelector("[data-note-audio-duration]")
    var src = audioEl.getAttribute("data-note-audio-src")

    function formatTime(sec) {
      if (!isFinite(sec) || sec < 0) return "–:––"
      var m = Math.floor(sec / 60)
      var s = Math.floor(sec % 60)
      return m + ":" + (s < 10 ? "0" : "") + s
    }

    function ensureSrc() {
      if (!audioEl.src) audioEl.src = src
    }

    btn.addEventListener("click", function () {
      ensureSrc()
      if (audioEl.paused) {
        audioEl.play()
      } else {
        audioEl.pause()
      }
    })

    audioEl.addEventListener("play", function () {
      btn.setAttribute("aria-label", "Pause")
      btn.setAttribute("aria-pressed", "true")
      btn.innerHTML = ${JSON.stringify(PAUSE_ICON)}
    })
    audioEl.addEventListener("pause", function () {
      btn.setAttribute("aria-label", "Play")
      btn.setAttribute("aria-pressed", "false")
      btn.innerHTML = ${JSON.stringify(PLAY_ICON)}
    })
    audioEl.addEventListener("loadedmetadata", function () {
      durationEl.textContent = formatTime(audioEl.duration)
    })
    audioEl.addEventListener("timeupdate", function () {
      elapsedEl.textContent = formatTime(audioEl.currentTime)
      if (audioEl.duration) {
        fill.style.width = (100 * audioEl.currentTime / audioEl.duration) + "%"
      }
    })
    audioEl.addEventListener("ended", function () {
      fill.style.width = "0%"
      elapsedEl.textContent = "0:00"
    })

    function seek(evt) {
      ensureSrc()
      var rect = progress.getBoundingClientRect()
      var ratio = Math.min(1, Math.max(0, (evt.clientX - rect.left) / rect.width))
      if (audioEl.duration) audioEl.currentTime = ratio * audioEl.duration
    }
    progress.addEventListener("click", seek)
  })
}
document.addEventListener("nav", noteAudioInit)
`

export function NoteAudio() {
  return NoteAudioComponent
}
