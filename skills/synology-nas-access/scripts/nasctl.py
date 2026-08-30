#!/usr/bin/env python3
"""Read-only Synology NAS client for the synology-nas-access Agent Skill."""

from __future__ import annotations

import argparse
import hashlib
import ipaddress
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple


CONFIG_ENV = "SYNOLOGY_NAS_SKILL_CONFIG"
DEFAULT_HOST = "informa-nas.tail077572.ts.net"
DEFAULT_PORT = 2222

DEFAULTS: Dict[str, Any] = {
    "host": DEFAULT_HOST,
    "port": DEFAULT_PORT,
    "user": "nasreader",
    "remote_root": "/nas",
    "identity_file": "~/.ssh/claude_nas_read_ed25519",
    "known_hosts_file": "~/.config/claude-nas/known_hosts",
    "connect_timeout_seconds": 10,
    "command_timeout_seconds": 45,
    "max_list_entries": 1000,
    "max_search_depth": 6,
    "max_search_results": 200,
    "max_read_bytes": 1024 * 1024,
    "max_download_bytes": 1024 * 1024 * 1024,
}

SENSITIVE_COMPONENTS = {
    ".ssh",
    ".gnupg",
    ".aws",
    ".config-rclone",
    "credentials",
    "secrets",
    "state",
}
SENSITIVE_FILENAMES = {
    ".env",
    "credenziali_oauth.txt",
    "credentials.json",
    "masterkey",
    "id_dsa",
    "id_ecdsa",
    "id_ed25519",
    "id_rsa",
}
PRIVATE_KEY_RE = re.compile(r"^(id_(?:dsa|ecdsa|ed25519|rsa)|.*\.(?:key|pem|p12|pfx))$", re.I)
HOST_RE = re.compile(r"^[A-Za-z0-9.-]+$")
UNSAFE_SHELL_CHARS = set("'\"`$;&|<>(){}!\\")


