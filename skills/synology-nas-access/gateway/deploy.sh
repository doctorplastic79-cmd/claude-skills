#!/bin/sh
set -eu

if [ ! -f .env ]; then
  echo "Create .env from .env.example and set the three required paths first." >&2
  exit 1
fi

if grep -Ev '^[[:space:]]*(#.*)?$|^(TAILSCALE_IP|GATEWAY_PORT|NAS_SOURCE_PATH|PUBLIC_KEY_FILE|NAS_UID|NAS_GID)=[^[:cntrl:]]+$' .env >/dev/null; then
  echo ".env contains an unknown or unsafe line" >&2
  exit 1
fi

get_env() {
  awk -F= -v wanted="$1" '
    $1 == wanted { count++; sub(/^[^=]*=/, ""); value=$0 }
    END { if (count != 1) exit 1; print value }
  ' .env
}

TAILSCALE_IP="$(get_env TAILSCALE_IP)" || { echo "TAILSCALE_IP must occur exactly once" >&2; exit 1; }
GATEWAY_PORT="$(get_env GATEWAY_PORT)" || { echo "GATEWAY_PORT must occur exactly once" >&2; exit 1; }
NAS_SOURCE_PATH="$(get_env NAS_SOURCE_PATH)" || { echo "NAS_SOURCE_PATH must occur exactly once" >&2; exit 1; }
PUBLIC_KEY_FILE="$(get_env PUBLIC_KEY_FILE)" || { echo "PUBLIC_KEY_FILE must occur exactly once" >&2; exit 1; }
NAS_UID="$(get_env NAS_UID)" || { echo "NAS_UID must occur exactly once" >&2; exit 1; }
NAS_GID="$(get_env NAS_GID)" || { echo "NAS_GID must occur exactly once" >&2; exit 1; }
export TAILSCALE_IP GATEWAY_PORT NAS_SOURCE_PATH PUBLIC_KEY_FILE NAS_UID NAS_GID

if ! printf '%s\n' "$TAILSCALE_IP" | awk -F. '
  NF == 4 && $1 == 100 && $2 ~ /^[0-9]+$/ && $2 >= 64 && $2 <= 127 &&
  $3 ~ /^[0-9]+$/ && $3 >= 0 && $3 <= 255 && $4 ~ /^[0-9]+$/ && $4 >= 0 && $4 <= 255 { ok=1 }
  END { exit ok ? 0 : 1 }
'; then
  echo "TAILSCALE_IP must be inside 100.64.0.0/10" >&2
  exit 1
fi

case "${GATEWAY_PORT:-2222}" in *[!0-9]*|'') echo "Invalid GATEWAY_PORT" >&2; exit 1 ;; esac
if [ "${GATEWAY_PORT:-2222}" -lt 1024 ] || [ "${GATEWAY_PORT:-2222}" -gt 65535 ] || [ "${GATEWAY_PORT:-2222}" -eq 22 ]; then
  echo "GATEWAY_PORT must be 1024..65535 and cannot be 22" >&2
  exit 1
fi

case "${NAS_UID:-}:${NAS_GID:-}" in *[!0-9:]*|:|*:|':') echo "NAS_UID and NAS_GID must be numeric" >&2; exit 1 ;; esac
if [ ! -d "${NAS_SOURCE_PATH:-}" ]; then
  echo "NAS_SOURCE_PATH must be an existing dedicated directory" >&2
  exit 1
fi
nas_source_real="$(cd "$NAS_SOURCE_PATH" && pwd -P)"
case "$nas_source_real" in
  /volume1/ClaudeAccess|/volume1/ClaudeAccess/*) ;;
  *) echo "NAS_SOURCE_PATH must be /volume1/ClaudeAccess or one of its subfolders" >&2; exit 1 ;;
esac
if [ ! -f "${PUBLIC_KEY_FILE:-}" ]; then
  echo "PUBLIC_KEY_FILE must be an existing restricted public-key file" >&2
  exit 1
fi
public_key_real="$(cd "$(dirname "$PUBLIC_KEY_FILE")" && pwd -P)/$(basename "$PUBLIC_KEY_FILE")"
case "$public_key_real" in "$nas_source_real"/*) echo "Public key cannot be inside the exported folder" >&2; exit 1 ;; esac

mkdir -p state
chmod 0700 state

docker compose config >/dev/null
docker compose build --pull
docker compose up -d

echo "Gateway host-key fingerprint:"
docker compose exec -T gateway ssh-keygen -lf /state/ssh_host_ed25519_key.pub -E sha256
