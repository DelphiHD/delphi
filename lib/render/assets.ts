// Brand asset loader for the docx renderer.
//
// Files live at `~/Desktop/Delphi Brand Assets/` so Kaycee can manage them
// from Finder without touching the repo. The loader returns Buffers when a
// file exists and undefined when it doesn't — the renderer falls back to
// styled-text alternatives in the undefined case. Partial coverage is
// supported and intended: drop one image now, fill in the rest later.
//
// Override the asset root with DELPHI_ASSETS_DIR env var (useful for tests
// or when the operator wants to keep assets elsewhere).

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

export function assetRoot(): string {
  return process.env.DELPHI_ASSETS_DIR
    ?? resolve(homedir(), "Desktop", "Delphi Brand Assets");
}

// Read a file relative to the asset root. Returns undefined when the file
// is missing or unreadable so callers can degrade gracefully without
// branching on existence checks themselves.
export function readAsset(relPath: string): Buffer | undefined {
  const full = resolve(assetRoot(), relPath);
  try {
    if (!existsSync(full)) return undefined;
    if (!statSync(full).isFile()) return undefined;
    return readFileSync(full);
  } catch {
    return undefined;
  }
}

// Brand logos. Tries several filename / location variants so Kaycee can
// drop the files in either the brand/ subfolder OR the assets root, with
// any of the common name spellings. First file found wins.
function firstExisting(candidates: string[]): Buffer | undefined {
  for (const c of candidates) {
    const buf = readAsset(c);
    if (buf) return buf;
  }
  return undefined;
}

export const brandAssets = {
  delphiLogo:  () => firstExisting([
    "brand/Delphi.png",            // current canonical (5/26)
    "brand/delphi.png",
    "brand/delphi-logo.png",
    "brand/Delphi Logo.png",
    "brand/DelphiLogo.png",
    "Delphi.png",
    "Delphi Logo.png",
    "delphi-logo.png",
    "DelphiLogo.png",
  ]),
  knowThyself: () => firstExisting([
    "brand/know-thyself.png",
    "brand/knowthyself.png",
    "brand/Know Thyself.png",
    "knowthyself.png",
    "know-thyself.png",
    "Know Thyself.png",
  ]),
};

// Section images. The HD center names use spaces ("Solar Plexus") in
// Kaycee's vocabulary; the filename convention is lowercase with hyphens.
// The G-center is just "g.png".
const CENTER_SLUG: Record<string, string> = {
  "head": "head",
  "ajna": "ajna",
  "throat": "throat",
  "g": "g",
  "g center": "g",
  "heart": "heart",
  "ego": "heart",
  "will": "heart",
  "solar plexus": "solar-plexus",
  "sacral": "sacral",
  "spleen": "spleen",
  "splenic": "spleen",
  "root": "root",
};

export function centerImage(centerLabel: string): Buffer | undefined {
  // The H3 label can be any of:
  //   "Throat"
  //   "Throat | Manifestation and Communication | Defined"
  //   "G (Identity) | Direction, Love, and Identity | Defined"
  //   "Heart (Ego, Will) | Willpower and Self-Worth | Defined"
  // Strip the trailing pipe-segments AND any parenthetical alias before
  // slug-lookup. Matt's report exposed the parenthetical case (the model
  // tacks "(Identity)" and "(Ego, Will)" onto G and Heart respectively).
  const head = centerLabel.split("|")[0]
    .replace(/\(.*?\)/g, "")
    .trim()
    .toLowerCase();
  const slug = CENTER_SLUG[head];
  if (!slug) return undefined;
  // Kaycee's asset files mix capitalization (`G.png`, `Throat.png`,
  // `Solar-Plexus.png`, `spleen.png`). Try several common casings.
  const capitalized = slug.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("-");
  const candidates = [
    `sections/centers/${slug}.png`,
    `sections/centers/${capitalized}.png`,
    `sections/centers/${slug.toUpperCase()}.png`,
  ];
  return firstExisting(candidates);
}

// Channel images. The H2 header looks like "(21-45) The Channel of Money".
// We extract the gate pair and try BOTH ordering conventions — Kaycee's
// stock files use whichever ordering Ra named the channel by, which is
// sometimes hi-lo (e.g., "34-10", "57-20"), sometimes lo-hi (e.g., "1-8",
// "21-45"). Trying both makes the lookup robust to either convention.
export function channelImage(channelLabel: string): Buffer | undefined {
  const match = channelLabel.match(/\((\d+)\s*-\s*(\d+)\)/);
  if (!match) return undefined;
  const a = parseInt(match[1], 10);
  const b = parseInt(match[2], 10);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return readAsset(`sections/channels/${lo}-${hi}.png`)
      ?? readAsset(`sections/channels/${hi}-${lo}.png`)
      // Also try the exact order from the H2 in case neither matches the
      // sorted version (rare but possible if naming is irregular).
      ?? readAsset(`sections/channels/${a}-${b}.png`);
}
