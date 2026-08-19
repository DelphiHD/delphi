// Canonical client roster. Single source of truth.
// All client-aware scripts (generate-report.ts, render-planetary-docx.ts,
// export-mandala-pngs.ts) import from here. To add a client: edit ONLY this file.

export interface ClientBrief {
  slug: string;
  name: string;
  birthDate: string;   // YYYY-MM-DD
  birthTime: string;   // HH:MM (24h)
  birthPlace: string;  // free-form, must resolve via mybodygraph /locations
}

export const CLIENTS: Record<string, ClientBrief> = {
  chris:    { slug: "chris",    name: "Chris Kulish",      birthDate: "1988-06-03", birthTime: "11:37", birthPlace: "Johnstown, Pennsylvania, United States" },
  sean:     { slug: "sean",     name: "Sean Preetorious",  birthDate: "1985-01-19", birthTime: "23:02", birthPlace: "San Diego, California, United States" },
  meelad:   { slug: "meelad",   name: "Meelad Kharazian",  birthDate: "1986-02-09", birthTime: "01:02", birthPlace: "Lodi, California, United States" },
  tennyson: { slug: "tennyson", name: "Tennyson",          birthDate: "1993-01-06", birthTime: "07:51", birthPlace: "Orem, Utah, United States" },
  kaycee:   { slug: "kaycee",   name: "Kaycee Vandenberg", birthDate: "1983-06-17", birthTime: "06:29", birthPlace: "Ogden, Utah, United States" },
  paul:     { slug: "paul",     name: "Paul",              birthDate: "1978-11-07", birthTime: "15:10", birthPlace: "Bountiful, Utah, United States" },
  tiff:     { slug: "tiff",     name: "Tiff",              birthDate: "1981-12-01", birthTime: "15:05", birthPlace: "Saratoga Springs, New York, United States" },
  michael:  { slug: "michael",  name: "Michael",           birthDate: "1958-08-29", birthTime: "07:33", birthPlace: "Gary, Indiana, United States" },
  matt:     { slug: "matt",     name: "Matt Hollingshead", birthDate: "1984-04-08", birthTime: "07:15", birthPlace: "Bountiful, Utah, United States" },
  brit:     { slug: "brit",     name: "Brit",              birthDate: "1988-03-21", birthTime: "13:27", birthPlace: "Payson, Utah, United States" },
  jason:    { slug: "jason",    name: "Jason",             birthDate: "1981-09-11", birthTime: "16:51", birthPlace: "Lodi, California, United States" },
  sarah:    { slug: "sarah",    name: "Sarah Marie",       birthDate: "1986-05-13", birthTime: "09:20", birthPlace: "Murray, Utah, United States" },
  rob:      { slug: "rob",      name: "Rob Morris",        birthDate: "1975-01-18", birthTime: "09:43", birthPlace: "Nampa, Idaho, United States" },
  ether:    { slug: "ether",    name: "Ether",             birthDate: "1991-06-27", birthTime: "19:32", birthPlace: "Salt Lake City, Utah, United States" },
  alison:   { slug: "alison",   name: "Alison",            birthDate: "1990-12-24", birthTime: "18:01", birthPlace: "Salt Lake City, Utah, United States" },
  max:      { slug: "max",      name: "Max Jones",         birthDate: "1987-07-29", birthTime: "20:30", birthPlace: "Bountiful, Utah, United States" },
  erlene:   { slug: "erlene",   name: "Erlene Goodin",     birthDate: "1958-05-15", birthTime: "15:52", birthPlace: "Logan, Utah, United States" },
  joe:      { slug: "joe",      name: "Joe Goodin",        birthDate: "1955-01-17", birthTime: "12:30", birthPlace: "Ogden, Utah, United States" },
  russell:  { slug: "russell",  name: "Russell Goodin",    birthDate: "1982-04-11", birthTime: "11:30", birthPlace: "Ogden, Utah, United States" },
  talia:    { slug: "talia",    name: "Talia Quartuccio",  birthDate: "1986-04-07", birthTime: "20:06", birthPlace: "Ogden, Utah, United States" },
  parker:   { slug: "parker",   name: "Parker Goodin",     birthDate: "1989-08-11", birthTime: "16:30", birthPlace: "Ogden, Utah, United States" },
  austin:   { slug: "austin",   name: "Austin Vandenberg", birthDate: "2007-09-04", birthTime: "14:30", birthPlace: "Ogden, Utah, United States" },
  waylon:   { slug: "waylon",   name: "Waylon Vandenberg", birthDate: "2009-12-29", birthTime: "07:35", birthPlace: "Ogden, Utah, United States" },
  annie:    { slug: "annie",    name: "Annie Hollingshead", birthDate: "2009-08-04", birthTime: "21:43", birthPlace: "American Fork, Utah, United States" },
  izzy:     { slug: "izzy",     name: "Izzy Hollingshead",  birthDate: "2013-02-02", birthTime: "06:23", birthPlace: "Orem, Utah, United States" },
  jack:     { slug: "jack",     name: "Jack Hollingshead",  birthDate: "2007-03-21", birthTime: "20:32", birthPlace: "American Fork, Utah, United States" },
  bryan:    { slug: "bryan",    name: "Bryan Rodabough",    birthDate: "1986-08-01", birthTime: "10:41", birthPlace: "Bountiful, Utah, United States" },
  sarahco:  { slug: "sarahco",  name: "Sarah",              birthDate: "1981-10-28", birthTime: "10:51", birthPlace: "Colorado Springs, Colorado, United States" },
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
