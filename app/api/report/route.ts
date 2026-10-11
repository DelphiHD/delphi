/**
 * A problem report from a chart page: what the person wrote, a picture of
 * what was on their screen, and what the page knew. Filed for the dashboard's
 * Reports tab and emailed to the people who run Delphi.
 *
 * Kaycee, 2026-10-11, to semi-automate the bug hunt: dashboard plus email,
 * for everyone. See supabase/migrations/20261011_problem_reports.sql.
 *
 * The chart token is the credential, as for the feedback survey: only a live
 * chart link can file one, and only ten an hour from any one link.
 */
import { createClient } from "@supabase/supabase-js";
import { NextResponse, after } from "next/server";
import { sendTeamEmail } from "@/lib/email";
import { createClient as createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_CHARTS_URL ?? "https://charts.delphihd.com";
const bad = (status: number) => NextResponse.json({ ok: false }, { status });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function POST(request: Request) {
  let b: { token?: unknown; what?: unknown; context?: unknown; image?: unknown };
  try { b = await request.json(); } catch { return bad(400); }
  const token = typeof b.token === "string" ? b.token : "";
  const what = typeof b.what === "string" ? b.what.trim().slice(0, 4000) : "";
  if (!/^[a-f0-9]{32}$/.test(token) || !what) return bad(400);
  const context = b.context && typeof b.context === "object" ? b.context as Record<string, unknown> : {};
  if (JSON.stringify(context).length > 20000) return bad(400);
  const image = typeof b.image === "string" && /^data:image\/(jpeg|png);base64,/.test(b.image) ? b.image : "";
  if (image.length > 4_000_000) return bad(413);

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: link } = await db.from("client_charts").select("client_name, revoked_at").eq("token", token).maybeSingle();
  if (!link || link.revoked_at) return bad(404);
  const { count } = await db.from("problem_reports").select("id", { count: "exact", head: true })
    .eq("token", token).gte("created_at", new Date(Date.now() - 3600e3).toISOString());
  if ((count ?? 0) >= 10) return bad(429);

  // Who sent it, if they are signed in: the verified session, in the request
  // itself so any refreshed session reaches their browser.
  let reporterId: string | null = null, reporterEmail: string | null = null;
  try {
    const session = await createServerClient();
    const { data: { user } } = await session.auth.getUser();
    if (user) { reporterId = user.id; reporterEmail = user.email ?? null; }
  } catch { /* not signed in */ }

  const { data: row, error } = await db.from("problem_reports")
    .insert({ token, person: link.client_name, what, context, reporter_id: reporterId, reporter_email: reporterEmail }).select("id").single();
  if (error || !row) { console.error("report: not filed:", error?.message); return bad(500); }

  let imagePath = "";
  if (image) {
    const kind = image.startsWith("data:image/png") ? "png" : "jpg";
    imagePath = `reports/${row.id}.${kind}`;
    const bytes = Buffer.from(image.slice(image.indexOf(",") + 1), "base64");
    const up = await db.storage.from("charts").upload(imagePath, bytes, { contentType: kind === "png" ? "image/png" : "image/jpeg" });
    if (up.error) { console.error("report: picture not kept:", up.error.message); imagePath = ""; }
    else await db.from("problem_reports").update({ image_path: imagePath }).eq("id", row.id);
  }

  // The email goes after the reply, so the person is never kept waiting on it.
  after(async () => {
    const { data: admins } = await db.from("delphi_admins").select("user_id");
    const ids = (admins ?? []).map((a) => a.user_id);
    const { data: people } = ids.length ? await db.from("profiles").select("email").in("id", ids) : { data: [] };
    const to = (people ?? []).map((p) => String(p.email ?? "")).filter(Boolean);
    const pic = imagePath ? (await db.storage.from("charts").createSignedUrl(imagePath, 7 * 86400)).data?.signedUrl ?? "" : "";
    const where = [context.mode, context.view].filter(Boolean).join(" · ");
    const r = await sendTeamEmail({
      to,
      subject: `Problem report: ${link.client_name}${where ? ` · ${where}` : ""}`,
      text: `${link.client_name} (${SITE}/c/${token})\n${where}\nFrom: ${reporterEmail ?? "not signed in"}\n\n${what}\n\nDashboard: ${SITE}/portal/admin`,
      html: `<p><b>${esc(String(link.client_name))}</b> · <a href="${SITE}/c/${token}">their chart</a>${where ? ` · ${esc(String(where))}` : ""}</p>` +
        `<p style="color:#6b6790;font-size:12px">From: ${esc(reporterEmail ?? "not signed in")}</p>` +
        `<p style="white-space:pre-wrap">${esc(what)}</p>` +
        (pic ? `<p><a href="${pic}"><img src="${pic}" alt="" style="max-width:520px;border:1px solid #ddd;border-radius:8px"></a></p>` : "") +
        `<p style="color:#6b6790;font-size:12px">${esc([context.device, context.screen, context.browser].filter(Boolean).join(" · "))}</p>` +
        `<p><a href="${SITE}/portal/admin">Open the dashboard</a> (Reports)</p>`,
    });
    if (!r.sent) console.error("report: email not sent:", r.reason);
  });
  return NextResponse.json({ ok: true });
}