class NasError(RuntimeError):
    def __init__(self, message: str, code: str = "nas_error", details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.code = code
        self.details = details or {}


def config_path() -> Path:
    override = os.environ.get(CONFIG_ENV)
    if override:
        return Path(override).expanduser()
    if os.name == "nt":
        root = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    else:
        root = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    return root / "claude-nas" / "config.json"


def _as_int(cfg: Dict[str, Any], key: str, low: int, high: int) -> int:
    value = cfg.get(key)
    if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
        raise NasError(f"Invalid integer setting: {key}", "invalid_config")
    return value


def _is_tailscale_host(host: str) -> bool:
    if host == DEFAULT_HOST:
        return True
    try:
        return ipaddress.ip_address(host) in ipaddress.ip_network("100.64.0.0/10")
    except ValueError:
        return False


def load_config() -> Dict[str, Any]:
    path = config_path()
    if not path.is_file():
        raise NasError(
            f"Configuration not found at {path}. Run scripts/configure.py init.",
            "configuration_missing",
            {"config_path": str(path)},
        )
    _check_protected_file(path, require_private=True)
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise NasError(f"Cannot read configuration: {exc}", "invalid_config") from exc
    if not isinstance(raw, dict):
        raise NasError("Configuration root must be a JSON object", "invalid_config")
    cfg = dict(DEFAULTS)
    cfg.update(raw)

    host = cfg.get("host")
    if not isinstance(host, str) or not HOST_RE.fullmatch(host) or not _is_tailscale_host(host):
        raise NasError("host must be a Tailscale MagicDNS name or 100.64.0.0/10 address", "invalid_config")
    port = _as_int(cfg, "port", 1024, 65535)
    if port == 22:
        raise NasError("DSM SSH port 22 is forbidden; use the isolated gateway port", "invalid_config")
    user = cfg.get("user")
    if user != "nasreader":
        raise NasError("Gateway user must be the isolated nasreader account", "invalid_config")
    remote_root = cfg.get("remote_root")
    if not isinstance(remote_root, str) or not remote_root.startswith("/") or ".." in PurePosixPath(remote_root).parts:
        raise NasError("remote_root must be an absolute virtual SFTP path", "invalid_config")
    root_parts = remote_root.split("/")[1:]
    if (
        not root_parts
        or any(part in ("", ".", "..") for part in root_parts)
        or any(len(part.encode("utf-8")) > 255 for part in root_parts)
        or any(ord(ch) < 32 for ch in remote_root)
        or "\\" in remote_root
        or any(ch in "*?[]" or ch in UNSAFE_SHELL_CHARS for ch in remote_root)
    ):
        raise NasError("remote_root contains forbidden characters", "invalid_config")

    for key in ("connect_timeout_seconds", "command_timeout_seconds"):
        _as_int(cfg, key, 1, 300)
    _as_int(cfg, "max_list_entries", 1, 10000)
    _as_int(cfg, "max_search_depth", 0, 20)
    _as_int(cfg, "max_search_results", 1, 5000)
    _as_int(cfg, "max_read_bytes", 1, 16 * 1024 * 1024)
    _as_int(cfg, "max_download_bytes", 1, 16 * 1024 * 1024 * 1024)

    identity = Path(str(cfg.get("identity_file", ""))).expanduser()
    known_hosts = Path(str(cfg.get("known_hosts_file", ""))).expanduser()
    if not identity.is_file():
        raise NasError(f"Private key not found: {identity}", "identity_missing")
    if not known_hosts.is_file() or known_hosts.stat().st_size == 0:
        raise NasError(f"Pinned known_hosts file not found or empty: {known_hosts}", "host_key_missing")
    _check_protected_file(identity, require_private=True)
    _check_protected_file(known_hosts, require_private=False)
    cfg["identity_file"] = str(identity.resolve())
    cfg["known_hosts_file"] = str(known_hosts.resolve())
    cfg["remote_root"] = remote_root.rstrip("/") or "/"
    return cfg


def _check_protected_file(path: Path, require_private: bool) -> None:
    if path.is_symlink() or not path.is_file():
        raise NasError(f"Security file must be a regular non-symlink: {path}", "unsafe_file")
    if os.name == "nt":
        return
    info = path.stat()
    if info.st_uid != os.getuid():
        raise NasError(f"Security file is not owned by the current user: {path}", "unsafe_file_owner")
    forbidden = 0o077 if require_private else 0o022
    if info.st_mode & forbidden:
        expected = "600" if require_private else "not group/world-writable"
        raise NasError(f"Unsafe permissions on {path}; expected {expected}", "unsafe_file_permissions")


def normalize_relative_path(value: str, allow_root: bool = True) -> str:
    if not isinstance(value, str):
        raise NasError("Path must be text", "invalid_path")
    value = unicodedata.normalize("NFC", value)
    if value in ("", "."):
        if allow_root:
            return ""
        raise NasError("A file path is required", "invalid_path")
    if value.startswith("/") or "\\" in value:
        raise NasError("NAS paths must be relative POSIX paths", "invalid_path")
    if any(ch in value for ch in "*?[]"):
        raise NasError("SFTP wildcard characters are not allowed in paths", "invalid_path")
    if any(ch in UNSAFE_SHELL_CHARS for ch in value):
        raise NasError("Shell metacharacters are not supported in NAS paths", "invalid_path")
    if any(ord(ch) < 32 or ord(ch) == 127 for ch in value):
        raise NasError("Path contains control characters", "invalid_path")
    parts = value.split("/")
    if any(part in ("", ".", "..") for part in parts):
        raise NasError("Path contains an empty, dot, or parent component", "invalid_path")
    if any(len(part.encode("utf-8")) > 255 for part in parts):
        raise NasError("Path component is too long", "invalid_path")
    return "/".join(parts)


def is_sensitive(relative: str) -> bool:
    parts = [part.casefold() for part in PurePosixPath(relative).parts]
    if any(part in SENSITIVE_COMPONENTS for part in parts):
        return True
    if parts:
        name = parts[-1]
        if name in SENSITIVE_FILENAMES or PRIVATE_KEY_RE.fullmatch(name):
            return True
    return False


def ensure_not_sensitive(relative: str) -> None:
    if is_sensitive(relative):
        raise NasError("Credential or secret paths are outside this skill's scope", "sensitive_path_blocked")


def remote_path(cfg: Dict[str, Any], relative: str) -> str:
    root = cfg["remote_root"]
    return root if not relative else (root.rstrip("/") + "/" + relative)


def sftp_quote(value: str) -> str:
    if any(ch in value for ch in ("\n", "\r", "\x00")):
        raise NasError("SFTP path contains forbidden characters", "invalid_path")
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _trusted_sftp_binary() -> str:
    candidates: List[Path] = []
    if os.name == "nt":
        system_root = Path(os.environ.get("SystemRoot", "C:/Windows"))
        candidates.append(system_root / "System32" / "OpenSSH" / "sftp.exe")
    else:
        candidates.extend((Path("/usr/bin/sftp"), Path("/usr/local/bin/sftp"), Path("/bin/sftp")))
    for candidate in candidates:
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)
    found = shutil.which("sftp")
    if found:
        return str(Path(found).resolve())
    raise NasError("OpenSSH sftp client is not installed", "dependency_missing")


