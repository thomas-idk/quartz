#!/usr/bin/env python3
"""Note narration pipeline.

Walks TARGET_FOLDER recursively, narrates any note whose cleaned-text hash
doesn't match its stored `audio_hash`, and commits+pushes the note and its
MP3 together, one commit per note.

Deliberately does NOT run Kokoro on import — see the guard in main(). This
module is safe to import and unit-test without ever invoking the model.

Usage:
    python3 -m scripts.audio_pipeline.render

Run from the repo root (it locates the repo root itself via git, but the
working directory matters for the lockfile path).
"""

from __future__ import annotations

import fcntl
import logging
import os
import re
import subprocess
import sys
import time
import unicodedata
import uuid
from pathlib import Path
from typing import Optional

import yaml

from scripts.audio_pipeline import config
from scripts.audio_pipeline.clean_text import clean_note_text, hash_clean_text

LOCK_PATH = ".audio-pipeline.lock"
LOG_PATH = ".audio-pipeline.log"
SCRATCH_DIR = ".audio-pipeline-tmp"  # gitignored; never inside content/

log = logging.getLogger("audio_pipeline")


# --------------------------------------------------------------------------
# Setup
# --------------------------------------------------------------------------


def _configure_logging(repo_root: Path) -> None:
    log.setLevel(logging.INFO)
    log.handlers.clear()
    file_handler = logging.FileHandler(repo_root / LOG_PATH, encoding="utf-8")
    file_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    log.addHandler(file_handler)
    # Only warnings and above go to stdout — this runs unattended (cron/systemd);
    # a clean successful run should be silent on the console.
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.WARNING)
    console_handler.setFormatter(logging.Formatter("%(levelname)s %(message)s"))
    log.addHandler(console_handler)


def _cap_cpu_usage() -> None:
    """Best-effort: pin this process (all its threads) to a single core.

    Pi-hole runs on this machine; a Kokoro process spread across every core
    is a bad time for the rest of the house. Affinity to one core caps the
    process regardless of how many threads torch/onnxruntime spawn
    underneath, without needing systemd/cgroups. When this pipeline IS
    installed under systemd, prefer CPUQuota= there too (see
    scripts/audio_pipeline/systemd/) — the two aren't mutually exclusive.
    """
    try:
        if hasattr(os, "sched_setaffinity"):
            available = os.sched_getaffinity(0)
            if available:
                os.sched_setaffinity(0, {min(available)})
    except OSError:
        log.warning("Could not set CPU affinity; continuing without it.")
    try:
        import torch

        torch.set_num_threads(1)
    except ImportError:
        pass


def _repo_root() -> Path:
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        capture_output=True,
        text=True,
        check=True,
    )
    return Path(result.stdout.strip())


# --------------------------------------------------------------------------
# Lockfile
# --------------------------------------------------------------------------


