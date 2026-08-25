import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 renamed the "middleware" file convention to "proxy".
// Same semantics; the file lives at the project root.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Match everything except Next.js internals, static assets, and published
  // client chart links. A chart link is authenticated by its token alone, so it
  // must not depend on the auth stack: keeping /c out of here means a client's
  // page serves even if Supabase auth is misconfigured, and saves a session
  // round-trip on every view.
  matcher: [
    "/((?!c/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js)$).*)",
  ],
};
