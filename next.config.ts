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
  // The operator scripts under scripts/ are dev tools run with tsx, not part of
  // the deployed app. They are type-checked by `npm run typecheck`; keeping them
  // out of the production build stops an unrelated script error from blocking a
  // deploy.
  typescript: {
    tsconfigPath: "tsconfig.build.json",
  },
  env: {
    NEXT_PUBLIC_BUILD_ID:
      process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "",
    NEXT_PUBLIC_BUILD_COMMIT: process.env.VERCEL_GIT_COMMIT_SHA ?? "",
  },
};

export default nextConfig;