class _Lock:
    def __init__(self, path: Path):
        self.path = path
        self._fh = None

    def __enter__(self) -> bool:
        self._fh = open(self.path, "w")
        try:
            fcntl.flock(self._fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self._fh.close()
            self._fh = None
            return False
        self._fh.write(str(os.getpid()))
        self._fh.flush()
        return True

    def __exit__(self, *exc) -> None:
        if self._fh is not None:
            fcntl.flock(self._fh.fileno(), fcntl.LOCK_UN)
            self._fh.close()


# --------------------------------------------------------------------------
# Frontmatter (reversible — distinct from clean_text's internal, discard-only
# frontmatter stripping, since here we need to rewrite the file afterwards)
# --------------------------------------------------------------------------


def split_frontmatter(raw: str) -> tuple[dict, str]:
    """Returns (frontmatter_dict, body). body is the exact remaining text,
    byte-for-byte, so it can be written back unchanged."""
    if not raw.startswith("---"):
        return {}, raw
    lines = raw.split("\n")
    if lines[0].strip() != "---":
        return {}, raw
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            fm_text = "\n".join(lines[1:i])
            body = "\n".join(lines[i + 1 :])
            data = yaml.safe_load(fm_text) or {}
            if not isinstance(data, dict):
                return {}, raw
            return data, body
    return {}, raw


class _IndentedListDumper(yaml.SafeDumper):
    """PyYAML dumps list items flush with their parent key by default; this
    matches the indented-list style already used throughout the vault so
    re-rendered notes don't show a wall of unrelated indentation diffs."""

    def increase_indent(self, flow: bool = False, indentless: bool = False) -> None:
        return super().increase_indent(flow, False)


def render_note_file(frontmatter: dict, body: str) -> str:
    fm_text = yaml.dump(
        frontmatter,
        Dumper=_IndentedListDumper,
        sort_keys=False,
        allow_unicode=True,
        default_flow_style=False,
    ).rstrip("\n")
    return f"---\n{fm_text}\n---\n{body}"


# --------------------------------------------------------------------------
# Filenames
# --------------------------------------------------------------------------


def ascii_slug(text: str) -> str:
    """ASCII-safe filename slug. Never a copy of the (unicode, spaced) note
    or folder name — only used for the MP3's own basename."""
    normalized = unicodedata.normalize("NFKD", text)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    ascii_only = ascii_only.lower()
    ascii_only = re.sub(r"[^a-z0-9]+", "-", ascii_only).strip("-")
    return ascii_only or "note"


def audio_filename_for(note_path: Path, frontmatter: dict, content_hash: str) -> str:
    title = frontmatter.get("title") or note_path.stem
    return f"{ascii_slug(str(title))}-{content_hash[:8]}.mp3"


# --------------------------------------------------------------------------
# Kokoro rendering (NOT invoked until main() explicitly allows it)
# --------------------------------------------------------------------------

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])[ \t]+")


def chunk_sentences(text: str, max_chars: int = 400) -> list[str]:
    sentences = [s for s in _SENTENCE_SPLIT.split(text) if s]
    if not sentences:
        return [text] if text else []
    chunks: list[str] = []
    current = ""
    for s in sentences:
        if current and len(current) + 1 + len(s) > max_chars:
            chunks.append(current)
            current = s
        else:
            current = f"{current} {s}".strip()
    if current:
        chunks.append(current)
    return chunks


def synthesize_to_wav(cleaned_text: str, wav_path: Path, voice: str) -> None:
    """Chunks at sentence boundaries, synthesizes each chunk with Kokoro, and
    concatenates with a short silence between chunks so joins aren't abrupt.
    """
    from kokoro import KPipeline  # local import: heavy, only touched at render time
    import numpy as np
    import soundfile as sf

    pipeline = KPipeline(lang_code="a")  # American English
    silence = np.zeros(
        int(config.SAMPLE_RATE_HZ * config.PARAGRAPH_SILENCE_MS / 1000), dtype=np.float32
    )

    pieces = []
    for chunk in chunk_sentences(cleaned_text):
        for _graphemes, _phonemes, audio in pipeline(chunk, voice=voice):
            pieces.append(audio)
            pieces.append(silence)

    if not pieces:
        raise RuntimeError("Kokoro produced no audio for this note")

    full = np.concatenate(pieces)
    sf.write(str(wav_path), full, config.SAMPLE_RATE_HZ)


def encode_mp3(wav_path: Path, mp3_path: Path, bitrate_kbps: int) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-i",
            str(wav_path),
            "-ac",
            "1",
            "-b:a",
            f"{bitrate_kbps}k",
            str(mp3_path),
        ],
        check=True,
    )


def tag_mp3(mp3_path: Path, title: str) -> None:
    from mutagen.id3 import ID3, TALB, TIT2, TPE1
    from mutagen.mp3 import MP3

    audio = MP3(str(mp3_path))
    if audio.tags is None:
        audio.add_tags()
    audio.tags.add(TIT2(encoding=3, text=[title]))
    audio.tags.add(TPE1(encoding=3, text=[config.ID3_ARTIST]))
    audio.tags.add(TALB(encoding=3, text=[config.ID3_ALBUM]))
    audio.save()


