#!/usr/bin/env python3
"""
Compute exact planetary return dates from a birth UTC datetime.

For Saturn, Chiron, and the 2nd Saturn return: a "return" is when the planet's
ecliptic longitude crosses the natal longitude. Because each of these planets
spends some time retrograde, the crossing happens THREE times (direct pass,
retrograde back, final direct pass) over 12-18 months. We compute all three.

For Uranus: at the Opposition (~age 42), Uranus is 180 degrees from its natal
position. Same three-pass structure applies.

Usage:
    python3 scripts/compute-returns.py <birth-utc-iso>
    e.g. python3 scripts/compute-returns.py 1993-01-06T14:51:00Z

Outputs JSON to stdout:
    {
      "saturn_return": {
        "passes": ["YYYY-MM-DD", "YYYY-MM-DD", "YYYY-MM-DD"],
        "window_start": "YYYY-MM-DD",
        "window_end": "YYYY-MM-DD",
        "midpoint": "YYYY-MM-DD"
      },
      "uranus_opposition": { ... },
      "chiron_return":     { ... },
      "second_saturn_return": { ... }
    }
"""

import sys
import json
import os
from datetime import datetime, timezone, timedelta

import swisseph as swe

# Point swisseph at the bundled ephemeris files. We ship the 1800-2399 block
# (~2 MB total) covering the date range that any modern HD client could fall
# into. Files live in ~/.cache/swisseph/ where setup-once downloaded them.
_EPH_PATH = os.environ.get("SWE_EPH_PATH") or os.path.expanduser("~/.cache/swisseph")
if os.path.isdir(_EPH_PATH):
    swe.set_ephe_path(_EPH_PATH)

# Planet codes for swisseph.
SATURN = swe.SATURN
URANUS = swe.URANUS
CHIRON = swe.CHIRON

# Approximate age windows for each return. Each is generous enough to catch
# the full 12-18 month retrograde dance (3 passes) even when the dance straddles
# the natural age boundary. Chiron in particular has an irregular orbit and
# can return anywhere from ~48 to ~52.
SEARCH_WINDOWS = {
    "saturn_return":        (27.5,  32.0,  SATURN, "return"),
    "uranus_opposition":    (38.0,  47.0,  URANUS, "opposition"),
    "chiron_return":        (46.0,  55.0,  CHIRON, "return"),
    "second_saturn_return": (56.5,  61.5,  SATURN, "return"),
}


def julday_utc(dt: datetime) -> float:
    """Julian day from a UTC datetime."""
    hours = dt.hour + dt.minute / 60.0 + dt.second / 3600.0
    return swe.julday(dt.year, dt.month, dt.day, hours)


def jd_to_iso_date(jd: float) -> str:
    """Julian day -> 'YYYY-MM-DD' (UTC)."""
    y, m, d, h = swe.revjul(jd)
    if h >= 24:
        h -= 24
        d += 1
    return f"{y:04d}-{m:02d}-{d:02d}"


def jd_to_iso_datetime(jd: float) -> str:
    """Julian day -> 'YYYY-MM-DDTHH:MM:SSZ' (UTC). Matches Maia Mechanics display."""
    y, m, d, h = swe.revjul(jd)
    if h >= 24:
        h -= 24
        d += 1
    hh = int(h)
    mm_f = (h - hh) * 60
    mm = int(mm_f)
    ss = int((mm_f - mm) * 60)
    return f"{y:04d}-{m:02d}-{d:02d}T{hh:02d}:{mm:02d}:{ss:02d}Z"


def lon_diff_signed(target: float, lon: float) -> float:
    """Signed difference (target - lon) wrapped to [-180, 180]."""
    d = (target - lon) % 360.0
    if d > 180.0:
        d -= 360.0
    return d


def lon_at(jd: float, planet: int) -> float:
    """Ecliptic longitude (degrees) of `planet` at Julian day `jd`."""
    pos, _ret = swe.calc_ut(jd, planet, swe.FLG_SWIEPH | swe.FLG_SPEED)
    return pos[0]


