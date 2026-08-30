#!/usr/bin/env python3
"""Il finto DSM servito in HTTPS con un certificato autofirmato.

    python3 https_dsm.py <porta> <cert.pem> <key.pem>

Serve a verificare la diagnosi TLS del client: un DSM appena installato ha
esattamente questo, un certificato che nessun client puo' verificare.
"""
import os
import ssl
import sys
from http.server import HTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fake_dsm  # noqa: E402

port, certfile, keyfile = int(sys.argv[1]), sys.argv[2], sys.argv[3]
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(certfile, keyfile)
server = HTTPServer(("127.0.0.1", port), fake_dsm.Handler)
server.socket = context.wrap_socket(server.socket, server_side=True)
server.serve_forever()
