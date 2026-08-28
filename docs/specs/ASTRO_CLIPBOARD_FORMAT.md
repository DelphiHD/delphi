# Copy-to-clipboard astrology text

Kaycee's target (2026-08-28), chart2txt.com natal format. Her example is the
spec; match it exactly. Note `house_system: E` — **Equal houses**, not the
Placidus the first probe used.

## What the astrology endpoint gives us directly

- Angles: Ascendant and Midheaven
- House cusps, all twelve (pass `house_system=E`)
- Planets: sign, degree, minute, and which house
- Element and modality per planet, so both distributions are a tally
- Aspects with their orbs, so the tight / moderate / wide banding is a sort

## What we compute ourselves, from standard tables

- **Rulership** `[Ruler: Saturn]` — the ruler of the sign the planet sits in
- **Dignity** `[Domicile]`, `[Fall]` — domicile, exaltation, detriment, fall
- **Dispositor tree** — follow each planet to its sign ruler until it reaches a
  planet in its own sign (final) or returns to one already visited (cycle)
- **Polarity** — fire and air masculine, earth and water feminine
- **Aspect patterns** — T-squares, grand trines and stelliums fall out of the
  aspect list and the sign positions

## What the endpoint does NOT provide

Two fields in the example need planetary speed, which the response has no field
for (probed 2026-08-27: no `retrograde`, no velocity):

- **Retrograde** `Mars: 18°11' Cancer Retrograde`
- **Applying / separating** `Mars opposition Uranus: 0.2° (applying)`

Both are obtainable with **one extra call** to the same endpoint at birth plus
24 hours: a planet whose longitude decreases is retrograde, and an aspect whose
orb is closing is applying. That is derivation from two real measurements rather
than a guess, and it costs one more chart call, which the subscription covers.

**Flag to Kaycee before relying on it.** Anything marked applying or separating
would be computed by us, not reported by the provider, so if it ever disagrees
with her own software the arithmetic here is the thing to check first.

## The target

```
[METADATA]
chart_type: natal
house_system: E
date_format: MM/DD/YYYY

[CHART: Tennyson]
[BIRTHDATA] Orem, Utah | 01/06/1993 | 07:51:00 AM
[ANGLES]
Ascendant: 15°19' Capricorn
Midheaven: 9°39' Scorpio
[HOUSE CUSPS]
1st house: 15°19' Capricorn  7th house: 15°19' Cancer
...
[PLANETS]
Sun: 16°18' Capricorn [Ruler: Saturn], 1st house
Mars: 18°11' Cancer Retrograde [Fall | Ruler: Moon], 7th house
Saturn: 16°57' Aquarius [Domicile], 2nd house
[DISPOSITOR TREE]
Sun → Saturn → (final)
Venus → Jupiter → Venus (cycle)
[ELEMENT DISTRIBUTION]
Fire: 1 (North Node) | Earth: 5 (...) | Air: 3 (...) | Water: 3 (...)
[MODALITY DISTRIBUTION]
Cardinal: 6 | Fixed: 3 | Mutable: 3
[POLARITY]
Masculine: 4 | Feminine: 8
[ASPECTS]
[TIGHT ASPECTS: orb 0.0-2.0°]
Mars opposition Uranus: 0.2° (applying)
[MODERATE ASPECTS: orb 2.0-4.0°]
[WIDE ASPECTS: orb 4.0-7.0°]
[ASPECT PATTERNS]
No T-Squares detected.
Stellium (12.4°): Sun, Mercury, Uranus, Neptune in Capricorn (1st House-12th House)
```

Note the Ascendant counts in the element and polarity tallies (Kaycee's example
lists it under Earth), and the distributions therefore total 12, not 11.
