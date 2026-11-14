# -*- coding: utf-8 -*-
"""Packaging contract for the built Android APK (spec seam 2).

One test opens the APK as a zip, reads its manifest with ``aapt2``, and fails when
the packaging contract regresses: wrong identity, a debuggable release, a bundled
secret or database file, or dead weight left behind by an incremental build.

The test needs no device. It skips cleanly when the APK or ``aapt2`` is absent, so
the suite still runs on a machine that has never built the app.
"""

from __future__ import annotations

import os
import re
import subprocess
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_APK_PATH = REPO_ROOT / "android" / "app" / "build" / "outputs" / "apk" / "debug" / "app-debug.apk"
APK_PATH_ENV = "TGMS_APK"
AAPT2_ENV = "TGMS_AAPT2"

EXPECTED_PACKAGE_ID = "io.github.alwinsontgm.stocks"
EXPECTED_MIN_SDK = 24
EXPECTED_TARGET_SDK = 36
EXPECTED_ABIS = ("arm64-v8a",)

# The zip central directory plus local headers of a 164 MiB APK measure about
# 200 KiB. 2 MiB leaves room for that and for a future signature block while
# still catching the regression that produced a 290 MiB APK from a 164 MiB
# payload (126 MiB of orphaned data).
MAX_ORPHANED_BYTES = 2 * 1024 * 1024

# Files that must never ship inside the APK: user secrets and local databases.
FORBIDDEN_ENTRY_PATTERNS = (
    re.compile(r"(^|/)\.env($|[._-])", re.IGNORECASE),
    re.compile(r"\.(db|sqlite|sqlite3)$", re.IGNORECASE),
)


@dataclass
class ApkFacts:
    """Everything the contract checks, gathered from one APK."""

    path: Path
    package_id: str | None
    version_name: str | None
    version_code: str | None
    min_sdk: str | None
    target_sdk: str | None
    native_code: tuple[str, ...]
    allow_backup: bool | None
    debuggable: bool | None
    entry_names: tuple[str, ...]
    file_size: int
    entry_compressed_bytes: int


@dataclass
class ContractReport:
    """The outcome of checking an :class:`ApkFacts` against the contract."""

    variant: str
    failures: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.failures

    def fail(self, message: str) -> None:
        self.failures.append(message)


def detect_variant(apk_path: Path) -> str:
    """Decide debug or release from the artifact path, as Gradle lays it out."""
    parts = {part.lower() for part in apk_path.parts}
    if "release" in parts:
        return "release"
    if "debug" in parts:
        return "debug"
    raise ValueError(f"cannot tell debug from release in APK path: {apk_path}")


def check_apk_contract(facts: ApkFacts, variant: str | None = None) -> ContractReport:
    """Check the packaging contract and report every violation, not just the first."""
    variant = variant or detect_variant(facts.path)
    report = ContractReport(variant=variant)

    if facts.package_id != EXPECTED_PACKAGE_ID:
        report.fail(f"package id is {facts.package_id!r}, expected {EXPECTED_PACKAGE_ID!r}")

    for label, value in (("versionName", facts.version_name), ("versionCode", facts.version_code)):
        if not (value and value.strip()) or value.strip() == "0":
            report.fail(f"{label} is missing or empty ({value!r})")

    if facts.min_sdk != str(EXPECTED_MIN_SDK):
        report.fail(f"minSdkVersion is {facts.min_sdk!r}, expected {EXPECTED_MIN_SDK}")

    if facts.target_sdk != str(EXPECTED_TARGET_SDK):
        report.fail(f"targetSdkVersion is {facts.target_sdk!r}, expected {EXPECTED_TARGET_SDK}")

    if tuple(facts.native_code) != EXPECTED_ABIS:
        report.fail(f"native-code is {list(facts.native_code)!r}, expected {list(EXPECTED_ABIS)!r}")

    if facts.allow_backup is not False:
        report.fail(f"allowBackup is {facts.allow_backup!r}, expected False")

    expected_debuggable = variant == "debug"
    if facts.debuggable is not expected_debuggable:
        report.fail(
            f"debuggable is {facts.debuggable!r}, expected {expected_debuggable} for a {variant} artifact"
        )

    for name in facts.entry_names:
        if any(pattern.search(name) for pattern in FORBIDDEN_ENTRY_PATTERNS):
            report.fail(f"forbidden file inside the APK: {name}")

    orphaned = facts.file_size - facts.entry_compressed_bytes
    if orphaned > MAX_ORPHANED_BYTES:
        report.fail(
            f"archive carries {orphaned} bytes not accounted for by its entries "
            f"(file {facts.file_size}, entries {facts.entry_compressed_bytes}, "
            f"limit {MAX_ORPHANED_BYTES})"
        )

    return report


def _find_aapt2() -> Path | None:
    override = os.environ.get(AAPT2_ENV, "").strip()
    candidates: list[Path] = []
    if override:
        candidates.append(Path(override))
    local_app_data = os.environ.get("LOCALAPPDATA", "").strip()
    if local_app_data:
        build_tools = Path(local_app_data) / "Android" / "Sdk" / "build-tools"
        candidates.append(build_tools / "36.0.0" / "aapt2.exe")
        if build_tools.is_dir():
            # Fall back to the newest installed build-tools when 36.0.0 is absent.
            for child in sorted(build_tools.iterdir(), reverse=True):
                candidates.append(child / "aapt2.exe")
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return None


