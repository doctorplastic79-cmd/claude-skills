#!/usr/bin/env python3
"""Il proxy di uscita di una sessione cloud, in miniatura.

    python3 fake_proxy.py <porta> <host-negato>

Nega ogni CONNECT verso <host-negato> con 403, come fa il gateway quando un
dominio non e' nella network policy, e lo annota in /__agentproxy/status
nella stessa forma del proxy vero. Serve a verificare che il client
trasformi quel 403 nella diagnosi giusta invece che in "non raggiungibile".
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT, NEGATO = int(sys.argv[1]), sys.argv[2]
FAILURES = []


class Proxy(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_CONNECT(self):
        host = self.path.split(":")[0]
        if host == NEGATO:
            FAILURES.append({
                "ts": "2026-09-01T00:00:00Z", "kind": "connect_rejected",
                "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)",
                "host": self.path,
            })
            self.send_response(403)
            self.end_headers()
            return
        self.send_response(502)
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/__agentproxy/status"):
            body = json.dumps({"enabled": True, "recentRelayFailures": FAILURES[-5:]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.end_headers()


HTTPServer(("127.0.0.1", PORT), Proxy).serve_forever()
