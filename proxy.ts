import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 renamed the "middleware" file convention to "proxy".
// Same semantics; the file lives at the project root.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Match everything except Next.js internals and static assets. The
  // updateSession helper does the actual auth gating per path.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js)$).*)",
  ],
};
