// Shared text-cleaning contract for note narration.
//
// This function's output is hashed (sha256 of its UTF-8 bytes) and that hash
// is compared against a mirror implementation in
// `scripts/audio_pipeline/clean_text.py`. The two MUST produce byte-identical
// output for the same input, or the staleness check silently disagrees and
// the sidebar player never appears. Any change here must be mirrored there,
// in the same order, and re-verified with:
//
//     python3 -m unittest scripts.audio_pipeline.test_clean_text
//     npx tsx --test quartz-plugins/note-audio/cleanText.test.js
//
// CONTRACT (authoritative — mirrored verbatim as a comment in clean_text.py):
//
//   0. Normalize line endings: CRLF and lone CR both become LF.
//   1. Strip a single leading YAML frontmatter block delimited by '---' lines.
//   2. Single pass over lines:
//        - drop fenced code blocks (``` or ~~~, opening fence 3+ of the same
//          character, closing fence made of only that character with
//          length >= opening length)
//        - drop footnote *definition* lines matching ^\[\^id\]:...
//        - drop GFM-style table blocks: a line containing '|' immediately
//          followed by a delimiter row (only '-', ':', '|', spaces/tabs);
//          the table then extends through subsequent lines that still
//          contain '|'
//   3. Remove inline code spans: a run of N backticks, closed by the same
//      length run of backticks -> replaced with a single space.
//   4. Resolve wikilinks [[target]] / [[target|alias]] -> alias if present,
//      else target with any '#'/'^' anchor suffix removed, trimmed.
//   5. Resolve markdown links [text](url) -> text.
//   6. Remove autolinks/bare URLs: <http...> angle-bracket form, and bare
//      http://, https://, or www. tokens up to the next ASCII whitespace char.
//   7. Remove inline footnote reference markers [^id] -> "" (no replacement
//      space).
//   8. Strip heading markers "#{1,6} " at line start.
//   9. Strip blockquote markers ">" (one or more, optional trailing space)
//      at line start.
//   10. Strip list markers "-", "*", "+", or "N." at line start.
//   11. Strip any remaining *, _, ~, ` characters.
//   12. Collapse runs of ASCII whitespace (space, tab, CR, LF, FF, VT) to a
//       single space; trim both ends.
//   13. Unicode-normalize the result to NFC.
//
// Only ASCII character classes are used throughout (never \s, \w, or
// String.trim() with no arguments) specifically so Python's `re` and
// JavaScript's RegExp -- which do not agree on the exact set of Unicode
// codepoints those shorthands cover -- can't silently diverge on unicode
// input.

const ASCII_WS = " \t"

const FENCE_START = /^[ \t]{0,3}([`~]{3,})/
const TABLE_DELIM = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/
const FOOTNOTE_DEF = /^\[\^[^\]]+\]:.*$/

const INLINE_CODE = /(`+)(.*?)\1/g
const WIKILINK = /\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g
const MD_LINK = /\[([^[\]]*)\]\([^()]*\)/g
const ANGLE_AUTOLINK = /<https?:\/\/[^>]*>/g
const BARE_URL = /(?:https?:\/\/|www\.)[^ \t\r\n\f\v]*/g
const FOOTNOTE_REF = /\[\^[^\]]+\]/g
const HEADING = /^#{1,6}[ \t]+/gm
const BLOCKQUOTE = /^>+[ \t]?/gm
const LIST_MARKER = /^[ \t]*(?:[-*+]|\d+\.)[ \t]+/gm
const RESIDUAL_MARKUP = /[*_~`]/g
const WHITESPACE_RUN = /[ \t\r\n\f\v]+/g

function trimAscii(s) {
  let start = 0
  let end = s.length
  while (start < end && ASCII_WS.includes(s[start])) start++
  while (end > start && ASCII_WS.includes(s[end - 1])) end--
  return s.slice(start, end)
}

function normalizeLineEndings(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
}

function stripFrontmatter(text) {
  if (!text.startsWith("---")) return text
  const lines = text.split("\n")
  if (trimAscii(lines[0]) !== "---") return text
  for (let i = 1; i < lines.length; i++) {
    if (trimAscii(lines[i]) === "---") {
      return lines.slice(i + 1).join("\n")
    }
  }
  return text // unterminated frontmatter -- leave untouched
}

function stripFencesFootnoteDefsAndTables(text) {
  const lines = text.split("\n")
  const out = []
  let inFence = false
  let fenceChar = ""
  let fenceLen = 0
  let i = 0
  const n = lines.length
  while (i < n) {
    const line = lines[i]
    if (inFence) {
      const stripped = trimAscii(line)
      if (stripped.length > 0 && [...stripped].every((c) => c === fenceChar) && stripped.length >= fenceLen) {
        inFence = false
      }
      i++
      continue
    }

    const m = FENCE_START.exec(line)
    FENCE_START.lastIndex = 0
    if (m) {
      inFence = true
      fenceChar = m[1][0]
      fenceLen = m[1].length
      i++
      continue
    }

    if (FOOTNOTE_DEF.test(line)) {
      i++
      continue
    }

    if (line.includes("|") && i + 1 < n && TABLE_DELIM.test(lines[i + 1])) {
      i += 2
      while (i < n && lines[i].includes("|")) i++
      continue
    }

    out.push(line)
    i++
  }
  return out.join("\n")
}

function resolveWikilink(_match, target, alias) {
  if (alias !== undefined) return trimAscii(alias)
  let t = trimAscii(target)
  for (const sep of ["#", "^"]) {
    const idx = t.indexOf(sep)
    if (idx !== -1) t = t.slice(0, idx)
  }
  return trimAscii(t)
}

/**
 * Pure function: raw note file text (including frontmatter) -> cleaned
 * prose suitable for narration. See module comment for the contract.
 */
export function cleanNoteText(raw) {
  let text = normalizeLineEndings(raw)
  text = stripFrontmatter(text)
  text = stripFencesFootnoteDefsAndTables(text)
  text = text.replace(INLINE_CODE, " ")
  text = text.replace(WIKILINK, resolveWikilink)
  text = text.replace(MD_LINK, (_m, inner) => inner)
  text = text.replace(ANGLE_AUTOLINK, "")
  text = text.replace(BARE_URL, "")
  text = text.replace(FOOTNOTE_REF, "")
  text = text.replace(HEADING, "")
  text = text.replace(BLOCKQUOTE, "")
  text = text.replace(LIST_MARKER, "")
  text = text.replace(RESIDUAL_MARKUP, "")
  text = text.replace(WHITESPACE_RUN, " ")
  text = trimAscii(text)
  text = text.normalize("NFC")
  return text
}

export async function hashCleanText(raw) {
  const { createHash } = await import("node:crypto")
  return createHash("sha256").update(cleanNoteText(raw), "utf8").digest("hex")
}