def _safe_error(stderr: str) -> str:
    lines = []
    for line in stderr.splitlines():
        if "identity file" in line.lower():
            continue
        lines.append(line.strip())
    return " | ".join(line for line in lines if line)[:1000]


def _relative_join(parent: str, name: str) -> str:
    return name if not parent else f"{parent}/{name}"


def _entry_type(mode: str) -> str:
    return {"d": "directory", "-": "file", "l": "symlink"}.get(mode[:1], "other")


def parse_long_listing(output: str, parent: str) -> List[Dict[str, Any]]:
    entries: List[Dict[str, Any]] = []
    for raw_line in output.splitlines():
        line = raw_line.rstrip("\r")
        if not line or line.startswith("sftp>") or line.startswith("Connected to "):
            continue
        parts = line.split(None, 8)
        if len(parts) < 9 or len(parts[0]) < 10 or parts[0][0] not in "-dlbcps":
            continue
        mode = parts[0]
        try:
            size = int(parts[4])
        except ValueError:
            continue
        listed_name = parts[8]
        if mode.startswith("l") and " -> " in listed_name:
            listed_name = listed_name.split(" -> ", 1)[0]
        name = PurePosixPath(listed_name).name
        if name in ("", ".", "..") or any(ord(ch) < 32 for ch in name) or any(ch in UNSAFE_SHELL_CHARS for ch in name):
            continue
        rel = _relative_join(parent, name)
        if is_sensitive(rel):
            continue
        entries.append(
            {
                "name": name,
                "path": rel,
                "type": _entry_type(mode),
                "size": size,
                "mode": mode,
                "modified": " ".join(parts[5:8]),
            }
        )
    return entries


