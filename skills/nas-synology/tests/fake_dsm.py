#!/usr/bin/env python3
"""Finto DSM 7: risponde come quello vero, per collaudare scripts/nas.

    python3 fake_dsm.py 18080

Credenziali attese: claude / segreta, con 2FA (qualunque codice va bene).
Endpoint di controllo per i test, non presenti in un DSM reale:

    GET /__control/expire   invalida il SID corrente
Qualunque richiesta con &lento=N ritarda la risposta di N secondi.
    GET /__control/state    restituisce lo stato interno in JSON

Le risposte riproducono la forma di quelle vere, compresa la stranezza per cui
gli errori delle operazioni asincrone arrivano dentro un `success: true`.
"""

import json
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

APIS = {
    "SYNO.API.Info": {"path": "query.cgi", "minVersion": 1, "maxVersion": 1},
    "SYNO.API.Auth": {"path": "entry.cgi", "minVersion": 1, "maxVersion": 7},
    "SYNO.Core.System": {"path": "entry.cgi", "minVersion": 1, "maxVersion": 3},
    "SYNO.Core.System.Utilization": {"path": "entry.cgi", "minVersion": 1, "maxVersion": 1},
    "SYNO.Storage.CGI.Storage": {"path": "entry.cgi", "minVersion": 1, "maxVersion": 1},
    "SYNO.Core.Share": {"path": "entry.cgi", "minVersion": 1, "maxVersion": 1},
    "SYNO.Core.Package": {"path": "entry.cgi", "minVersion": 1, "maxVersion": 2},
    "SYNO.Core.User": {"path": "entry.cgi", "minVersion": 1, "maxVersion": 1},
    "SYNO.Core.CurrentConnection": {"path": "entry.cgi", "minVersion": 1, "maxVersion": 1},
    "SYNO.Docker.Container": {"path": "entry.cgi", "minVersion": 1, "maxVersion": 1},
    "SYNO.Core.Upgrade.Server": {"path": "entry.cgi", "minVersion": 1, "maxVersion": 1},
    "SYNO.Core.SecurityScan.Status": {"path": "entry.cgi", "minVersion": 1, "maxVersion": 1},
    "SYNO.FileStation.List": {"path": "entry.cgi", "minVersion": 1, "maxVersion": 2},
    "SYNO.FileStation.Search": {"path": "entry.cgi", "minVersion": 1, "maxVersion": 2},
    "SYNO.FileStation.Delete": {"path": "entry.cgi", "minVersion": 1, "maxVersion": 2},
    "SYNO.FileStation.CopyMove": {"path": "entry.cgi", "minVersion": 1, "maxVersion": 3},
    "SYNO.FileStation.Download": {"path": "entry.cgi", "minVersion": 1, "maxVersion": 2},
    "SYNO.FileStation.Upload": {"path": "entry.cgi", "minVersion": 1, "maxVersion": 2},
    "SYNO.FileStation.CreateFolder": {"path": "entry.cgi", "minVersion": 1, "maxVersion": 2},
    # SYNO.Backup.Task e SYNO.Core.SyslogClient.Log restano fuori di proposito:
    # servono a verificare che l'assenza di un'API degradi con grazia.
}

SID = "sid-di-prova"
STATE = {"logins": 0, "valid": True, "deleted": [], "uploaded": [], "moved": []}


def ok(data):
    return {"success": True, "data": data}


def err(code):
    return {"success": False, "error": {"code": code}}


def system_info():
    return {
        "model": "DS923+", "firmware_ver": "DSM 7.2.2-72806", "serial": "1234ABC",
        "up_time": 954321, "sys_temp": 41, "ram_size": 8192,
        "cpu_series": "Ryzen R1600", "cpu_clock_speed": 2600, "cpu_cores": "2",
    }


def storage_info():
    return {
        "volumes": [{
            "id": "volume_1", "display_name": "Volume 1", "fs_type": "btrfs",
            "status": "normal",
            "size": {"total": "7900000000000", "used": "6900000000000"},
        }],
        "disks": [{
            "id": "sata1", "model": "WD80EFZZ", "size_total": "8001563222016",
            "temp": 38, "smart_status": "normal", "status": "normal",
        }],
        "storagePools": [{
            "id": "pool_1", "raid_type": "raid_1",
            "size": {"total": "7900000000000"}, "status": "normal",
        }],
    }


