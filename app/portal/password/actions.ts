"use server";

/**
 * Setting a password on your own account.
 *
 * Kaycee, 2026-09-28: "The admin portal does need to be password protected
 * though. Is there not a way to do that?" There is: the account has always
 * accepted a password, there was simply never a page to set one, so the magic
 * link was the only way in.
 *
 * She types it, Supabase stores its hash, and nothing here writes it down: not
 * a log line, not an error message, not a redirect parameter.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function setPassword(formData: FormData): Promise<void> {
  const password = String(formData.get("password") ?? "");
  const again = String(formData.get("again") ?? "");

  const say = (msg: string) => redirect(`/portal/password?said=${encodeURIComponent(msg)}`);

  if (password.length < 12) say("A password needs at least twelve characters.");
  if (password !== again) say("Those two did not match.");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/portal/password");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) say(error.message);

  revalidatePath("/portal/password");
  redirect("/portal/password?said=" + encodeURIComponent("Your password is set. You can sign in with it now."));
}
