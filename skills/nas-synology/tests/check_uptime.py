#!/usr/bin/env python3
"""human_time deve reggere tutte le forme in cui DSM restituisce l'uptime.

Su un DS220+ con DSM 7.3.2 il campo non era un numero di secondi, e l'uptime
usciva come "-": un dato mancante presentato come se non ci fosse.
"""
import sys
import types

source = open(sys.argv[1]).read().replace('if __name__ == "__main__":\n    main()', "")
module = types.ModuleType("nas")
exec(compile(source, "nas", "exec"), module.__dict__)
human_time = module.human_time

casi = [
    (954321, "11g 1h 5m"),          # secondi, interi
    ("954321", "11g 1h 5m"),        # secondi, come stringa
    ("26:47:41", "1g 2h 47m"),      # HH:MM:SS con ore oltre le 24
    ("3:21:44", "0g 3h 21m"),       # HH:MM:SS breve
    ("5 days, 3:21:44", "5g 3h 21m"),  # con i giorni a parole
    (None, "-"),                     # campo assente
    ("boh", "-"),                    # valore incomprensibile
]

errori = [f"  {v!r} -> {human_time(v)!r}, atteso {atteso!r}"
          for v, atteso in casi if human_time(v) != atteso]
if errori:
    print("human_time sbaglia su:", *errori, sep="\n")
    sys.exit(1)
sys.exit(0)
