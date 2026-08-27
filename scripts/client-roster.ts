// Canonical client roster. Single source of truth.
// All client-aware scripts (generate-report.ts, render-planetary-docx.ts,
// export-mandala-pngs.ts) import from here. To add a client: edit ONLY this file.

export interface ClientBrief {
  /** Permanent, never reused, never changed. Assigned once when a person joins
   *  the roster and independent of both name and slug, because both of those
   *  turn out to be mutable: "Paul" became "Paul Hollingshead" and "Sarah"
   *  became "Sarah Gallardo", and each rename orphaned every transit read that
   *  person had. The name is what a client is called; this is what they are. */
  id: string;
  slug: string;
  name: string;
  birthDate: string;   // YYYY-MM-DD
  birthTime: string;   // HH:MM (24h)
  birthPlace: string;  // what the chart prints, and the truth about where they were born
  /** Only when birthPlace is a town the chart provider has never heard of. The
   *  provider's gazetteer stops at fairly large places, so a birth in Salmon,
   *  Idaho has to be looked up as somewhere it knows in the same timezone. The
   *  chart is identical either way, because only the instant matters; this
   *  exists so a small town still prints on the client's own chart instead of
   *  being quietly replaced by the nearest city. */
  lookupPlace?: string;
}

/** The place to ASK the chart provider about, which is not always the place
 *  someone was born. Everything that resolves a timezone or casts a chart goes
 *  through here; everything that shows a person where they were born uses
 *  birthPlace. */
export function placeForLookup(c: ClientBrief): string {
  return c.lookupPlace ?? c.birthPlace;
}

