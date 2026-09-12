/**
 * A chart in the database, as something the builder can cast.
 *
 * The builder has only ever been able to draw somebody who was written into
 * scripts/client-roster.ts by hand. The portal needs it to draw a stranger who
 * filled in a form thirty seconds ago, so this turns a row of public.charts into
 * the same brief the roster produces. One builder, two ways in.
 *
 * The timezone travels with the row rather than being resolved again: the
 * provider already answered that question when the chart was created, and its
 * answer is what the chart was cast from. Asking twice invites two answers.
 */

import { createClient } from "@supabase/supabase-js";
import {
  birthFingerprint, fromStored, reliabilityOf, settled, toStored,
  type Reliability, type StoredScan,
} from "@/lib/hd/time-accuracy";

export interface ChartRecord {
  id: string;
  token: string;
  personName: string;
  birthDate: string;
  birthTime: string | null;
  birthPlace: string;
  birthTimezone: string;
  timeAccuracy: "document" | "told" | "approximate" | "unknown";
  tier: "seed" | "free" | "purchased" | "gift";
  visibility: "private" | "shared" | "public";
  ownerId: string | null;
  /** The stored birth time scan, and the birth details it was run against.
   *  Null on an exact time, which is never scanned. */
  timeScan: StoredScan | null;
  timeScanFor: string | null;
}

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase credentials are not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

const shape = (r: Record<string, unknown>): ChartRecord => ({
  id: String(r.id),
  token: String(r.token),
  personName: String(r.person_name),
  birthDate: String(r.birth_date),
  birthTime: (r.birth_time as string | null) ?? null,
  birthPlace: String(r.birth_place),
  birthTimezone: String(r.birth_timezone),
  timeAccuracy: r.time_accuracy as ChartRecord["timeAccuracy"],
  tier: r.tier as ChartRecord["tier"],
  visibility: r.visibility as ChartRecord["visibility"],
  ownerId: (r.owner_id as string | null) ?? null,
  timeScan: (r.time_scan as StoredScan | null) ?? null,
  timeScanFor: (r.time_scan_for as string | null) ?? null,
});

/**
 * What this chart may claim, worked out once and kept.
 *
 * Scanning a window costs about forty calls to bodygraph.com and four seconds.
 * The answer only changes when the birth details change, so it is stored with
 * the details it was run against and thrown away when they stop matching.
 * Kaycee approved keeping it on 2026-09-12.
 *
 * An exact time is never scanned at all, so most rows never touch any of this.
 */
export async function reliabilityForChart(r: ChartRecord): Promise<Reliability> {
  if (r.timeAccuracy === "document" || r.timeAccuracy === "told") {
    return settled(r.timeAccuracy);
  }
  const want = birthFingerprint({
    accuracy: r.timeAccuracy, birthDate: r.birthDate, birthTime: r.birthTime,
    timezone: r.birthTimezone, locationQuery: r.birthPlace,
  });
  if (r.timeScan && r.timeScanFor === want) return fromStored(r.timeScan);

  const fresh = await reliabilityOf({
    accuracy: r.timeAccuracy, birthDate: r.birthDate, birthTime: r.birthTime,
    timezone: r.birthTimezone, locationQuery: r.birthPlace,
  });
  // Failing to write the cache must never fail the chart: the chart is the
  // thing somebody is waiting for, and the worst case here is scanning again.
  const { error } = await db().from("charts").update({
    time_scan: toStored(fresh),
    time_scan_for: want,
    time_scan_at: new Date().toISOString(),
  }).eq("id", r.id);
  if (error) console.warn(`could not store the birth time scan for ${r.id}: ${error.message}`);
  return fresh;
}

/** One chart by its link token. Null when there is no such chart. */
export async function chartByToken(token: string): Promise<ChartRecord | null> {
  const { data, error } = await db().from("charts").select("*").eq("token", token).limit(1);
  if (error) throw new Error(`could not read chart ${token}: ${error.message}`);
  const row = (data ?? [])[0];
  return row ? shape(row) : null;
}

/**
 * The brief the builder works from. `slug` is the token, because a portal chart
 * has no roster slug and the token is the one thing it is guaranteed to have.
 */
export function briefFromRecord(r: ChartRecord): {
  id: string; slug: string; name: string;
  birthDate: string; birthTime: string; birthPlace: string; birthTimezone: string;
  tier: string; timeAccuracy: ChartRecord["timeAccuracy"];
} {
  return {
    tier: r.tier,
    // Carried, not dropped. Without this the builder cannot tell a birth
    // certificate from "some time in the afternoon", and draws both with the
    // same confidence.
    timeAccuracy: r.timeAccuracy,
    id: r.id,
    slug: r.token,
    name: r.personName,
    birthDate: r.birthDate,
    // No time means the chart is cast for noon and everything the time governs
    // is marked unreliable rather than presented as fact. A missing time is not
    // midnight: midnight is a real birth time and would look like an answer.
    // Postgres hands back a time as HH:MM:SS; the provider wants HH:MM and
    // answers 500 to anything else.
    birthTime: (r.birthTime ?? "12:00").slice(0, 5),
    birthPlace: r.birthPlace,
    birthTimezone: r.birthTimezone,
  };
}

/** Record a correction to a chart's birth details, and what it cost. */
export async function recordEdit(args: {
  chartId: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  editedBy?: string | null;
  recast?: boolean;
  rewroteReport?: boolean;
}): Promise<void> {
  const { error } = await db().from("chart_edits").insert({
    chart_id: args.chartId,
    field: args.field,
    old_value: args.oldValue,
    new_value: args.newValue,
    edited_by: args.editedBy ?? null,
    recast: args.recast ?? true,
    rewrote_report: args.rewroteReport ?? false,
  });
  if (error) throw new Error(`could not record the edit: ${error.message}`);
}
