"""Shared text-cleaning contract for note narration.

This function's output is hashed (sha256 of its UTF-8 bytes) and that hash is
compared against a mirror implementation in
`quartz-plugins/note-audio/cleanText.js`. The two MUST produce byte-identical
output for the same input, or the staleness check silently disagrees and the
sidebar player never appears. Any change here must be mirrored there,
in the same order, and re-verified with:

    python3 -m unittest scripts.audio_pipeline.test_clean_text
    npx tsx --test quartz-plugins/note-audio/cleanText.test.js

CONTRACT (authoritative — mirrored verbatim as a comment in cleanText.js):

  0. Normalize line endings: CRLF and lone CR both become LF.
  1. Strip a single leading YAML frontmatter block delimited by '---' lines.
  2. Single pass over lines:
       - drop fenced code blocks (``` or ~~~, opening fence 3+ of the same
         character, closing fence made of only that character with
         length >= opening length)
       - drop footnote *definition* lines matching ^\\[\\^id\\]:...
       - drop GFM-style table blocks: a line containing '|' immediately
         followed by a delimiter row (only '-', ':', '|', spaces/tabs);
         the table then extends through subsequent lines that still
         contain '|'
  3. Remove inline code spans: a run of N backticks, closed by the same
     length run of backticks -> replaced with a single space.
  4. Resolve wikilinks [[target]] / [[target|alias]] -> alias if present,
     else target with any '#'/'^' anchor suffix removed, trimmed.
  5. Resolve markdown links [text](url) -> text.
  6. Remove autolinks/bare URLs: <http...> angle-bracket form, and bare
     http://, https://, or www. tokens up to the next ASCII whitespace char.
  7. Remove inline footnote reference markers [^id] -> "" (no replacement
     space).
  8. Strip heading markers "#{1,6} " at line start.
  9. Strip blockquote markers ">" (one or more, optional trailing space)
     at line start.
  10. Strip list markers "-", "*", "+", or "N." at line start.
  11. Strip any remaining *, _, ~, ` characters.
  12. Collapse runs of ASCII whitespace (space, tab, CR, LF, FF, VT) to a
      single space; trim both ends.
  13. Unicode-normalize the result to NFC.

Only ASCII character classes are used throughout (never \\s, \\w, or
str.strip()/trim() with no arguments) specifically so Python's `re` and
JavaScript's RegExp -- which do not agree on the exact set of Unicode
codepoints those shorthands cover -- can't silently diverge on unicode
input.
"""

from __future__ import annotations

import hashlib
import re
import unicodedata

_ASCII_WS = " \t"
_ASCII_WS_CLASS = " \t\r\n\f\v"

_FENCE_START = re.compile(r"^[ \t]{0,3}([`~]{3,})")
_TABLE_DELIM = re.compile(r"^[ \t]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$")
_FOOTNOTE_DEF = re.compile(r"^\[\^[^\]]+\]:.*$")

_INLINE_CODE = re.compile(r"(`+)(.*?)\1")
_WIKILINK = re.compile(r"\[\[([^\[\]|]+)(?:\|([^\[\]]+))?\]\]")
_MD_LINK = re.compile(r"\[([^\[\]]*)\]\([^()]*\)")
_ANGLE_AUTOLINK = re.compile(r"<https?://[^>]*>")
_BARE_URL = re.compile(r"(?:https?://|www\.)[^ \t\r\n\f\v]*")
_FOOTNOTE_REF = re.compile(r"\[\^[^\]]+\]")
_HEADING = re.compile(r"^#{1,6}[ \t]+", re.MULTILINE)
_BLOCKQUOTE = re.compile(r"^>+[ \t]?", re.MULTILINE)
_LIST_MARKER = re.compile(r"^[ \t]*(?:[-*+]|\d+\.)[ \t]+", re.MULTILINE)
_RESIDUAL_MARKUP = re.compile(r"[*_~`]")
_WHITESPACE_RUN = re.compile(r"[ \t\r\n\f\v]+")


def _trim_ascii(s: str) -> str:
    return s.strip(_ASCII_WS)


def _normalize_line_endings(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n")


def _strip_frontmatter(text: str) -> str:
    if not text.startswith("---"):
        return text
    lines = text.split("\n")
    if _trim_ascii(lines[0]) != "---":
        return text
    for i in range(1, len(lines)):
        if _trim_ascii(lines[i]) == "---":
            return "\n".join(lines[i + 1 :])
    return text  # unterminated frontmatter -- leave untouched


def _strip_fences_footnote_defs_and_tables(text: str) -> str:
    lines = text.split("\n")
    out: list[str] = []
    in_fence = False
    fence_char = ""
    fence_len = 0
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        if in_fence:
            stripped = _trim_ascii(line)
            if stripped and set(stripped) == {fence_char} and len(stripped) >= fence_len:
                in_fence = False
            i += 1
            continue

        m = _FENCE_START.match(line)
        if m:
            in_fence = True
            fence_char = m.group(1)[0]
            fence_len = len(m.group(1))
            i += 1
            continue

        if _FOOTNOTE_DEF.match(line):
            i += 1
            continue

        if "|" in line and i + 1 < n and _TABLE_DELIM.match(lines[i + 1]):
            i += 2
            while i < n and "|" in lines[i]:
                i += 1
            continue

        out.append(line)
        i += 1
    return "\n".join(out)


def _resolve_wikilink(m: "re.Match[str]") -> str:
    target, alias = m.group(1), m.group(2)
    if alias is not None:
        return _trim_ascii(alias)
    target = _trim_ascii(target)
    for sep in ("#", "^"):
        idx = target.find(sep)
        if idx != -1:
            target = target[:idx]
    return _trim_ascii(target)


def clean_note_text(raw: str) -> str:
    """Pure function: raw note file text (including frontmatter) -> cleaned
    prose suitable for narration. See module docstring for the contract."""
    text = _normalize_line_endings(raw)
    text = _strip_frontmatter(text)
    text = _strip_fences_footnote_defs_and_tables(text)
    text = _INLINE_CODE.sub(" ", text)
    text = _WIKILINK.sub(_resolve_wikilink, text)
    text = _MD_LINK.sub(lambda m: m.group(1), text)
    text = _ANGLE_AUTOLINK.sub("", text)
    text = _BARE_URL.sub("", text)
    text = _FOOTNOTE_REF.sub("", text)
    text = _HEADING.sub("", text)
    text = _BLOCKQUOTE.sub("", text)
    text = _LIST_MARKER.sub("", text)
    text = _RESIDUAL_MARKUP.sub("", text)
    text = _WHITESPACE_RUN.sub(" ", text)
    text = _trim_ascii(text)
    text = unicodedata.normalize("NFC", text)
    return text


def hash_clean_text(raw: str) -> str:
    return hashlib.sha256(clean_note_text(raw).encode("utf-8")).hexdigest()


def _main() -> None:
    import sys

    raw = sys.stdin.buffer.read().decode("utf-8")
    print(hash_clean_text(raw))


if __name__ == "__main__":
    _main()
