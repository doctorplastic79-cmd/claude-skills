#!/usr/bin/env python3
"""Verifica che i due messaggi TLS distinguano cause diverse.

Un Python senza CA di sistema rifiuta qualunque sito: mandare l'utente a
cercare il certificato del NAS sarebbe mandarlo dalla parte sbagliata.
"""
import ssl
import sys
import types

source = open(sys.argv[1]).read().replace('if __name__ == "__main__":\n    main()', "")
module = types.ModuleType("nas")
exec(compile(source, "nas", "exec"), module.__dict__)

dsm = module.DSM.__new__(module.DSM)
error = ssl.SSLCertVerificationError("unable to get local issuer certificate")

dsm.no_ca_store = True
senza_ca = dsm._tls_hint(error)
dsm.no_ca_store = False
cert_nas = dsm._tls_hint(error)

sys.exit(0 if (
    "Install Certificates" in senza_ca
    and "non e' il NAS" in senza_ca
    and "Install Certificates" not in cert_nas
    and "autofirmato" in cert_nas
) else 1)
