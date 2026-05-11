import { NextResponse } from "next/server";

// Returns the deploy ID of the currently-running server. The client-side
// VersionToast component compares this against NEXT_PUBLIC_BUILD_ID baked
// into its bundle; a mismatch means the browser is running stale code.
//
// Must be dynamic — caching this would defeat the whole point.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(
    {
      deploymentId:
        process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "",
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "",
      env: process.env.VERCEL_ENV ?? "development",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    },
  );
}
