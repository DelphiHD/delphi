import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Welcome — HD Reports" };

export default async function WelcomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Welcome</h1>
      <p className="mt-3 text-base text-zinc-600 dark:text-zinc-400">
        Signed in as{" "}
        <span className="font-medium text-zinc-900 dark:text-zinc-100">
          {user?.email}
        </span>
        .
      </p>
      <p className="mt-6 text-sm text-zinc-500">
        Your portal is being built. Soon this page will collect your birth
        details and walk you through your reading.
      </p>
    </main>
  );
}
