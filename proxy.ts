import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 renamed the "middleware" file convention to "proxy".
// Same semantics; the file lives at the project root.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Match everything except Next.js internals, static assets, published client
  // chart links, and the feedback endpoint those pages post to. Both are
  // authenticated by the chart token alone, so they must not depend on the auth
  // stack: keeping them out of here means a client's page serves, and their
  // response files, even if Supabase auth is misconfigured, and it saves a
  // session round-trip on every view.
  matcher: [
    "/((?!c/|api/chart-feedback|api/sky|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js)$).*)",
  ],
};
