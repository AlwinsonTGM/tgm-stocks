#!/usr/bin/env bash
# Build the TGM Stocks APK end to end: Web UI, staged source, Gradle.
# Run from anywhere:  bash android/build-apk.sh [debug|release]
set -euo pipefail

variant="${1:-debug}"
case "$variant" in
  debug | release) ;;
  *)
    echo "usage: $0 [debug|release]" >&2
    exit 2
    ;;
esac

android_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(dirname "$android_dir")"
web_dir="$repo_root/apps/dsa-web"

fail() {
  echo "TGM Stocks build: $*" >&2
  exit 1
}

sdk_root="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
[ -n "$sdk_root" ] || fail "ANDROID_HOME (or ANDROID_SDK_ROOT) is not set. Point it at your Android SDK."
[ -d "$sdk_root/platforms/android-36" ] || fail "Android SDK platform android-36 not found under $sdk_root."
[ -n "${TGMS_BUILD_PYTHON:-}" ] || fail "TGMS_BUILD_PYTHON is not set. Point it at a CPython 3.13 executable; see android/README.md."

echo "==> Building the Web UI into static/"
if [ ! -d "$web_dir/node_modules" ]; then
  (cd "$web_dir" && npm ci) || fail "npm ci failed."
fi
(cd "$web_dir" && npm run build) || fail "npm run build failed."

echo "==> Staging source and static assets"
python "$android_dir/stage_repo.py" || fail "stage_repo.py failed."

echo "==> Assembling the $variant APK"
(cd "$android_dir" && ./gradlew ":app:assemble${variant^}") || fail "gradlew assemble${variant^} failed."

apk="$android_dir/app/build/outputs/apk/$variant/app-$variant.apk"
[ -f "$apk" ] || fail "Expected APK not found at $apk."
echo "APK: $apk ($(du -h "$apk" | cut -f1))"
