"""Self-contained Python-side test for clean_note_text.

This locks down the exact expected output for each shared fixture so a
future edit to clean_text.py can't silently change behavior. It does not
require Node — for the cross-language agreement proof, see
quartz-plugins/note-audio/cleanText.test.js, which spawns python3 and
diffs its hash against the JS implementation.

Run with:
    python3 -m unittest scripts.audio_pipeline.test_clean_text -v
"""

import json
import re
import unittest
from pathlib import Path

from scripts.audio_pipeline.clean_text import clean_note_text, hash_clean_text

FIXTURES_PATH = Path(__file__).parent / "fixtures" / "clean_text_fixtures.json"

EXPECTED = {
    "frontmatter_and_heading": "Hello World Some text.",
    "wikilink_plain": "See Hinge Propositions for more.",
    "wikilink_with_alias": "See the hinges and a section plus Other Note.",
    "nested_code_blocks": "Here's how to write a fence: And inline too, plus .",
    "footnotes": "This has a footnote. And another. More text after.",
    "table": "Intro paragraph. Outro paragraph.",
    "unicode": (
        "✨ Emoji and unicode: café, naïve, 你好, مرحبا, — an em dash, "
        "‘curly quotes’, and combining: é (e + combining acute)."
    ),
    "links_and_urls": "Check this article or just and or .",
    "lists_and_blockquotes": (
        "[!note] How this is organised Every note lives somewhere. "
        "First item Second item Numbered one Numbered two"
    ),
    "emphasis_and_residual_markup": (
        "This is bold, this is italic, this is also italic, and this is struck text."
    ),
    "mixed_realistic_note": (
        "Hinge Propositions See Wittgenstein's book and this link. A table "
        "[!note] Some callout text. bullet one bullet two Inline here. "
        "éèê unicode too."
    ),
    "crlf_line_endings": "Heading Some text here.",
}


class CleanNoteTextTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixtures = {
            fx["name"]: fx["input"]
            for fx in json.loads(FIXTURES_PATH.read_text(encoding="utf-8"))
        }

    def test_all_fixtures_have_expectations(self):
        self.assertEqual(set(self.fixtures), set(EXPECTED))

    def test_golden_output_per_fixture(self):
        for name, expected in EXPECTED.items():
            with self.subTest(fixture=name):
                self.assertEqual(clean_note_text(self.fixtures[name]), expected)

    def test_hash_is_sha256_hex(self):
        for raw in self.fixtures.values():
            h = hash_clean_text(raw)
            self.assertRegex(h, r"^[0-9a-f]{64}$")

    def test_hash_is_deterministic(self):
        for raw in self.fixtures.values():
            self.assertEqual(hash_clean_text(raw), hash_clean_text(raw))

    def test_no_residual_markdown_syntax(self):
        markdown_tokens = re.compile(r"\[\[|\]\]|```|~~~|`")
        for name, raw in self.fixtures.items():
            with self.subTest(fixture=name):
                cleaned = clean_note_text(raw)
                self.assertNotRegex(cleaned, markdown_tokens)

    def test_table_fixture_has_no_pipes(self):
        cleaned = clean_note_text(self.fixtures["table"])
        self.assertNotIn("|", cleaned)

    def test_footnote_defs_and_markers_removed(self):
        cleaned = clean_note_text(self.fixtures["footnotes"])
        self.assertNotIn("[^", cleaned)
        self.assertNotIn("footnote definition", cleaned)


if __name__ == "__main__":
    unittest.main()