def render_audio_atomically(cleaned_text: str, title: str, dest_path: Path, scratch_dir: Path) -> None:
    """Render to a temp path, then atomically move into place. Never leaves a
    partial MP3 where the committer can see it.

    The temp files live in `scratch_dir` (a gitignored directory outside
    content/), not next to dest_path. `os.replace` only needs same-filesystem
    to be atomic, not same-directory -- so this still gets atomicity, but a
    process that dies from an uncatchable signal (OOM kill, `kill -9`) instead
    of a normal Python exception leaves its debris somewhere that can never
    be picked up by a `git add -A` on either machine, and is outside
    content/ so Quartz's Assets emitter can never publish it either. A
    `finally` block can't run after SIGKILL, so this is the thing that
    actually has to hold up under that failure mode, not the try/finally.
    """
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    scratch_dir.mkdir(parents=True, exist_ok=True)
    tmp_id = uuid.uuid4().hex
    tmp_wav = scratch_dir / f"{tmp_id}.wav"
    tmp_mp3 = scratch_dir / f"{tmp_id}.mp3"
    try:
        synthesize_to_wav(cleaned_text, tmp_wav, config.KOKORO_VOICE)
        encode_mp3(tmp_wav, tmp_mp3, config.MP3_BITRATE_KBPS)
        tag_mp3(tmp_mp3, title)
        os.replace(tmp_mp3, dest_path)  # atomic (same filesystem, not same dir)
    finally:
        tmp_wav.unlink(missing_ok=True)
        tmp_mp3.unlink(missing_ok=True)


# --------------------------------------------------------------------------
# Git
# --------------------------------------------------------------------------


def _run_git(args: list[str], cwd: Path, check: bool = True) -> subprocess.CompletedProcess:
    result = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True)
    if check and result.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed:\n{result.stderr}")
    return result


def git_pull_rebase(repo_root: Path) -> None:
    result = _run_git(
        ["pull", "--rebase", "--autostash", config.GIT_REMOTE, config.GIT_BRANCH],
        repo_root,
        check=False,
    )
    if result.returncode != 0:
        rebase_in_progress = (repo_root / ".git" / "rebase-merge").exists() or (
            repo_root / ".git" / "rebase-apply"
        ).exists()
        if rebase_in_progress:
            log.error("git pull --rebase conflicted; aborting rebase, leaving repo untouched.")
            _run_git(["rebase", "--abort"], repo_root, check=False)
        raise RuntimeError(f"git pull --rebase failed:\n{result.stderr}")


def git_commit_note_and_audio(
    repo_root: Path, note_path: Path, mp3_path: Path, old_mp3_path: Optional[Path], message: str
) -> None:
    paths = [note_path, mp3_path]
    if old_mp3_path is not None and old_mp3_path != mp3_path:
        paths.append(old_mp3_path)  # already deleted from disk; `git add` stages the removal
    _run_git(["add", "--", *[str(p) for p in paths]], repo_root)
    _run_git(["commit", "-m", message], repo_root)


def git_push_with_retry(repo_root: Path) -> None:
    for attempt in range(1, config.PUSH_MAX_ATTEMPTS + 1):
        result = _run_git(["push", config.GIT_REMOTE, config.GIT_BRANCH], repo_root, check=False)
        if result.returncode == 0:
            return
        log.warning("push attempt %d/%d rejected:\n%s", attempt, config.PUSH_MAX_ATTEMPTS, result.stderr)
        if attempt == config.PUSH_MAX_ATTEMPTS:
            raise RuntimeError(f"git push failed after {attempt} attempts:\n{result.stderr}")
        git_pull_rebase(repo_root)  # never force-push; re-pull and retry instead
        time.sleep(min(2**attempt, 30))