def find_crossings(
    natal_lon: float,
    planet: int,
    jd_start: float,
    jd_end: float,
    aspect: str,
    step_days: float = 1.0,
) -> list[float]:
    """
    Walk forward from jd_start in `step_days` increments. Whenever the signed
    distance from the target longitude flips sign, refine by bisection to find
    the exact crossing time. `aspect` is "return" (0 degrees from natal) or
    "opposition" (180 degrees from natal).
    """
    target = natal_lon if aspect == "return" else (natal_lon + 180.0) % 360.0

    crossings: list[float] = []
    prev_jd = jd_start
    prev_d = lon_diff_signed(target, lon_at(prev_jd, planet))

    jd = jd_start + step_days
    while jd <= jd_end:
        cur_d = lon_diff_signed(target, lon_at(jd, planet))
        # Sign flip indicates a crossing (or the jump from +179 to -179, but
        # the planets we care about move slowly enough that step_days=1 won't
        # span 358 degrees).
        if prev_d == 0 or cur_d == 0 or (prev_d * cur_d < 0 and abs(prev_d - cur_d) < 90):
            # Bisect between prev_jd and jd.
            lo, hi = prev_jd, jd
            lo_d, hi_d = prev_d, cur_d
            for _ in range(40):  # ~1 second precision
                mid = (lo + hi) / 2.0
                mid_d = lon_diff_signed(target, lon_at(mid, planet))
                if mid_d == 0:
                    lo = hi = mid
                    break
                if (lo_d * mid_d) < 0:
                    hi, hi_d = mid, mid_d
                else:
                    lo, lo_d = mid, mid_d
            crossings.append((lo + hi) / 2.0)
        prev_jd, prev_d = jd, cur_d
        jd += step_days

    # Dedup very-close crossings (within a day) which can happen at extrema.
    deduped = []
    for c in crossings:
        if not deduped or abs(c - deduped[-1]) > 1.0:
            deduped.append(c)
    return deduped


def compute(birth_utc_iso: str, now_utc_iso: str | None = None) -> dict:
    s = birth_utc_iso.replace("Z", "+00:00")
    birth_dt = datetime.fromisoformat(s).astimezone(timezone.utc)
    birth_jd = julday_utc(birth_dt)

    # Reference "now" for Passed/Upcoming status. Defaults to today.
    if now_utc_iso:
        now_dt = datetime.fromisoformat(now_utc_iso.replace("Z", "+00:00")).astimezone(timezone.utc)
    else:
        now_dt = datetime.now(timezone.utc)
    now_jd = julday_utc(now_dt)

    result = {}
    for name, (age_lo, age_hi, planet, aspect) in SEARCH_WINDOWS.items():
        natal_lon = lon_at(birth_jd, planet)
        jd_lo = birth_jd + age_lo * 365.25
        jd_hi = birth_jd + age_hi * 365.25
        crossings = find_crossings(natal_lon, planet, jd_lo, jd_hi, aspect)

        if not crossings:
            result[name] = {
                "first_pass":  None,
                "first_pass_datetime": None,
                "all_passes":  [],
                "status":      "unknown",
                "window_end":  None,
                "note":        "no crossing found in search window",
            }
            continue

        first_pass_jd = crossings[0]
        last_pass_jd  = crossings[-1]

        # Status: Passed if every pass is before now; Current if now sits inside
        # the [first_pass, last_pass + 90 days] window (Saturn's integration
        # period bleeds beyond the last exact crossing); Upcoming otherwise.
        integration_buffer_days = 90.0
        if last_pass_jd + integration_buffer_days < now_jd:
            status = "Passed"
        elif first_pass_jd <= now_jd <= last_pass_jd + integration_buffer_days:
            status = "Current"
        else:
            status = "Upcoming"

        result[name] = {
            "first_pass":          jd_to_iso_date(first_pass_jd),
            "first_pass_datetime": jd_to_iso_datetime(first_pass_jd),
            "all_passes":          [jd_to_iso_date(c) for c in crossings],
            "all_passes_datetime": [jd_to_iso_datetime(c) for c in crossings],
            "status":              status,
            "window_end":          jd_to_iso_date(last_pass_jd),
        }

    return result


def main():
    if len(sys.argv) < 2 or len(sys.argv) > 3:
        print("usage: compute-returns.py <birth-utc-iso> [now-utc-iso]", file=sys.stderr)
        sys.exit(1)
    now = sys.argv[2] if len(sys.argv) == 3 else None
    print(json.dumps(compute(sys.argv[1], now), indent=2))


if __name__ == "__main__":
    main()
