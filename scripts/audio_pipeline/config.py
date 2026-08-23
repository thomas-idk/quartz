"""Tunables for the note narration pipeline. Edit and re-run; no other code
changes needed for any of these.
"""

# --- Kokoro voice -----------------------------------------------------------
# One-line swap: change this and re-run to try a different voice. No other
# code needs to change.
#
# af_heart is Kokoro's top-rated American-English voice on community quality
# leaderboards (clear, natural pacing for long-form reading, not over-acted).
# Other solid options if this doesn't land for you: "af_bella" (also
# American female, slightly warmer), "am_michael" (American male),
# "bf_emma" (British female).
KOKORO_VOICE = "af_heart"

# --- Scope --------------------------------------------------------------
TARGET_FOLDER = "content/✍️ Writing"  # recursive; new subfolders are picked up automatically
WORD_CAP = 15_000  # runaway guard, not a routing rule (see spec)

# --- Audio encoding -------------------------------------------------------
SAMPLE_RATE_HZ = 24_000  # Kokoro's native output rate
MP3_BITRATE_KBPS = 40  # mono, within the spec's 32-48kbps band
PARAGRAPH_SILENCE_MS = 400  # inserted between chunks so joins don't sound abrupt

# --- ID3 tags ---------------------------------------------------------------
ID3_ARTIST = "the abyss"
ID3_ALBUM = "the abyss — narrated notes"

# --- Git ----------------------------------------------------------------
GIT_REMOTE = "origin"
GIT_BRANCH = "main"
PUSH_MAX_ATTEMPTS = 5