def dispatch(query, has_body):
    api, method = query.get("api"), query.get("method")

    if query.get("lento"):
        # per verificare la diagnosi del timeout di lettura
        time.sleep(float(query["lento"]))

    if api == "SYNO.API.Info":
        return ok(APIS)

    if api == "SYNO.API.Auth":
        if method == "logout":
            STATE["valid"] = False
            return ok({})
        if query.get("account") != "claude" or query.get("passwd") != "segreta":
            return err(400)
        if not query.get("otp_code") and not query.get("device_id"):
            return err(403)          # 2FA obbligatoria, come su un DSM moderno
        STATE["logins"] += 1
        STATE["valid"] = True
        return ok({"sid": SID, "synotoken": "token-di-prova", "did": "device-1"})

    if query.get("_sid") != SID or not STATE["valid"]:
        return err(119)

    if api == "SYNO.Core.System":
        return ok(system_info())
    if api == "SYNO.Core.System.Utilization":
        return ok({
            "cpu": {"user_load": 7, "system_load": 3},
            "memory": {"memory_size": 8388608, "real_usage": 43},
            "network": [{"device": "eth0", "rx": 128000, "tx": 51200}],
            "disk": {"disk": [{"device": "sata1", "utilization": 12,
                               "read_byte": 900000, "write_byte": 120000}]},
        })
    if api == "SYNO.Storage.CGI.Storage":
        return ok(storage_info())
    if api == "SYNO.Core.Share":
        return ok({"shares": [
            {"name": "Drive", "vol_path": "/volume1", "desc": "documenti"},
            {"name": "video", "vol_path": "/volume1", "desc": ""},
        ]})
    if api == "SYNO.Core.Package":
        # Due forme diverse nella stessa risposta: DSM 7.2 mette i campi al
        # primo livello, 7.3 li annida sotto `additional`. Il client deve
        # leggerle entrambe, altrimenti la colonna esce vuota.
        return ok({"packages": [
            {"id": "Docker", "version": "24.0", "status": "running",
             "description": "Container Manager"},
            {"id": "SynologyPhotos", "version": "1.9.0-10924",
             "additional": {"status": "running", "description": "Foto"}},
            {"id": "HyperBackup", "version": "4.1", "status": "stopped",
             "description": "Backup"},
        ]})
    if api == "SYNO.Core.User":
        return ok({"users": [{"name": "claude", "email": "", "description": "agente",
                              "expired": "normal"}]})
    if api == "SYNO.Core.CurrentConnection":
        return ok({"items": [{"who": "dario", "from": "192.168.1.5",
                              "type": "SMB", "time": "2026-08-30 03:00"}]})
    if api == "SYNO.Docker.Container":
        return ok({"containers": [{"name": "plex", "image": "plex:latest",
                                   "status": "running", "mem_limit": 2147483648}]})

    if api == "SYNO.Core.Upgrade.Server":
        # forma restituita da un DS220+ su DSM 7.3.2
        return ok({"update": {
            "available": True, "reboot": "now", "restart": "none",
            "rss_result": "success", "type": "system", "version": "DSM 7.4.1-90080",
            "version_details": {"buildnumber": 90080, "isSecurityVersion": False,
                                "major": 7, "micro": 1, "minor": 4, "nano": 0,
                                "os_name": "DSM"},
        }})
    if api == "SYNO.Core.SecurityScan.Status":
        vuoto = {"danger": 0, "info": 0, "outOfDate": 0, "risk": 0, "warning": 0}
        return ok({"items": {
            nome: {"category": nome, "fail": dict(vuoto), "failSeverity": "safe",
                   "progress": 100, "runningItem": "", "total": 0, "waitNum": 0}
            for nome in ("malware", "network", "systemCheck", "update")
        }})

    if api == "SYNO.FileStation.List":
        if method == "list_share":
            return ok({"shares": [{"name": "Drive", "path": "/volume1/Drive"}]})
        return ok({"total": 2, "files": [
            {"name": "nota.txt", "isdir": False,
             "additional": {"size": 1234, "time": {"mtime": 1756500000},
                            "owner": {"user": "claude"}}},
            {"name": "foto", "isdir": True,
             "additional": {"size": 0, "time": {"mtime": 1756400000},
                            "owner": {"user": "claude"}}},
        ]})
    if api == "SYNO.FileStation.Search":
        if method == "start":
            return ok({"taskid": "search-1"})
        if method == "list":
            return ok({"finished": True, "total": 1, "files": [
                {"path": "/volume1/video/film.mkv", "additional": {"size": 4294967296}},
            ]})
        return ok({})
    if api == "SYNO.FileStation.CreateFolder":
        return ok({"folders": [{"path": query.get("name", "")}]})
    if api == "SYNO.FileStation.Delete":
        if method == "start":
            STATE["deleted"].append(query.get("path"))
            return ok({"taskid": "del-1"})
        return ok({"finished": True, "errors": []})
    if api == "SYNO.FileStation.CopyMove":
        if method == "start":
            STATE["moved"].append(query.get("path"))
            return ok({"taskid": "mv-1"})
        return ok({"finished": True, "errors": []})
    if api == "SYNO.FileStation.Upload" and has_body:
        STATE["uploaded"].append(True)
        return ok({"blSkip": False})

    return err(102)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def handle_error(self, *args):
        # Quando il client molla per timeout la scrittura fallisce: e' proprio
        # cio' che la prova sta verificando, non un errore del finto DSM.
        pass

    def _safe(self, action):
        try:
            action()
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _send(self, payload, content_type="application/json"):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _handle(self, has_body=False):
        parsed = urlparse(self.path)
        query = {k: v[0] for k, v in parse_qs(parsed.query).items()}

        if parsed.path == "/__control/expire":
            STATE["valid"] = False
            return self._send(b'{"expired": true}')
        if parsed.path == "/__control/state":
            return self._send(json.dumps(STATE).encode())

        if query.get("api") == "SYNO.FileStation.Download" and STATE["valid"]:
            return self._send(b"contenuto del file\n", "application/octet-stream")

        self._send(json.dumps(dispatch(query, has_body)).encode())

    def do_GET(self):
        self._safe(self._handle)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        if length:
            self.rfile.read(length)
        self._safe(lambda: self._handle(has_body=True))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 18080
    HTTPServer(("127.0.0.1", port), Handler).serve_forever()