# --------------------------------------------------------------------------
# Per-note processing
# --------------------------------------------------------------------------


def find_notes(target_dir: Path) -> list[Path]:
    return sorted(p for p in target_dir.rglob("*.md") if p.is_file())


def process_note(note_path: Path, repo_root: Path) -> bool:
    """Returns True if a commit was made for this note."""
    raw = note_path.read_text(encoding="utf-8")
    frontmatter, body = split_frontmatter(raw)

    if frontmatter.get("noaudio"):
        return False

    cleaned = clean_note_text(raw)
    if not cleaned:
        return False  # nothing to narrate (e.g. an empty stub or index page)

    word_count = len(cleaned.split())
    if word_count > config.WORD_CAP:
        log.warning("Skipping %s: %d words exceeds cap of %d", note_path, word_count, config.WORD_CAP)
        return False

    new_hash = hash_clean_text(raw)
    if frontmatter.get("audio_hash") == new_hash:
        return False  # up to date, nothing to do

    title = str(frontmatter.get("title") or note_path.stem)
    new_filename = audio_filename_for(note_path, frontmatter, new_hash)
    new_mp3_path = note_path.parent / new_filename

    old_audio_rel = frontmatter.get("audio")
    old_mp3_path: Optional[Path] = None
    if isinstance(old_audio_rel, str):
        # old_audio_rel is relative to the content root, not note_path.parent.
        content_root = (repo_root / "content").resolve()
        candidate = (content_root / old_audio_rel).resolve()
        if candidate.exists() and candidate != new_mp3_path.resolve():
            old_mp3_path = candidate

    render_audio_atomically(cleaned, title, new_mp3_path, repo_root / SCRATCH_DIR)

    if old_mp3_path is not None:
        old_mp3_path.unlink(missing_ok=True)

    content_root = (repo_root / "content").resolve()
    audio_rel = new_mp3_path.resolve().relative_to(content_root).as_posix()

    frontmatter["audio"] = audio_rel
    frontmatter["audio_hash"] = new_hash
    note_path.write_text(render_note_file(frontmatter, body), encoding="utf-8")

    git_commit_note_and_audio(
        repo_root,
        note_path,
        new_mp3_path,
        old_mp3_path,
        message=f"Narrate: {title}",
    )
    git_push_with_retry(repo_root)
    log.info("Rendered and pushed audio for %s", note_path)
    return True


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------


def main() -> int:
    repo_root = _repo_root()
    _configure_logging(repo_root)
    _cap_cpu_usage()

    lock = _Lock(repo_root / LOCK_PATH)
    with lock as acquired:
        if not acquired:
            # Overlapping runs are the main failure mode here — exit quietly,
            # this is expected under a cron/timer schedule.
            return 0

        # Clear debris from a previous run that died mid-render (OOM kill,
        # power loss -- anything that skipped render_audio_atomically's
        # `finally`). Safe: the lock guarantees nothing else can be using
        # this directory right now.
        scratch_dir = repo_root / SCRATCH_DIR
        if scratch_dir.is_dir():
            for stale in scratch_dir.iterdir():
                stale.unlink(missing_ok=True)

        try:
            git_pull_rebase(repo_root)
        except RuntimeError as e:
            log.error("Aborting run: %s", e)
            return 1

        target_dir = repo_root / config.TARGET_FOLDER
        if not target_dir.is_dir():
            log.error("Target folder does not exist: %s", target_dir)
            return 1

        rendered = 0
        for note_path in find_notes(target_dir):
            try:
                if process_note(note_path, repo_root):
                    rendered += 1
            except Exception:
                log.exception("Failed processing %s", note_path)
                # Keep going — one bad note shouldn't block the rest of the folder.
        log.info("Run complete. Rendered %d note(s).", rendered)
    return 0


if __name__ == "__main__":
    sys.exit(main())
