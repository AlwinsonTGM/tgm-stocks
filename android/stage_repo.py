"""Stage the repository source and built Web UI into the Android app assets.

The Android app unpacks ``app/src/main/assets/repo.zip`` into app-private
storage on first launch and runs the on-device backend from there. This script
builds that archive from the working tree at the repository root.

Only source and static assets are copied. Secrets, databases, logs and caches
are never included, and the script fails if any of them would be.

Run from anywhere; paths are resolved relative to this file:

    python android/stage_repo.py
"""

from __future__ import annotations

import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ANDROID_DIR = Path(__file__).resolve().parent
REPO_ROOT = ANDROID_DIR.parent
TARGET = ANDROID_DIR / "app" / "src" / "main" / "assets" / "repo.zip"

# Directories copied from the repository root, recursively.
ROOT_DIRECTORIES = ("api", "src", "data_provider", "bot", "strategies", "templates", "static")
# Individual files copied from the repository root.
ROOT_FILES = ("main.py", "server.py", ".env.example")
# The Web UI is built into static/ by `npm run build`; without it the app has no UI.
REQUIRED_FILES = ("static/index.html", "api/app.py")
# Suffixes kept from the copied directories. Anything else (databases, logs,
# secrets, bytecode) is skipped rather than shipped.
ALLOWED_SUFFIXES = {
    ".py",
    ".json",
    ".yaml",
    ".yml",
    ".html",
    ".md",
    ".jinja",
    ".jinja2",
    ".txt",
    ".css",
    ".js",
    ".svg",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".ico",
    ".woff",
    ".woff2",
}
# Names that must never appear in the archive, wherever they are found.
FORBIDDEN_NAMES = {".env", ".env.local", ".env.production"}
FORBIDDEN_SUFFIXES = {".db", ".sqlite", ".sqlite3", ".log", ".pyc", ".pem", ".key", ".p12"}


def iter_source_files():
    for directory in ROOT_DIRECTORIES:
        base = REPO_ROOT / directory
        if not base.is_dir():
            continue
        for path in sorted(base.rglob("*")):
            if not path.is_file() or path.is_symlink():
                continue
            if "__pycache__" in path.parts or "node_modules" in path.parts:
                continue
            if path.suffix.lower() not in ALLOWED_SUFFIXES:
                continue
            yield path, path.relative_to(REPO_ROOT).as_posix()
    for filename in ROOT_FILES:
        path = REPO_ROOT / filename
        if path.is_file():
            yield path, filename


def check_name(relative: str) -> None:
    name = relative.rsplit("/", 1)[-1]
    if name in FORBIDDEN_NAMES or (name.startswith(".env.") and not name.endswith(".example")):
        raise SystemExit(f"Refusing to stage secret file: {relative}")
    suffix = Path(relative).suffix.lower()
    if suffix in FORBIDDEN_SUFFIXES or "/logs/" in relative or relative.startswith("logs/"):
        raise SystemExit(f"Refusing to stage generated file: {relative}")


def main() -> int:
    if not (REPO_ROOT / "static" / "index.html").is_file():
        print(
            "static/index.html is missing: build the Web UI first "
            "(cd apps/dsa-web && npm ci && npm run build).",
            file=sys.stderr,
        )
        return 1

    staged = []
    for path, relative in iter_source_files():
        check_name(relative)
        staged.append((path, relative))

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(TARGET, "w", compression=ZIP_DEFLATED) as archive:
        for path, relative in staged:
            archive.write(path, relative)

    with ZipFile(TARGET) as archive:
        names = set(archive.namelist())
    missing = [name for name in REQUIRED_FILES if name not in names]
    if missing:
        raise SystemExit(f"Staged archive is missing required files: {missing}")
    leaked = sorted(
        name
        for name in names
        if Path(name).suffix.lower() in FORBIDDEN_SUFFIXES
        or name.rsplit("/", 1)[-1] in FORBIDDEN_NAMES
    )
    if leaked:
        raise SystemExit(f"Staged archive contains forbidden files: {leaked[:5]}")

    print(f"Staged {len(names)} source/static files into {TARGET}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
