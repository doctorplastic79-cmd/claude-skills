#!/usr/bin/env bash
# Installa gli strumenti MEGA a riga di comando: prima il pacchetto MEGAcmd
# ufficiale (mega.nz), altrimenti megatools dai repository della distribuzione.
# Sonda anche l'API di MEGA, perché "installato" non implica "raggiungibile":
# nelle sessioni cloud la network policy può bloccare i domini MEGA, e allora
# vale solo il fallback MEGA Bridge (vedi SKILL.md).
set -u

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    echo "Servono privilegi di root (o sudo) per installare pacchetti." >&2
    exit 1
  fi
fi

api_reachable=false
if curl --silent --output /dev/null --max-time 15 \
    -X POST --data '[{"a":"g"}]' "https://g.api.mega.co.nz/cs"; then
  api_reachable=true
fi

have_megacmd() { command -v mega-get >/dev/null 2>&1 || command -v mega-cmd >/dev/null 2>&1; }
have_megatools() { command -v megadl >/dev/null 2>&1 || command -v megatools >/dev/null 2>&1; }

install_megacmd_deb() {
  # Solo Debian/Ubuntu: MEGA pubblica un deb per distribuzione e versione.
  [ -r /etc/os-release ] || return 1
  # shellcheck disable=SC1091
  . /etc/os-release
  local flavor=""
  case "${ID:-}" in
    ubuntu) flavor="xUbuntu_${VERSION_ID:-}" ;;
    debian)
      case "${VERSION_ID:-}" in
        13*) flavor="Debian_13" ;;
        12*) flavor="Debian_12" ;;
        11*) flavor="Debian_11" ;;
        *) return 1 ;;
      esac
      ;;
    *) return 1 ;;
  esac
  local arch
  arch="$(dpkg --print-architecture 2>/dev/null)" || return 1
  local url="https://mega.nz/linux/repo/${flavor}/${arch}/megacmd-${flavor}_${arch}.deb"
  local tmp
  tmp="$(mktemp -d)"
  echo "Provo MEGAcmd ufficiale: $url"
  if curl --fail --silent --show-error --location --max-time 300 \
      "$url" --output "$tmp/megacmd.deb"; then
    $SUDO apt-get update -qq || true
    if $SUDO apt-get install -y -qq "$tmp/megacmd.deb"; then
      rm -rf "$tmp"
      return 0
    fi
  fi
  rm -rf "$tmp"
  return 1
}

install_megatools() {
  if command -v apt-get >/dev/null 2>&1; then
    $SUDO apt-get update -qq || true
    $SUDO apt-get install -y -qq megatools
  elif command -v dnf >/dev/null 2>&1; then
    $SUDO dnf install -y megatools
  elif command -v apk >/dev/null 2>&1; then
    $SUDO apk add megatools
  elif command -v brew >/dev/null 2>&1; then
    brew install megatools
  else
    return 1
  fi
}

if ! have_megacmd && ! have_megatools; then
  install_megacmd_deb || true
  have_megacmd || install_megatools || true
fi

echo
echo "================ Riepilogo MEGA ================"
if have_megacmd; then
  echo "MEGAcmd:   installato ($(command -v mega-get || command -v mega-cmd))"
else
  echo "MEGAcmd:   non installato (deb ufficiale non scaricabile o distribuzione non supportata)"
fi
if have_megatools; then
  echo "megatools: installato ($(command -v megadl || command -v megatools))"
else
  echo "megatools: non installato"
fi
if [ "$api_reachable" = true ]; then
  echo "API MEGA:  raggiungibile (g.api.mega.co.nz)"
else
  echo "API MEGA:  NON raggiungibile — la rete della sessione blocca MEGA."
  echo "           Gli strumenti locali non potranno collegarsi: usare il"
  echo "           fallback MEGA Bridge (workflow GitHub Actions in"
  echo "           doctorplastic79-cmd/karaoke-cloud), oppure consentire"
  echo "           mega.nz, g.api.mega.co.nz e *.userstorage.mega.co.nz"
  echo "           nella network policy dell'environment."
fi
echo "================================================"

if have_megacmd || have_megatools; then
  exit 0
fi
exit 1
