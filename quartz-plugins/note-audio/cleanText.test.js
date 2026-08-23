// Cross-language contract test: proves cleanText.js and clean_text.py agree
// on the sha256 hash of their cleaned output for every shared fixture.
//
// This is the test the pipeline spec calls for: if these two implementations
// ever drift, the sidebar player silently stops appearing (the build-time
// hash in the component won't match the one the render script wrote), with
// no error anywhere. This test is the thing that would catch that before it
// ships.
//
// Run with:
//     npx tsx --test quartz-plugins/note-audio/cleanText.test.js
// (requires `python3` on PATH; this is the same laptop that runs the
// render script, so it always is)

import { test } from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

import { cleanNoteText } from "./dist/cleanText.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_PATH = path.join(
  __dirname,
  "..",
  "..",
  "scripts",
  "audio_pipeline",
  "fixtures",
  "clean_text_fixtures.json",
)
const CLEAN_TEXT_PY = path.join(__dirname, "..", "..", "scripts", "audio_pipeline", "clean_text.py")

const fixtures = JSON.parse(readFileSync(FIXTURES_PATH, "utf8"))

function jsHash(raw) {
  return createHash("sha256").update(cleanNoteText(raw), "utf8").digest("hex")
}

function pythonHash(raw) {
  const result = spawnSync("python3", [CLEAN_TEXT_PY], {
    input: raw,
    encoding: "utf8",
  })
  if (result.status !== 0) {
    throw new Error(`clean_text.py exited ${result.status}: ${result.stderr}`)
  }
  return result.stdout.trim()
}

for (const fixture of fixtures) {
  test(`clean text hash agrees between JS and Python: ${fixture.name}`, () => {
    const js = jsHash(fixture.input)
    const py = pythonHash(fixture.input)
    assert.match(js, /^[0-9a-f]{64}$/, "JS hash should be a sha256 hex digest")
    assert.equal(js, py, `hash mismatch for fixture "${fixture.name}" — cleanText.js and clean_text.py disagree`)
  })
}

test("cleanNoteText is deterministic", () => {
  const raw = fixtures[0].input
  assert.equal(jsHash(raw), jsHash(raw))
})
