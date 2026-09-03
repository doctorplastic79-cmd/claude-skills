#!/usr/bin/env python3
"""Dietro un relay QuickConnect il NAS risponde tardi: il tempo di attesa di
default deve salire, ma NAS_TIMEOUT esplicito vince sempre."""
import os
import sys
import types

source = open(sys.argv[1]).read().replace('if __name__ == "__main__":\n    main()', "")
module = types.ModuleType("nas")
exec(compile(source, "nas", "exec"), module.__dict__)

base = {"NAS_USER": "u", "NAS_PASS": "p", "NAS_AMBIENTE": "mac"}
casi = [
    ({"NAS_URL": "https://x.fr3.quickconnect.to"}, 90),
    ({"NAS_URL": "https://x.fr3.quickconnect.to", "NAS_TIMEOUT": "20"}, 20),
    ({"NAS_URL": "https://192.168.1.10:5001"}, 30),
]
errori = []
for extra, atteso in casi:
    os.environ.update(base); os.environ.update(extra)
    os.environ.pop("NAS_TIMEOUT", None) if "NAS_TIMEOUT" not in extra else None
    dsm = module.DSM()          # un solo indirizzo: nessuna connessione
    if dsm.timeout != atteso:
        errori.append(f"  {extra}: timeout={dsm.timeout}, atteso {atteso}")
if errori:
    print("timeout sbagliato:", *errori, sep="\n"); sys.exit(1)
sys.exit(0)
