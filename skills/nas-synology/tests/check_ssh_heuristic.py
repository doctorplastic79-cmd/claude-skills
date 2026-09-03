#!/usr/bin/env python3
"""L'euristica che decide se un comando SSH e' di sola lettura.

Non e' una sandbox e non pretende di esserlo: e' un freno che impedisce di
lanciare per distrazione un comando che modifica il NAS. Sbagliare in un
verso rende scomodo lo strumento (un `2>/dev/null` bocciato), sbagliare
nell'altro toglie il freno. Questa tabella tiene fermi entrambi i lati.
"""
import sys
import types

source = open(sys.argv[1]).read().replace('if __name__ == "__main__":\n    main()', "")
module = types.ModuleType("nas")
exec(compile(source, "nas", "exec"), module.__dict__)

DI_SOLA_LETTURA = [
    "du -sh /volume1/* 2>/dev/null | sort -h",   # il caso che veniva bocciato
    "sudo du -sh /volume1/* | sort -h",
    "sudo smartctl -a /dev/sata1",
    "cat /proc/mdstat | grep -v ^$ | head -20",
    "df -h 2>&1",
    "ls -la /volume1",
    "sudo btrfs filesystem usage /volume1",
    "sudo btrfs subvolume list /volume1",
    "sudo mdadm --detail /dev/md2",
    "ip addr show",
    "synopkg list --name",
    "docker ps -a",
    "docker logs plex | tail -50",
    "sed -n '1,5p' /etc/VERSION",
    "cat /etc/VERSION && df -h",
]

CHE_SCRIVONO = [
    "du -sh /volume1/* | tee /tmp/elenco",       # scrive il secondo comando
    "sudo mdadm --fail /dev/md2 /dev/sata1p5",   # il playbook lo vieta
    "sudo btrfs filesystem resize max /volume1",
    "sudo sed -i 's/a/b/' /etc/synoinfo.conf",
    "ip addr flush dev eth0",
    "docker rmi plex",
    "docker exec plex rm -rf /config",
    "ls /volume1; rm -rf /volume1/foto",         # gia' coperto, ma resta
    "ls /volume1 & rm -rf /volume1/foto",        # & in mezzo
    "ls $(rm -rf /volume1/foto)",                # sostituzione di comando
    "ls `rm -rf /volume1/foto`",
    "ls\nrm -rf /volume1/foto",                  # a capo
    "cat /etc/passwd > /tmp/x",
    "find /volume1 -name '*.tmp' | xargs rm",
    "sudo rm -rf /volume1/foto",
    "sudo reboot",
    "sudo synopkg stop Docker",
    "echo ciao >> /etc/passwd",
    "sudo",                                       # un prefisso senza comando
    "",
]

errori = []
for comando in DI_SOLA_LETTURA:
    if not module._looks_readonly(comando):
        errori.append(f"  bocciato ma innocuo: {comando!r}")
for comando in CHE_SCRIVONO:
    if module._looks_readonly(comando):
        errori.append(f"  accettato ma scrive: {comando!r}")

if errori:
    print("euristica SSH sbagliata su:", *errori, sep="\n")
    sys.exit(1)
sys.exit(0)
