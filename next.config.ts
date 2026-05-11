import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root so Turbopack doesn't pick up a stray lockfile from
  // a parent directory.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Expose the Vercel deployment ID and git SHA to the client bundle as
  // NEXT_PUBLIC_* vars so the version-skew toast can compare what the browser
  // is running against what the server is currently serving.
  env: {
    NEXT_PUBLIC_BUILD_ID:
      process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "",
    NEXT_PUBLIC_BUILD_COMMIT: process.env.VERCEL_GIT_COMMIT_SHA ?? "",
  },
};

export default nextConfig;