class SftpClient:
    def __init__(self, cfg: Dict[str, Any]):
        self.cfg = cfg
        self.binary = _trusted_sftp_binary()

    def _command(self) -> List[str]:
        return [
            self.binary,
            "-b",
            "-",
            "-F",
            os.devnull,
            "-P",
            str(self.cfg["port"]),
            "-i",
            self.cfg["identity_file"],
            "-oBatchMode=yes",
            "-oIdentitiesOnly=yes",
            "-oIdentityAgent=none",
            "-oPreferredAuthentications=publickey",
            "-oPasswordAuthentication=no",
            "-oKbdInteractiveAuthentication=no",
            "-oStrictHostKeyChecking=yes",
            f"-oUserKnownHostsFile={self.cfg['known_hosts_file']}",
            f"-oGlobalKnownHostsFile={os.devnull}",
            "-oProxyCommand=none",
            "-oProxyJump=none",
            "-oCanonicalizeHostname=no",
            "-oUpdateHostKeys=no",
            "-oHostKeyAlgorithms=ssh-ed25519",
            f"-oConnectTimeout={self.cfg['connect_timeout_seconds']}",
            "-oConnectionAttempts=1",
            "-oClearAllForwardings=yes",
            "-oForwardAgent=no",
            "-oForwardX11=no",
            "-oRequestTTY=no",
            "-oPermitLocalCommand=no",
            "-oControlPath=none",
            "-oServerAliveInterval=15",
            "-oServerAliveCountMax=2",
            "-oLogLevel=ERROR",
            f"{self.cfg['user']}@{self.cfg['host']}",
        ]

    def run(self, commands: Sequence[str]) -> Tuple[str, str]:
        batch = "\n".join(commands) + "\nquit\n"
        try:
            proc = subprocess.run(
                self._command(),
                input=batch,
                text=True,
                capture_output=True,
                timeout=self.cfg["command_timeout_seconds"],
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise NasError("SFTP operation timed out", "timeout") from exc
        except OSError as exc:
            raise NasError(f"Cannot start SFTP client: {exc}", "dependency_error") from exc
        if proc.returncode != 0:
            safe = _safe_error(proc.stderr) or "SFTP request failed"
            lowered = safe.casefold()
            code = "host_key_mismatch" if "host key verification failed" in lowered else "connection_failed"
            raise NasError(safe, code, {"returncode": proc.returncode})
        return proc.stdout, proc.stderr

    def list(self, relative: str) -> List[Dict[str, Any]]:
        ensure_not_sensitive(relative)
        target = remote_path(self.cfg, relative)
        stdout, _ = self.run([f"ls -lan {sftp_quote(target)}"])
        entries = parse_long_listing(stdout, relative)
        limit = self.cfg["max_list_entries"]
        if len(entries) > limit:
            raise NasError(f"Directory exceeds the configured limit of {limit} entries", "result_limit")
        return sorted(entries, key=lambda item: (item["type"] != "directory", item["name"].casefold()))

    def stat(self, relative: str) -> Dict[str, Any]:
        ensure_not_sensitive(relative)
        target = remote_path(self.cfg, relative)
        stdout, _ = self.run([f"ls -ldn {sftp_quote(target)}"])
        parent = str(PurePosixPath(relative).parent)
        parent = "" if parent == "." else parent
        entries = parse_long_listing(stdout, parent)
        if not entries:
            raise NasError("SFTP server returned no metadata", "invalid_server_response")
        item = entries[0]
        item["path"] = relative or "."
        return item

    def get(self, relative: str, local_path: Path) -> None:
        ensure_not_sensitive(relative)
        target = remote_path(self.cfg, relative)
        self.run([f"get {sftp_quote(target)} {sftp_quote(str(local_path))}"])


def _check_regular_file(client: SftpClient, relative: str, byte_limit: int) -> Dict[str, Any]:
    item = client.stat(relative)
    if item["type"] != "file":
        raise NasError("Only regular files can be read or downloaded", "not_regular_file")
    if item["size"] > byte_limit:
        raise NasError(
            f"File size {item['size']} exceeds the configured limit {byte_limit}",
            "file_too_large",
            {"size": item["size"], "limit": byte_limit},
        )
    return item


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def cmd_doctor(cfg: Dict[str, Any], client: SftpClient, _args: argparse.Namespace) -> Dict[str, Any]:
    client.run(["pwd"])
    root = client.stat("")
    return {
        "ok": True,
        "status": "ready",
        "endpoint": f"{cfg['host']}:{cfg['port']}",
        "transport": "SFTP over Tailscale",
        "remote_mode": "read-only",
        "root": root,
    }


def cmd_list(cfg: Dict[str, Any], client: SftpClient, args: argparse.Namespace) -> Dict[str, Any]:
    relative = normalize_relative_path(args.path)
    entries = client.list(relative)
    return {"ok": True, "path": relative or ".", "count": len(entries), "entries": entries}


def cmd_stat(cfg: Dict[str, Any], client: SftpClient, args: argparse.Namespace) -> Dict[str, Any]:
    relative = normalize_relative_path(args.path)
    return {"ok": True, "entry": client.stat(relative)}


def cmd_search(cfg: Dict[str, Any], client: SftpClient, args: argparse.Namespace) -> Dict[str, Any]:
    query = unicodedata.normalize("NFC", args.query).strip()
    if not query or any(ord(ch) < 32 for ch in query) or any(ch in UNSAFE_SHELL_CHARS for ch in query):
        raise NasError("Search query must be non-empty text without control characters", "invalid_query")
    start = normalize_relative_path(args.path)
    max_depth = cfg["max_search_depth"] if args.depth is None else min(args.depth, cfg["max_search_depth"])
    max_results = cfg["max_search_results"] if args.limit is None else min(args.limit, cfg["max_search_results"])
    needle = query.casefold()
    queue: List[Tuple[str, int]] = [(start, 0)]
    results: List[Dict[str, Any]] = []
    visited_entries = 0
    incomplete_reason: Optional[str] = None
    warnings: List[Dict[str, str]] = []
    extension = args.extension.casefold() if args.extension else None
    if extension is not None and (
        not extension.startswith(".")
        or "/" in extension
        or any(ord(ch) < 32 for ch in extension)
        or any(ch in UNSAFE_SHELL_CHARS or ch in "*?[]" for ch in extension)
    ):
        raise NasError("Extension must be a literal suffix such as .pdf", "invalid_extension")

    while queue and len(results) < max_results:
        current, depth = queue.pop(0)
        try:
            entries = client.list(current)
        except NasError as exc:
            warnings.append({"path": current or ".", "error": str(exc)})
            continue
        visited_entries += len(entries)
        if visited_entries > cfg["max_list_entries"] * 10:
            incomplete_reason = "visit_limit"
            break
        for entry in entries:
            type_match = args.type is None or entry["type"] == args.type
            extension_match = extension is None or entry["name"].casefold().endswith(extension)
            if needle in entry["name"].casefold() and type_match and extension_match:
                results.append(entry)
                if len(results) >= max_results:
                    incomplete_reason = "result_limit"
                    break
            if entry["type"] == "directory" and depth < max_depth:
                queue.append((entry["path"], depth + 1))
            elif entry["type"] == "directory":
                incomplete_reason = incomplete_reason or "depth_limit"

    complete = not warnings and incomplete_reason is None and not queue
    if args.require_complete and not complete:
        raise NasError(
            "Search could not prove complete coverage",
            "partial_search",
            {"reason": incomplete_reason or "directory_error", "warnings": warnings[:20]},
        )

    return {
        "ok": True,
        "query": query,
        "path": start or ".",
        "count": len(results),
        "complete": complete,
        "truncated": not complete,
        "incomplete_reason": incomplete_reason,
        "results": results,
        "warnings": warnings[:20],
    }


def cmd_read(cfg: Dict[str, Any], client: SftpClient, args: argparse.Namespace) -> Dict[str, Any]:
    relative = normalize_relative_path(args.path, allow_root=False)
    max_bytes = cfg["max_read_bytes"] if args.max_bytes is None else min(args.max_bytes, cfg["max_read_bytes"])
    item = _check_regular_file(client, relative, max_bytes)
    with tempfile.TemporaryDirectory(prefix="nas-read-") as temp_dir:
        local = Path(temp_dir) / "payload"
        client.get(relative, local)
        payload = local.read_bytes()
    if b"\x00" in payload:
        raise NasError("File appears to be binary; use download instead", "binary_file")
    try:
        content = payload.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise NasError("File is not valid UTF-8; use download instead", "unsupported_encoding") from exc
    return {
        "ok": True,
        "path": relative,
        "size": item["size"],
        "sha256": hashlib.sha256(payload).hexdigest(),
        "content": content,
    }


def _confined_destination(raw: Optional[str], relative: str) -> Path:
    root = Path.cwd().resolve()
    candidate = Path(raw) if raw else Path(PurePosixPath(relative).name)
    if not candidate.is_absolute():
        candidate = root / candidate
    candidate = candidate.resolve(strict=False)
    try:
        common = Path(os.path.commonpath((str(root), str(candidate))))
    except ValueError as exc:
        raise NasError("Download destination is outside the current workspace", "unsafe_destination") from exc
    if common != root:
        raise NasError("Download destination must stay inside the current workspace", "unsafe_destination")
    if candidate.exists():
        if candidate.is_dir():
            candidate = candidate / PurePosixPath(relative).name
        if candidate.exists():
            raise NasError(f"Destination already exists: {candidate}", "destination_exists")
    if not candidate.parent.is_dir():
        raise NasError(f"Destination directory does not exist: {candidate.parent}", "destination_missing")
    return candidate


def cmd_download(cfg: Dict[str, Any], client: SftpClient, args: argparse.Namespace) -> Dict[str, Any]:
    relative = normalize_relative_path(args.path, allow_root=False)
    item = _check_regular_file(client, relative, cfg["max_download_bytes"])
    destination = _confined_destination(args.dest, relative)
    fd, temp_name = tempfile.mkstemp(prefix=".nas-download-", dir=str(destination.parent))
    os.close(fd)
    temp_path = Path(temp_name)
    try:
        client.get(relative, temp_path)
        actual_size = temp_path.stat().st_size
        if actual_size != item["size"]:
            raise NasError(
                "Downloaded size does not match NAS metadata",
                "integrity_error",
                {"expected": item["size"], "actual": actual_size},
            )
        digest = _sha256(temp_path)
        try:
            os.link(temp_path, destination)
        except FileExistsError as exc:
            raise NasError(f"Destination appeared during transfer: {destination}", "destination_exists") from exc
        except OSError as exc:
            raise NasError(f"Cannot publish download without overwriting: {exc}", "publish_failed") from exc
        temp_path.unlink()
    finally:
        if temp_path.exists():
            temp_path.unlink()
    return {
        "ok": True,
        "remote_path": relative,
        "local_path": str(destination),
        "size": item["size"],
        "sha256": digest,
    }


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description="Read-only Synology NAS access over a pinned SFTP gateway")
    sub = root.add_subparsers(dest="command", required=True)
    sub.add_parser("doctor", help="Verify configuration, host identity, and read access")

    list_parser = sub.add_parser("list", help="List one NAS directory")
    list_parser.add_argument("path", nargs="?", default=".")

    search_parser = sub.add_parser("search", help="Search filenames recursively using a literal query")
    search_parser.add_argument("query")
    search_parser.add_argument("--path", default=".")
    search_parser.add_argument("--depth", type=int, choices=range(0, 21))
    search_parser.add_argument("--limit", type=int, choices=range(1, 5001))
    search_parser.add_argument("--type", choices=("file", "directory"))
    search_parser.add_argument("--extension")
    search_parser.add_argument("--require-complete", action="store_true")

    stat_parser = sub.add_parser("stat", help="Return metadata for one path")
    stat_parser.add_argument("path")

    read_parser = sub.add_parser("read", help="Read one small UTF-8 text file")
    read_parser.add_argument("path")
    read_parser.add_argument("--max-bytes", type=int, choices=range(1, 16 * 1024 * 1024 + 1))

    download_parser = sub.add_parser("download", help="Download one regular file into the current workspace")
    download_parser.add_argument("path")
    download_parser.add_argument("--dest")
    return root


COMMANDS = {
    "doctor": cmd_doctor,
    "list": cmd_list,
    "search": cmd_search,
    "stat": cmd_stat,
    "read": cmd_read,
    "download": cmd_download,
}


def emit(payload: Dict[str, Any], stream: Any = sys.stdout) -> None:
    json.dump(payload, stream, ensure_ascii=False, indent=2)
    stream.write("\n")


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parser().parse_args(argv)
    try:
        cfg = load_config()
        client = SftpClient(cfg)
        payload = COMMANDS[args.command](cfg, client, args)
    except NasError as exc:
        emit({"ok": False, "error": {"code": exc.code, "message": str(exc), "details": exc.details}}, sys.stderr)
        return 2
    except KeyboardInterrupt:
        emit({"ok": False, "error": {"code": "interrupted", "message": "Operation interrupted"}}, sys.stderr)
        return 130
    emit(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
