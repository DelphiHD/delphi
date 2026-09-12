#!/usr/bin/env python3
"""
Generate the slow-body ephemeris table, once, so no chart ever has to ask.

Kiron is the one body the runtime ephemeris does not know, and its return is
the marker that matters most for 6-line beings. Asking bodygraph.com where it
is costs about sixty five calls to find one return date, per chart, for
information that is identical for everybody. Kaycee, 2026-09-12: "I don't want
to have to make that many calls per chart, that's silly."

So its position is sampled here, from Swiss Ephemeris, and shipped as data. The
runtime interpolates between samples and finds crossings the same way it does
for Saturn and Uranus: locally, exactly, and for nothing.

Five day steps. Kiron moves at most about two hundredths of a degree a day, so
five days is a tenth of a degree between samples and Catmull-Rom through four
of them is far finer than the tone the scan reports to.

Run: python3 scripts/build-kiron-table.py
"""

import json
import os
from datetime import datetime, timezone, timedelta

import swisseph as swe

_EPH = os.environ.get("SWE_EPH_PATH") or os.path.expanduser("~/.cache/swisseph")
if os.path.isdir(_EPH):
    swe.set_ephe_path(_EPH)

BODIES = {
    "Chiron": swe.CHIRON,
    "Saturn": swe.SATURN,
    "Uranus": swe.URANUS,
}

START = datetime(1900, 1, 1, tzinfo=timezone.utc)
END = datetime(2130, 1, 1, tzinfo=timezone.utc)
STEP_DAYS = 1
SCALE = 100000  # longitude to five decimal places, as an integer

def julian(dt):
    return swe.julday(dt.year, dt.month, dt.day,
                      dt.hour + dt.minute / 60 + dt.second / 3600)

def main():
    out = {
        "what": "Ecliptic longitude from Swiss Ephemeris, every 5 days, for the bodies whose returns a chart reports.",
        "why": "So a return date and its exact moment can be found without asking anyone. See lib/hd/slow-table.ts.",
        "generatedBy": "scripts/build-kiron-table.py",
        "start": START.isoformat().replace("+00:00", "Z"),
        "stepDays": STEP_DAYS,
        "scale": SCALE,
        "bodies": {},
    }

    for name, code in BODIES.items():
        values = []
        t = START
        while t < END:
            lon = swe.calc_ut(julian(t), code, swe.FLG_SWIEPH)[0][0]
            values.append(round(lon * SCALE))
            t += timedelta(days=STEP_DAYS)
        deltas = [values[0]]
        for i in range(1, len(values)):
            deltas.append(values[i] - values[i - 1])
        out["bodies"][name] = deltas
        out["count"] = len(values)
        print(f"  {name}: {len(values)} samples")

    path = "lib/hd/slow-table.json"
    with open(path, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"{START.date()} to {END.date()}, {os.path.getsize(path)/1024:.0f} KB at {path}")

if __name__ == "__main__":
    main()
