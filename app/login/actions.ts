"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site-url";

function safeNext(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "/portal";
  return value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/portal";
}



export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const params = new URLSearchParams({
      error: error.message,
      next: next === "/portal" ? "" : next,
    });
    redirect(`/login?${params.toString()}`);
  }

  revalidatePath("/", "layout");
  redirect(next);
}

export async function signInWithMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const next = safeNext(formData.get("next"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  const params = new URLSearchParams();
  if (error) params.set("error", error.message);
  else params.set("sent", "1");
  redirect(`/login?${params.toString()}`);
}
