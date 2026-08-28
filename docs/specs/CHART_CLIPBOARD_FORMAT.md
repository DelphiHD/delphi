# Copy-to-clipboard chart text

The "Copy chart data" button on a client chart produces plain text in the
**chart2txt.com** format. Kaycee supplied this example (2026-08-28) as the
target; match it exactly, including section names in square brackets, the
pipe separators, the arrows in [CHANNELS], and the two-column pairing of
Sun/Earth and the Nodes in the activation blocks.

It carries chart data only. No report prose, no interpretation.

```
[METADATA]
chart_type: human_design

[CHART: Tennyson]
[BIRTHDATA] Orem, Utah | 1993-01-06 | 07:51:00

[TYPE]
Type: Manifestor
Strategy: Inform Before Acting
Authority: Emotional (Solar Plexus)
Definition: Split Definition
Definition Islands: [Throat+Ego] + [Solar Plexus+Spleen+Root]
Profile: 2/4 (Hermit/Opportunist)
Incarnation Cross: Right Angle Cross of Penetration (54/53 | 57/51)

[CENTERS]
Defined: Throat, Ego, Solar Plexus, Spleen, Root
Undefined: Ajna, G Center, Sacral
Open: Head

[CHANNELS]
21-45 (Money): Ego ↔ Throat
28-38 (Struggle): Spleen ↔ Root
39-55 (Emoting): Solar Plexus ↔ Root

[HANGING GATES]
(Gates not part of a complete channel)
11: Ideas | Ajna
12: Caution | Throat

[GATES]
11: Ideas | Ajna (Design)
54: Ambition | Root (Both)

[PERSONALITY ACTIVATIONS]
Sun: 54.2    Earth: 53.2
Moon: 45.5
North Node: 26.5    South Node: 45.5
Mercury: 58.3    Venus: 55.3    Mars: 53.4
Jupiter: 48.5    Saturn: 13.4
Uranus: 54.4    Neptune: 54.4    Pluto: 14.1

[DESIGN ACTIVATIONS]
Sun: 57.4    Earth: 51.4
Moon: 21.5
North Node: 11.2    South Node: 12.2
Mercury: 28.5    Venus: 43.2    Mars: 39.6
Jupiter: 46.3    Saturn: 19.5
Uranus: 38.6    Neptune: 54.2    Pluto: 43.3
```

## Notes on the fields

- **BIRTHDATA** uses the place as it prints on the chart, not the lookup place.
- **Definition Islands** are the connected groups of defined centres, which the
  chart already computes for the split reading. Joined with `+` inside brackets,
  islands separated by ` + `.
- **CENTERS** uses the three-state model: defined, undefined (not defined but
  carrying an activated gate), open (no activations at all).
- **GATES** marks each gate Personality, Design, or Both.
- **HANGING GATES** are gates that do not complete a channel, and repeat in the
  [GATES] block.
- Centre naming follows this example: "Ego", "G Center", "Solar Plexus".
