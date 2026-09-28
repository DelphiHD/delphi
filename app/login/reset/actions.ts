"use server";

/**
 * Email the way back in.
 *
 * Kaycee, 2026-09-28. The link goes to the page where she sets a new password,
 * on charts.delphihd.com, which is where her cookie already lives.
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site-url";

export async function sendReset(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) redirect("/login/reset?said=" + encodeURIComponent("An email address is needed."));

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent("/portal/password")}`,
  });

  // Whether or not that address has an account, the answer is the same, so the
  // page never tells a stranger who has one.
  redirect("/login/reset?said=" + encodeURIComponent(
    error ? error.message : "Sent. Open the link on the phone or laptop you want to stay signed in on.",
  ));
}
