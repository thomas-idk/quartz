# ============================================================
#  Quartz Publish Guard
#  Replaces the plain autopush. Runs hourly (hidden) via the
#  QuartzAutoPublish scheduled task.
#
#  What it does every run:
#   1. Pulls the latest from GitHub (phone edits, etc.)
#   2. Counts your published notes (.md files).
#   3. If the count suddenly collapsed (e.g. a folder got
#      deleted on your phone and synced), it AUTO-HEALS:
#      restores the notes from the last known-good version in
#      git history and re-publishes them -> the site never
#      stays empty.
#   4. Otherwise (healthy) it records this as the new
#      known-good point, drops a timestamped .zip backup of
#      your notes, and publishes any new edits as normal.
#
#  Backups + logs live OUTSIDE the repo so they never sync:
#      C:\Users\Me1Io\Desktop\Quartz Backups
# ============================================================

$ErrorActionPreference = 'SilentlyContinue'

$repo       = 'C:\Users\Me1Io\Desktop\quartz'
$content    = Join-Path $repo 'content'          # junction -> Obsidian Vault\Published
$backupRoot = 'C:\Users\Me1Io\Desktop\Quartz Backups'
$log        = Join-Path $backupRoot 'guard.log'
$goodHashF  = Join-Path $backupRoot 'last_good_hash.txt'
$goodCountF = Join-Path $backupRoot 'last_good_count.txt'
$keepZips   = 48                                  # ~2 days of hourly backups

New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

function Log($m) {
    "$(Get-Date -f 'yyyy-MM-dd HH:mm:ss')  $m" | Out-File -Append -FilePath $log -Encoding utf8
}
function Count-Notes {
    return (Get-ChildItem -Path $content -Recurse -Filter *.md -File -ErrorAction SilentlyContinue |
            Measure-Object).Count
}

Set-Location $repo

# 1. Pull latest (phone edits arrive here)
git pull --no-edit 2>&1 | Out-Null

# 2. How many notes are published right now?
$mdNow  = Count-Notes
$mdGood = 0
if (Test-Path $goodCountF) { $mdGood = [int](Get-Content $goodCountF) }

# 3. Mass-deletion check: had a healthy history, now less than half remain
if ($mdGood -ge 5 -and $mdNow -lt [math]::Floor($mdGood / 2)) {
    Log "MASS DELETION DETECTED: notes dropped $mdGood -> $mdNow. Auto-healing."
    $hash = ''
    if (Test-Path $goodHashF) { $hash = (Get-Content $goodHashF).Trim() }
    if ($hash -ne '') {
        # Restore the whole content tree from the last known-good commit
        git checkout $hash -- content 2>&1 | Out-Null
    }
    $mdNow = Count-Notes
    git add -A 2>&1 | Out-Null
    git commit -m "Auto-heal: restored $mdNow notes after accidental mass deletion" --quiet 2>&1 | Out-Null
    git push --quiet 2>&1 | Out-Null
    Log "Auto-heal complete. Notes restored: $mdNow"
    exit
}

# 4. Healthy path: publish any local edits, then record known-good + backup
git add -A 2>&1 | Out-Null
git commit -m "Auto update" --quiet 2>&1 | Out-Null
git push --quiet 2>&1 | Out-Null

if ($mdNow -ge 1) {
    # Record this state as the new known-good restore point
    $head = (git rev-parse HEAD).Trim()
    Set-Content -Path $goodHashF  -Value $head
    Set-Content -Path $goodCountF -Value $mdNow

    # Timestamped .zip backup of the notes (lightweight: .md only)
    $stamp   = Get-Date -f 'yyyyMMdd_HHmm'
    $zip     = Join-Path $backupRoot "notes_$stamp.zip"
    $staging = Join-Path $env:TEMP "quartz_notes_$stamp"
    if (-not (Test-Path $zip)) {
        New-Item -ItemType Directory -Force -Path $staging | Out-Null
        Get-ChildItem -Path $content -Recurse -Filter *.md -File | ForEach-Object {
            $rel  = $_.FullName.Substring($content.Length).TrimStart('\')
            $dest = Join-Path $staging $rel
            New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
            Copy-Item $_.FullName $dest -Force
        }
        Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $zip -Force
        Remove-Item $staging -Recurse -Force
    }
    # Rotate: keep only the newest $keepZips backups
    Get-ChildItem $backupRoot -Filter 'notes_*.zip' |
        Sort-Object LastWriteTime -Descending |
        Select-Object -Skip $keepZips |
        Remove-Item -Force

    Log "Healthy. Notes: $mdNow. Known-good=$head. Backup: notes_$stamp.zip"
} else {
    Log "WARNING: 0 notes found and no prior good state (>=5) to heal from. Nothing backed up."
}