export const CLIENTS: Record<string, ClientBrief> = {
  chris:    { id: "HD-001", slug: "chris",    name: "Chris Kulish",      birthDate: "1988-06-03", birthTime: "11:37", birthPlace: "Johnstown, Pennsylvania, United States" },
  sean:     { id: "HD-002", slug: "sean",     name: "Sean Preetorious",  birthDate: "1985-01-19", birthTime: "23:02", birthPlace: "San Diego, California, United States" },
  meelad:   { id: "HD-003", slug: "meelad",   name: "Meelad Kharazian",  birthDate: "1986-02-09", birthTime: "01:02", birthPlace: "Lodi, California, United States" },
  tennyson: { id: "HD-004", slug: "tennyson", name: "Tennyson",          birthDate: "1993-01-06", birthTime: "07:51", birthPlace: "Orem, Utah, United States" },
  kaycee:   { id: "HD-005", slug: "kaycee",   name: "Kaycee Vandenberg", birthDate: "1983-06-17", birthTime: "06:29", birthPlace: "Ogden, Utah, United States" },
  paul:     { id: "HD-006", slug: "paul",     name: "Paul Hollingshead", birthDate: "1978-11-07", birthTime: "15:10", birthPlace: "Bountiful, Utah, United States" },
  tiff:     { id: "HD-007", slug: "tiff",     name: "Tiff",              birthDate: "1981-12-01", birthTime: "15:05", birthPlace: "Saratoga Springs, New York, United States" },
  michael:  { id: "HD-008", slug: "michael",  name: "Michael",           birthDate: "1958-08-29", birthTime: "07:33", birthPlace: "Gary, Indiana, United States" },
  matt:     { id: "HD-009", slug: "matt",     name: "Matt Hollingshead", birthDate: "1984-04-08", birthTime: "07:15", birthPlace: "Bountiful, Utah, United States" },
  brit:     { id: "HD-010", slug: "brit",     name: "Brit",              birthDate: "1988-03-21", birthTime: "13:27", birthPlace: "Payson, Utah, United States" },
  jason:    { id: "HD-011", slug: "jason",    name: "Jason",             birthDate: "1981-09-11", birthTime: "16:51", birthPlace: "Lodi, California, United States" },
  sarah:    { id: "HD-012", slug: "sarah",    name: "Sarah Marie",       birthDate: "1986-05-13", birthTime: "09:20", birthPlace: "Murray, Utah, United States" },
  rob:      { id: "HD-013", slug: "rob",      name: "Rob Morris",        birthDate: "1975-01-18", birthTime: "09:43", birthPlace: "Nampa, Idaho, United States" },
  ether:    { id: "HD-014", slug: "ether",    name: "Ether",             birthDate: "1991-06-27", birthTime: "19:32", birthPlace: "Salt Lake City, Utah, United States" },
  alison:   { id: "HD-015", slug: "alison",   name: "Alison",            birthDate: "1990-12-24", birthTime: "18:01", birthPlace: "Salt Lake City, Utah, United States" },
  max:      { id: "HD-016", slug: "max",      name: "Max Jones",         birthDate: "1987-07-29", birthTime: "20:30", birthPlace: "Bountiful, Utah, United States" },
  erlene:   { id: "HD-017", slug: "erlene",   name: "Erlene Goodin",     birthDate: "1958-05-15", birthTime: "15:52", birthPlace: "Logan, Utah, United States" },
  joe:      { id: "HD-018", slug: "joe",      name: "Joe Goodin",        birthDate: "1955-01-17", birthTime: "12:30", birthPlace: "Ogden, Utah, United States" },
  russell:  { id: "HD-019", slug: "russell",  name: "Russell Goodin",    birthDate: "1982-04-11", birthTime: "11:30", birthPlace: "Ogden, Utah, United States" },
  talia:    { id: "HD-020", slug: "talia",    name: "Talia Quartuccio",  birthDate: "1986-04-07", birthTime: "20:06", birthPlace: "Ogden, Utah, United States" },
  parker:   { id: "HD-021", slug: "parker",   name: "Parker Goodin",     birthDate: "1989-08-11", birthTime: "16:30", birthPlace: "Ogden, Utah, United States" },
  austin:   { id: "HD-022", slug: "austin",   name: "Austin Vandenberg", birthDate: "2007-09-04", birthTime: "14:30", birthPlace: "Ogden, Utah, United States" },
  waylon:   { id: "HD-023", slug: "waylon",   name: "Waylon Vandenberg", birthDate: "2009-12-29", birthTime: "07:35", birthPlace: "Ogden, Utah, United States" },
  annie:    { id: "HD-024", slug: "annie",    name: "Annie Hollingshead", birthDate: "2009-08-04", birthTime: "21:43", birthPlace: "American Fork, Utah, United States" },
  izzy:     { id: "HD-025", slug: "izzy",     name: "Izzy Hollingshead",  birthDate: "2013-02-02", birthTime: "06:23", birthPlace: "Orem, Utah, United States" },
  jack:     { id: "HD-026", slug: "jack",     name: "Jack Hollingshead",  birthDate: "2007-03-21", birthTime: "20:32", birthPlace: "American Fork, Utah, United States" },
  bryan:    { id: "HD-027", slug: "bryan",    name: "Bryan Rodabough",    birthDate: "1986-08-01", birthTime: "10:41", birthPlace: "Bountiful, Utah, United States" },
  sarahco:  { id: "HD-028", slug: "sarahco",  name: "Sarah Gallardo",     birthDate: "1981-10-28", birthTime: "10:51", birthPlace: "Colorado Springs, Colorado, United States" },
  lance:    { id: "HD-029", slug: "lance", name: "Lance Wall", birthDate: "1980-06-13", birthTime: "03:54", birthPlace: "Salt Lake City, Utah, United States" },
  daniela:  { id: "HD-030", slug: "daniela", name: "Daniela Montoya", birthDate: "1990-01-30", birthTime: "06:30", birthPlace: "Bogota, Colombia" },
  david:    { id: "HD-031", slug: "david", name: "David Whiting", birthDate: "1983-06-15", birthTime: "15:45", birthPlace: "Salmon, Idaho, United States", lookupPlace: "Idaho Falls, Idaho, United States" },
  patrick:  { id: "HD-032", slug: "patrick", name: "Patrick Johns", birthDate: "1984-03-17", birthTime: "11:00", birthPlace: "Ann Arbor, Michigan, United States" },
  joseph:   { id: "HD-034", slug: "joseph", name: "Joseph Jaxin Vandenberg", birthDate: "2002-07-04", birthTime: "10:44", birthPlace: "Ogden, Utah, United States" },
  tori:     { id: "HD-033", slug: "tori", name: "Tori Tarver", birthDate: "1987-12-06", birthTime: "17:30", birthPlace: "Landstuhl (Rheinland-Pfalz), Germany" },
};

/** Resolve a slug to a ClientBrief or exit with usage. */
export function clientFromSlug(slug: string | undefined): ClientBrief {
  if (!slug || !CLIENTS[slug]) {
    console.error(`unknown client slug: ${slug}`);
    console.error(`available slugs: ${Object.keys(CLIENTS).join(", ")}`);
    process.exit(1);
  }
  return CLIENTS[slug];
}

/**
 * Canonical output directory for a client's deliverables.
 * All client subfolders live under ~/Desktop/HD Reports/Paid HD Reports/<Name>/
 * (Kaycee's convention). All render + export scripts should call this so .md,
 * .docx, and PNGs sit together in the same folder.
 */
export function clientOutputDir(client: ClientBrief): string {
  return `/Users/dorothygale/Desktop/HD Reports/Paid HD Reports/${client.name}`;
}
