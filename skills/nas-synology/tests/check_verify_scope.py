#!/usr/bin/env python3
"""NAS_VERIFY_TLS=no deve togliere la verifica del certificato SOLO agli host
locali o Tailscale. Su un indirizzo pubblico la stessa riga di configurazione
non deve avere effetto: li' l'unica via e' --insecure, esplicito ogni volta."""
import sys
import types

source = open(sys.argv[1]).read().replace('if __name__ == "__main__":\n    main()', "")
module = types.ModuleType("nas")
exec(compile(source, "nas", "exec"), module.__dict__)

dsm = module.DSM.__new__(module.DSM)
dsm.insecure = False
dsm.verify_local = False          # e' NAS_VERIFY_TLS=no

attese = {
    "192.168.10.139": False,      # LAN: verifica tolta
    "100.73.172.85": False,       # Tailscale: verifica tolta
    "informamedica-nas.fr3.quickconnect.to": True,   # pubblico: resta
    "casa.synology.me": True,     # DDNS: resta
}
errori = [f"  {h}: verify={dsm.verify_for(h)}, atteso {v}" for h, v in attese.items() if dsm.verify_for(h) != v]

dsm.verify_local = True           # configurazione di default
if dsm.verify_for("192.168.10.139") is not True:
    errori.append("  con NAS_VERIFY_TLS=yes la LAN deve essere verificata")
dsm.insecure = True
if dsm.verify_for("casa.synology.me") is not False:
    errori.append("  --insecure deve valere anche per un host pubblico")

if errori:
    print("verify_for sbaglia:", *errori, sep="\n")
    sys.exit(1)
sys.exit(0)
