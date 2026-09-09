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
  // The chart builder is now imported by /api/chart, which drags its whole
  // dependency tree into the server bundle. The rasteriser is a native binary
  // and cannot live in a bundle at all: the build fails with "asset is not
  // placeable in ESM chunks". It is only ever used to write Kaycee's PNG, which
  // the server never does, so it is left outside the bundle and loaded from
  // node_modules if anything ever asks for it.
  serverExternalPackages: ["@resvg/resvg-js"],
  env: {
    NEXT_PUBLIC_BUILD_ID:
      process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "",
    NEXT_PUBLIC_BUILD_COMMIT: process.env.VERCEL_GIT_COMMIT_SHA ?? "",
  },
};

export default nextConfig;