def _run_aapt2(aapt2: Path, *args: str) -> str:
    completed = subprocess.run(
        [str(aapt2), *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=120,
    )
    if completed.returncode != 0:
        raise RuntimeError(f"aapt2 {' '.join(args)} failed: {completed.stderr.strip()}")
    return completed.stdout


def _parse_badging(output: str) -> dict[str, object]:
    facts: dict[str, object] = {
        "package_id": None,
        "version_name": None,
        "version_code": None,
        "min_sdk": None,
        "target_sdk": None,
        "native_code": (),
        "debuggable": None,
    }
    for line in output.splitlines():
        line = line.strip()
        if line.startswith("package:"):
            for key, name in (("name", "package_id"), ("versionName", "version_name"), ("versionCode", "version_code")):
                match = re.search(rf"\b{key}='([^']*)'", line)
                if match:
                    facts[name] = match.group(1)
        elif line.startswith("minSdkVersion:"):
            facts["min_sdk"] = line.split(":", 1)[1].strip().strip("'")
        elif line.startswith("targetSdkVersion:"):
            facts["target_sdk"] = line.split(":", 1)[1].strip().strip("'")
        elif line.startswith("native-code:"):
            facts["native_code"] = tuple(re.findall(r"'([^']*)'", line))
    # aapt2 badging prints "application-debuggable" only when the flag is set,
    # so its absence means false.
    facts["debuggable"] = "application-debuggable" in output.splitlines()
    return facts


def _parse_allow_backup(xmltree_output: str) -> bool | None:
    for line in xmltree_output.splitlines():
        if ":allowBackup(" in line and "=" in line:
            value = line.rsplit("=", 1)[1].strip()
            if value == "true":
                return True
            if value == "false":
                return False
    return None


def read_apk_facts(apk_path: Path, aapt2: Path) -> ApkFacts:
    """Read the manifest and archive layout of one built APK."""
    badging = _parse_badging(_run_aapt2(aapt2, "dump", "badging", str(apk_path)))
    allow_backup = _parse_allow_backup(
        _run_aapt2(aapt2, "dump", "xmltree", "--file", "AndroidManifest.xml", str(apk_path))
    )

    with zipfile.ZipFile(apk_path) as archive:
        entries = archive.infolist()
        entry_names = tuple(info.filename for info in entries)
        entry_compressed_bytes = sum(info.compress_size for info in entries)

    return ApkFacts(
        path=apk_path,
        package_id=badging["package_id"],
        version_name=badging["version_name"],
        version_code=badging["version_code"],
        min_sdk=badging["min_sdk"],
        target_sdk=badging["target_sdk"],
        native_code=badging["native_code"],
        allow_backup=allow_backup,
        debuggable=badging["debuggable"],
        entry_names=entry_names,
        file_size=apk_path.stat().st_size,
        entry_compressed_bytes=entry_compressed_bytes,
    )


def _apk_path() -> Path:
    override = os.environ.get(APK_PATH_ENV, "").strip()
    return Path(override) if override else DEFAULT_APK_PATH


def test_built_apk_satisfies_packaging_contract() -> None:
    apk_path = _apk_path()
    if not apk_path.is_file():
        pytest.skip(f"no built APK at {apk_path}; build it or set {APK_PATH_ENV}")

    aapt2 = _find_aapt2()
    if aapt2 is None:
        pytest.skip(f"aapt2 not found; set {AAPT2_ENV} or install Android build-tools 36.0.0")

    facts = read_apk_facts(apk_path, aapt2)
    report = check_apk_contract(facts)

    assert report.ok, "packaging contract violated:\n  " + "\n  ".join(report.failures)


def _facts(**overrides: object) -> ApkFacts:
    base: dict[str, object] = dict(
        path=Path("android/app/build/outputs/apk/debug/app-debug.apk"),
        package_id=EXPECTED_PACKAGE_ID,
        version_name="1.0.0",
        version_code="1",
        min_sdk="24",
        target_sdk="36",
        native_code=("arm64-v8a",),
        allow_backup=False,
        debuggable=True,
        entry_names=("AndroidManifest.xml", "classes.dex"),
        file_size=1_000_000,
        entry_compressed_bytes=1_000_000 - 4096,
    )
    base.update(overrides)
    return ApkFacts(**base)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "overrides",
    [
        {"package_id": "com.example.probe"},
        {"version_name": ""},
        {"version_code": ""},
        {"min_sdk": "26"},
        {"target_sdk": "35"},
        {"native_code": ("arm64-v8a", "armeabi-v7a")},
        {"allow_backup": True},
        {"allow_backup": None},
        {"debuggable": False},
        {"entry_names": ("AndroidManifest.xml", "assets/python/.env")},
        {"entry_names": ("AndroidManifest.xml", "data/stocks.db")},
        {"file_size": 1_000_000 + MAX_ORPHANED_BYTES + 1},
    ],
)
def test_contract_check_reports_deliberate_violations(overrides: dict[str, object]) -> None:
    report = check_apk_contract(_facts(**overrides))

    assert not report.ok, f"checker accepted a broken APK: {overrides}"
    assert report.failures


def test_contract_check_accepts_a_conforming_apk() -> None:
    assert check_apk_contract(_facts()).ok


def test_contract_check_requires_non_debuggable_release() -> None:
    release_path = Path("android/app/build/outputs/apk/release/app-release.apk")
    report = check_apk_contract(_facts(path=release_path, debuggable=True))
    assert not report.ok
    assert any("debuggable" in failure for failure in report.failures)
