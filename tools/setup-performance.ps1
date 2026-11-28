<#
  Opportunity Hub - one-time performance setup for a development machine.
  Run it on every new machine / after copying the project (safe to re-run):

      powershell -ExecutionPolicy Bypass -File tools\setup-performance.ps1
      powershell -ExecutionPolicy Bypass -File tools\setup-performance.ps1 -PhpIni D:\xampp\php\php.ini

  What it does (edits keep applying immediately - nothing is "frozen"):
    1. PHP: enables OPcache in the php.ini that PHP / Apache uses (XAMPP: one php.ini
       for both). Without OPcache PHP recompiles all Laravel + vendor files on every
       request: ~300 ms per API call instead of ~40 ms. validate_timestamps stays on,
       so edited PHP files are picked up within 1 second. A backup is kept as
       php.ini.bak-opcache.
    2. Laravel: optimized Composer autoloader; clears config / route / event caches.
       (A cached config ignores .env edits and a cached route list ignores route
       edits, so in development they must NOT be cached.)
    3. Prints a reminder to restart Apache (XAMPP Control Panel -> Apache -> Stop / Start).

  Optional, needs an Administrator PowerShell:
      -DefenderExclusions   exclude the project folder from Windows Defender real-time
                            scanning (much faster `npm install`, `next dev` compiles and
                            PHP file reads). Only use on a machine you trust.
#>
param(
    [string]$PhpIni = "",
    [switch]$DefenderExclusions
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root "backend"

function Write-Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }

# ---------------------------------------------------------------- 1. OPcache
Write-Step "PHP OPcache"
if (-not $PhpIni) {
    $php = Get-Command php -ErrorAction SilentlyContinue
    if (-not $php) { throw "php is not on PATH. Pass -PhpIni <path to php.ini>." }
    $iniLine = (& php --ini) | Where-Object { $_ -match "Loaded Configuration File" }
    $PhpIni = ($iniLine -replace ".*:\s*", "").Trim()
    if ($PhpIni -match "^\\") { $PhpIni = (Split-Path -Qualifier $php.Source) + $PhpIni } # "\xampp\php\php.ini"
}
if (-not (Test-Path $PhpIni)) { throw "php.ini not found: $PhpIni" }
Write-Host "php.ini: $PhpIni"

$backup = "$PhpIni.bak-opcache"
if (-not (Test-Path $backup)) { Copy-Item $PhpIni $backup; Write-Host "Backup:  $backup" }

$settings = [ordered]@{
    "opcache.enable"                  = "1"
    "opcache.enable_cli"              = "0"
    "opcache.memory_consumption"      = "256"
    "opcache.interned_strings_buffer" = "16"
    "opcache.max_accelerated_files"   = "20000"
    "opcache.validate_timestamps"     = "1"   # keep: edits apply without restarting Apache
    "opcache.revalidate_freq"         = "1"
    "opcache.save_comments"           = "1"   # Laravel / packages read docblocks
}

$lines = [System.Collections.Generic.List[string]]([System.IO.File]::ReadAllLines($PhpIni))
# zend_extension=opcache (uncomment, or add)
$ext = $lines.FindIndex({ param($l) $l -match '^\s*;?\s*zend_extension\s*=\s*"?(php_)?opcache(\.dll|\.so)?"?\s*$' })
if ($ext -ge 0) { $lines[$ext] = "zend_extension=opcache" } else { $lines.Add("zend_extension=opcache") }
# Remove active lines for our keys, then write them right after [opcache].
foreach ($k in $settings.Keys) {
    $re = '^\s*' + [regex]::Escape($k) + '\s*='
    for ($i = $lines.Count - 1; $i -ge 0; $i--) { if ($lines[$i] -match $re) { $lines.RemoveAt($i) } }
}
for ($i = $lines.Count - 1; $i -ge 0; $i--) { if ($lines[$i] -match '^; Opportunity Hub performance') { $lines.RemoveAt($i) } }
$sec = $lines.FindIndex({ param($l) $l -match '^\s*\[opcache\]\s*$' })
if ($sec -lt 0) { $lines.Add(""); $lines.Add("[opcache]"); $sec = $lines.Count - 1 }
$block = @("; Opportunity Hub performance (tools/setup-performance.ps1). Backup: php.ini.bak-opcache") + ($settings.Keys | ForEach-Object { "$_=$($settings[$_])" })
$lines.InsertRange($sec + 1, [string[]]$block)
[System.IO.File]::WriteAllLines($PhpIni, $lines, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "OPcache enabled (timestamps validated every 1 s, so code edits still apply)." -ForegroundColor Green

# ---------------------------------------------------------------- 2. Laravel
Write-Step "Laravel backend"
Push-Location $backend
try {
    if (Get-Command composer -ErrorAction SilentlyContinue) {
        & composer dump-autoload -o --no-interaction
    } else {
        Write-Host "composer not on PATH - skipped the optimized autoloader." -ForegroundColor Yellow
    }
    # Development: never serve cached config / routes / events (edits must apply).
    & php artisan config:clear
    & php artisan route:clear
    & php artisan event:clear
} finally { Pop-Location }

# ---------------------------------------------------------------- 3. Defender (optional)
if ($DefenderExclusions) {
    Write-Step "Windows Defender exclusions"
    $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $admin) {
        Write-Host "Not an Administrator PowerShell - skipped. Re-run as Administrator with -DefenderExclusions." -ForegroundColor Yellow
    } else {
        Add-MpPreference -ExclusionPath $root
        Write-Host "Excluded from real-time scanning: $root" -ForegroundColor Green
    }
}

Write-Step "Done"
Write-Host "Restart Apache now (XAMPP Control Panel -> Apache -> Stop, then Start) to load OPcache."
Write-Host "Frontend: 'npm run dev' in frontend\ (pre-compiles the public pages after start)."
