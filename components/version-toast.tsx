"use client";

import { useEffect, useState } from "react";

// Polls /api/version and shows a toast with a refresh button when the running
// server's deploy ID no longer matches the one this browser was loaded with.
//
// In local dev both IDs are empty strings (no Vercel env), so the toast never
// appears. In Vercel preview/production they're real deployment IDs.
const POLL_INTERVAL_MS = 60_000;

export function VersionToast() {
  const buildId = process.env.NEXT_PUBLIC_BUILD_ID ?? "";
  const [staleSince, setStaleSince] = useState<number | null>(null);

  useEffect(() => {
    // No build ID means local dev (or a non-Vercel build). Nothing to compare
    // against, so skip the polling loop entirely.
    if (!buildId) return;

    let cancelled = false;

    async function check() {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { deploymentId?: string };
        if (cancelled) return;
        if (data.deploymentId && data.deploymentId !== buildId) {
          setStaleSince((prev) => prev ?? Date.now());
        }
      } catch {
        // Network blip. Try again on the next tick.
      }
    }

    check();
    const interval = setInterval(check, POLL_INTERVAL_MS);

    function onVisible() {
      if (document.visibilityState === "visible") check();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [buildId]);

  if (staleSince === null) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-full border border-zinc-200 bg-white px-4 py-3 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
    >
      <span className="text-zinc-900 dark:text-zinc-100">
        A new version of HD Reports is available.
      </span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex h-8 items-center justify-center rounded-full bg-zinc-900 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Refresh
      </button>
    </div>
  );
}
