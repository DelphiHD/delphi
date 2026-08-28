/**
 * The twelve houses, in Kaycee's words (2026-08-27).
 *
 * Her copy, verbatim, including the split between the personal houses and the
 * interpersonal and collective ones. The astrology endpoint returns its own
 * house text; this is used instead, for the same reason the sign copy is hers:
 * the reports and the chart speak in her voice, not the vendor's.
 */

export interface HouseNote {
  /** 1..12 */
  number: number;
  /** "First House" */
  name: string;
  /** "Personal" | "Interpersonal and collective" */
  group: string;
  /** what the house covers */
  blurb: string;
}

export const HOUSE_GROUPS: Record<string, string> = {
  Personal: "The where of planetary energy, close to home: houses 1 to 6.",
  "Interpersonal and collective":
    "The where of planetary energy out in the world: houses 7 to 12.",
};

const P = "Personal";
const C = "Interpersonal and collective";

export const HOUSES: HouseNote[] = [
  { number: 1, name: "First House", group: P,
    blurb: "Self-image, physical appearance, first impressions, and your rising sign (Ascendant)." },
  { number: 2, name: "Second House", group: P,
    blurb: "Personal money, material assets, values, and sense of self-worth." },
  { number: 3, name: "Third House", group: P,
    blurb: "Communication, local community, daily routines, siblings, and short trips." },
  { number: 4, name: "Fourth House", group: P,
    blurb: "Home, family roots, parents or primary caregivers, and private foundation." },
  { number: 5, name: "Fifth House", group: P,
    blurb: "Creativity, romance, self-expression, children, and leisure or play." },
  { number: 6, name: "Sixth House", group: P,
    blurb: "Daily work, health habits, wellness routines, and pets." },
  { number: 7, name: "Seventh House", group: C,
    blurb: "One-on-one partnerships, marriage, business contracts, and open enemies." },
  { number: 8, name: "Eighth House", group: C,
    blurb: "Shared resources, intimacy, taxes, debts, transformation, and deep psychological cycles." },
  { number: 9, name: "Ninth House", group: C,
    blurb: "Higher education, philosophy, long-distance travel, and spiritual expansion." },
  { number: 10, name: "Tenth House", group: C,
    blurb: "Career, public reputation, social status, and professional ambitions (Midheaven)." },
  { number: 11, name: "Eleventh House", group: C,
    blurb: "Friendships, group networks, community involvement, and long-term goals." },
  { number: 12, name: "Twelfth House", group: C,
    blurb: "The subconscious, hidden matters, privacy, isolation, and spiritual surrender." },
];

/** "The 12 houses of astrology are the distinct sectors of a birth chart that
 *  represent the 'where' of planetary energy, dividing the wheel into different
 *  areas of life from self-identity to collective society." — Kaycee */
export const HOUSES_INTRO =
  "The twelve houses are the distinct sectors of a birth chart. They represent " +
  "the where of planetary energy, dividing the wheel into different areas of " +
  "life, from self-identity to collective society.";
