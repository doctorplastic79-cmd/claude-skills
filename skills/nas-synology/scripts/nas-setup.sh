#!/usr/bin/env bash
# Crea ~/.config/nas-synology/config.env con i permessi giusti e prova la
# connessione. Interattivo: da eseguire sul Mac, una volta sola.
#
#   ./nas-setup.sh
#
# Le credenziali restano solo in questo file (chmod 600), mai nel repository.

set -euo pipefail

CONFIG="${NAS_CONFIG:-$HOME/.config/nas-synology/config.env}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -e "$CONFIG" ]; then
  echo "Esiste gia' $CONFIG."
  read -rp "Sovrascriverlo? [s/N] " reply
  [[ "$reply" =~ ^[sSyY]$ ]] || { echo "Lasciato com'e'."; exit 0; }
fi

echo "Configurazione dell'accesso al NAS Synology."
echo "Serve un utente DSM dedicato: vedi references/setup.md."
echo

read -rp "URL del NAS (es. https://casa.synology.me:5001): " url
read -rp "Utente DSM: " user
read -rsp "Password: " pass; echo
read -rp "Segreto 2FA base32 (invio per saltare): " otp
read -rp "Host SSH per il Mac (invio per saltare): " ssh_host
read -rp "Utente SSH [$user]: " ssh_user
ssh_user="${ssh_user:-$user}"

mkdir -p "$(dirname "$CONFIG")"
umask 077
{
  echo "# Credenziali del NAS. Non copiare questo file in un repository."
  echo "NAS_URL=$url"
  echo "NAS_USER=$user"
  echo "NAS_PASS=$pass"
  [ -n "$otp" ] && echo "NAS_OTP_SECRET=$otp"
  if [ -n "$ssh_host" ]; then
    echo "NAS_SSH_HOST=$ssh_host"
    echo "NAS_SSH_USER=$ssh_user"
    echo "NAS_SSH_KEY=~/.ssh/id_ed25519_nas"
  fi
  echo "# Togli il commento solo se il NAS ha ancora il certificato autofirmato"
  echo "# e lo raggiungi solo dalla LAN:"
  echo "# NAS_VERIFY_TLS=no"
} > "$CONFIG"
chmod 600 "$CONFIG"

echo
echo "Scritto $CONFIG (permessi 600)."
echo "Verifica in corso..."
echo
exec "$HERE/nas" check
