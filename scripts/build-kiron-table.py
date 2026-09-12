#!/usr/bin/env python3
"""
Generate the Kiron ephemeris table, once, so no chart ever has to ask for it.

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

START = datetime(1900, 1, 1, tzinfo=timezone.utc)
END = datetime(2130, 1, 1, tzinfo=timezone.utc)
STEP_DAYS = 5
SCALE = 100000  # longitude to five decimal places, as an integer

def julian(dt):
    return swe.julday(dt.year, dt.month, dt.day,
                      dt.hour + dt.minute / 60 + dt.second / 3600)

def main():
    values = []
    t = START
    while t < END:
        lon = swe.calc_ut(julian(t), swe.CHIRON, swe.FLG_SWIEPH)[0][0]
        values.append(round(lon * SCALE))
        t += timedelta(days=STEP_DAYS)

    # Stored as differences, which are small and regular, so the file gzips to
    # a fraction of what the raw longitudes would.
    deltas = [values[0]]
    for i in range(1, len(values)):
        deltas.append(values[i] - values[i - 1])

    out = {
        "what": "Kiron's ecliptic longitude, from Swiss Ephemeris, every 5 days.",
        "why": "So a chart can find the Kiron return without asking anyone. See lib/hd/kiron.ts.",
        "generatedBy": "scripts/build-kiron-table.py",
        "start": START.isoformat().replace("+00:00", "Z"),
        "stepDays": STEP_DAYS,
        "scale": SCALE,
        "count": len(values),
        "deltas": deltas,
    }
    path = "lib/hd/kiron-table.json"
    with open(path, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    size = os.path.getsize(path)
    print(f"{len(values)} samples, {START.date()} to {END.date()}, {size/1024:.0f} KB at {path}")

if __name__ == "__main__":
    main()
