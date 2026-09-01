#!/usr/bin/env bash
# Classificazione degli indirizzi, condivisa fra nas-setup.sh e le prove.
#
# Serve a decidere una cosa sola ma delicata: verso quale host ha senso
# configurare SSH. La chiave privata e la password di DSM passano di li',
# quindi un errore di classificazione non e' un fastidio, e' un problema.

# is_local_host <host> -> 0 se e' un indirizzo raggiungibile direttamente e
# ragionevole come destinazione SSH, 1 altrimenti.
is_local_host() {
  case "$1" in
    # Relay QuickConnect: risolve a un server Synology, non al NAS. Una chiave
    # installata li' finirebbe su una macchina di terzi.
    *.quickconnect.to|*.quickconnect.cn|*.quickconnect.*) return 1 ;;

    # Rete locale.
    *.local|localhost|127.*)                              return 0 ;;
    10.*|192.168.*)                                       return 0 ;;
    172.1[6-9].*|172.2[0-9].*|172.3[01].*)                return 0 ;;

    # 100.64.0.0/10: l'intervallo CGNAT che usano Tailscale e le VPN mesh.
    # Un indirizzo qui non e' pubblico: e' un tunnel cifrato e autenticato
    # fra due macchine dell'utente, ed e' anzi il modo migliore di arrivare
    # al NAS da fuori casa, perche' non espone nessuna porta su Internet.
    100.6[4-9].*|100.[7-9][0-9].*|100.1[0-1][0-9].*|100.12[0-7].*) return 0 ;;

    # Nomi MagicDNS di Tailscale.
    *.ts.net)                                             return 0 ;;

    # Un nome senza punti ("nas", "diskstation") si risolve solo in LAN,
    # via mDNS o /etc/hosts: e' locale per costruzione.
    *.*|*:*)                                              return 1 ;;
    ?*)                                                   return 0 ;;

    *)                                                    return 1 ;;
  esac
}
