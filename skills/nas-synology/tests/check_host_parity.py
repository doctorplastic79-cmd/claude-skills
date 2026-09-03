#!/usr/bin/env python3
"""La classificazione degli host esiste due volte, in bash (lib-host.sh, per
nas-setup.sh) e in Python (scripts/nas). Devono dire la stessa cosa sugli
stessi indirizzi, altrimenti il setup e il client si contraddicono su dove
si puo' mandare una chiave o togliere la verifica del certificato."""
import subprocess
import sys
import types

nas, lib = sys.argv[1], sys.argv[2]
source = open(nas).read().replace('if __name__ == "__main__":\n    main()', "")
module = types.ModuleType("nas")
exec(compile(source, "nas", "exec"), module.__dict__)

INDIRIZZI = [
    "192.168.1.10", "10.0.0.5", "172.16.3.4", "127.0.0.1", "diskstation.local",
    "100.73.172.85", "100.64.0.1", "100.127.255.254", "nas.coda-panda.ts.net",
    "informamedica-nas.fr3.quickconnect.to", "casa.synology.me", "8.8.8.8",
    "example.com", "172.15.0.1", "172.32.0.1", "100.63.0.1", "100.128.0.1",
    "nas", "diskstation", "INFORMA-NAS",       # nomi senza punto: solo in LAN
]

disaccordi = []
for host in INDIRIZZI:
    py = module.is_local_host(host)
    sh = subprocess.run(
        ["bash", "-c", f'. "{lib}"; is_local_host "$1"', "_", host],
    ).returncode == 0
    if py != sh:
        disaccordi.append(f"  {host}: python={py} bash={sh}")

if disaccordi:
    print("le due classificazioni non concordano:", *disaccordi, sep="\n")
    sys.exit(1)
sys.exit(0)
