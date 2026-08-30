#!/usr/bin/env python3
"""One-time, fail-closed configuration helper for synology-nas-access."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from typing import Any, Dict, Optional, Sequence

import nasctl


FINGERPRINT_RE = re.compile(r"^SHA256:[A-Za-z0-9+/]+={0,2}$")


def emit(payload: Dict[str, Any]) -> None:
    json.dump(payload, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


def _write_new(path: Path, content: str, mode: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(content)
    except Exception:
        try:
            path.unlink()
        except OSError:
            pass
        raise


def cmd_init(args: argparse.Namespace) -> Dict[str, Any]:
    path = nasctl.config_path()
    if path.exists():
        raise nasctl.NasError(f"Configuration already exists: {path}", "already_exists")
    cfg = dict(nasctl.DEFAULTS)
    cfg.update({"host": args.host, "port": args.port, "remote_root": args.remote_root})
    _write_new(path, json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", 0o600)
    if os.name != "nt":
        path.chmod(0o600)
    return {"ok": True, "config_path": str(path), "next": "Run configure.py keygen"}


def _raw_config() -> Dict[str, Any]:
    path = nasctl.config_path()
    if not path.is_file():
        raise nasctl.NasError("Configuration is missing; run configure.py init", "configuration_missing")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise nasctl.NasError(f"Cannot read configuration: {exc}", "invalid_config") from exc
    if not isinstance(data, dict):
        raise nasctl.NasError("Configuration root must be an object", "invalid_config")
    return data


def _identity_path() -> Path:
    cfg = _raw_config()
    return Path(str(cfg.get("identity_file", nasctl.DEFAULTS["identity_file"]))).expanduser()


def _binary(name: str) -> str:
    fixed = Path("/usr/bin") / name
    if fixed.is_file() and os.access(fixed, os.X_OK):
        return str(fixed)
    found = shutil.which(name)
    if found:
        return str(Path(found).resolve())
    raise nasctl.NasError(f"Required OpenSSH tool is missing: {name}", "dependency_missing")


def cmd_keygen(_args: argparse.Namespace) -> Dict[str, Any]:
    identity = _identity_path()
    public = Path(str(identity) + ".pub")
    if identity.exists() or public.exists():
        raise nasctl.NasError(f"Key already exists: {identity}", "already_exists")
    identity.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.run(
        [_binary("ssh-keygen"), "-q", "-t", "ed25519", "-N", "", "-C", "synology-nas-read", "-f", str(identity)],
        text=True,
        capture_output=True,
        timeout=30,
        check=False,
    )
    if proc.returncode != 0:
        raise nasctl.NasError(proc.stderr.strip() or "ssh-keygen failed", "keygen_failed")
    if os.name != "nt":
        identity.chmod(0o600)
        public.chmod(0o644)
    fingerprint = _fingerprint(public)
    return {
        "ok": True,
        "private_key": str(identity),
        "public_key": str(public),
        "fingerprint": fingerprint,
        "note": "The private key stays on this computer; deploy only the restricted public key.",
    }


def _public_line() -> str:
    public = Path(str(_identity_path()) + ".pub")
    if not public.is_file():
        raise nasctl.NasError("Public key is missing; run configure.py keygen", "identity_missing")
    line = public.read_text(encoding="utf-8").strip()
    if not line.startswith("ssh-ed25519 ") or "\n" in line or "\r" in line:
        raise nasctl.NasError("Unexpected public-key format", "invalid_public_key")
    return "restrict " + line + "\n"


def cmd_export_public_key(args: argparse.Namespace) -> Dict[str, Any]:
    destination = Path(args.dest).expanduser().resolve(strict=False)
    if destination.exists():
        raise nasctl.NasError(f"Destination already exists: {destination}", "already_exists")
    if not destination.parent.is_dir():
        raise nasctl.NasError(f"Destination directory does not exist: {destination.parent}", "destination_missing")
    _write_new(destination, _public_line(), 0o644)
    return {"ok": True, "public_key_file": str(destination), "safe_to_copy_to_nas": True}


def _fingerprint(key_file: Path) -> str:
    proc = subprocess.run(
        [_binary("ssh-keygen"), "-lf", str(key_file), "-E", "sha256"],
        text=True,
        capture_output=True,
        timeout=15,
        check=False,
    )
    if proc.returncode != 0:
        raise nasctl.NasError(proc.stderr.strip() or "Cannot fingerprint key", "fingerprint_failed")
    for token in proc.stdout.split():
        if token.startswith("SHA256:"):
            return token
    raise nasctl.NasError("ssh-keygen returned no SHA256 fingerprint", "fingerprint_failed")


def cmd_pin_host(args: argparse.Namespace) -> Dict[str, Any]:
    if not FINGERPRINT_RE.fullmatch(args.expected_fingerprint):
        raise nasctl.NasError("Expected fingerprint must use SHA256:... format", "invalid_fingerprint")
    cfg = _raw_config()
    host = str(cfg.get("host", nasctl.DEFAULT_HOST))
    port = int(cfg.get("port", nasctl.DEFAULT_PORT))
    if port < 1024 or port == 22 or not nasctl._is_tailscale_host(host):
        raise nasctl.NasError("Refusing to scan a non-gateway endpoint", "invalid_config")
    known_hosts = Path(str(cfg.get("known_hosts_file", nasctl.DEFAULTS["known_hosts_file"]))).expanduser()
    if known_hosts.exists():
        raise nasctl.NasError(
            f"Pinned host-key file already exists: {known_hosts}. A key change requires manual out-of-band review.",
            "already_exists",
        )
    proc = subprocess.run(
        [_binary("ssh-keyscan"), "-T", "10", "-t", "ed25519", "-p", str(port), host],
        text=True,
        capture_output=True,
        timeout=15,
        check=False,
    )
    lines = [line for line in proc.stdout.splitlines() if line and not line.startswith("#")]
    if proc.returncode != 0 or len(lines) != 1:
        raise nasctl.NasError("Could not obtain exactly one ED25519 host key", "host_scan_failed")
    with tempfile.TemporaryDirectory(prefix="nas-hostkey-") as temp_dir:
        temp_key = Path(temp_dir) / "host.key"
        temp_key.write_text(lines[0] + "\n", encoding="utf-8")
        actual = _fingerprint(temp_key)
    if actual != args.expected_fingerprint:
        raise nasctl.NasError(
            "Host-key fingerprint does not match the fingerprint verified on the NAS",
            "host_key_mismatch",
            {"expected": args.expected_fingerprint, "actual": actual},
        )
    _write_new(known_hosts, lines[0] + "\n", 0o600)
    if os.name != "nt":
        known_hosts.chmod(0o600)
    return {"ok": True, "known_hosts_file": str(known_hosts), "fingerprint": actual, "pinned": True}


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description="Configure the read-only Synology NAS Agent Skill")
    sub = root.add_subparsers(dest="command", required=True)
    init = sub.add_parser("init")
    init.add_argument("--host", default=nasctl.DEFAULT_HOST)
    init.add_argument("--port", type=int, default=nasctl.DEFAULT_PORT)
    init.add_argument("--remote-root", default="/nas")
    sub.add_parser("keygen")
    export = sub.add_parser("export-public-key")
    export.add_argument("--dest", required=True)
    pin = sub.add_parser("pin-host")
    pin.add_argument("--expected-fingerprint", required=True)
    return root


COMMANDS = {
    "init": cmd_init,
    "keygen": cmd_keygen,
    "export-public-key": cmd_export_public_key,
    "pin-host": cmd_pin_host,
}


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parser().parse_args(argv)
    try:
        result = COMMANDS[args.command](args)
    except nasctl.NasError as exc:
        json.dump(
            {"ok": False, "error": {"code": exc.code, "message": str(exc), "details": exc.details}},
            sys.stderr,
            ensure_ascii=False,
            indent=2,
        )
        sys.stderr.write("\n")
        return 2
    emit(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

