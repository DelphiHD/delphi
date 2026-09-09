/**
 * Where this process may write.
 *
 * The operator scripts keep caches under `.cache` next to the code, which is
 * right on Kaycee's Mac and impossible on a server: a deployed function gets a
 * read-only filesystem with one writable corner, and a plain mkdir there throws
 * ENOENT. The first chart made through the website died that way twice in a row,
 * on `.cache/fonts` and then on `.cache/charts`.
 *
 * So: `.cache` when `.cache` can be written, a scratch directory when it cannot,
 * and callers that only wanted to leave a note carry on either way.
 */

import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let resolved: string | null = null;

/** The cache root, made if it can be. */
export function cacheRoot(): string {
  if (resolved) return resolved;
  try {
    mkdirSync(".cache", { recursive: true });
    resolved = ".cache";
  } catch {
    resolved = join(tmpdir(), "delphi-cache");
    try {
      mkdirSync(resolved, { recursive: true });
    } catch {
      // Nowhere at all. Callers use tryMkdir and skip.
    }
  }
  return resolved;
}

/** A directory inside the cache, made if it can be. */
export function cacheDir(...parts: string[]): string {
  const p = join(cacheRoot(), ...parts);
  tryMkdir(p);
  return p;
}

/**
 * Make a directory, and say whether it worked rather than throwing. A cache
 * that cannot be written is a cache miss, not a failure: nothing that only
 * wanted to leave a note should ever cost somebody their chart.
 */
export function tryMkdir(path: string): boolean {
  try {
    mkdirSync(path, { recursive: true });
    return true;
  } catch {
    return false;
  }
}
