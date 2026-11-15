# Build the TGM Stocks APK end to end: Web UI, staged source, Gradle.
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File android/build-apk.ps1
param(
    [ValidateSet('debug', 'release')][string]$Variant = 'debug'
)

$ErrorActionPreference = 'Stop'
$androidDir = $PSScriptRoot
$repoRoot = Split-Path -Parent $androidDir
$webDir = Join-Path $repoRoot 'apps\dsa-web'
$sdkRoot = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { '' }

function Fail([string]$message) {
    Write-Host "TGM Stocks build: $message" -ForegroundColor Red
    exit 1
}

if (-not $sdkRoot) {
    Fail 'ANDROID_HOME (or ANDROID_SDK_ROOT) is not set. Point it at your Android SDK.'
}
if (-not (Test-Path (Join-Path $sdkRoot 'platforms\android-36'))) {
    Fail "Android SDK platform android-36 not found under $sdkRoot."
}
if (-not $env:TGMS_BUILD_PYTHON) {
    Fail @'
TGMS_BUILD_PYTHON is not set. Point it at a CPython 3.13 executable, for example:
  $env:TGMS_BUILD_PYTHON = "$env:APPDATA\uv\python\cpython-3.13-windows-x86_64-none\python.exe"
See android/README.md.
'@
}

# The web UI reports its version from DSA_WEB_VERSION. Pin it to the Android
# version so the app shows TGM Stocks' version instead of the upstream tag.
$appGradle = Join-Path $androidDir 'app\build.gradle'
$versionMatch = Select-String -Path $appGradle -Pattern "versionName\s+'([^']+)'"
if ($versionMatch) {
    $env:DSA_WEB_VERSION = $versionMatch.Matches[0].Groups[1].Value
    Write-Host "==> Web UI version: $env:DSA_WEB_VERSION" -ForegroundColor Cyan
}

Write-Host '==> Building the Web UI into static/' -ForegroundColor Cyan
if (-not (Test-Path (Join-Path $webDir 'node_modules'))) {
    Push-Location $webDir
    try {
        npm ci
        if ($LASTEXITCODE -ne 0) { Fail 'npm ci failed.' }
    } finally { Pop-Location }
}
Push-Location $webDir
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { Fail 'npm run build failed.' }
} finally { Pop-Location }

Write-Host '==> Staging source and static assets' -ForegroundColor Cyan
python (Join-Path $androidDir 'stage_repo.py')
if ($LASTEXITCODE -ne 0) { Fail 'stage_repo.py failed.' }

Write-Host "==> Assembling the $Variant APK" -ForegroundColor Cyan
$gradleTask = if ($Variant -eq 'release') { ':app:assembleRelease' } else { ':app:assembleDebug' }
Push-Location $androidDir
try {
    & (Join-Path $androidDir 'gradlew.bat') $gradleTask
    if ($LASTEXITCODE -ne 0) { Fail "gradlew $gradleTask failed." }
} finally { Pop-Location }

$apk = Join-Path $androidDir "app\build\outputs\apk\$Variant\app-$Variant.apk"
if (-not (Test-Path $apk)) { Fail "Expected APK not found at $apk." }
$sizeMiB = [Math]::Round((Get-Item $apk).Length / 1MB, 1)
Write-Host "APK: $apk ($sizeMiB MiB)" -ForegroundColor Green
