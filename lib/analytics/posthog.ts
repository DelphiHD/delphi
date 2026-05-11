import "server-only";
import { PostHog } from "posthog-node";

// Server-side PostHog client. Caller is responsible for `await client.shutdown()`
// at the end of the request so events flush before the function returns.
export function postHogServer() {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return null;
  return new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
  });
}
