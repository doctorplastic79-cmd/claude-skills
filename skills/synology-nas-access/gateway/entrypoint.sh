#!/bin/sh
set -eu

source_key=/bootstrap/claude.pub
authorized_key=/run/authorized_keys/nasreader
host_key=/state/ssh_host_ed25519_key

if [ ! -s "$source_key" ]; then
  echo "Missing authorized public key" >&2
  exit 1
fi

nonempty_lines="$(grep -cve '^[[:space:]]*$' "$source_key" || true)"
if [ "$nonempty_lines" -ne 1 ] || ! grep -Eq '^restrict ssh-ed25519 [A-Za-z0-9+/=]+( .*)?$' "$source_key"; then
  echo "Authorized key must be one restricted ED25519 public key" >&2
  exit 1
fi

mkdir -p /run/authorized_keys /run/sshd
cp "$source_key" "$authorized_key"
chown root:root "$authorized_key"
chmod 0600 "$authorized_key"

if [ ! -s "$host_key" ]; then
  ssh-keygen -q -t ed25519 -N '' -f "$host_key"
fi

chmod 0600 "$host_key"
chmod 0644 "$host_key.pub"

/usr/sbin/sshd -t -f /etc/ssh/sshd_config
exec /usr/sbin/sshd -D -e -f /etc/ssh/sshd_config
