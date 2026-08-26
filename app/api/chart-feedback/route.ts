// Takes one survey response from a client chart page and files it in Kaycee's
// Notion database.
//
// The chart token is the credential, the same as it is for viewing the chart:
// a response is only accepted if that token names a live, unrevoked chart. So
// only someone holding a chart link can post, and the row is stamped with whose
// chart it came from rather than trusting anything the page says about itself.
//
// Notion is a place to read things, not a store built to catch writes, so a
// failed write is reported loudly rather than swallowed: the client sees an
// error and the response is not silently lost.

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const NOTION_DB = "e8aa4eebd92c45abb1591e18ee4c6be7";
const ANSWERS = ["Yes", "Sort of", "Not really"] as const;
const COMMENT_MAX = 2000;

const bad = (msg: string, code = 400) =>
  NextResponse.json({ ok: false, error: msg }, { status: code });

export async function POST(request: Request) {
  let body: { token?: unknown; answer?: unknown; comment?: unknown; readDate?: unknown };
  try {
    body = await request.json();
  } catch {
    return bad("expected JSON");
  }

  const token = typeof body.token === "string" ? body.token : "";
  if (!/^[a-f0-9]{32}$/.test(token)) return bad("bad token");

  const answer = ANSWERS.find((a) => a === body.answer);
  if (!answer) return bad("answer must be one of " + ANSWERS.join(", "));

  const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, COMMENT_MAX) : "";
  const readDate = typeof body.readDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.readDate)
    ? body.readDate
    : new Date().toISOString().slice(0, 10);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const notionToken = process.env.NOTION_TOKEN;
  if (!supabaseUrl || !serviceKey || !notionToken) {
    console.error("chart-feedback: missing env", {
      supabaseUrl: !!supabaseUrl, serviceKey: !!serviceKey, notionToken: !!notionToken,
    });
    return bad("server not configured", 500);
  }

  // the token has to name a live chart, which is what stops this being an open
  // write endpoint on the public internet
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: row, error } = await db
    .from("client_charts")
    .select("client_name, revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (error || !row || row.revoked_at) return bad("unknown chart", 404);

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${notionToken}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parent: { database_id: NOTION_DB },
      properties: {
        Name: { title: [{ text: { content: `${row.client_name} · ${readDate}` } }] },
        Client: { rich_text: [{ text: { content: row.client_name } }] },
        "Read Date": { date: { start: readDate } },
        Answer: { select: { name: answer } },
        ...(comment ? { Comment: { rich_text: [{ text: { content: comment } }] } } : {}),
        Chart: { url: `https://charts.delphihd.com/c/${token}` },
        Submitted: { date: { start: new Date().toISOString() } },
      },
    }),
  });

  if (!res.ok) {
    // loud, not silent: the response is worth more than a tidy log line
    console.error("chart-feedback: Notion write failed", res.status, (await res.text()).slice(0, 400));
    return bad("could not file that response", 502);
  }
  return NextResponse.json({ ok: true });
}
