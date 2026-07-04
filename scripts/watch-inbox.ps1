param(
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),
  [int]$PollSeconds = 5
)

$inboxPath = Join-Path $RepoRoot "inbox"
$manifestPath = Join-Path $inboxPath "manifest.json"

if (-not (Test-Path $manifestPath)) {
  Write-Host "manifest.json not found at $manifestPath — aborting."
  exit 1
}

Write-Host "Watching $inboxPath every $PollSeconds sec for new card files. Press Ctrl+C to stop."

while ($true) {
  try {
    # retry any commit that was made locally but failed to push last cycle
    Push-Location $RepoRoot
    try {
      $ahead = git rev-list --count '@{u}..HEAD' 2>$null
      if ($ahead -and [int]$ahead -gt 0) {
        git push 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
          Write-Host "$(Get-Date -Format 'HH:mm:ss') Retried push succeeded ($ahead commit(s))."
        }
      }
    } finally {
      Pop-Location
    }

    $manifest = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $known = @($manifest.files)

    $jsonFiles = Get-ChildItem -Path $inboxPath -Filter "*.json" -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -ne "manifest.json" }
    $candidates = $jsonFiles | Where-Object { $known -notcontains $_.Name }

    $readyNames = @()
    foreach ($f in $candidates) {
      try {
        $parsed = Get-Content $f.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
        if (-not $parsed.cards) {
          Write-Host "Skipping $($f.Name): no 'cards' array."
          continue
        }
        $readyNames += $f.Name
      } catch {
        Write-Host "Skipping $($f.Name) for now: not valid JSON yet (may still be writing)."
      }
    }

    if ($readyNames.Count -gt 0) {
      $manifest.files = @($known) + $readyNames
      ($manifest | ConvertTo-Json -Depth 10) | Set-Content -Path $manifestPath -Encoding utf8

      Push-Location $RepoRoot
      try {
        git add inbox | Out-Null
        $msg = "Add inbox batch: " + ($readyNames -join ", ")
        git commit -m $msg | Out-Null

        git push 2>&1 | Out-Null
        $pushed = ($LASTEXITCODE -eq 0)
        if (-not $pushed) {
          Write-Host "Push failed, retrying after pull --rebase..."
          git pull --rebase origin main 2>&1 | Out-Null
          git push 2>&1 | Out-Null
          $pushed = ($LASTEXITCODE -eq 0)
        }

        if ($pushed) {
          Write-Host "$(Get-Date -Format 'HH:mm:ss') Published: $($readyNames -join ', ')"
        } else {
          Write-Host "$(Get-Date -Format 'HH:mm:ss') Committed locally but PUSH FAILED for: $($readyNames -join ', ') — will retry pushing next cycle."
        }
      } finally {
        Pop-Location
      }
    }
  } catch {
    Write-Host "Watcher error: $($_.Exception.Message)"
  }

  Start-Sleep -Seconds $PollSeconds
}
